'use strict';
const crypto = require('crypto');
/** Normalise text for duplicate detection (case/whitespace-insensitive). */
const normalise = (t) => String(t).toLowerCase().replace(/\s+/g, ' ').trim();
const textHash = (t) => crypto.createHash('sha256').update(normalise(t)).digest('hex');
const randomCode = (len = 8) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};
module.exports = { normalise, textHash, randomCode };
