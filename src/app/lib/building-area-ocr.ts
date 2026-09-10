import { parseScreenshot } from './ocr';

export async function recognizeBuildingArea(
  worker: any,
  file: Blob,
  image: string,
) {
  const bitmap = await createImageBitmap(file);
  const crops = [
    { x: 0.48, y: 0.24, w: 0.52, h: 0.3, scale: 3 },
    { x: 0, y: 0.2, w: 1, h: 0.42, scale: 2 },
  ];
  try {
    for (const crop of crops) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * crop.w * crop.scale);
      canvas.height = Math.round(bitmap.height * crop.h * crop.scale);
      canvas
        .getContext('2d')!
        .drawImage(
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
      const text = (await worker.recognize(canvas)).data.text;
      const area = parseScreenshot(text, image)[0]?.area || '';
      if (Number(area) >= 10) return { area, text };
    }
    return { area: '', text: '' };
  } finally {
    bitmap.close();
  }
}
