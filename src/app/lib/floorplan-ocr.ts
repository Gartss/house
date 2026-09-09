import { parseRooms, FloorPlan } from './property-extras';
import { newId } from './id';

export function mergeFloorPlanRooms(texts: string[], areaTexts: string[]) {
  const candidates = texts.flatMap(parseRooms);
  const rooms = candidates.filter(
    (r, i) =>
      candidates.findIndex((n) => n.name === r.name && n.area === r.area) === i,
  );
  for (const part of [...texts, ...areaTexts]) {
    for (const match of part
      .replace(/[ \t]/g, '')
      .matchAll(/(?:^|\n)[^\d\u4e00-\u9fff]{0,8}(\d+\.\d+)(?:\s*m[²2i]?)?/gi)) {
      const area = Number(match[1]);
      if (
        area >= 1 &&
        area <= 80 &&
        !rooms.some((r) => Number(r.area) === area)
      )
        rooms.push({
          id: newId(),
          name: '待核对房间',
          area: match[1],
          included: true,
        });
    }
  }
  const cleanText = texts.join('\n').replace(/[ \t]/g, '');
  const mentionedNames = Array.from(
    cleanText.matchAll(
      /(厨房|卫生间|卫|客厅|餐厅|卧室|主卧|次卧|阳台|书房|储藏室|过道|玄关)([A-Z\d]?)/gi,
    ),
    (match) => match[1] + match[2],
  ).filter((name, index, all) => all.indexOf(name) === index);
  const unmatchedNames = mentionedNames.filter(
    (name) => !rooms.some((room) => room.name === name),
  );
  const unnamedRooms = rooms.filter((room) => room.name === '待核对房间');
  if (unmatchedNames.length === 1 && unnamedRooms.length === 1)
    unnamedRooms[0].name = unmatchedNames[0];
  return rooms;
}

// Extra passes are restricted to the diagram portion of a detail screenshot.
export async function recognizeFloorPlan(
  worker: any,
  file: Blob,
  image: string,
  text: string,
): Promise<FloorPlan | undefined> {
  if (!/户\s*型\s*图|使\s*用\s*面\s*积|户\s*型|房\s*型/.test(text))
    return undefined;
  const bitmap = await createImageBitmap(file);
  const texts = [text];
  const areaTexts: string[] = [];
  const cropToCanvas = (crop: {
    x: number;
    y: number;
    w: number;
    h: number;
    scale: number;
  }) => {
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
    return canvas;
  };
  try {
    const broad = cropToCanvas({ x: 0.25, y: 0.04, w: 0.5, h: 0.32, scale: 3 });
    const tight = cropToCanvas({
      x: 0.34,
      y: 0.08,
      w: 0.32,
      h: 0.34,
      scale: 5,
    });
    const tall = cropToCanvas({ x: 0.36, y: 0.07, w: 0.3, h: 0.36, scale: 5 });
    for (const canvas of [broad, tight, tall]) {
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      texts.push((await worker.recognize(canvas)).data.text);
    }
    await worker.setParameters({
      tessedit_pageseg_mode: '11',
      tessedit_char_whitelist: '0123456789.m²',
    });
    areaTexts.push((await worker.recognize(broad)).data.text);
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: '0123456789.m²',
    });
    areaTexts.push(
      (await worker.recognize(tight)).data.text,
      (await worker.recognize(tall)).data.text,
    );
  } finally {
    bitmap.close();
    await worker.setParameters({
      tessedit_pageseg_mode: '3',
      tessedit_char_whitelist: '',
    });
  }
  const rooms = mergeFloorPlanRooms(texts.slice(1), areaTexts);
  return {
    image,
    text: [...texts, ...areaTexts].join('\n').slice(0, 50000),
    rooms,
    confirmed: false,
  };
}
