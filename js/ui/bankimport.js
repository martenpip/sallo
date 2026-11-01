// Import a bank statement (CSV) without any network: pick the file, check how Sallo read it, import.
import { app } from './ctx.js';
import { html, icon, pageHeader, field, options, money, chip, actions, changes, toast, amountSpan, dateText, cur } from './kit.js';
import { parseCSV, analyze, buildTransactions } from '../csvimport.js';

const MAX_BYTES = 10 * 1024 * 1024;
const st = () => app.ui.bank || null;

export function bankImport() {
  const s = app.store, b = st();
  const accounts = s.activeAccounts();
  const head = pageHeader('Import bank statement', { back: true });
  if (!accounts.length) return { html: html`${head}<p class="muted pad">Add an account first, then come back to import its statement.</p>` };
  const intro = html`<p class="muted pad">Download a statement as a CSV file from your bank’s website or app, then choose it here. Sallo reads it on this device. Nothing is uploaded anywhere.</p>`;
  const picker = html`<input type="file" id="bank-file" data-change="bank-file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden>
    <button class="btn ${b ? '' : 'primary'} block" data-act="bank-pick">${icon('upload', 18)} ${b ? 'Choose a different file' : 'Choose a CSV file'}</button>`;
  if (!b) return { html: html`${head}${intro}<section class="card">${picker}
    <p class="hint">Works with most banks, including statements with semicolons, commas as decimals, and separate in/out columns. If something looks wrong you can fix it before anything is saved.</p></section>` };

  const { a } = b;
  const cols = a.header.map((h, i) => [String(i), h || `Column ${i + 1}`]);
  const sel = (k) => String(a.map[k]);
  const colSelect = (k, label, none) => field(label, html`<select name="${k}" data-change="bank-opt">${options(cols, sel(k) === '-1' ? '' : sel(k), { empty: none })}</select>`);
  const built = build();
  const shown = built.items.slice(0, 60);
  const toImport = built.items.filter((x) => !x.dupe || b.includeDupes);
  const dupes = built.items.filter((x) => x.dupe).length;
  const cats = (type) => s.categoriesOf(type).map((c) => [c.id, c.name]);
  return {
    html: html`${head}${intro}
    <section class="card"><div class="card-head"><h2>${icon('list', 18)} ${b.fileName}</h2></div>${picker}</section>
    <section class="card"><h2>Which column is what?</h2>
      <p class="muted">Sallo guessed from the file. Change anything that looks off.</p>
      ${colSelect('date', 'Date', 'Not found')}
      ${colSelect('desc', 'Description', 'None')}
      ${colSelect('desc2', 'More detail (used to find the category)', 'None')}
      ${colSelect('amount', 'Amount (one column, minus for money out)', 'No single amount column')}
      ${a.map.amount < 0 ? html`${colSelect('debit', 'Money out column', 'None')}${colSelect('credit', 'Money in column', 'None')}` : colSelect('dir', 'Direction column (D / K, debit / credit)', 'None')}
      <label class="field"><span>Date order</span><select name="dateOrder" data-change="bank-opt">${options([['dmy', 'Day, month, year (13.11.2026)'], ['mdy', 'Month, day, year (11/13/2026)'], ['ymd', 'Year first (2026-11-13)']], a.dateOrder)}</select></label>
      <label class="field"><span>Decimal mark</span><select name="decimal" data-change="bank-opt">${options([['.', 'Dot (1,234.50)'], [',', 'Comma (1.234,50)']], a.decimal)}</select></label>
      <label class="check inline"><input type="checkbox" name="flip" data-change="bank-opt" ${b.flip ? 'checked' : ''}><span><b>Swap in and out</b><small>Turn on if your spending shows as money in.</small></span></label>
    </section>
    <section class="card"><h2>Into which account?</h2>
      <label class="field"><span>Account</span><select name="account" data-change="bank-opt">${options(accounts.map((x) => [x.id, x.name]), b.accountId)}</select></label>
      ${dupes ? html`<label class="check inline"><input type="checkbox" name="dupes" data-change="bank-opt" ${b.includeDupes ? 'checked' : ''}><span><b>Import the ${dupes} that look already added</b><small>Same day, amount and description as something you have. Off by default so nothing is counted twice.</small></span></label>` : ''}
    </section>
    <section class="card"><div class="card-head"><h2>Preview</h2></div>
      ${built.items.length ? html`<p class="muted"><b>${toImport.length}</b> to import${dupes && !b.includeDupes ? html`, <b>${dupes}</b> skipped as already added` : ''}${built.skipped.length ? html`, <b>${built.skipped.length}</b> row${built.skipped.length === 1 ? '' : 's'} couldn’t be read` : ''}. Check the categories, you can change them here.</p>
        <div class="list flush bank-list">${shown.map((x) => html`<div class="row bank-row ${x.dupe && !b.includeDupes ? 'dim' : ''}"><span class="row-text"><b>${x.name}</b><small>${dateText(x.date, { day: 'numeric', month: 'short', year: 'numeric' })}${x.dupe ? html` ${chip('Already added', 'neutral')}` : ''}</small>
          <select class="mini-select" data-change="bank-cat" data-i="${x.row}" aria-label="Category for ${x.name}">${options(cats(x.type), x.categoryId || '', { empty: 'No category' })}</select></span>
          <span class="row-amt">${amountSpan(x.amountMinor, x.type)}</span></div>`)}</div>
        ${built.items.length > shown.length ? html`<p class="hint">…and ${built.items.length - shown.length} more. They are imported too; you can change categories later in Activity.</p>` : ''}
        <div class="btn-row"><span class="grow"></span><button class="btn primary" data-act="bank-go" ${toImport.length ? '' : 'disabled'}>Import ${toImport.length} transaction${toImport.length === 1 ? '' : 's'}</button></div>`
        : html`<p class="note">${icon('info', 16)}<span>Sallo couldn’t read any transactions with these settings. Check the date and amount columns above.</span></p>`}
    </section>`,
  };
}

