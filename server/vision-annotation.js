function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeConfidence(value) {
  return Math.min(1, Math.max(0, finiteNumber(value)))
}

function normalizeVertices(boundingPoly) {
  const sourceVertices = boundingPoly?.vertices ?? boundingPoly?.normalizedVertices ?? []
  const vertices = Array.from({ length: 4 }, (_, index) => ({
    // Vision REST may omit coordinates whose value is zero.
    x: finiteNumber(sourceVertices[index]?.x),
    y: finiteNumber(sourceVertices[index]?.y),
  }))

  const xs = vertices.map((vertex) => vertex.x)
  const ys = vertices.map((vertex) => vertex.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)

  return {
    vertices,
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

function normalizeDetectedLanguages(property) {
  return (property?.detectedLanguages ?? [])
    .map((language) => ({
      languageCode: typeof language.languageCode === 'string' ? language.languageCode : '',
      confidence: normalizeConfidence(language.confidence),
    }))
    .filter((language) => language.languageCode)
}

export function getDetectedBreakText(breakType) {
  switch (breakType) {
    case 'SPACE':
    case 'SURE_SPACE':
    case 1:
    case 2:
      return ' '
    case 'EOL_SURE_SPACE':
    case 'LINE_BREAK':
    case 3:
    case 5:
      return '\n'
    case 'HYPHEN':
    case 4:
      return '-\n'
    default:
      return ''
  }
}

function normalizeSymbol(symbol, symbolIndex) {
  const detectedBreakType = symbol.property?.detectedBreak?.type ?? null

  return {
    symbolIndex,
    text: typeof symbol.text === 'string' ? symbol.text : '',
    confidence: normalizeConfidence(symbol.confidence),
    boundingBox: normalizeVertices(symbol.boundingBox),
    detectedLanguages: normalizeDetectedLanguages(symbol.property),
    detectedBreak: {
      type: detectedBreakType,
      text: getDetectedBreakText(detectedBreakType),
      isPrefix: Boolean(symbol.property?.detectedBreak?.isPrefix),
    },
  }
}

function normalizeWord(word, indexes) {
  const symbols = (word.symbols ?? []).map(normalizeSymbol)

  return {
    ...indexes,
    text: symbols.map((symbol) => symbol.text).join(''),
    confidence: normalizeConfidence(word.confidence),
    boundingBox: normalizeVertices(word.boundingBox),
    detectedLanguages: normalizeDetectedLanguages(word.property),
    symbols,
  }
}

export function extractVisionPageText(page) {
  const paragraphs = []

  for (const block of page?.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      let paragraphText = ''

      for (const word of paragraph.words ?? []) {
        for (const symbol of word.symbols ?? []) {
          paragraphText += symbol.text ?? ''
          paragraphText += getDetectedBreakText(symbol.property?.detectedBreak?.type)
        }
      }

      const normalizedParagraph = paragraphText.replace(/[ \t]+\n/g, '\n').trim()
      if (normalizedParagraph) paragraphs.push(normalizedParagraph)
    }
  }

  return paragraphs.join('\n').trim()
}

export function normalizeVisionPage(page, metadata = {}) {
  const words = []
  const blockSummaries = []

  for (const [blockIndex, block] of (page?.blocks ?? []).entries()) {
    const paragraphSummaries = []

    for (const [paragraphIndex, paragraph] of (block.paragraphs ?? []).entries()) {
      const paragraphWords = (paragraph.words ?? []).map((word, wordIndex) => {
        const normalizedWord = normalizeWord(word, { blockIndex, paragraphIndex, wordIndex })
        words.push(normalizedWord)
        return normalizedWord
      })

      paragraphSummaries.push({
        paragraphIndex,
        confidence: normalizeConfidence(paragraph.confidence),
        boundingBox: normalizeVertices(paragraph.boundingBox),
        detectedLanguages: normalizeDetectedLanguages(paragraph.property),
        text: paragraphWords.map((word) => word.text).join(''),
        wordIndexes: paragraphWords.map((word) => words.indexOf(word)),
      })
    }

    blockSummaries.push({
      blockIndex,
      blockType: block.blockType ?? null,
      confidence: normalizeConfidence(block.confidence),
      boundingBox: normalizeVertices(block.boundingBox),
      paragraphs: paragraphSummaries,
    })
  }

  return {
    pageIndex: finiteNumber(metadata.pageIndex),
    sourceFileIndex: finiteNumber(metadata.sourceFileIndex),
    sourcePageIndex: finiteNumber(metadata.sourcePageIndex),
    width: Math.max(0, finiteNumber(page?.width)),
    height: Math.max(0, finiteNumber(page?.height)),
    confidence: normalizeConfidence(page?.confidence),
    detectedLanguages: normalizeDetectedLanguages(page?.property),
    text: extractVisionPageText(page),
    blocks: blockSummaries,
    words,
  }
}

export function normalizeVisionAnnotation(fullTextAnnotation, metadata = {}) {
  const pages = fullTextAnnotation?.pages ?? []
  const pageIndexOffset = finiteNumber(metadata.pageIndexOffset)
  const sourcePageIndexOffset = finiteNumber(metadata.sourcePageIndexOffset)

  return {
    text:
      typeof fullTextAnnotation?.text === 'string'
        ? fullTextAnnotation.text.replace(/\r\n?/g, '\n').trim()
        : '',
    pages: pages.map((page, index) =>
      normalizeVisionPage(page, {
        pageIndex: pageIndexOffset + index,
        sourceFileIndex: metadata.sourceFileIndex,
        sourcePageIndex: sourcePageIndexOffset + index,
      }),
    ),
  }
}

export function reindexVisionPages(pages) {
  return pages.map((page, pageIndex) => ({ ...page, pageIndex }))
}

export function createVisionPagePlaceholder(metadata = {}) {
  return {
    pageIndex: finiteNumber(metadata.pageIndex),
    sourceFileIndex: finiteNumber(metadata.sourceFileIndex),
    sourcePageIndex: finiteNumber(metadata.sourcePageIndex),
    width: 0,
    height: 0,
    confidence: 0,
    detectedLanguages: [],
    text: typeof metadata.text === 'string' ? metadata.text : '',
    blocks: [],
    words: [],
  }
}
