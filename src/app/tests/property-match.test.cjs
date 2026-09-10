const ts = require('typescript'),
  fs = require('fs'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (m, p) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(p, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    p,
  );
const { newProperty } = require('../lib/model.ts');
const {
  sameProperty,
  mergeImportedDrafts,
} = require('../lib/property-match.ts');
const imageA = 'a'.repeat(64),
  imageB = 'b'.repeat(64);
const property = (overrides) => ({
  ...newProperty(),
  name: '古美一村',
  area: '50.15',
  layout: '1室1厅',
  images: [imageA],
  ...overrides,
});
assert(
  sameProperty(
    property({ code: '123' }),
    property({ code: '123', area: '60' }),
  ),
);
assert(!sameProperty(property({ code: '123' }), property({ code: '456' })));
assert(
  sameProperty(
    property({ floor: '高楼层' }),
    property({ floor: '高楼层', direction: '南', images: [imageB] }),
  ),
);
assert(
  !sameProperty(property({ layout: '1室1厅' }), property({ layout: '2室1厅' })),
);
assert(
  !sameProperty(
    property({ floor: '' }),
    property({ floor: '', direction: '南' }),
  ),
);
let state = {
  properties: [],
  drafts: [
    {
      id: 'd1',
      image: imageA,
      text: 'a',
      properties: [property({ floor: '高楼层' })],
    },
    {
      id: 'd2',
      image: imageB,
      text: 'b',
      properties: [
        property({ floor: '高楼层', direction: '南', images: [imageB] }),
      ],
    },
  ],
};
state = mergeImportedDrafts(state);
assert.equal(state.drafts.length, 1);
assert.equal(state.drafts[0].properties.length, 1);
assert.equal(state.drafts[0].properties[0].direction, '南');
assert.deepEqual(state.drafts[0].properties[0].images, [imageA, imageB]);
const saved = property({ id: 'saved', code: '9988' });
state = {
  properties: [saved],
  drafts: [
    {
      id: 'd3',
      image: imageB,
      text: 'c',
      properties: [property({ code: '9988', images: [imageB] })],
    },
  ],
};
state = mergeImportedDrafts(state);
assert.equal(state.drafts[0].properties[0].suggestedTarget, 'saved');
console.log(
  'PASS: exact identifiers and strong listing fingerprints merge imported screenshots; conflicts stay separate; saved property target is suggested.',
);