function build() {
  const s = app.store, b = st(), a = b.a;
  const history = s.data.txns.filter((t) => t.categoryId && t.name).map((t) => ({ name: t.name, categoryId: t.categoryId, kind: t.type }));
  const r = buildTransactions(a.data, { map: a.map, dateOrder: a.dateOrder, decimal: a.decimal, exp: cur().exp, flip: b.flip, accountId: b.accountId, categories: s.data.categories, history, existing: s.data.txns });
  for (const it of r.items) if (b.cats[it.row] !== undefined) it.categoryId = b.cats[it.row] || null;
  return r;
}

actions['bank-pick'] = () => { const i = document.getElementById('bank-file'); if (i) { i.value = ''; i.click(); } };
changes['bank-file'] = async (input) => {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > MAX_BYTES) { toast('That file is too large for a bank statement.'); return; }
  let text;
  try { text = await file.text(); } catch { toast('Could not read that file.'); return; }
  const { rows } = parseCSV(text);
  const a = rows.length > 1 ? analyze(rows, cur().exp) : null;
  if (!a || !a.data.length) { toast('That doesn’t look like a bank statement CSV.'); return; }
  const s = app.store;
  app.ui.bank = { fileName: file.name.slice(0, 60), a, accountId: s.activeAccounts()[0]?.id || '', flip: false, includeDupes: false, cats: {} };
  app.render();
};
changes['bank-opt'] = (el) => {
  const b = st(); if (!b) return;
  const a = b.a, v = el.type === 'checkbox' ? el.checked : el.value;
  if (['date', 'desc', 'desc2', 'amount', 'debit', 'credit', 'dir'].includes(el.name)) a.map[el.name] = v === '' ? -1 : Number(v);
  else if (el.name === 'dateOrder') a.dateOrder = v;
  else if (el.name === 'decimal') a.decimal = v;
  else if (el.name === 'flip') b.flip = v;
  else if (el.name === 'account') b.accountId = v;
  else if (el.name === 'dupes') b.includeDupes = v;
  if (el.name === 'amount' && a.map.amount >= 0) { a.map.debit = -1; a.map.credit = -1; }
  app.render();
};
changes['bank-cat'] = (el) => { const b = st(); if (b) b.cats[Number(el.dataset.i)] = el.value; };
actions['bank-go'] = () => {
  const b = st(); if (!b) return;
  const s = app.store, r = build();
  const rows = r.items.filter((x) => !x.dupe || b.includeDupes);
  if (!rows.length) return;
  const ids = rows.map((x) => s.add('txns', { type: x.type, amountMinor: x.amountMinor, name: x.name, categoryId: x.categoryId, accountId: b.accountId, toAccountId: null, date: x.date, notes: 'Imported from bank statement', plannedId: null }).id);
  s.commit();
  app.ui.bank = null;
  location.hash = '#/activity';
  toast(`${ids.length} transaction${ids.length === 1 ? '' : 's'} imported`, { label: 'Undo', ms: 8000, undo: () => { const set = new Set(ids); s.data.txns = s.data.txns.filter((t) => !set.has(t.id)); s.commit(); toast('Import undone'); } });
};
