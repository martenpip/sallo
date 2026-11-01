// Reads a bank statement (CSV) on the device. Pure functions: no DOM, no network, easy to test.
import { parseMinor } from './money.js';
import { detectCategory } from './categorize.js';

// ---------- parsing the file ----------
export function parseCSV(text, delimiter) {
  text = String(text || '').replace(/^﻿/, '');
  const delim = delimiter || sniffDelimiter(text);
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return { rows: rows.map((r) => r.map((x) => x.trim())), delimiter: delim };
}
function sniffDelimiter(text) {
  const lines = text.split(/\r?\n/).slice(0, 12).filter((l) => l.trim());
  let best = ',', bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => { let n = 0, q = false; for (const c of l) { if (c === '"') q = !q; else if (c === d && !q) n++; } return n; });
    const min = Math.min(...counts, 99);
    const score = counts.length && counts.every((n) => n === counts[0]) && counts[0] > 0 ? counts[0] * 10 + 5 : min;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

// ---------- dates ----------
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** order: 'ymd' | 'dmy' | 'mdy'. Returns 'yyyy-MM-dd' or null. */
export function parseDate(s, order = 'dmy') {
  s = String(s || '').trim();
  if (!s) return null;
  const named = s.match(/^(\d{1,2})[ .\-/]([A-Za-z]{3})[a-z]*[ .\-/,]+(\d{2,4})/);
  let y, m, d;
  if (named) { d = +named[1]; m = MONTHS.indexOf(named[2].toLowerCase()) + 1; y = +named[3]; if (!m) return null; }
  else {
    const iso = s.match(/^(\d{4})[-./ ](\d{1,2})[-./ ](\d{1,2})/);
    if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
    else {
      const x = s.match(/^(\d{1,2})[-./ ](\d{1,2})[-./ ](\d{2}|\d{4})(?!\d)/);
      if (!x) return null;
      const a = +x[1], b = +x[2]; y = +x[3];
      if (order === 'mdy') { m = a; d = b; } else { d = a; m = b; }
    }
  }
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** Looks at the date column: if a first number is above 12 it's day-first; if a second one is, month-first. */
export function guessDateOrder(samples) {
  let dmy = 0, mdy = 0;
  for (const s of samples) {
    if (/^\d{4}[-./ ]/.test(String(s).trim())) return 'ymd';
    const x = String(s).trim().match(/^(\d{1,2})[-./ ](\d{1,2})[-./ ]\d{2,4}/);
    if (!x) continue;
    if (+x[1] > 12) dmy++; if (+x[2] > 12) mdy++;
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}

// ---------- amounts ----------
/** Returns minor units (signed) or null. decimal: '.' or ','. */
export function parseAmount(s, exp = 2, decimal = '.') {
  let t = String(s ?? '').trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[−–—]/g, '-');
  if (/-\s*$/.test(t)) { neg = !neg; t = t.replace(/-\s*$/, ''); }
  if (/^\s*-/.test(t)) { neg = !neg; t = t.replace(/^\s*-/, ''); }
  if (/^\s*\+/.test(t)) t = t.replace(/^\s*\+/, '');
  if (/cr\s*$/i.test(t)) t = t.replace(/cr\s*$/i, '');
  if (/dr\s*$/i.test(t)) { neg = !neg; t = t.replace(/dr\s*$/i, ''); }
  t = t.replace(/[^0-9.,]/g, '');
  if (!/\d/.test(t)) return null;
  const group = decimal === ',' ? '.' : ',';
  t = t.split(group).join('');
  if (decimal === ',') t = t.replace(',', '.');
  if ((t.match(/\./g) || []).length > 1) return null;
  const v = parseMinor(t, exp);
  if (v === null || !Number.isSafeInteger(v)) return null;
  return neg ? -v : v;
}
export function guessDecimal(samples) {
  let comma = 0, dot = 0;
  for (const s of samples) {
    const t = String(s).trim();
    if (/,\d{1,2}\s*[A-Za-z€$£]*\)?$/.test(t) && !/\.\d{1,2}$/.test(t)) comma++;
    if (/\.\d{1,2}\s*[A-Za-z€$£]*\)?$/.test(t) && !/,\d{1,2}$/.test(t)) dot++;
  }
  return comma > dot ? ',' : '.';
}

