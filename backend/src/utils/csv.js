'use strict';
/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, embedded newlines). Returns array of objects keyed by header. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (inQuotes) throw new Error('Unterminated quoted field in CSV');
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r, i) => {
    const o = { __line: i + 2 };
    header.forEach((h, j) => { o[h] = (r[j] ?? '').trim(); });
    return o;
  });
}
module.exports = { parseCsv };
