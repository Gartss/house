import { parseRooms, FloorPlan } from './property-extras';
import { newId } from './id';

type PositionedRoomPart = {
  kind: 'name' | 'area';
  value: string;
  x: number;
  y: number;
};

const ROOM_NAME_PATTERN =
  /(厨房|局房|卫生间|卫|客厅|餐厅|卧室|主卧|次卧|阳台|书房|储藏室|过道|玄关)([A-Z\d人]?)/i;

function normalizedRoomName(value: string) {
  const compact = value.replace(/\s/g, '');
  const confusedKitchen = compact.match(/^[卫局言本]房([A-Z\d人]?)$/i);
  if (confusedKitchen) {
    const suffix =
      confusedKitchen[1] === '人' ? 'A' : confusedKitchen[1].toUpperCase();
    return `厨房${suffix}`;
  }
  const confusedBedroom = compact.match(/^卧[享宝]([A-Z\d人]?)$/i);
  if (confusedBedroom) {
    const suffix =
      confusedBedroom[1] === '人' ? 'A' : confusedBedroom[1].toUpperCase();
    return `卧室${suffix}`;
  }
  const abbreviatedBathroom = compact.match(/^了([A-Z\d人]?)$/i);
  if (abbreviatedBathroom) {
    const suffix =
      abbreviatedBathroom[1] === '人'
        ? 'A'
        : abbreviatedBathroom[1].toUpperCase();
    return `卫${suffix}`;
  }
  const match = compact.match(ROOM_NAME_PATTERN);
  if (!match) return '';
  const room = match[1] === '局房' ? '厨房' : match[1];
  const suffix = match[2] === '人' ? 'A' : match[2].toUpperCase();
  return room + suffix;
}

function unmatchedPositionedAreas(parts: PositionedRoomPart[]) {
  const { areas, usedAreas } = matchPositionedParts(parts);
  return areas.filter((_, index) => !usedAreas.has(index));
}

export function positionedRoomParts(
  tsv: string | null | undefined,
  top = 0,
  height = 1,
  imageWidth?: number,
  imageHeight?: number,
): PositionedRoomPart[] {
  if (!tsv) return [];
  const words = tsv
    .split('\n')
    .map((row) => row.split('\t'))
    .filter((columns) => columns[0] === '5' && columns.length >= 12)
    .map((columns) => ({
      line: columns.slice(1, 5).join(':'),
      left: Number(columns[6]),
      top: Number(columns[7]),
      width: Number(columns[8]),
      height: Number(columns[9]),
      text: columns.slice(11).join('\t').trim(),
    }))
    .filter(
      (word) =>
        word.text &&
        [word.left, word.top, word.width, word.height].every(Number.isFinite),
    );
  const maxX =
    imageWidth || Math.max(1, ...words.map((word) => word.left + word.width));
  const maxY =
    imageHeight || Math.max(1, ...words.map((word) => word.top + word.height));
  const parts: PositionedRoomPart[] = [];
  const lines = new Map<string, typeof words>();
  for (const word of words)
    lines.set(word.line, [...(lines.get(word.line) || []), word]);
  for (const lineWords of lines.values()) {
    const ordered = lineWords.sort((a, b) => a.left - b.left);
    const text = ordered.map((word) => word.text).join('');
    const name = normalizedRoomName(text);
    if (!name) continue;
    const left = Math.min(...ordered.map((word) => word.left));
    const right = Math.max(...ordered.map((word) => word.left + word.width));
    const lineTop = Math.min(...ordered.map((word) => word.top));
    const bottom = Math.max(...ordered.map((word) => word.top + word.height));
    parts.push({
      kind: 'name',
      value: name,
      x: (left + right) / 2 / maxX,
      y: top + ((lineTop + bottom) / 2 / maxY) * height,
    });
  }
  for (const word of words) {
    const area = word.text.match(/(?:^|\D)(\d{1,2}\.\d+)(?:\D|$)/)?.[1];
    if (!area || Number(area) < 1 || Number(area) > 80) continue;
    parts.push({
      kind: 'area',
      value: area,
      x: (word.left + word.width / 2) / maxX,
      y: top + ((word.top + word.height / 2) / maxY) * height,
    });
  }
  return parts;
}

