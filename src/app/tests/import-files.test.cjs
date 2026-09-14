const ts = require('typescript');
const fs = require('fs');
const assert = require('node:assert/strict');

require.extensions['.ts'] = (module, path) =>
  module._compile(
    ts.transpileModule(
      fs
        .readFileSync(path, 'utf8')
        .replace('import.meta.url', "'file:///test/import-files.js'"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    path,
  );

const { IMPORT_ACCEPT, importFileKind, pdfTextLines } = require('../lib/import-files.ts');

assert.equal(importFileKind({ name: 'house.JPG', type: 'image/jpeg' }), 'image');
assert.equal(importFileKind({ name: 'house.pdf', type: 'application/pdf' }), 'pdf');
assert.equal(importFileKind({ name: 'house.PDF', type: '' }), 'pdf');
assert.equal(importFileKind({ name: 'house.docx', type: '' }), 'unsupported');
assert.match(IMPORT_ACCEPT, /application\/pdf/);
assert.equal(
  pdfTextLines([
    { str: '200万', transform: [1, 0, 0, 1, 20, 80] },
    { str: '益文路79弄', transform: [1, 0, 0, 1, 10, 100] },
    { str: '房屋总价', transform: [1, 0, 0, 1, 10, 80] },
  ]),
  '益文路79弄\n房屋总价 200万',
);

console.log('PASS: image and PDF import types are classified correctly.');