// ---------- columns ----------
const HEAD = {
  date: /(^|\b)(date|datum|kuup|buchung|data|fecha|posted|booking|valuta|transaction date)/i,
  desc: /(descr|detail|narrat|memo|reference|payee|merchant|counterpart|beneficiar|selgitus|saaja|maksja|text|verwendung|opis|concept|concepto|name|nimi|info|particulars|note)/i,
  amount: /^(amount|sum|summa|betrag|value|importe|kogus|transaction amount|amount \(.+\))$/i,
  debit: /(debit|withdraw|paid out|money out|outgoing|deebet|soll|expense|out\b)/i,
  credit: /(credit|deposit|paid in|money in|incoming|kreedit|haben|income|in\b)/i,
  dir: /(d\/k|dk|direction|type|tüüp|deebet\/kreedit|cr\/dr|dr\/cr|indicator|soll\/haben)/i,
};
const looksHeader = (row) => row.length >= 2 && row.filter((c) => c && !/^[\d.,\-+ ()€$£]+$/.test(c) && !parseDate(c)).length >= Math.max(2, Math.ceil(row.length / 2));

/** Finds the header row (banks often put account info above it) and guesses what each column is. */
export function analyze(rows, exp = 2) {
  if (!rows.length) return null;
  let h = 0;
  const width = Math.max(...rows.slice(0, 15).map((r) => r.length));
  for (let i = 0; i < Math.min(rows.length, 15); i++) { if (rows[i].length >= Math.max(2, width - 1) && looksHeader(rows[i])) { h = i; break; } }
  const header = rows[h], data = rows.slice(h + 1).filter((r) => r.length >= 2);
  const cols = header.length;
  const sample = (i) => data.slice(0, 40).map((r) => r[i] ?? '').filter((x) => x !== '');
  const map = { date: -1, desc: -1, desc2: -1, amount: -1, debit: -1, credit: -1, dir: -1 };
  header.forEach((name, i) => {
    if (map.dir < 0 && /(deebet\/kreedit|d\/k|dk|dr\/cr|cr\/dr|soll\/haben|debit\/credit|credit\/debit)/i.test(name)) { map.dir = i; return; }
    for (const k of ['amount', 'debit', 'credit', 'date', 'dir', 'desc']) if (map[k] < 0 && HEAD[k].test(name)) { map[k] = i; break; }
  });
  // fall back to what the cells look like
  const dateScore = (i) => { const s = sample(i); return s.length ? s.filter((x) => parseDate(x, 'dmy') || parseDate(x, 'mdy')).length / s.length : 0; };
  const numScore = (i) => { const s = sample(i); return s.length ? s.filter((x) => parseAmount(x, exp, '.') !== null || parseAmount(x, exp, ',') !== null).length / s.length : 0; };
  if (map.date < 0 || dateScore(map.date) < 0.6) { let best = -1, bs = 0.6; for (let i = 0; i < cols; i++) { const sc = dateScore(i); if (sc > bs) { bs = sc; best = i; } } if (best >= 0) map.date = best; }
  if (map.amount < 0 && map.debit < 0 && map.credit < 0) {
    let best = -1, bs = 0.6; for (let i = 0; i < cols; i++) { if (i === map.date) continue; const sc = numScore(i) * (dateScore(i) > 0.6 ? 0 : 1); if (sc > bs) { bs = sc; best = i; } } if (best >= 0) map.amount = best;
  }
  if (map.desc < 0) { let best = -1, len = 0; for (let i = 0; i < cols; i++) { if ([map.date, map.amount, map.debit, map.credit, map.dir].includes(i)) continue; const avg = sample(i).reduce((n, x) => n + x.length, 0) / (sample(i).length || 1); if (avg > len && numScore(i) < 0.5) { len = avg; best = i; } } map.desc = best; }
  header.forEach((name, i) => { if (map.desc2 < 0 && i !== map.desc && ![map.date, map.amount, map.debit, map.credit, map.dir].includes(i) && HEAD.desc.test(name)) map.desc2 = i; });
  if (map.dir >= 0) { const v = new Set(sample(map.dir).map((x) => x.toLowerCase())); if (v.size > 6) map.dir = -1; }
  const dateOrder = map.date >= 0 ? guessDateOrder(sample(map.date)) : 'dmy';
  const amtCols = [map.amount, map.debit, map.credit].filter((i) => i >= 0);
  const decimal = guessDecimal(amtCols.flatMap(sample));
  return { headerIndex: h, header, data, map, dateOrder, decimal };
}

