// Builds js/lang-et.js from i18n/et.tsv (one "English<TAB>Estonian" pair per line). Run: node tools/gen-lang.mjs, then node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const out = {};
for (const line of readFileSync('i18n/et.tsv', 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const t = line.indexOf('\t');
  out[line.slice(0, t).trim().replace(/\s+/g, ' ')] = line.slice(t + 1).trim();
}
writeFileSync('js/lang-et.js', '// Estonian wording. Generated from i18n/et.tsv by tools/gen-lang.mjs: edit the .tsv, not this file.\nexport const ET = ' + JSON.stringify(out, null, 0).replace(/","/g, '",\n"') + ';\n');
console.log(Object.keys(out).length, 'phrases');
