const ts = require('typescript');
const fs = require('fs');
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');

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

const { sha256HexPortable } = require('../lib/image-hash.ts');

function expected(value) {
  return nodeCrypto.createHash('sha256').update(value).digest('hex');
}

for (const value of [
  Buffer.alloc(0),
  Buffer.from('abc'),
  Buffer.from('House 手机图片导入兼容测试'),
  Buffer.alloc(1024 * 1024, 0xa5),
]) {
  assert.equal(sha256HexPortable(value), expected(value));
}

console.log('PASS: portable image hashing matches SHA-256.');
