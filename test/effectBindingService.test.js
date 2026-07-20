const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPageIndexMapper,
  extractEffectiveLines,
  remapWorkEffectBindings,
} = require('../services/effectBindingService');

function makeWork() {
  return {
    effectsDraft: [],
    effectsPublished: [],
    backgroundDraft: { images: [], bindings: [], transitions: [] },
    backgroundPublished: { images: [], bindings: [], transitions: [] },
  };
}

test('extractEffectiveLines matches the editor effective-line rules', () => {
  const lines = extractEffectiveLines({
    ops: [
      { insert: ' first line \n\nsecond' },
      { insert: { image: 'ignored' } },
      { insert: ' line\n' },
    ],
  });

  assert.deepEqual(lines, ['first line', 'second line']);
});

test('inserting a sentence shifts later bindings without moving the target', () => {
  const work = makeWork();
  work.effectsDraft = [{ lineIndex: 6, effectType: 'flash' }];
  work.backgroundDraft.bindings = [{ imageId: 'bg', imageName: 'bg', startLine: 5, endLine: 7 }];

  remapWorkEffectBindings(work, {
    oldLines: ['A', 'B', 'C'],
    newLines: ['new', 'A', 'B', 'C'],
    pageStartIndex: 5,
  });

  assert.equal(work.effectsDraft[0].lineIndex, 7);
  assert.equal(work.effectsDraft[0].anchor.text, 'B');
  assert.deepEqual(
    work.backgroundDraft.bindings.map(({ startLine, endLine }) => ({ startLine, endLine })),
    [{ startLine: 6, endLine: 8 }]
  );
});

test('deleting the bound sentence removes its text effect instead of applying it to the next sentence', () => {
  const work = makeWork();
  work.effectsDraft = [
    { lineIndex: 10, effectType: 'flash' },
    { lineIndex: 11, effectType: 'glow' },
  ];

  remapWorkEffectBindings(work, {
    oldLines: ['delete me', 'keep me'],
    newLines: ['keep me'],
    pageStartIndex: 10,
  });

  assert.deepEqual(
    work.effectsDraft.map(({ lineIndex, effectType }) => ({ lineIndex, effectType })),
    [{ lineIndex: 10, effectType: 'glow' }]
  );
});

test('background endpoints clamp inward when one endpoint sentence is deleted', () => {
  const work = makeWork();
  work.backgroundDraft.bindings = [
    { imageId: 'bg', imageName: 'bg', startLine: 11, endLine: 12 },
  ];

  remapWorkEffectBindings(work, {
    oldLines: ['before', 'deleted start', 'kept end'],
    newLines: ['before', 'kept end'],
    pageStartIndex: 10,
  });

  assert.deepEqual(
    work.backgroundDraft.bindings.map(({ startLine, endLine }) => ({ startLine, endLine })),
    [{ startLine: 11, endLine: 11 }]
  );
});

test('editing a sentence in place keeps the binding and refreshes its anchor', () => {
  const mapper = createPageIndexMapper(
    ['before', 'old wording', 'after'],
    ['before', 'new wording', 'after'],
    20
  );

  assert.equal(mapper.mapIndex(21), 21);
  assert.deepEqual(mapper.newAnchorForIndex(21), {
    text: 'new wording',
    before: 'before',
    after: 'after',
  });
});

test('deleting a page drops bindings inside it and shifts later bindings', () => {
  const work = makeWork();
  work.effectsPublished = [
    { lineIndex: 3, effectType: 'flash' },
    { lineIndex: 6, effectType: 'fade' },
  ];
  work.backgroundPublished.bindings = [
    { imageId: 'bg', imageName: 'bg', startLine: 2, endLine: 6 },
    { imageId: 'gone', imageName: 'gone', startLine: 3, endLine: 4 },
  ];

  remapWorkEffectBindings(work, {
    oldLines: ['page line 1', 'page line 2'],
    newLines: [],
    pageStartIndex: 3,
  });

  assert.deepEqual(
    work.effectsPublished.map(({ lineIndex, effectType }) => ({ lineIndex, effectType })),
    [{ lineIndex: 4, effectType: 'fade' }]
  );
  assert.deepEqual(
    work.backgroundPublished.bindings.map(({ imageId, startLine, endLine }) => ({
      imageId,
      startLine,
      endLine,
    })),
    [{ imageId: 'bg', startLine: 2, endLine: 4 }]
  );
});
