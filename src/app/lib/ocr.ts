import { newProperty, Property } from './model';
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
  if (/降价|涨价|首付|月供|租金|万\/月|元\/月/.test(line)) return '';
  return line.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)万/)?.[1] || '';
}
function unitPrice(text: string) {
  const m = text.match(/(\d{1,3}(?:[,.]\d{3})+|\d{4,7})元\/(?:平|㎡|m)/i);
  return m ? m[1].replace(/[,.]/g, '') : '';
}
function floorValue(text: string) {
  return (
    text.match(
      /(?:低|中|高)楼层(?:[（(]共?\d+层[）)]|\/共?\d+层|共?\d+层)/,
    )?.[0] || ''
  );
}
export function parseScreenshot(text: string, image: string): Property[] {
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
    entries.push(p);
  }
  if (entries.length) return entries;
  const p = newProperty();
  p.images = [image];
  p.layout = compact.match(/\d+室\d+厅/)?.[0] || '';
  p.area = compact.match(areaPattern)?.[1] || '';
  p.year = compact.match(/(19\d{2}|20\d{2})年/)?.[1] || '';
  p.floor = floorValue(compact);
  p.direction = compact.match(/([东西南北]+)朝向/)?.[1] || '';
  p.lift = compact.includes('无电梯')
    ? '否'
    : compact.includes('有电梯')
      ? '是'
      : '';
  p.name = compact.match(/小区[“"：:]?([^\n(（》]+)[(（]/)?.[1] || '';
  p.suggestedPrice = lines.map(amount).find(Boolean) || '';
  p.unitPrice = unitPrice(compact);
  const unit = compact.match(/单价[:：](\d+(?:\.\d+)?)万/);
  if (unit) p.unitPrice = String(Number(unit[1]) * 10000);
  const location = compact.match(
    /小区[^\n]*[（(]([^:：·()（）]+)[:：·]([^()（）]+)[）)]/,
  );
  if (location) {
    p.region = location[1];
    p.district = location[2];
  }
  p.note = '';
  return [p];
}
