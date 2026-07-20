function normalizeSentenceText(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}

function extractEffectiveLines(delta) {
  if (!delta || typeof delta !== 'object' || !Array.isArray(delta.ops)) return [];

  const text = delta.ops
    .map((op) => (typeof op?.insert === 'string' ? op.insert : ''))
    .join('');

  return text
    .split(/\r?\n/)
    .map(normalizeSentenceText)
    .filter(Boolean);
}

function makeSentenceAnchor(lines, index) {
  if (!Array.isArray(lines) || !Number.isInteger(index) || index < 0 || index >= lines.length) {
    return undefined;
  }

  return {
    text: normalizeSentenceText(lines[index]),
    before: index > 0 ? normalizeSentenceText(lines[index - 1]) : '',
    after: index + 1 < lines.length ? normalizeSentenceText(lines[index + 1]) : '',
  };
}

function buildStablePairs(oldLines, newLines) {
  const oldValues = oldLines.map(normalizeSentenceText);
  const newValues = newLines.map(normalizeSentenceText);
  const pairs = [];

  let prefix = 0;
  while (
    prefix < oldValues.length &&
    prefix < newValues.length &&
    oldValues[prefix] === newValues[prefix]
  ) {
    pairs.push([prefix, prefix]);
    prefix += 1;
  }

  let oldSuffix = oldValues.length - 1;
  let newSuffix = newValues.length - 1;
  const suffixPairs = [];
  while (
    oldSuffix >= prefix &&
    newSuffix >= prefix &&
    oldValues[oldSuffix] === newValues[newSuffix]
  ) {
    suffixPairs.push([oldSuffix, newSuffix]);
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  const oldOccurrences = new Map();
  const newOccurrences = new Map();

  for (let i = prefix; i <= oldSuffix; i += 1) {
    const value = oldValues[i];
    const list = oldOccurrences.get(value) || [];
    list.push(i);
    oldOccurrences.set(value, list);
  }
  for (let i = prefix; i <= newSuffix; i += 1) {
    const value = newValues[i];
    const list = newOccurrences.get(value) || [];
    list.push(i);
    newOccurrences.set(value, list);
  }

  const candidates = [];
  oldOccurrences.forEach((oldIndexes, value) => {
    const newIndexes = newOccurrences.get(value);
    if (oldIndexes.length === 1 && newIndexes?.length === 1) {
      candidates.push([oldIndexes[0], newIndexes[0]]);
    }
  });
  candidates.sort((a, b) => a[0] - b[0]);

  // Longest increasing subsequence by new index keeps the exact-text anchors ordered.
  const tails = [];
  const tailCandidateIndexes = [];
  const previous = new Array(candidates.length).fill(-1);

  candidates.forEach((pair, candidateIndex) => {
    const value = pair[1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (tails[mid] < value) lo = mid + 1;
      else hi = mid;
    }

    tails[lo] = value;
    previous[candidateIndex] = lo > 0 ? tailCandidateIndexes[lo - 1] : -1;
    tailCandidateIndexes[lo] = candidateIndex;
  });

  if (tailCandidateIndexes.length) {
    let cursor = tailCandidateIndexes[tailCandidateIndexes.length - 1];
    const middlePairs = [];
    while (cursor >= 0) {
      middlePairs.push(candidates[cursor]);
      cursor = previous[cursor];
    }
    middlePairs.reverse().forEach((pair) => pairs.push(pair));
  }

  suffixPairs.reverse().forEach((pair) => pairs.push(pair));
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs;
}

function createPageIndexMapper(oldLines, newLines, pageStartIndex) {
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  const shift = newCount - oldCount;
  const stablePairs = buildStablePairs(oldLines, newLines);
  const direct = new Map(stablePairs);
  const boundaries = [[-1, -1], ...stablePairs, [oldCount, newCount]];

  function mapLocalIndex(oldLocalIndex) {
    if (direct.has(oldLocalIndex)) return direct.get(oldLocalIndex);

    let before = boundaries[0];
    let after = boundaries[boundaries.length - 1];
    for (let i = 1; i < boundaries.length; i += 1) {
      if (boundaries[i][0] > oldLocalIndex) {
        after = boundaries[i];
        before = boundaries[i - 1];
        break;
      }
    }

    const oldGapCount = after[0] - before[0] - 1;
    const newGapCount = after[1] - before[1] - 1;
    const offsetInGap = oldLocalIndex - before[0] - 1;

    if (oldGapCount === newGapCount && newGapCount > 0) {
      return before[1] + 1 + offsetInGap;
    }

    const wantedText = normalizeSentenceText(oldLines[oldLocalIndex]);
    const exactMatches = [];
    for (let i = before[1] + 1; i < after[1]; i += 1) {
      if (normalizeSentenceText(newLines[i]) === wantedText) exactMatches.push(i);
    }
    return exactMatches.length === 1 ? exactMatches[0] : null;
  }

  function mapIndex(rawIndex, direction = 'none') {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0) return null;
    if (index < pageStartIndex) return index;
    if (index >= pageStartIndex + oldCount) return index + shift;

    const oldLocalIndex = index - pageStartIndex;
    const mappedLocalIndex = mapLocalIndex(oldLocalIndex);
    if (mappedLocalIndex !== null) return pageStartIndex + mappedLocalIndex;

    if (direction === 'forward') {
      const nextStablePair = stablePairs.find(([oldIndex]) => oldIndex > oldLocalIndex);
      if (nextStablePair) return pageStartIndex + nextStablePair[1];
      return pageStartIndex + newCount;
    }
    if (direction === 'backward') {
      const previousStablePair = stablePairs
        .slice()
        .reverse()
        .find(([oldIndex]) => oldIndex < oldLocalIndex);
      const previousIndex = previousStablePair
        ? pageStartIndex + previousStablePair[1]
        : pageStartIndex - 1;
      return previousIndex >= 0 ? previousIndex : null;
    }
    return null;
  }

  return {
    mapIndex,
    newAnchorForIndex(globalIndex) {
      const localIndex = globalIndex - pageStartIndex;
      return makeSentenceAnchor(newLines, localIndex);
    },
  };
}

