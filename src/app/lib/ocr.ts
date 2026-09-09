import { newProperty, Property } from './model';
import { LOCATION_DATA } from './location-data';
import { localDateValue } from './date';
// Normalize typography only; never repair uncertain address characters by guessing.
const normalize = (text: string) =>
  text
    .replace(/[ \t\r\u00a0]/g, '')
    .replace(/[／丨|]/g, '/')
    .replace(/[，]/g, ',')
    .replace(/[。．]/g, '.')
    .replace(/平方米|平米/g, '㎡');
const areaPattern = /(\d+(?:\.\d+)?)(?:㎡|m(?:[iI²2]|\^2)?)/i;
function amount(line: string) {
  if (
    /降价|涨价|首付|月供|租金|单价|万元?\/(?:平|㎡|m)|万\/月|元\/月/i.test(line)
  )
    return '';
  return line.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)万/)?.[1] || '';
}
function unitPrice(text: string) {
  const m = text.match(/(\d{1,3}(?:[,.]\d{3})+|\d{4,7})元\/(?:平|㎡|m)/i);
  return m ? m[1].replace(/[,.]/g, '') : '';
}
function floorValue(text: string) {
  return (
    text.match(
      /(?:低|中|高)楼层(?:[（(]共?\d+层[）)]|\/共?\d+层|共?\d+层)?/,
    )?.[0] || ''
  );
}
function quoteDate(text: string, now: Date) {
  const full = text.match(
    /(?:^|[^\d])(20\d{2})[年/.\-](\d{1,2})[月/.\-](\d{1,2})日?/,
  );
  const partial = text.match(/(?:^|[^\d])(\d{1,2})月(\d{1,2})日/);
  const parts = full
    ? [Number(full[1]), Number(full[2]), Number(full[3])]
    : partial
      ? [now.getFullYear(), Number(partial[1]), Number(partial[2])]
      : null;
  if (!parts) return localDateValue(now);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.getFullYear() === parts[0] &&
    date.getMonth() === parts[1] - 1 &&
    date.getDate() === parts[2]
    ? localDateValue(date)
    : localDateValue(now);
}
function locationValue(text: string) {
  for (const [region, districts] of Object.entries(LOCATION_DATA)) {
    const shortRegion = region.replace(/区$/, '');
    for (const district of districts) {
      if (
        new RegExp(`${shortRegion}(?:区)?[·:：.。\\-–—>》]+${district}`).test(
          text,
        )
      )
        return { region, district };
    }
  }
  return null;
}
function semanticArea(text: string) {
  return (
    text.match(
      /(?:建筑面积|建面|产证面积|面积)[:：]?[^\d]{0,8}(\d+(?:\.\d+)?)\s*(?:㎡|m(?:[iI²2]|\^2)?)/i,
    )?.[1] ||
    text.match(areaPattern)?.[1] ||
    ''
  );
}
function applySemanticFields(p: Property, text: string, now: Date) {
  p.layout = text.match(/\d+室\d+厅(?:\d+卫)?/)?.[0] || p.layout;
  p.area = semanticArea(text) || p.area;
  p.year =
    text.match(
      /(?:建成|建成年份|建筑年代|竣工)[:：]?\D{0,6}(19\d{2}|20\d{2})年?/,
    )?.[1] ||
    text.match(/(19\d{2}|20\d{2})年(?!\d{1,2}月)/)?.[1] ||
    p.year;
  p.floor = floorValue(text) || p.floor;
  p.direction =
    text
      .match(/(?:朝向[:：]?)([东西南北]+)|([东西南北]+)朝向/)
      ?.slice(1)
      .find(Boolean) || p.direction;
  p.decoration = text.match(/(?:精装|简装|毛坯)/)?.[0] || p.decoration;
  p.lift = text.includes('无电梯')
    ? '否'
    : text.includes('有电梯')
      ? '是'
      : p.lift;
  p.code = text.match(/房源核验码[:：]?(\d+)/)?.[1] || p.code;
  p.suggestedPrice =
    text.split('\n').map(amount).find(Boolean) || p.suggestedPrice;
  p.unitPrice = unitPrice(text) || p.unitPrice;
  const unit = text.match(/单价[:：]?(\d+(?:\.\d+)?)万元?\/(?:平|㎡|m)/i);
  if (unit) p.unitPrice = String(Number(unit[1]) * 10000);
  p.suggestedDate = quoteDate(text, now);
}

export function parseScreenshot(
  text: string,
  image: string,
  now = new Date(),
): Property[] {
  const compact = normalize(text);
  const lines = compact.split('\n').filter(Boolean);
  const entries: Property[] = [];
  // Area + direction + address forms a card anchor even when the room count is unreadable.
  const anchors = lines
    .map((line, index) => ({
      line,
      index,
      match: line.match(
        /(\d+(?:\.\d+)?)(?:㎡|m(?:[iI²2]|\^2)?)[^/]*\/([东西南北向]+)\/(.+)/i,
      ),
    }))
    .filter((a) => a.match);
  for (let n = 0; n < anchors.length; n++) {
    const { line, index, match: m } = anchors[n];
    if (!m) continue;
    const p = newProperty();
    p.images = [image];
    p.layout = line.match(/\d+室\d+厅/)?.[0] || '';
    p.area = m[1];
    p.direction = m[2];
    p.name = m[3].replace(/(?:地图|对比|近\d+天).*$/, '').trim();
    const end = anchors[n + 1]?.index ?? lines.length;
    const block = lines.slice(index, end);
    const priceLine = block.find((l) => amount(l));
    p.suggestedPrice = priceLine ? amount(priceLine) : '';
    // Unit price may wrap onto the following line, but may not cross into the next card.
    p.unitPrice = unitPrice(block.join('\n'));
    p.floor = floorValue(block.join('\n'));
    p.note = '';
    applySemanticFields(p, block.join('\n'), now);
    entries.push(p);
  }
  if (entries.length) return entries;
  const p = newProperty();
  p.images = [image];
  p.name = compact.match(/小区[“"：:]?([^\n(（》]+)[(（]/)?.[1] || '';
  applySemanticFields(p, compact, now);
  const location = compact.match(
    /小区[^\n]*[（(]([^:：·()（）]+)[:：·]([^()（）]+)[）)]/,
  );
  if (location) {
    p.region = location[1];
    p.district = location[2];
  } else {
    const directLocation = locationValue(compact);
    if (directLocation) {
      p.region = directLocation.region;
      p.district = directLocation.district;
    }
  }
  p.note = '';
  return [p];
}
