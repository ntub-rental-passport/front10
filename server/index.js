import 'dotenv/config';
import path from 'node:path';
import process from 'node:process';
import express from 'express';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';
import vision from '@google-cloud/vision';

const app = express();
const port = Number(process.env.OCR_API_PORT || 8787);
const maxFileSizeMb = Number(process.env.OCR_MAX_FILE_SIZE_MB || 20);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
  },
});

const imageClient = new vision.ImageAnnotatorClient();
const fileClient = new vision.v1.ImageAnnotatorClient();

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
]);

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/tiff',
  'image/gif',
]);

function parseLanguageHints(rawValue) {
  if (!rawValue) return ['zh-TW', 'en'];

  if (Array.isArray(rawValue)) {
    return rawValue.flatMap((value) => parseLanguageHints(value));
  }

  if (typeof rawValue !== 'string') {
    return ['zh-TW', 'en'];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Ignore JSON parse errors and fall back to comma-separated parsing.
  }

  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getUserFacingError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('Could not load the default credentials') ||
    message.includes('Could not load the default credentials from any providers')
  ) {
    return '找不到 Google Cloud 憑證。請先設定 GOOGLE_APPLICATION_CREDENTIALS 指向服務帳戶 JSON 金鑰。';
  }

  if (message.includes('unsupported file')) {
    return '目前僅支援 PDF、PNG、JPG、JPEG、WEBP、BMP、TIFF 與 GIF。';
  }

  if (message.includes('Request payload size exceeds')) {
    return '檔案太大，請縮小檔案後再試。';
  }

  return message;
}

function decodeUploadedFileName(fileName) {
  if (!fileName || /^[\x00-\x7F]*$/.test(fileName)) return fileName;

  const decodedFileName = Buffer.from(fileName, 'latin1').toString('utf8');
  return decodedFileName.includes('\uFFFD') ? fileName : decodedFileName;
}

async function recognizeImage(buffer, languageHints) {
  const request = {
    image: { content: buffer },
    imageContext: languageHints.length ? { languageHints } : undefined,
  };

  const [result] = await imageClient.documentTextDetection(request);
  const text = result.fullTextAnnotation?.text?.trim() || '';

  return {
    text,
    pageCount: text ? 1 : 0,
    pageTexts: text ? [text] : [],
    warnings: [],
    engine: 'DOCUMENT_TEXT_DETECTION',
  };
}

function getDetectedBreakText(breakType) {
  switch (breakType) {
    case 'SPACE':
    case 'SURE_SPACE':
    case 1:
    case 2:
      return ' ';
    case 'EOL_SURE_SPACE':
    case 'LINE_BREAK':
    case 3:
    case 5:
      return '\n';
    case 'HYPHEN':
    case 4:
      return '-\n';
    default:
      return '';
  }
}

function extractVisionPageText(page) {
  const paragraphs = [];

  for (const block of page?.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      let paragraphText = '';

      for (const word of paragraph.words ?? []) {
        for (const symbol of word.symbols ?? []) {
          paragraphText += symbol.text ?? '';
          paragraphText += getDetectedBreakText(symbol.property?.detectedBreak?.type);
        }
      }

      const normalizedParagraph = paragraphText.replace(/[ \t]+\n/g, '\n').trim();
      if (normalizedParagraph) paragraphs.push(normalizedParagraph);
    }
  }

  return paragraphs.join('\n').trim();
}

function extractDocumentPageTexts(responses) {
  const annotationPages = responses.flatMap(
    (response) => response.fullTextAnnotation?.pages ?? [],
  );

  // Vision 有時只在第一個 response.text 放入整份 PDF；pages 才是真正逐頁資料。
  if (annotationPages.length > 1) {
    return annotationPages.map(extractVisionPageText);
  }

  return responses.map(
    (response) => response.fullTextAnnotation?.text?.replace(/\r\n?/g, '\n').trim() || '',
  );
}

