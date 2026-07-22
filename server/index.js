import 'dotenv/config';
import path from 'node:path';
import process from 'node:process';
import express from 'express';
import multer from 'multer';
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

async function recognizeDocument(buffer, mimeType, languageHints) {
  const request = {
    requests: [
      {
        inputConfig: {
          mimeType,
          content: buffer,
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: languageHints.length ? { languageHints } : undefined,
      },
    ],
  };

  const [result] = await fileClient.batchAnnotateFiles(request);
  const responses = result.responses?.[0]?.responses ?? [];
  const pageTexts = responses
    .map((response) => response.fullTextAnnotation?.text?.trim() || '');

  const warnings = [];
  if (mimeType === 'application/pdf') {
    warnings.push('Vision API 的同步 PDF OCR 單次最多適合處理 5 頁；較長租約建議改成雲端批次流程。');
  }

  return {
    text: pageTexts.filter(Boolean).join('\n\n'),
    pageCount: responses.length,
    pageTexts,
    warnings,
    engine: 'batchAnnotateFiles(DOCUMENT_TEXT_DETECTION)',
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
      fileName: path.basename(file.originalname),
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
