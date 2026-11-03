'use strict';
/** MySQL DATETIME (UTC) <-> Date helpers. DB connection uses timezone 'Z' and dateStrings. */
const toSql = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');
const fromSql = (s) => (s instanceof Date ? s : new Date(String(s).replace(' ', 'T') + 'Z'));
module.exports = { toSql, fromSql };