async function recognizeDocument(buffer, mimeType, languageHints) {
  const createFileRequest = (pages) => ({
    inputConfig: {
      mimeType,
      content: buffer,
    },
    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
    imageContext: languageHints.length ? { languageHints } : undefined,
    pages,
  });

  let pageTexts = [];
  let sourcePageCount = 0;

  if (mimeType === 'application/pdf') {
    const pdfDocument = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    sourcePageCount = pdfDocument.getPageCount();
    const pagesToRecognize = Math.min(sourcePageCount, 5);

    // 每次明確指定一頁，避免 Vision 將整份 PDF 全文放進第一個 response。
    for (let pageNumber = 1; pageNumber <= pagesToRecognize; pageNumber += 1) {
      const [pageResult] = await fileClient.batchAnnotateFiles({
        requests: [createFileRequest([pageNumber])],
      });
      const pageResponses = pageResult.responses?.[0]?.responses ?? [];
      const recognizedPageTexts = extractDocumentPageTexts(pageResponses);
      pageTexts.push(recognizedPageTexts.find(Boolean) ?? '');
    }
  } else {
    const [result] = await fileClient.batchAnnotateFiles({
      requests: [createFileRequest(undefined)],
    });
    const responses = result.responses?.[0]?.responses ?? [];
    pageTexts = extractDocumentPageTexts(responses);
    sourcePageCount = pageTexts.length;
  };

  const warnings = [];
  if (mimeType === 'application/pdf') {
    warnings.push('Vision API 的同步 PDF OCR 單次最多適合處理 5 頁；較長租約建議改成雲端批次流程。');
    if (sourcePageCount > 5) {
      warnings.push(`此 PDF 共 ${sourcePageCount} 頁，本次僅辨識前 5 頁。`);
    }
  }

  const blankPageNumbers = pageTexts
    .map((pageText, index) => pageText ? null : index + 1)
    .filter((pageNumber) => pageNumber !== null);

  if (blankPageNumbers.length) {
    warnings.push(`第 ${blankPageNumbers.join('、')} 頁未辨識到文字，請在契約編輯器中逐頁確認。`);
  }

  return {
    // 保留頁面順序，空白頁不會讓後續頁碼錯位。
    text: pageTexts.map((pageText) => pageText.trimEnd()).join('\n\n').trim(),
    pageCount: pageTexts.length,
    pageTexts,
    warnings,
    engine: mimeType === 'application/pdf'
      ? 'batchAnnotateFiles(DOCUMENT_TEXT_DETECTION, PER_PAGE)'
      : 'batchAnnotateFiles(DOCUMENT_TEXT_DETECTION)',
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'rentmate-ocr-api',
    credentialsConfigured: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  });
});

app.post('/api/ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '請先選擇要辨識的檔案。' });
    }

    const { file } = req;
    const mimeType = file.mimetype;
    const languageHints = parseLanguageHints(req.body.languageHints);

    if (!IMAGE_MIME_TYPES.has(mimeType) && !DOCUMENT_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({ error: 'unsupported file type' });
    }

    const result = DOCUMENT_MIME_TYPES.has(mimeType)
      ? await recognizeDocument(file.buffer, mimeType, languageHints)
      : await recognizeImage(file.buffer, languageHints);

    if (!result.text) {
      return res.status(422).json({
        error: 'OCR 沒有辨識到可用文字，請改用更清晰的掃描檔或照片再試一次。',
      });
    }

    return res.json({
      fileName: path.basename(decodeUploadedFileName(file.originalname)),
      mimeType,
      size: file.size,
      languageHints,
      ...result,
    });
  } catch (error) {
    console.error('[OCR] failed:', error);
    return res.status(500).json({
      error: getUserFacingError(error),
    });
  }
});

app.listen(port, () => {
  console.log(`OCR API listening on http://localhost:${port}`);
});
