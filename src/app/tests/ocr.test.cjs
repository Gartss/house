const ts=require('typescript'),fs=require('fs'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {parseScreenshot}=require('../lib/ocr.ts');
const raw=fs.readFileSync('../../work/ocr/current-text.txt','utf8');const p=parseScreenshot(raw,'a'.repeat(64));
assert.equal(p.length,4);assert.deepEqual(p.map(p=>p.suggestedPrice),['190','185','185','165']);assert.deepEqual(p.map(p=>p.area),['50.65','53.2','52.62','52.64']);assert.deepEqual(p.map(p=>p.unitPrice),['37513','34775','35158','31345']);assert.equal(p[1].layout,'');assert.equal(p[1].note,'');assert.equal(p[3].name,'梅陇一村');assert(p.every(p=>!p.suggestedDate));
const cases=parseScreenshot('昨天降价3万\n2室1厅／50.65㎡／南／测试小区\n190万\n37,513元/平\n1室1厅/52.64m²/南/另一小区\n165万 31,345元/平','x');assert.deepEqual(cases.map(p=>p.suggestedPrice),['190','165']);assert.equal(cases[0].unitPrice,'37513');
const absent=parseScreenshot('2室1厅/50㎡/南/甲小区\n昨天降价3万\n1室1厅/60㎡/南/乙小区\n180万 30,000元/平','x');assert.equal(absent[0].suggestedPrice,'');assert.equal(absent[0].unitPrice,'');
console.log('PASS: current screenshot four cards; grouped unit prices; slash/unit variants; no price crossing; discount excluded; unknown layout/date preserved.');