const OUT_WORDS = /^(d|dr|deb|debit|deebet|soll|out|w|withdrawal|-)$/i;
const IN_WORDS = /^(k|c|cr|cre|credit|kreedit|haben|in|d\.|deposit|\+)$/i;

/**
 * Turns the data rows into transactions. opts: {map, dateOrder, decimal, exp, flip, accountId, categories, history, existing}
 * existing: transactions already stored (to spot repeats). Returns {items, skipped} where each item has `dupe` set when
 * the same date + amount + name already exists (or appears more often in the file than in the data).
 */
export function buildTransactions(data, opts) {
  const { map, dateOrder, decimal, exp = 2, flip = false, accountId, categories = [], history = [], existing = [] } = opts;
  const seen = new Map();
  const key = (date, type, amt, name) => `${accountId}|${date}|${type}|${amt}|${normName(name)}`;
  for (const t of existing) if (t.accountId === accountId && t.type !== 'transfer') seen.set(key(t.date, t.type, t.amountMinor, t.name), (seen.get(key(t.date, t.type, t.amountMinor, t.name)) || 0) + 1);
  const items = [], skipped = [];
  data.forEach((r, i) => {
    const date = map.date >= 0 ? parseDate(r[map.date], dateOrder) : null;
    if (!date) { skipped.push({ row: i, why: 'no date' }); return; }
    let signed = null;
    if (map.amount >= 0) {
      signed = parseAmount(r[map.amount], exp, decimal);
      if (signed !== null && map.dir >= 0) {
        const w = String(r[map.dir] || '').trim();
        if (OUT_WORDS.test(w) && signed > 0) signed = -signed; else if (IN_WORDS.test(w) && signed < 0) signed = -signed;
      }
    } else {
      const dv = map.debit >= 0 ? parseAmount(r[map.debit], exp, decimal) : null;
      const cv = map.credit >= 0 ? parseAmount(r[map.credit], exp, decimal) : null;
      if (dv) signed = -Math.abs(dv); else if (cv) signed = Math.abs(cv); else if (dv === 0 || cv === 0) signed = 0;
    }
    if (signed === null) { skipped.push({ row: i, why: 'no amount' }); return; }
    if (signed === 0) { skipped.push({ row: i, why: 'zero' }); return; }
    if (flip) signed = -signed;
    const type = signed < 0 ? 'expense' : 'income';
    const name = cleanName(map.desc >= 0 ? r[map.desc] : '') || (type === 'expense' ? 'Payment' : 'Money in');
    const amountMinor = Math.abs(signed);
    const k = key(date, type, amountMinor, name);
    const have = seen.get(k) || 0;
    const dupe = have > 0;
    if (dupe) seen.set(k, have - 1);
    items.push({ date, type, amountMinor, name, categoryId: detectCategory(name, type, categories, history) || (map.desc2 >= 0 && r[map.desc2] ? detectCategory(name + ' ' + r[map.desc2], type, categories, []) : null), dupe, row: i });
  });
  return { items, skipped };
}
const normName = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function cleanName(s) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(card purchase|pos|purchase|kaardimakse|maksekorraldus)[\s:\-*]+/i, '');
  return t.length > 80 ? t.slice(0, 80).trim() : t;
}
