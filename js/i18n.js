// Wording in other languages. English is what the code is written in; this file swaps it at the point where
// text is put on the screen. Estonian lives in lang-et.js (generated from i18n/et.tsv).
// A translation may contain {0}, {1}… for values that the screen fills in, and {1?ut} meaning
// "insert ut when value 1 is non-empty" (used for plural endings).
import { ET } from './lang-et.js';

const PACKS = { et: ET };
let lang = 'en', dict = new Map(), patterns = [];
const cache = new Map();
export const missing = new Set(); // untranslated text seen so far (for finding gaps)
export const missingRuntime = new Set(); // same, for text that arrived already assembled

const norm = (s) => s.replace(/\s+/g, ' ');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const PLACE = /\{(\d+)(?:\?([^}]*))?\}/g;

export function setLang(l) {
  if (l === lang) return;
  lang = PACKS[l] ? l : 'en';
  cache.clear();
  dict = new Map(); patterns = [];
  const pack = PACKS[lang];
  if (!pack) return;
  for (const [k, v] of Object.entries(pack)) {
    const nk = norm(k);
    dict.set(nk, v);
    if (/\{\d+\}/.test(nk) && (nk.replace(/\{\d+\}/g, '').replace(/[^A-Za-z]/g, '').length >= 4 || /^[A-Za-z]/.test(nk))) {
      const order = [];
      const src = '^' + esc(nk).replace(/\\\{(\d+)\\\}/g, (_, i) => { order.push(+i); return '([\\s\\S]*?)'; }) + '$';
      patterns.push({ re: new RegExp(src), order, v, weight: nk.replace(/\{\d+\}/g, '').length });
    }
  }
  patterns.sort((a, b) => b.weight - a.weight);
}
export const getLang = () => lang;
export const languages = () => [['en', 'English'], ['et', 'Eesti']];

export function fill(tpl, args) {
  return tpl.replace(PLACE, (m, i, pl) => (pl !== undefined ? (args[i] ? pl : '') : (args[i] ?? '')));
}

/** Translate a piece of text that arrives already assembled (a toast, an error, a label from a list). */
export function tr(s) {
  if (lang === 'en' || typeof s !== 'string' || !/[A-Za-z]{2}/.test(s)) return s;
  if (cache.has(s)) return cache.get(s);
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const core = norm(m[2]);
  let out = s;
  const hit = dict.get(core);
  if (hit !== undefined && !/\{\d+/.test(hit)) out = m[1] + hit + m[3];
  else {
    for (const p of patterns) {
      const r = p.re.exec(core);
      if (!r) continue;
      const args = {};
      p.order.forEach((idx, j) => { args[idx] = tr(r[j + 1]); });
      out = m[1] + fill(p.v, args) + m[3];
      break;
    }
  }
  if (out === s && core.includes(' · ')) { const parts = core.split(' · ').map(tr); if (parts.some((x, i) => x !== core.split(' · ')[i])) out = m[1] + parts.join(' · ') + m[3]; }
  if (out === s && /^[A-Z][a-z]+ [a-z]/.test(core)) missingRuntime.add(core);
  if (cache.size > 4000) cache.clear();
  cache.set(s, out);
  return out;
}

/** Look up one static piece of a template, where interpolated values are already written as {n}. */
function seg(text) {
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const core = norm(m[2]);
  if (!/[A-Za-z]{2}/.test(core.replace(/\{\d+\}/g, ''))) return text;
  const v = dict.get(core);
  if (v === undefined) { missing.add(core); return text; }
  return m[1] + v + m[3];
}
const ATTR = /(\b(?:aria-label|title|placeholder|alt)=")([^"]*)(")/g;

/** Turn a template literal's pieces into a list of strings and value slots, translated. */
export function compile(strings) {
  let T = strings[0];
  for (let i = 1; i < strings.length; i++) T += `{${i - 1}}` + strings[i];
  const out = T.split(/(<[^>]*>)/).map((p) => (p.startsWith('<') ? p.replace(ATTR, (_, a, v, q) => a + seg(v) + q) : seg(p))).join('');
  const parts = []; let last = 0;
  out.replace(PLACE, (m, i, pl, off) => { parts.push(out.slice(last, off)); parts.push(pl !== undefined ? { i: +i, pl } : { i: +i }); last = off + m.length; return m; });
  parts.push(out.slice(last));
  return parts;
}
