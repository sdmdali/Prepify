'use strict';
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { AppError } = require('../utils/errors');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    const valid = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
    cb(valid ? null : new AppError(415, 'PDF_ONLY', 'Please upload a PDF syllabus.'), valid);
  },
});

exports.uploadMiddleware = upload.single('syllabus');
exports.extract = async (req, res) => {
  if (!req.file) throw new AppError(400, 'PDF_REQUIRED', 'Choose a syllabus PDF first.');
  const signature = req.file.buffer.subarray(0, 5).toString('ascii');
  if (signature !== '%PDF-') throw new AppError(415, 'INVALID_PDF', 'The uploaded file is not a valid PDF.');
  let parsed;
  try { parsed = await pdfParse(req.file.buffer); }
  catch (_) { throw new AppError(422, 'PDF_READ_FAILED', 'Prepify could not read this PDF. Try a text-based PDF rather than a scanned document.'); }
  const text = String(parsed.text || '').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim();
  if (text.length < 100) throw new AppError(422, 'PDF_NO_TEXT', 'This PDF has too little selectable text. It may be scanned; OCR is not enabled yet.');
  if (text.length > 80000) throw new AppError(413, 'SYLLABUS_TOO_LONG', 'This syllabus is too long to process at once. Please upload a shorter or condensed syllabus PDF.');
  res.json({ success: true, data: { text, pages: parsed.numpages, characters: text.length, fileName: req.file.originalname } });
};