function matchPositionedParts(parts: PositionedRoomPart[]) {
  const unique = parts.filter(
    (part, index) =>
      parts.findIndex(
        (candidate) =>
          candidate.kind === part.kind &&
          candidate.value === part.value &&
          Math.abs(candidate.x - part.x) < 0.06 &&
          Math.abs(candidate.y - part.y) < 0.06,
      ) === index,
  );
  const nameParts = unique.filter((part) => part.kind === 'name');
  const roomBase = (value: string) => value.replace(/[A-Z\d]$/, '');
  const names = nameParts.filter(
    (part, index) =>
      !nameParts.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          roomBase(candidate.value) === roomBase(part.value) &&
          candidate.value.length > part.value.length &&
          Math.abs(candidate.x - part.x) < 0.08 &&
          Math.abs(candidate.y - part.y) < 0.08,
      ),
  );
  const areas = unique.filter((part) => part.kind === 'area');
  const usedAreas = new Set<number>();
  const matches = names.flatMap((name) => {
    let nearest = -1;
    let nearestScore = Infinity;
    for (const [index, area] of areas.entries()) {
      if (usedAreas.has(index)) continue;
      const dx = Math.abs(name.x - area.x);
      const dy = Math.abs(name.y - area.y);
      const score = dx * 1.2 + dy * 2;
      if (dx <= 0.28 && dy <= 0.12 && score < nearestScore) {
        nearest = index;
        nearestScore = score;
      }
    }
    if (nearest < 0) return [];
    usedAreas.add(nearest);
    return [{ name, area: areas[nearest] }];
  });
  return { areas, usedAreas, matches };
}

function roomsFromPositions(parts: PositionedRoomPart[]) {
  const { areas, usedAreas, matches } = matchPositionedParts(parts);
  const rooms = matches.map(({ name, area }) => ({
    id: newId(),
    name: name.value,
    area: area.value,
    included: !name.value.startsWith('阳台'),
  }));
  for (const [index, area] of areas.entries()) {
    if (usedAreas.has(index)) continue;
    rooms.push({
      id: newId(),
      name: '待核对房间',
      area: area.value,
      included: true,
    });
  }
  return rooms;
}

export function mergeFloorPlanRooms(
  texts: string[],
  areaTexts: string[],
  positionedParts: PositionedRoomPart[] = [],
  expectedLayout = '',
) {
  const candidates = [
    ...roomsFromPositions(positionedParts),
    ...(positionedParts.length ? [] : texts.flatMap(parseRooms)),
  ];
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
      /(厨房|局房|卫生间|卫|客厅|餐厅|卧室|主卧|次卧|阳台|书房|储藏室|过道|玄关)([A-Z\d人]?)/gi,
    ),
    (match) => normalizedRoomName(match[0]),
  ).filter((name, index, all) => all.indexOf(name) === index);
  const unmatchedNames = mentionedNames.filter(
    (name) => !rooms.some((room) => room.name === name),
  );
  const unnamedRooms = rooms.filter((room) => room.name === '待核对房间');
  if (unmatchedNames.length === 1 && unnamedRooms.length === 1)
    unnamedRooms[0].name = unmatchedNames[0];
  const layout = expectedLayout.match(/(\d+)室(\d+)厅(?:(\d+)卫)?/);
  if (layout && unnamedRooms.length === 1) {
    const expected = {
      bedroom: Number(layout[1]),
      hall: Number(layout[2]),
      bathroom: Number(layout[3] || 0),
    };
    const missing = [
      ...Array(
        Math.max(
          0,
          expected.bedroom -
            rooms.filter((room) => /卧/.test(room.name)).length,
        ),
      ).fill('卧室（待核对）'),
      ...Array(
        Math.max(
          0,
          expected.hall -
            rooms.filter((room) => /客厅|餐厅/.test(room.name)).length,
        ),
      ).fill('客厅（待核对）'),
      ...Array(
        Math.max(
          0,
          expected.bathroom -
            rooms.filter((room) => /卫/.test(room.name)).length,
        ),
      ).fill('卫生间（待核对）'),
    ];
    if (missing.length === 1) unnamedRooms[0].name = missing[0];
  }
  return rooms;
}

