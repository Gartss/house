const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_TYPE = 'application/pdf';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_PDF_PAGES = 50;

export const IMPORT_ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';

export type PreparedImportFile = {
  file: File;
  pdfText: string;
  source: 'image' | 'pdf';
};

export function importFileKind(file: Pick<File, 'name' | 'type'>) {
  if (IMAGE_TYPES.has(file.type)) return 'image';
  if (file.type === PDF_TYPE || file.name.toLowerCase().endsWith('.pdf'))
    return 'pdf';
  return 'unsupported';
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PDF 页面转换失败'))),
      'image/jpeg',
      0.95,
    );
  });
}

export function pdfTextLines(
  items: Array<unknown>,
) {
  const lines = new Map<number, Array<{ x: number; value: string }>>();
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item) || !('transform' in item))
      continue;
    const textItem = item as { str?: string; transform?: ArrayLike<number> };
    const value = textItem.str?.trim();
    if (!value || !textItem.transform) continue;
    const x = Number(textItem.transform[4]) || 0;
    const y = Math.round((Number(textItem.transform[5]) || 0) / 3);
    lines.set(y, [...(lines.get(y) || []), { x, value }]);
  }
  return [...lines.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, parts]) =>
      parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.value)
        .join(' '),
    )
    .join('\n');
}

async function renderPdf(file: File, onPage?: (page: number, total: number) => void) {
  if (file.size > MAX_PDF_BYTES) throw new Error('PDF 文件需小于30MB');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const pdfDocument = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdfDocument.numPages > MAX_PDF_PAGES)
    throw new Error(`PDF 最多支持 ${MAX_PDF_PAGES} 页`);
  const pages: PreparedImportFile[] = [];
  const baseName = file.name.replace(/\.pdf$/i, '');
  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      onPage?.(pageNumber, pdfDocument.numPages);
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('当前浏览器无法转换 PDF 页面');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await canvasBlob(canvas);
      pages.push({
        file: new File(
          [blob],
          `${baseName}-第${String(pageNumber).padStart(2, '0')}页.jpg`,
          { type: 'image/jpeg', lastModified: file.lastModified },
        ),
        pdfText: pdfTextLines(textContent.items),
        source: 'pdf',
      });
      page.cleanup();
    }
  } finally {
    await pdfDocument.destroy();
  }
  return pages;
}

export async function prepareImportFiles(
  files: File[],
  onPdfPage?: (fileName: string, page: number, total: number) => void,
) {
  const images: PreparedImportFile[] = [];
  for (const file of files) {
    const kind = importFileKind(file);
    if (kind === 'unsupported') throw new Error('请选择 JPG、PNG、WebP 图片或 PDF 文件');
    if (kind === 'image') {
      if (file.size > MAX_IMAGE_BYTES) throw new Error('图片需小于12MB');
      images.push({ file, pdfText: '', source: 'image' });
      continue;
    }
    images.push(
      ...(await renderPdf(file, (page, total) => onPdfPage?.(file.name, page, total))),
    );
  }
  return images;
}
