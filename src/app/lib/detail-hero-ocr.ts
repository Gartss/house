type HeroField = 'price' | 'layout' | 'area';
type OcrWorker = {
  setParameters: (parameters: Record<string, string>) => Promise<unknown>;
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
};

export type DetailHeroFields = {
  price: string;
  layout: string;
  area: string;
  text: string;
};

const compact = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(',', '.');

export function parseDetailHeroTexts(texts: Record<HeroField, string>): DetailHeroFields {
  const priceText = compact(texts.price);
  const layoutText = compact(texts.layout)
    .replace(/[丨|Il]/g, '1')
    .replace(/(\d+厅\d+)了/g, '$1卫');
  const areaText = compact(texts.area).replace(/[Oo]/g, '0');

  const priceCandidate = priceText.match(/(\d+(?:\.\d+)?)万/)?.[1] || '';
  const priceNumber = Number(priceCandidate);
  const price = priceNumber > 0 && priceNumber < 100000 ? priceCandidate : '';
  const layout = layoutText.match(/\d+室\d+厅(?:\d+卫)?/)?.[0] || '';
  const area = Array.from(areaText.matchAll(/\d{2,3}(?:\.\d{1,2})?/g))
    .map((match) => match[0])
    .find((value) => Number(value) >= 10 && Number(value) <= 1000) || '';

  return {
    price,
    layout,
    area,
    text: [texts.price, texts.layout, texts.area].filter(Boolean).join('\n'),
  };
}

function thresholdCanvas(
  bitmap: ImageBitmap,
  crop: { x: number; y: number; w: number; h: number },
) {
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * crop.w * scale);
  canvas.height = Math.round(bitmap.height * crop.h * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingEnabled = true;
  context.drawImage(
    bitmap,
    bitmap.width * crop.x,
    bitmap.height * crop.y,
    bitmap.width * crop.w,
    bitmap.height * crop.h,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance =
      image.data[index] * 0.299 +
      image.data[index + 1] * 0.587 +
      image.data[index + 2] * 0.114;
    const value = luminance < 205 ? 0 : 255;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export async function recognizeDetailHeroFields(worker: OcrWorker, file: Blob) {
  const bitmap = await createImageBitmap(file);
  const crops: Record<HeroField, { x: number; y: number; w: number; h: number }> = {
    price: { x: 0.025, y: 0.425, w: 0.27, h: 0.095 },
    layout: { x: 0.27, y: 0.425, w: 0.34, h: 0.095 },
    area: { x: 0.62, y: 0.425, w: 0.36, h: 0.095 },
  };
  const texts = { price: '', layout: '', area: '' };
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    for (const field of ['price', 'layout', 'area'] as const) {
      const canvas = thresholdCanvas(bitmap, crops[field]);
      texts[field] = (await worker.recognize(canvas)).data.text;
    }
    return parseDetailHeroTexts(texts);
  } finally {
    bitmap.close();
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
  }
}
