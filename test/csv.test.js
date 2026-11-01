import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, parseDate, parseAmount, analyze, buildTransactions, guessDecimal } from '../js/csvimport.js';
import { emptyData } from '../js/store.js';

const cats = emptyData().categories;
const run = (text, extra = {}) => {
  const { rows } = parseCSV(text);
  const a = analyze(rows, 2);
  return { a, ...buildTransactions(a.data, { ...a, exp: 2, accountId: 'acc', categories: cats, ...extra }) };
};

test('dates in several layouts', () => {
  assert.equal(parseDate('13.11.2026', 'dmy'), '2026-11-13');
  assert.equal(parseDate('11/13/2026', 'mdy'), '2026-11-13');
  assert.equal(parseDate('2026-11-13 14:22', 'dmy'), '2026-11-13');
  assert.equal(parseDate('13 Nov 2026', 'dmy'), '2026-11-13');
  assert.equal(parseDate('31.02.2026', 'dmy'), null);
  assert.equal(parseDate('hello'), null);
});
test('amounts: separators, signs, brackets', () => {
  assert.equal(parseAmount('1 234,56', 2, ','), 123456);
  assert.equal(parseAmount('-1,234.50', 2, '.'), -123450);
  assert.equal(parseAmount('(12.00)', 2, '.'), -1200);
  assert.equal(parseAmount('12,50-', 2, ','), -1250);
  assert.equal(parseAmount('€ 5', 2, '.'), 500);
  assert.equal(parseAmount('abc'), null);
  assert.equal(guessDecimal(['12,50', '3,20', '1 000,00']), ',');
});
test('quoted cells, embedded commas and newlines', () => {
  const { rows } = parseCSV('a,b\r\n"x, y","line1\nline2"\r\n');
  assert.deepEqual(rows[1], ['x, y', 'line1\nline2']);
});
test('Estonian style: semicolons, comma decimals, D/K column, preamble', () => {
  const csv = 'Konto;EE123\nPeriood;01.11.2026-30.11.2026\n\nKuupäev;Saaja;Selgitus;Summa;Deebet/Kreedit\n02.11.2026;Rimi;Toidukaup;12,50;D\n03.11.2026;Tööandja;Palk;1700,00;K\n13.11.2026;Hambaarst;Dentist visit;650,00;D\n';
  const r = run(csv);
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0].type, 'expense'); assert.equal(r.items[0].amountMinor, 1250);
  assert.equal(r.items[1].type, 'income'); assert.equal(r.items[1].amountMinor, 170000);
  assert.equal(r.items[2].date, '2026-11-13');
});
test('US style: month-first dates, signed amounts, auto category', () => {
  const r = run('Date,Description,Amount\n11/13/2026,DENTIST SMILES,-650.00\n11/14/2026,Salary ACME,2000.00\n');
  assert.equal(r.a.dateOrder, 'mdy');
  assert.equal(r.items[0].date, '2026-11-13');
  assert.equal(cats.find((c) => c.id === r.items[0].categoryId)?.name, 'Health');
  assert.equal(cats.find((c) => c.id === r.items[1].categoryId)?.name, 'Salary');
});
test('separate debit and credit columns', () => {
  const r = run('Date,Details,Debit,Credit\n2026-11-02,Netflix,9.99,\n2026-11-03,Refund,,20.00\n');
  assert.equal(r.items[0].type, 'expense'); assert.equal(r.items[0].amountMinor, 999);
  assert.equal(r.items[1].type, 'income');
});
test('flip sign for banks that list spending as positive', () => {
  const r = run('Date,Description,Amount\n2026-11-02,Lunch,12.00\n', { flip: true });
  assert.equal(r.items[0].type, 'expense');
});
test('repeats are flagged, genuine same-day twins are kept', () => {
  const csv = 'Date,Description,Amount\n2026-11-02,Coffee,-3.00\n2026-11-02,Coffee,-3.00\n2026-11-02,Coffee,-3.00\n';
  const existing = [{ accountId: 'acc', type: 'expense', date: '2026-11-02', amountMinor: 300, name: 'Coffee' }];
  const r = run(csv, { existing });
  assert.deepEqual(r.items.map((x) => x.dupe), [true, false, false]);
});
test('unreadable rows are skipped, not guessed', () => {
  const r = run('Date,Description,Amount\nnot a date,x,5\n2026-11-02,y,abc\n2026-11-03,ok,-1.00\n');
  assert.equal(r.items.length, 1); assert.equal(r.skipped.length, 2);
});
test('a second text column helps find the category', () => {
  const r = run('Kuupäev;Saaja;Selgitus;Summa\n13.11.2026;Hambaarst OÜ;Dentist visit;-650,00\n');
  assert.equal(r.items[0].amountMinor, 65000); assert.equal(r.items[0].type, 'expense');
  assert.equal(cats.find((c) => c.id === r.items[0].categoryId)?.name, 'Health');
});
