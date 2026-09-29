const ts = require('typescript');
const fs = require('fs');
const assert = require('node:assert/strict');

require.extensions['.ts'] = (module, path) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(path, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    path,
  );

const {
  isListingDocumentText,
  parseFloorPlanRoomsFromText,
  parseScreenshot,
} = require('../lib/ocr.ts');
const { pdfPageCount } = require('../app/tencent-ocr.ts');

const screenshotText = [
  '卧室B', '2815', '11.2m', '厨房', '客厅', '8.7m', '卫生间', '3.4m',
  '卧室A', '14.8m', '169万', '2室1厅', '59.27m', '售价', '房型', '建筑面积',
  '单价:2.9万元/平', '闵行·梅陇>', '房源核验码202610893796', '1996年',
  '南北朝向', '无电梯',
].join('\n');

const [property] = parseScreenshot(screenshotText, '');
assert.equal(property.suggestedPrice, '169');
assert.equal(property.area, '59.27', '建筑面积标签附近的 59.27 应优先于户型图中的房间面积');
assert.equal(property.layout, '2室1厅');
assert.equal(property.code, '202610893796');

const [pdfProperty] = parseScreenshot([
  '益文路79弄',
  '1室1厅/建筑面积54.1m2/1995(仅供参考)/满五',
  '房屋总价',
  '200万',
  '建筑面积:',
  '54.1m2',
  '房源编号:',
  '107116249531',
].join('\n'), '');
assert.equal(pdfProperty.area, '54.1', '地址门牌号不能被识别成建筑面积');
assert.equal(pdfProperty.code, '107116249531');
assert.equal(isListingDocumentText('基本情况\n房屋总价\n200万'), true);
assert.equal(isListingDocumentText('08月参考均价\n周边配套\n最近成交记录'), false);

assert.deepEqual(
  parseFloorPlanRoomsFromText(screenshotText).map(({ name, area, included }) => ({ name, area, included })),
  [
    { name: '卧室B', area: '11.2', included: true },
    { name: '厨房', area: '', included: true },
    { name: '客厅', area: '8.7', included: true },
    { name: '卫生间', area: '3.4', included: true },
    { name: '卧室A', area: '14.8', included: true },
  ],
);

const fakePdf = new TextEncoder().encode(
  `%PDF-1.7\n${Array.from({ length: 11 }, (_, index) => `${index + 1} 0 obj << /Type /Page >> endobj`).join('\n')}`,
);
assert.equal(pdfPageCount(fakePdf), 11);

console.log('PASS: mini-program OCR extracts listing values, floor-plan rooms, and every PDF page.');