function plainObject(value) {
  if (!value) return value;
  return typeof value.toObject === 'function' ? value.toObject() : { ...value };
}

function withRefreshedAnchor(item, anchorField, mappedIndex, mapper) {
  const freshAnchor = mapper.newAnchorForIndex(mappedIndex);
  if (freshAnchor) item[anchorField] = freshAnchor;
  return item;
}

function remapEffects(effects, mapper) {
  if (!Array.isArray(effects)) return [];

  return effects.flatMap((rawEffect) => {
    const effect = plainObject(rawEffect);
    const lineIndex = mapper.mapIndex(effect.lineIndex);
    if (lineIndex === null) return [];
    effect.lineIndex = lineIndex;
    return [withRefreshedAnchor(effect, 'anchor', lineIndex, mapper)];
  });
}

function remapBackground(config, mapper) {
  const source = plainObject(config) || {};
  const images = Array.isArray(source.images) ? source.images.map(plainObject) : [];
  const bindings = Array.isArray(source.bindings) ? source.bindings : [];
  const transitions = Array.isArray(source.transitions) ? source.transitions : [];

  return {
    images,
    bindings: bindings.flatMap((rawBinding) => {
      const binding = plainObject(rawBinding);
      const startLine = mapper.mapIndex(binding.startLine, 'forward');
      const endLine = mapper.mapIndex(binding.endLine, 'backward');
      if (startLine === null || endLine === null || startLine > endLine) return [];

      binding.startLine = startLine;
      binding.endLine = endLine;
      withRefreshedAnchor(binding, 'startAnchor', startLine, mapper);
      withRefreshedAnchor(binding, 'endAnchor', endLine, mapper);
      return [binding];
    }),
    transitions: transitions.flatMap((rawTransition) => {
      const transition = plainObject(rawTransition);
      const fromLine = mapper.mapIndex(transition.fromLine, 'backward');
      const toLine = mapper.mapIndex(transition.toLine, 'forward');
      if (fromLine === null || toLine === null || fromLine >= toLine) return [];

      transition.fromLine = fromLine;
      transition.toLine = toLine;
      withRefreshedAnchor(transition, 'fromAnchor', fromLine, mapper);
      withRefreshedAnchor(transition, 'toAnchor', toLine, mapper);
      return [transition];
    }),
  };
}

function remapWorkEffectBindings(work, { oldLines, newLines, pageStartIndex }) {
  const mapper = createPageIndexMapper(oldLines, newLines, pageStartIndex);

  work.effectsDraft = remapEffects(work.effectsDraft, mapper);
  work.effectsPublished = remapEffects(work.effectsPublished, mapper);
  work.backgroundDraft = remapBackground(work.backgroundDraft, mapper);
  work.backgroundPublished = remapBackground(work.backgroundPublished, mapper);
}

module.exports = {
  createPageIndexMapper,
  extractEffectiveLines,
  makeSentenceAnchor,
  normalizeSentenceText,
  remapWorkEffectBindings,
};