// Extra passes are restricted to the diagram portion of a detail screenshot.
export async function recognizeFloorPlan(
  worker: any,
  file: Blob,
  image: string,
  text: string,
  force = false,
): Promise<FloorPlan | undefined> {
  if (!force && !/户\s*型\s*图|使\s*用\s*面\s*积|户\s*型|房\s*型/.test(text))
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
    const reportPlan = force
      ? cropToCanvas({ x: 0.58, y: 0.27, w: 0.26, h: 0.31, scale: 8 })
      : null;
    const canvases = force
      ? [reportPlan!]
      : [broad, tight, tall];
    for (const canvas of canvases) {
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
    if (force) {
      areaTexts.push((await worker.recognize(reportPlan!)).data.text);
    } else {
      areaTexts.push(
        (await worker.recognize(tight)).data.text,
        (await worker.recognize(tall)).data.text,
      );
    }
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

// Standalone floorplan uploads need tiled OCR because room labels are often
// too small in the original portrait image for a single full-image pass.
export async function recognizeStandaloneFloorPlan(
  worker: any,
  source: Blob | HTMLCanvasElement,
  image: string,
  expectedLayout = '',
): Promise<FloorPlan> {
  const bitmap = await createImageBitmap(source);
  const texts: string[] = [];
  const areaTexts: string[] = [];
  const positionedParts: PositionedRoomPart[] = [];
  const makeCanvas = (top: number, height: number, scale: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * height * scale);
    canvas
      .getContext('2d')!
      .drawImage(
        bitmap,
        0,
        bitmap.height * top,
        bitmap.width,
        bitmap.height * height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    return canvas;
  };
  try {
    const full = makeCanvas(0, 1, 2);
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    let result = await worker.recognize(full, {}, { text: true, tsv: true });
    texts.push(result.data.text);
    positionedParts.push(
      ...positionedRoomParts(result.data.tsv, 0, 1, full.width, full.height),
    );
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    texts.push((await worker.recognize(full)).data.text);
    const slices = [
      [0, 0.4],
      [0.3, 0.4],
      [0.6, 0.4],
    ] as const;
    for (const [top, height] of slices) {
      const tile = makeCanvas(top, height, 3);
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      result = await worker.recognize(tile, {}, { text: true, tsv: true });
      texts.push(result.data.text);
      positionedParts.push(
        ...positionedRoomParts(
          result.data.tsv,
          top,
          height,
          tile.width,
          tile.height,
        ),
      );
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: '0123456789.m²',
      });
      result = await worker.recognize(tile, {}, { text: true, tsv: true });
      areaTexts.push(result.data.text);
      positionedParts.push(
        ...positionedRoomParts(
          result.data.tsv,
          top,
          height,
          tile.width,
          tile.height,
        ).filter((part) => part.kind === 'area'),
      );
    }
    const unmatchedAreas = unmatchedPositionedAreas(positionedParts).slice(
      0,
      4,
    );
    for (const area of unmatchedAreas) {
      const left = Math.max(0, area.x - 0.18);
      const top = Math.max(0, area.y - 0.12);
      const width = Math.min(0.36, 1 - left);
      const height = Math.min(0.2, 1 - top);
      const focus = document.createElement('canvas');
      focus.width = Math.round(bitmap.width * width * 8);
      focus.height = Math.round(bitmap.height * height * 8);
      focus
        .getContext('2d')!
        .drawImage(
          bitmap,
          bitmap.width * left,
          bitmap.height * top,
          bitmap.width * width,
          bitmap.height * height,
          0,
          0,
          focus.width,
          focus.height,
        );
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: '',
      });
      result = await worker.recognize(focus, {}, { text: true, tsv: true });
      texts.push(result.data.text);
      let focusedName = positionedRoomParts(
        result.data.tsv,
        0,
        1,
        focus.width,
        focus.height,
      ).find((part) => part.kind === 'name');
      if (!focusedName) {
        const context = focus.getContext('2d')!;
        const pixels = context.getImageData(0, 0, focus.width, focus.height);
        for (let index = 0; index < pixels.data.length; index += 4) {
          const gray =
            pixels.data[index] * 0.299 +
            pixels.data[index + 1] * 0.587 +
            pixels.data[index + 2] * 0.114;
          const value = gray < 205 ? 0 : 255;
          pixels.data[index] = value;
          pixels.data[index + 1] = value;
          pixels.data[index + 2] = value;
        }
        context.putImageData(pixels, 0, 0);
        await worker.setParameters({ tessedit_pageseg_mode: '11' });
        result = await worker.recognize(focus, {}, { text: true, tsv: true });
        texts.push(result.data.text);
        focusedName = positionedRoomParts(
          result.data.tsv,
          0,
          1,
          focus.width,
          focus.height,
        ).find((part) => part.kind === 'name');
      }
      if (focusedName)
        positionedParts.push({
          ...focusedName,
          x: area.x,
          y: area.y - 0.03,
        });
    }
  } finally {
    bitmap.close();
    await worker.setParameters({
      tessedit_pageseg_mode: '3',
      tessedit_char_whitelist: '',
    });
  }
  const rooms = mergeFloorPlanRooms(
    texts,
    areaTexts,
    positionedParts,
    expectedLayout,
  );
  return {
    image,
    text: [...texts, ...areaTexts].join('\n').slice(0, 50000),
    rooms,
    confirmed: false,
  };
}
