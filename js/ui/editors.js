// Every add/edit form. Forms are shown in sheets and handled via the `forms` registry.
import { app } from './ctx.js';
import {
  html, raw, icon, ICON_KEYS, money, dateText, cur, field, segmented, options, openSheet, closeSheet, closeAllSheets, confirmSheet,
  toast, showError, clearErrors, forms, actions, inputs, changes, $, $$, chip,
} from './kit.js';
import { parseMinor, minorToPlain } from '../money.js';
import { restartOnboarding } from './onboarding.js';
import { isIso, today, addDays, parse, toIso, daysInMonth, dow, monthName, weekdayShort } from '../dates.js';
import { displayStatus, suggestSaving, goalProgress, monthGrid } from '../calc.js';
import { detectCategory } from '../categorize.js';
import { guardFor, guardLines } from './guard.js';
import { isEssential } from '../calc.js';
import { describeRecurrence } from '../recurrence.js';

export const KIND_LABEL = { expense: 'Payment', income: 'Income', event: 'Event' };
const ACCOUNT_TYPES = [['bank', 'Bank account'], ['cash', 'Cash'], ['card', 'Card'], ['savings', 'Savings'], ['other', 'Other']];
export const ACCOUNT_ICON = { bank: 'bank', cash: 'cash', card: 'card', savings: 'piggy', other: 'wallet' };
const st = () => app.store;

// ---------- shared ----------
/** Shows/hides parts of a form depending on the checked radio (data-switch="type"). */
export function syncSwitch(form) {
  const name = form.dataset.switch;
  if (!name) return;
  const v = (form.querySelector(`input[name="${name}"]:checked`) || form.querySelector(`input[type=hidden][name="${name}"]`))?.value;
  $$('[data-for]', form).forEach((el) => {
    const show = el.dataset.for.split(' ').includes(v);
    el.hidden = !show;
    $$('select,input,textarea', el).forEach((c) => { c.disabled = !show; });
  });
}
function afterOpen(selector = 'form') {
  const form = $(`.sheet-wrap:last-child ${selector}`);
  if (form) syncSwitch(form);
}

export function readAmount(form, name, { positive = true, negative = false, optional = false } = {}) {
  const raw0 = String(new FormData(form).get(name) ?? '').trim();
  if (!raw0 && optional) return 0;
  const v = parseMinor(raw0, cur().exp);
  if (v === null) { showError(form, name, raw0 ? 'Enter an amount like 12.50.' : 'Enter an amount.'); return undefined; }
  if (positive && v <= 0) { showError(form, name, 'The amount must be more than zero.'); return undefined; }
  if (!negative && v < 0) { showError(form, name, 'The amount can’t be negative.'); return undefined; }
  return v;
}
export const amountField = (name, minor, label = 'Amount', { id = 'f-' + name, hint = '' } = {}) => field(label,
  html`<div class="money-in"><input id="${id}" name="${name}" inputmode="decimal" autocomplete="off" placeholder="${cur().exp ? '0.00' : '0'}" value="${minor == null ? '' : minorToPlain(minor, cur().exp)}"><b>${cur().symbol}</b></div>`, hint, id);
export const textField = (name, label, value = '', { id = 'f-' + name, required = false, ph = '', max = 120, attrs = '' } = {}) =>
  field(label, html`<input id="${id}" name="${name}" value="${value}" maxlength="${max}" placeholder="${ph}" autocomplete="off" ${raw(attrs)} ${required ? 'required' : ''}>`, '', id);
export const dateField = (name, label, value, { required = true } = {}) =>
  field(label, html`<input type="date" id="f-${name}" name="${name}" value="${value || ''}" ${required ? 'required' : ''}>`, '', 'f-' + name);
const notesField = (value = '') => field('Notes', html`<textarea id="f-notes" name="notes" rows="2" maxlength="2000">${value}</textarea>`, '', 'f-notes');
const accountOptions = (selected, { empty } = {}) => {
  const list = st().data.accounts.filter((a) => !a.archived || a.id === selected).map((a) => [a.id, a.name + (a.archived ? ' (archived)' : '')]);
  return options(list, selected, { empty });
};
const categoryOptions = (kind, selected) => {
  const list = st().data.categories.filter((c) => c.kind === kind && (!c.archived || c.id === selected)).map((c) => [c.id, c.name]);
  return options(list, selected, { empty: 'No category' });
};
const idOrNull = (v) => (v ? String(v) : null);
export const buttons = ({ del = '', saveLabel = 'Save' } = {}) => html`<div class="btn-row">${del}<span class="grow"></span><button type="button" class="btn ghost" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit">${saveLabel}</button></div>`;
export const delBtn = (act, id, label = 'Delete') => html`<button type="button" class="btn danger-ghost" data-act="${act}" data-id="${id}">${icon('trash', 16)} ${label}</button>`;

// ---------- transactions ----------
export function openTxnEditor({ id, type = 'expense', date, accountId } = {}) {
  const s = st();
  const t = id ? s.get('txns', id) : null;
  if (!s.activeAccounts().length && !t) { toast('Add an account first.'); location.hash = '#/settings/accounts'; return; }
  const ty = t?.type || type;
  // new entries start from what the person did last time: same account, same kind of category
  const all = s.data.txns, live = new Set(s.activeAccounts().map((a) => a.id));
  let lastT = null;
  for (let i = all.length - 1; i >= 0 && !lastT; i--) if (all[i].type !== 'transfer' && live.has(all[i].accountId)) lastT = all[i];
  const acc = t?.accountId || accountId || lastT?.accountId || s.activeAccounts()[0]?.id;
  const lastCat = !t && lastT ? lastT.categoryId : null;
  const lastOf = (kind) => { for (let i = all.length - 1; i >= 0; i--) if (all[i].type === kind && all[i].categoryId && s.category(all[i].categoryId) && !s.category(all[i].categoryId).archived) return all[i].categoryId; return null; };
  const recents = [];
  if (!t) {
    const seen = new Set();
    for (let i = all.length - 1; i >= 0 && recents.length < 5; i--) {
      const x = all[i];
      if (x.type === 'transfer' || !x.name || !live.has(x.accountId)) continue;
      const k = x.type + '|' + x.name.toLowerCase() + '|' + x.amountMinor;
      if (seen.has(k)) continue;
      seen.add(k); recents.push(x);
    }
  }
  void lastCat;
  openSheet(t ? 'Edit transaction' : 'New transaction', html`
    <form data-form="txn" data-switch="type" novalidate>
      <input type="hidden" name="id" value="${t?.id || ''}">
      ${recents.length ? html`<div class="recents" role="group" aria-label="Add again with one tap"><span class="eyebrow">Same as before? Tap to add again today</span><div class="chips">${recents.map((x) => html`<button type="button" class="pill recent" data-act="txn-repeat" data-id="${x.id}"><b>${x.name}</b> ${x.type === 'income' ? '+' : ''}${money(x.amountMinor)}</button>`)}</div></div>` : ''}
      ${segmented('type', [['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']], ty)}
      ${amountField('amount', t?.amountMinor)}
      ${textField('name', 'Description', t?.name || '', { ph: 'What was it for?', attrs: 'data-input="autocat"' })}
      <div data-for="expense">${field('Category', html`<select id="f-catx" name="categoryExpense" data-input="catmanual" ${raw(t?.categoryId ? 'data-touched="1"' : '')}>${categoryOptions('expense', t?.categoryId || lastOf('expense'))}</select>`, '', 'f-catx')}</div>
      <div data-for="income">${field('Category', html`<select id="f-cati" name="categoryIncome" data-input="catmanual" ${raw(t?.categoryId ? 'data-touched="1"' : '')}>${categoryOptions('income', t?.categoryId || lastOf('income'))}</select>`, '', 'f-cati')}</div>
      ${field(html`<span data-for="expense income">Account</span><span data-for="transfer">From account</span>`, html`<select id="f-account" name="accountId" required>${accountOptions(acc)}</select>`, '', 'f-account')}
      <div data-for="transfer">${field('To account', html`<select id="f-to" name="toAccountId">${accountOptions(t?.toAccountId || s.activeAccounts().find((a) => a.id !== acc)?.id)}</select>`, '', 'f-to')}</div>
      ${dateField('date', 'Date', t?.date || date || today())}
      ${notesField(t?.notes)}
      ${buttons({ del: t ? delBtn('txn-delete', t.id) : '' })}
    </form>`);
  afterOpen();
}
forms.txn = (fd, form) => {
  const s = st();
  const type = fd.get('type');
  const amountMinor = readAmount(form, 'amount');
  if (amountMinor === undefined) return false;
  const date = fd.get('date');
  if (!isIso(date)) { showError(form, 'date', 'Choose a date.'); return false; }
  const accountId = fd.get('accountId');
  if (!accountId) { showError(form, 'accountId', 'Choose an account.'); return false; }
  const rec = { type, amountMinor, name: String(fd.get('name') || '').trim(), accountId, date, notes: String(fd.get('notes') || '').trim() };
  if (type === 'transfer') {
    const to = fd.get('toAccountId');
    if (!to) { showError(form, 'toAccountId', 'Choose where the money goes.'); return false; }
    if (to === accountId) { showError(form, 'toAccountId', 'Pick two different accounts.'); return false; }
    Object.assign(rec, { toAccountId: to, categoryId: null });
  } else {
    Object.assign(rec, { toAccountId: null, categoryId: idOrNull(fd.get(type === 'income' ? 'categoryIncome' : 'categoryExpense')) });
  }
  const id = fd.get('id');
  if (id) s.updateTxn(id, rec); else s.addTxn(rec);
  toast('Saved');
  if (!id && type === 'income') offerSaving(amountMinor, rec.name);
  if (!id && type === 'expense' && s.settings.guard !== false && rec.categoryId && !isEssential(s.category(rec.categoryId))) {
    const g = guardFor();
    if (g.warnings.some((w) => w.code === 'shortfall' || w.code === 'tight')) toast(g.warnings[0].code === 'shortfall' ? 'Saved. Heads up: essential bills coming up aren’t fully covered.' : 'Saved. Heads up: money is getting tight for essential bills.', { ms: 7000 });
  }
  return true;
};
actions['txn-delete'] = async (el) => {
  const s = st();
  const t = s.get('txns', el.dataset.id);
  if (!t) return;
  const ok = await confirmSheet({ title: 'Delete this transaction?', message: t.plannedId ? 'The planned payment it came from will go back to Upcoming.' : 'This can’t be undone from here.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  const copy = { ...t };
  s.deleteTxn(t.id);
  closeSheet();
  toast('Transaction deleted', copy.plannedId ? {} : { undo: () => { s.data.txns.push(copy); s.commit(); } });
};

// ---------- planned items ----------
export function openPlannedEditor({ id, kind = 'expense', date } = {}) {
  const s = st();
  const p = id ? s.get('planned', id) : null;
  const k = p?.kind || kind;
  const rule = p?.ruleId ? s.get('rules', p.ruleId) : null;
  openSheet(p ? 'Edit ' + KIND_LABEL[p.kind].toLowerCase() : 'New planned item', html`
    <form data-form="planned" data-switch="kind" novalidate>
      <input type="hidden" name="id" value="${p?.id || ''}">
      ${p ? html`<input type="hidden" name="kind" value="${p.kind}">` : segmented('kind', [['expense', 'Payment'], ['income', 'Income'], ['event', 'Event']], k)}
      ${rule ? html`<p class="note">${icon('repeat', 16)} Part of a series (${describeRecurrence(rule.unit, rule.every)}). Changes here affect <b>this date only</b>. <button type="button" class="link" data-act="edit-series" data-id="${rule.id}">Edit the whole series</button></p>` : ''}
      ${textField('name', 'Name', p?.name || '', { required: true, ph: k === 'event' ? 'Dentist, birthday…' : 'Rent, salary, subscription…', attrs: 'data-input="autocat"' })}
      <div data-for="expense income">${amountField('amount', p?.amountMinor)}</div>
      ${!p ? html`<label class="check inline multi-toggle"><input type="checkbox" name="multi" data-change="md-mode"><span><b>Pick several specific days</b><small>For pay by the day, or anything on a few chosen dates. Choose the days and set the amount for each.</small></span></label>
        <div class="multi-box" hidden></div>` : ''}
      <div data-hide-multi>${dateField('date', 'Date', p?.date || date || today())}</div>
      ${field('Time (optional)', html`<input type="time" id="f-time" name="time" value="${p?.time || ''}">`, '', 'f-time')}
      <div data-for="expense">${field('Category', html`<select id="f-catx" name="categoryExpense" data-input="catmanual" ${raw(p?.categoryId ? 'data-touched="1"' : '')}>${categoryOptions('expense', p?.categoryId)}</select>`, '', 'f-catx')}</div>
      <div data-for="income">${field('Category', html`<select id="f-cati" name="categoryIncome" data-input="catmanual" ${raw(p?.categoryId ? 'data-touched="1"' : '')}>${categoryOptions('income', p?.categoryId)}</select>`, '', 'f-cati')}</div>
      <div data-for="expense income">${field('Account', html`<select id="f-account" name="accountId">${accountOptions(p?.accountId, { empty: 'Choose when paying' })}</select>`, '', 'f-account')}</div>
      ${!p ? html`<fieldset class="repeat" data-hide-multi><legend>Repeat</legend>
        <div class="row2">${field('Repeats', html`<select id="f-unit" name="unit">${options([['', 'Does not repeat'], ['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Yearly']], '')}</select>`, '', 'f-unit')}
        ${field('Every', html`<input id="f-every" name="every" type="number" min="1" max="99" value="1" inputmode="numeric">`, '', 'f-every')}</div>
        ${dateField('endDate', 'Ends on (optional)', '', { required: false })}
        <small class="hint">Monthly on the 31st becomes the last day of shorter months, then returns to the 31st.</small></fieldset>` : ''}
      ${notesField(p?.notes)}
      ${buttons({ del: p ? delBtn('planned-delete', p.id) : '' })}
    </form>`);
  afterOpen();
}
forms.planned = (fd, form) => {
  const s = st();
  const kind = fd.get('kind');
  const name = String(fd.get('name') || '').trim();
  if (!name) { showError(form, 'name', 'Give it a name.'); return false; }
  if (fd.get('multi') && !fd.get('id')) return submitMulti(fd, form, kind, name);
  const date = fd.get('date');
  if (!isIso(date)) { showError(form, 'date', 'Choose a date.'); return false; }
  let amountMinor = 0;
  if (kind !== 'event') { amountMinor = readAmount(form, 'amount', { positive: true }); if (amountMinor === undefined) return false; }
  const rec = {
    kind, name, amountMinor, date, time: fd.get('time') || '', notes: String(fd.get('notes') || '').trim(),
    categoryId: kind === 'event' ? null : idOrNull(fd.get(kind === 'income' ? 'categoryIncome' : 'categoryExpense')),
    accountId: kind === 'event' ? null : idOrNull(fd.get('accountId')),
  };
  const id = fd.get('id');
  if (id) { s.updatePlanned(id, rec); toast('Saved'); return true; }
  const unit = fd.get('unit');
  if (unit) {
    const every = Math.max(1, Math.min(99, parseInt(fd.get('every'), 10) || 1));
    const endDate = fd.get('endDate') || null;
    if (endDate && (!isIso(endDate) || endDate < date)) { showError(form, 'endDate', 'The end date must be on or after the start date.'); return false; }
    s.addRule({ kind, name, amountMinor, categoryId: rec.categoryId, accountId: rec.accountId, time: rec.time, notes: rec.notes, startDate: date, unit, every, endDate });
    toast('Recurring item added');
  } else { s.addPlanned(rec); toast('Added'); }
  return true;
};
actions['edit-series'] = (el) => { closeSheet(); openRuleEditor(el.dataset.id); };
actions['planned-delete'] = async (el) => {
  const s = st();
  const p = s.get('planned', el.dataset.id);
  if (!p) return;
  const ok = await confirmSheet({ title: p.ruleId ? 'Skip this date?' : 'Delete this item?', message: p.ruleId ? 'Only this date is removed. The rest of the series stays, and this date won’t come back.' : (p.status === 'done' ? 'The transaction created when you marked it paid will be deleted too.' : 'This can’t be undone.'), confirmLabel: p.ruleId ? 'Skip this date' : 'Delete', danger: true });
  if (!ok) return;
  s.deletePlanned(p.id);
  closeSheet(); closeSheet();
  toast(p.ruleId ? 'Date skipped' : 'Deleted');
};

export function openPlannedDetail(id) {
  const s = st();
  const p = s.get('planned', id);
  if (!p) return;
  const t = today();
  const status = displayStatus(p, t);
  const rule = p.ruleId ? s.get('rules', p.ruleId) : null;
  const cat = s.category(p.categoryId), acc = s.account(p.accountId);
  const label = { paid: p.kind === 'income' ? 'Received' : 'Paid', skipped: 'Skipped', overdue: 'Overdue', due: 'Due today', upcoming: 'Upcoming', past: 'Past' }[status];
  const tone = { paid: 'good', skipped: '', overdue: 'warn', due: 'accent', upcoming: '', past: '' }[status];
  const money1 = p.kind !== 'event';
  openSheet(p.name, html`
    <div class="detail">
      <div class="detail-top">${money1 ? html`<div class="big ${p.kind === 'income' ? 'in' : ''}">${money(p.amountMinor)}</div>` : html`<div class="big">${icon('calendar', 28)}</div>`}
        <div>${chip(label, tone)} ${chip(KIND_LABEL[p.kind])}</div></div>
      <dl class="kv">
        <div><dt>Date</dt><dd>${dateText(p.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}${p.time ? ' · ' + p.time : ''}</dd></div>
        ${cat ? html`<div><dt>Category</dt><dd>${cat.name}</dd></div>` : ''}
        ${acc ? html`<div><dt>Account</dt><dd>${acc.name}</dd></div>` : ''}
        ${rule ? html`<div><dt>Repeats</dt><dd>${describeRecurrence(rule.unit, rule.every)}${rule.endDate ? ' until ' + dateText(rule.endDate, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}${rule.paused ? ' (paused)' : ''}</dd></div>` : ''}
        ${p.notes ? html`<div><dt>Notes</dt><dd class="pre">${p.notes}</dd></div>` : ''}
      </dl>
      <div class="stack">
        ${money1 && p.status === 'planned' ? html`<button class="btn primary" data-act="mark-paid" data-id="${p.id}">${icon('check', 18)} ${p.kind === 'income' ? 'Mark as received' : 'Mark as paid'}</button>` : ''}
        ${p.status === 'done' ? html`<button class="btn" data-act="undo-paid" data-id="${p.id}">Undo — back to upcoming</button>` : ''}
        ${p.status === 'skipped' ? html`<button class="btn" data-act="unskip" data-id="${p.id}">Restore this date</button>` : ''}
        ${p.status === 'planned' && rule ? html`<button class="btn" data-act="skip" data-id="${p.id}">Skip this date</button>` : ''}
        <button class="btn" data-act="planned-edit" data-id="${p.id}">${icon('edit', 18)} Edit${rule ? ' this date' : ''}</button>
        ${rule ? html`<button class="btn" data-act="edit-series" data-id="${rule.id}">${icon('repeat', 18)} Edit the series</button>` : ''}
        ${rule && !rule.endDate ? html`<button class="btn" data-act="series-pause" data-id="${rule.id}">${rule.paused ? 'Resume series' : 'Pause series'}</button>` : ''}
        ${rule && !rule.paused ? html`<button class="btn" data-act="series-end" data-id="${rule.id}" data-date="${p.date}">Stop series after this date</button>` : ''}
        ${p.status !== 'done' || !rule ? delBtn('planned-delete', p.id, rule ? 'Delete this date' : 'Delete') : ''}
      </div>
    </div>`);
}
actions['planned-open'] = (el) => openPlannedDetail(el.dataset.id);
actions['planned-edit'] = (el) => { closeSheet(); openPlannedEditor({ id: el.dataset.id }); };
actions['skip'] = (el) => { st().skipPlanned(el.dataset.id, true); closeSheet(); toast('Date skipped', { undo: () => st().skipPlanned(el.dataset.id, false) }); };
actions['unskip'] = (el) => { st().skipPlanned(el.dataset.id, false); closeSheet(); toast('Restored'); };
actions['undo-paid'] = (el) => { st().undoPaid(el.dataset.id); closeSheet(); toast('Moved back to upcoming'); };
actions['series-pause'] = (el) => { const r = st().get('rules', el.dataset.id); st().pauseRule(r.id, !r.paused); closeSheet(); toast(r.paused ? 'Series paused' : 'Series resumed'); };
actions['series-end'] = async (el) => {
  const ok = await confirmSheet({ title: 'Stop this series?', message: 'Later dates are removed. Anything already paid stays in your history.', confirmLabel: 'Stop series', danger: true });
  if (!ok) return;
  st().endRule(el.dataset.id, el.dataset.date);
  closeSheet(); closeSheet(); toast('Series ended');
};

export function openMarkPaid(id) {
  const s = st();
  const p = s.get('planned', id);
  if (!p) return;
  if (!s.activeAccounts().length) { toast('Add an account first.'); return; }
  openSheet(p.kind === 'income' ? 'Mark as received' : 'Mark as paid', html`
    <form data-form="markpaid" novalidate>
      <input type="hidden" name="id" value="${p.id}">
      <p class="muted">${p.name}. Change the amount if the real one was different.</p>
      ${amountField('amount', p.amountMinor)}
      ${dateField('date', p.kind === 'income' ? 'Received on' : 'Paid on', today())}
      ${field('Account', html`<select id="f-account" name="accountId">${accountOptions(p.accountId || s.activeAccounts()[0].id)}</select>`, '', 'f-account')}
      ${buttons({ saveLabel: 'Confirm' })}
    </form>`);
}
actions['mark-paid'] = (el) => openMarkPaid(el.dataset.id);
forms.markpaid = (fd, form) => {
  const amountMinor = readAmount(form, 'amount');
  if (amountMinor === undefined) return false;
  const date = fd.get('date');
  if (!isIso(date)) { showError(form, 'date', 'Choose a date.'); return false; }
  const pl = st().get('planned', fd.get('id'));
  st().markPaid(fd.get('id'), { amountMinor, date, accountId: fd.get('accountId') });
  if (pl && pl.kind === 'income') offerSaving(amountMinor, pl.name);
  closeSheet(); // the detail sheet underneath
  toast('Saved to your activity');
  return true;
};

// ---------- recurring series ----------
export function openRuleEditor(id) {
  const s = st();
  const r = s.get('rules', id);
  if (!r) return;
  openSheet('Edit series', html`
    <form data-form="rule" novalidate>
      <input type="hidden" name="id" value="${r.id}">
      <input type="hidden" name="kind" value="${r.kind}">
      <p class="note">Updates every upcoming date that you haven’t edited yourself. Dates you changed or skipped are kept as they are.</p>
      ${textField('name', 'Name', r.name, { required: true })}
      ${r.kind !== 'event' ? amountField('amount', r.amountMinor) : ''}
      ${r.kind !== 'event' ? field('Category', html`<select id="f-cat" name="categoryId">${categoryOptions(r.kind, r.categoryId)}</select>`, '', 'f-cat') : ''}
      ${r.kind !== 'event' ? field('Account', html`<select id="f-account" name="accountId">${accountOptions(r.accountId, { empty: 'Choose when paying' })}</select>`, '', 'f-account') : ''}
      ${dateField('startDate', 'First date', r.startDate)}
      <div class="row2">${field('Repeats', html`<select id="f-unit" name="unit">${options([['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Yearly']], r.unit)}</select>`, '', 'f-unit')}
      ${field('Every', html`<input id="f-every" name="every" type="number" min="1" max="99" value="${r.every}" inputmode="numeric">`, '', 'f-every')}</div>
      ${dateField('endDate', 'Ends on (optional)', r.endDate || '', { required: false })}
      ${notesField(r.notes)}
      ${buttons({ del: delBtn('rule-delete', r.id, 'Delete series') })}
    </form>`);
}
forms.rule = (fd, form) => {
  const s = st();
  const r = s.get('rules', fd.get('id'));
  const name = String(fd.get('name') || '').trim();
  if (!name) { showError(form, 'name', 'Give it a name.'); return false; }
  let amountMinor = 0;
  if (r.kind !== 'event') { amountMinor = readAmount(form, 'amount'); if (amountMinor === undefined) return false; }
  const startDate = fd.get('startDate'), endDate = fd.get('endDate') || null;
  if (!isIso(startDate)) { showError(form, 'startDate', 'Choose a date.'); return false; }
  if (endDate && (!isIso(endDate) || endDate < startDate)) { showError(form, 'endDate', 'The end date must be on or after the first date.'); return false; }
  s.updateRule(r.id, {
    name, amountMinor, startDate, endDate, unit: fd.get('unit'), every: Math.max(1, Math.min(99, parseInt(fd.get('every'), 10) || 1)),
    categoryId: idOrNull(fd.get('categoryId')), accountId: idOrNull(fd.get('accountId')), notes: String(fd.get('notes') || '').trim(),
  });
  toast('Series updated');
  return true;
};
actions['rule-delete'] = async (el) => {
  const ok = await confirmSheet({ title: 'Delete this series?', message: 'All upcoming dates are removed. Payments you already marked as paid stay in your activity.', confirmLabel: 'Delete series', danger: true });
  if (!ok) return;
  st().deleteRule(el.dataset.id);
  closeSheet(); closeSheet(); toast('Series deleted');
};

// ---------- accounts ----------
export function openAccountEditor(id) {
  const a = id ? st().account(id) : null;
  openSheet(a ? 'Edit account' : 'New account', html`
    <form data-form="account" novalidate>
      <input type="hidden" name="id" value="${a?.id || ''}">
      ${textField('name', 'Name', a?.name || '', { required: true, ph: 'Everyday account' })}
      ${field('Type', html`<select id="f-type" name="type">${options(ACCOUNT_TYPES, a?.type || 'bank')}</select>`, '', 'f-type')}
      ${amountField('opening', a?.openingMinor ?? 0, 'Current balance', { hint: a ? 'Changing this changes the starting point your balance is counted from.' : 'What is in it right now. You can use a negative number for a debt.' })}
      ${buttons({ del: a ? (a.archived ? html`<button type="button" class="btn" data-act="account-restore" data-id="${a.id}">Restore</button>` : delBtn('account-delete', a.id, 'Archive')) : '' })}
      ${a ? html`<div class="danger-zone"><button type="button" class="btn danger-ghost block" data-act="account-wipe" data-id="${a.id}">${icon('trash', 16)} Delete account for good</button>
        <small class="muted">Erases the account and everything done in it. Archive hides it and keeps the history.</small></div>` : ''}
    </form>`);
}
forms.account = (fd, form) => {
  const name = String(fd.get('name') || '').trim();
  if (!name) { showError(form, 'name', 'Give the account a name.'); return false; }
  const openingMinor = readAmount(form, 'opening', { positive: false, negative: true, optional: true });
  if (openingMinor === undefined) return false;
  const id = fd.get('id');
  const rec = { name, type: fd.get('type'), openingMinor };
  if (id) st().update('accounts', id, rec); else st().add('accounts', { ...rec, archived: false });
  st().commit();
  toast('Saved');
  return true;
};
actions['account-wipe'] = async (el) => {
  const s = st(), a = s.account(el.dataset.id);
  if (!a) return;
  const f = s.accountFootprint(a.id);
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const parts = [n(f.txns, 'transaction', 'transactions'), f.planned ? n(f.planned, 'upcoming item', 'upcoming items') : '', f.rules ? n(f.rules, 'repeating item', 'repeating items') : '', f.goals ? n(f.goals, 'savings goal', 'savings goals') : '', f.budgets ? n(f.budgets, 'budget', 'budgets') : ''].filter(Boolean);
  const ok = await confirmSheet({
    title: 'Delete this account?',
    message: html`<b>${a.name}</b> and everything done in it will be erased from Sallo: ${parts.join(', ')}.${f.last ? html` Because it’s your only account, you start completely fresh. Your categories and settings stay.` : html` Savings goals and budgets stay.`}<br><br><b>This can’t be undone.</b> You can only get this information back if you’ve saved a backup on your phone or another device. <a href="#/settings/data">Make a backup first</a>.`,
    confirmLabel: 'Delete account', danger: true, requireText: 'delete account',
  });
  if (!ok) return;
  s.deleteAccountForGood(a.id);
  closeAllSheets();
  if (!s.activeAccounts().length) { restartOnboarding(); s.setSettings({ onboarded: false }); location.hash = ''; }
  else toast('Account deleted');
};
actions['account-delete'] = async (el) => {
  const s = st();
  const inUse = s.accountInUse(el.dataset.id);
  const ok = await confirmSheet({ title: 'Remove this account?', message: inUse ? 'It has transactions, so it will be archived: hidden from lists, with its history kept.' : 'It has no transactions, so it will be deleted.', confirmLabel: inUse ? 'Archive' : 'Delete', danger: true });
  if (!ok) return;
  const r = s.removeAccount(el.dataset.id);
  closeSheet(); closeSheet(); toast(r === 'archived' ? 'Account archived' : 'Account deleted');
};
actions['account-restore'] = (el) => { st().update('accounts', el.dataset.id, { archived: false }); st().commit(); closeSheet(); toast('Account restored'); };

// ---------- categories ----------
export function openCategoryEditor(id, kind = 'expense') {
  const c = id ? st().category(id) : null;
  const k = c?.kind || kind;
  openSheet(c ? 'Edit category' : 'New category', html`
    <form data-form="category" data-switch="kind" novalidate>
      <input type="hidden" name="id" value="${c?.id || ''}">
      ${c ? html`<input type="hidden" name="kind" value="${c.kind}">` : segmented('kind', [['expense', 'Expense'], ['income', 'Income']], k)}
      ${textField('name', 'Name', c?.name || '', { required: true, max: 40 })}
      <div data-for="expense"><label class="check inline"><input type="checkbox" name="essential" ${c ? (isEssential(c) ? 'checked' : '') : ''}><span><b>Priority expense</b><small>Needs like rent, utilities, food and health. Sallo warns you if other spending crowds these out.</small></span></label></div>
      <fieldset class="icons"><legend>Icon</legend><div class="icon-grid">${ICON_KEYS.map((k2) => html`<label><input type="radio" name="icon" value="${k2}" ${k2 === (c?.icon || 'tag') ? 'checked' : ''}><span>${icon(k2, 20)}<i class="sr">${k2}</i></span></label>`)}</div></fieldset>
      ${buttons({ del: c ? (c.archived ? html`<button type="button" class="btn" data-act="category-restore" data-id="${c.id}">Restore</button>` : delBtn('category-delete', c.id, 'Remove')) : '' })}
    </form>`);
  afterOpen();
}
forms.category = (fd, form) => {
  const name = String(fd.get('name') || '').trim();
  if (!name) { showError(form, 'name', 'Give the category a name.'); return false; }
  const id = fd.get('id');
  const ess = !!fd.get('essential');
  if (id) { const cc = st().category(id); st().update('categories', id, { name, icon: fd.get('icon'), ...(cc.kind === 'expense' ? { essential: ess } : {}) }); } else st().add('categories', { name, kind: fd.get('kind'), icon: fd.get('icon'), archived: false, ...(fd.get('kind') === 'expense' ? { essential: ess } : {}) });
  st().commit();
  toast('Saved');
  return true;
};
actions['category-delete'] = async (el) => {
  const s = st();
  const inUse = s.categoryInUse(el.dataset.id);
  const ok = await confirmSheet({ title: 'Remove this category?', message: inUse ? 'It is used by existing items, so it will be archived: hidden from pickers, history kept.' : 'It isn’t used anywhere, so it will be deleted.', confirmLabel: inUse ? 'Archive' : 'Delete', danger: true });
  if (!ok) return;
  s.removeCategory(el.dataset.id);
  closeSheet(); closeSheet(); toast('Done');
};
actions['category-restore'] = (el) => { st().update('categories', el.dataset.id, { archived: false }); st().commit(); closeSheet(); toast('Category restored'); };

// ---------- savings ----------
export function openGoalEditor(id) {
  const g = id ? st().get('goals', id) : null;
  openSheet(g ? 'Edit goal' : 'New savings goal', html`
    <form data-form="goal" novalidate>
      <input type="hidden" name="id" value="${g?.id || ''}">
      ${textField('name', 'Goal', g?.name || '', { required: true, ph: 'Holiday, new laptop, emergency fund…', max: 60 })}
      ${amountField('target', g?.targetMinor, 'Target amount')}
      ${dateField('deadline', 'Target date (optional)', g?.deadline || '', { required: false })}
      ${field('Suggest setting aside', html`<select id="f-autopct" name="autoPct">${options([['0', 'Smart: based on my target date'], ['5', '5% of income'], ['10', '10% of income'], ['15', '15% of income'], ['20', '20% of income'], ['30', '30% of income']], String(g?.autoPct || 0))}</select>`, 'Used when money comes in and Sallo offers to put some aside for this goal.', 'f-autopct')}
      <fieldset class="icons"><legend>Icon</legend><div class="icon-grid">${['piggy', 'target', 'plane', 'home', 'car', 'gift', 'heart', 'bag'].map((k2) => html`<label><input type="radio" name="icon" value="${k2}" ${k2 === (g?.icon || 'piggy') ? 'checked' : ''}><span>${icon(k2, 20)}<i class="sr">${k2}</i></span></label>`)}</div></fieldset>
      ${buttons({ del: g ? delBtn('goal-delete', g.id) : '' })}
    </form>`);
}
forms.goal = (fd, form) => {
  const name = String(fd.get('name') || '').trim();
  if (!name) { showError(form, 'name', 'Give the goal a name.'); return false; }
  const targetMinor = readAmount(form, 'target');
  if (targetMinor === undefined) return false;
  const deadline = fd.get('deadline') || null;
  if (deadline && !isIso(deadline)) { showError(form, 'deadline', 'Choose a valid date.'); return false; }
  const id = fd.get('id');
  const rec = { name, targetMinor, deadline, autoPct: Number(fd.get('autoPct')) || 0, icon: fd.get('icon') };
  if (id) st().update('goals', id, rec); else st().add('goals', { ...rec, archived: false, note: '' });
  st().commit();
  toast('Saved');
  return true;
};
actions['goal-delete'] = async (el) => {
  const ok = await confirmSheet({ title: 'Delete this goal?', message: 'Its saved amounts are removed with it. Your account balances don’t change.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  st().removeGoal(el.dataset.id);
  closeSheet(); closeSheet();
  if (location.hash.startsWith('#/goal/')) location.hash = '#/savings';
  toast('Goal deleted');
};

export function openContribEditor(goalId, id) {
  const c = id ? st().get('contribs', id) : null;
  const neg = c ? c.amountMinor < 0 : false;
  openSheet(c ? 'Edit saved amount' : 'Add to goal', html`
    <form data-form="contrib" novalidate>
      <input type="hidden" name="id" value="${c?.id || ''}"><input type="hidden" name="goalId" value="${goalId}">
      ${segmented('dir', [['add', 'Put aside'], ['take', 'Take out']], neg ? 'take' : 'add')}
      ${amountField('amount', c ? Math.abs(c.amountMinor) : null)}
      ${dateField('date', 'Date', c?.date || today())}
      ${textField('note', 'Note (optional)', c?.note || '', { max: 100 })}
      <p class="hint">This is a note to yourself. It doesn’t move money between your accounts.</p>
      ${buttons({ del: c ? delBtn('contrib-delete', c.id) : '' })}
    </form>`);
}
forms.contrib = (fd, form) => {
  const amount = readAmount(form, 'amount');
  if (amount === undefined) return false;
  const date = fd.get('date');
  if (!isIso(date)) { showError(form, 'date', 'Choose a date.'); return false; }
  const rec = { goalId: fd.get('goalId'), amountMinor: fd.get('dir') === 'take' ? -amount : amount, date, note: String(fd.get('note') || '').trim() };
  const id = fd.get('id');
  if (id) st().update('contribs', id, rec); else st().add('contribs', rec);
  st().commit();
  toast('Saved');
  return true;
};
actions['contrib-delete'] = (el) => { st().remove('contribs', el.dataset.id); st().commit(); closeSheet(); toast('Removed'); };

// ---------- budgets ----------
export function openBudgetEditor(categoryId) {
  const s = st();
  const existing = categoryId !== undefined ? s.data.budgets.find((b) => (b.categoryId || '') === categoryId) : null;
  const taken = new Set(s.data.budgets.map((b) => b.categoryId || ''));
  const cats = [['', 'All spending'], ...s.categoriesOf('expense').map((c) => [c.id, c.name])].filter(([v]) => !taken.has(v) || v === (existing?.categoryId || ''));
  if (!cats.length) { toast('Every category already has a budget.'); return; }
  openSheet(existing ? 'Edit budget' : 'New budget', html`
    <form data-form="budget" novalidate>
      ${existing ? html`<input type="hidden" name="categoryId" value="${existing.categoryId}"><p class="muted">${existing.categoryId ? s.category(existing.categoryId)?.name : 'All spending'}</p>`
        : field('Applies to', html`<select id="f-cat" name="categoryId">${options(cats, cats[0][0])}</select>`, '', 'f-cat')}
      ${amountField('limit', existing?.limitMinor, 'Limit per period')}
      <p class="hint">Resets every period (month). Overspending is shown, never blocked.</p>
      ${buttons({ del: existing ? delBtn('budget-delete', existing.categoryId || '-', 'Remove') : '' })}
    </form>`);
}
forms.budget = (fd, form) => {
  const limit = readAmount(form, 'limit');
  if (limit === undefined) return false;
  st().setBudget(fd.get('categoryId') || '', limit);
  toast('Saved');
  return true;
};
actions['budget-delete'] = (el) => { st().setBudget(el.dataset.id === '-' ? '' : el.dataset.id, 0); closeSheet(); toast('Budget removed'); };

// ---------- opening editors from buttons ----------
actions['txn-new'] = (el) => openTxnEditor({ type: el.dataset.type || 'expense', date: el.dataset.date });
actions['txn-open'] = (el) => openTxnEditor({ id: el.dataset.id });
actions['planned-new'] = (el) => openPlannedEditor({ kind: el.dataset.kind || 'expense', date: el.dataset.date });
actions['account-new'] = () => openAccountEditor();
actions['account-open'] = (el) => openAccountEditor(el.dataset.id);
actions['category-new'] = (el) => openCategoryEditor(null, el.dataset.kind);
actions['category-open'] = (el) => openCategoryEditor(el.dataset.id);
actions['goal-new'] = () => openGoalEditor();
actions['goal-edit'] = (el) => openGoalEditor(el.dataset.id);
actions['contrib-new'] = (el) => openContribEditor(el.dataset.goal);
actions['contrib-open'] = (el) => openContribEditor(el.dataset.goal, el.dataset.id);
actions['budget-new'] = () => openBudgetEditor();
actions['budget-open'] = (el) => openBudgetEditor(el.dataset.id === '-' ? '' : el.dataset.id);
actions['rule-open'] = (el) => openRuleEditor(el.dataset.id);


// ---------- smart saving: offered whenever income arrives ----------
export function offerSaving(incomeMinor, name = '') {
  const s = st();
  if (s.settings.nudges === false) return;
  const t = today();
  const goals = s.data.goals.filter((g) => !g.archived && !goalProgress(g, s.data.contribs, t).done);
  if (!goals.length) return;
  const recent = s.data.txns.filter((x) => x.type === 'income' && x.date >= addDays(t, -60)).length;
  const perMonth = Math.max(1, Math.round(recent / 2));
  let budget = Math.floor(incomeMinor * 0.6); // never suggest more than 60% of one payment in total
  const rows = goals.map((g) => {
    let sug = suggestSaving(g, s.data.contribs, incomeMinor, t, perMonth, s.settings.plan?.save || 10);
    sug = Math.min(sug, budget); budget -= sug;
    return { g, sug, gp: goalProgress(g, s.data.contribs, t) };
  });
  if (!rows.some((r) => r.sug > 0)) return;
  setTimeout(() => { $('#toast')?.classList.remove('show'); openSheet('Put some aside?', html`
    <form data-form="sweep" novalidate>
      <input type="hidden" name="income" value="${incomeMinor}"><input type="hidden" name="note" value="${name}">
      <p class="muted"><b>${money(incomeMinor)}</b> just came in${name ? ' from ' + name : ''}. Choose what to set aside for your goals. It’s a note to yourself and doesn’t move money between accounts.</p>
      ${rows.map(({ g, sug, gp }) => html`<div class="sweep-row field">
        <label class="check"><input type="checkbox" name="on_${g.id}" ${sug > 0 ? 'checked' : ''}><span><b>${g.name}</b><small>${money(gp.saved)} of ${money(g.targetMinor)}</small></span></label>
        <div class="money-in"><input id="sw-${g.id}" name="a_${g.id}" inputmode="decimal" autocomplete="off" aria-label="Amount for ${g.name}" value="${minorToPlain(sug, cur().exp)}"><b>${cur().symbol}</b></div><p class="err" role="alert"></p></div>`)}
      <div class="btn-row spread"><button type="button" class="btn" data-act="sheet-close">Not now</button><button type="submit" class="btn primary">Put aside</button></div>
    </form>`); }, 320);
}
forms.sweep = (fd, form) => {
  const t = today(), note = String(fd.get('note') || '');
  const picks = [];
  for (const g of st().data.goals) {
    if (!fd.get('on_' + g.id)) continue;
    const v = parseMinor(String(fd.get('a_' + g.id) ?? '').trim(), cur().exp);
    if (v === null || v <= 0) { showError(form, 'a_' + g.id, 'Enter an amount like 12.50.'); return false; }
    picks.push([g, v]);
  }
  if (!picks.length) return true;
  for (const [g, v] of picks) st().add('contribs', { goalId: g.id, amountMinor: v, date: t, note: note ? 'From ' + note : 'From income' });
  st().commit();
  toast(`Put ${money(picks.reduce((n, [, v]) => n + v, 0))} aside`);
  return true;
};


// ---------- auto-category: follow the name as it is typed, until the person picks one themselves ----------
export function autoCategorize(form) {
  const nameEl = form.elements.name;
  if (!nameEl) return;
  const fd = new FormData(form);
  const kind = fd.get(form.dataset.form === 'planned' ? 'kind' : 'type');
  const sel = form.elements[kind === 'income' ? 'categoryIncome' : 'categoryExpense'];
  if (!sel || sel.dataset.touched) return;
  const d = st().data;
  const history = [...d.txns, ...d.planned].filter((x) => x.categoryId && x.name).map((x) => ({ name: x.name, categoryId: x.categoryId }));
  const id = detectCategory(nameEl.value, kind, d.categories, history);
  if (id && sel.value !== id) {
    sel.value = id;
    sel.classList.remove('auto-set'); void sel.offsetWidth; sel.classList.add('auto-set');
  }
}
inputs.autocat = (el) => { const f = el.closest('form'); if (f) autoCategorize(f); };
inputs.catmanual = (el) => { el.dataset.touched = '1'; };

actions['txn-repeat'] = (el) => {
  const s = st(), src = s.get('txns', el.dataset.id);
  if (!src) return;
  const rec = s.addTxn({ type: src.type, amountMinor: src.amountMinor, name: src.name, accountId: src.accountId, categoryId: src.categoryId, toAccountId: null, date: today(), notes: '' });
  closeSheet();
  toast(`Added ${src.name}`, { undo: () => s.deleteTxn(rec.id) });
  if (src.type === 'income') offerSaving(src.amountMinor, src.name);
};


// ---------- several specific days (e.g. pay by the day) ----------
const md = new WeakMap(); // form -> { y, m, picked: Map<iso, amountText> }
function mdState(form) {
  let st0 = md.get(form);
  if (!st0) { const p = parse(today()); st0 = { y: p.y, m: p.m, picked: new Map() }; md.set(form, st0); }
  return st0;
}
function mdSync(form) { // keep what was typed before redrawing
  const st0 = mdState(form);
  for (const iso of st0.picked.keys()) { const el = form.elements['md_' + iso]; if (el) st0.picked.set(iso, el.value); }
}
function mdDraw(form) {
  const box = form.querySelector('.multi-box');
  if (!box) return;
  mdSync(form);
  const { y, m, picked } = mdState(form), set = st().settings, kind = form.querySelector('[name=kind]:checked')?.value || form.elements.kind?.value;
  const isEvent = kind === 'event', t = today();
  const days = monthGrid(y, m, set.weekStart);
  const heads = Array.from({ length: 7 }, (_, i) => weekdayShort((set.weekStart % 7 + i) % 7, set.locale || undefined));
  const prefix = `${y}-${String(m).padStart(2, '0')}`;
  const list = [...picked.keys()].sort();
  let total = 0, bad = false;
  if (!isEvent) for (const iso of list) { const v = parseMinor(String(picked.get(iso) || '').trim(), cur().exp); if (v === null || v <= 0) bad = true; else total += v; }
  box.innerHTML = html`
    <div class="pnav"><button type="button" class="icon-btn" data-act="md-prev" aria-label="Previous month">${icon('back')}</button>
      <div class="pnav-label" aria-live="polite">${monthName(y, m, set.locale || undefined)}</div>
      <button type="button" class="icon-btn" data-act="md-next" aria-label="Next month">${icon('next')}</button></div>
    <div class="cal" role="group" aria-label="Choose days">${heads.map((h) => html`<div class="cal-h">${h}</div>`)}${days.map((iso) => {
      const inM = iso.startsWith(prefix), on = picked.has(iso);
      return html`<button type="button" class="cell ${inM ? '' : 'out'} ${iso === t ? 'today' : ''} ${on ? 'sel' : ''}" data-act="md-day" data-date="${iso}" aria-pressed="${on}" aria-label="${dateText(iso, { weekday: 'long', day: 'numeric', month: 'long' })}"><span class="n">${parse(iso).d}</span></button>`;
    })}</div>
    <div class="btn-row spread md-quick"><button type="button" class="btn small" data-act="md-weekdays">Mon–Fri, from today</button><button type="button" class="btn small" data-act="md-clear">Clear</button></div>
    ${list.length ? html`<div class="md-list">${list.map((iso) => html`<div class="md-row"><span>${dateText(iso, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        ${isEvent ? '' : html`<div class="money-in"><input name="md_${iso}" inputmode="decimal" autocomplete="off" aria-label="Amount on ${dateText(iso, { day: 'numeric', month: 'long' })}" value="${picked.get(iso)}"><b>${cur().symbol}</b></div>`}
        <button type="button" class="icon-btn" data-act="md-day" data-date="${iso}" aria-label="Remove ${dateText(iso, { day: 'numeric', month: 'long' })}">${icon('x', 16)}</button></div>`)}</div>
      <p class="muted md-total">${list.length} day${list.length === 1 ? '' : 's'}${isEvent ? '' : bad ? ' · check the amounts' : ' · total ' + money(total)}</p>`
      : html`<p class="muted">Tap the days on the calendar.</p>`}`.s;
}
export function refreshMulti(form) { if (form?.querySelector('[name=multi]:checked')) mdDraw(form); }
changes['md-mode'] = (el) => {
  const form = el.closest('form'), on = el.checked;
  form.querySelectorAll('[data-hide-multi]').forEach((e) => { e.hidden = on; e.querySelectorAll('input,select').forEach((c) => { c.disabled = on; }); });
  form.querySelector('.multi-box').hidden = !on;
  if (on) mdDraw(form);
};
actions['md-prev'] = (el) => { const f = el.closest('form'), s0 = mdState(f); mdSync(f); const i = s0.y * 12 + s0.m - 2; s0.y = Math.floor(i / 12); s0.m = i % 12 + 1; mdDraw(f); f.querySelector('[data-act=md-prev]')?.focus({ preventScroll: true }); };
actions['md-next'] = (el) => { const f = el.closest('form'), s0 = mdState(f); mdSync(f); const i = s0.y * 12 + s0.m; s0.y = Math.floor(i / 12); s0.m = i % 12 + 1; mdDraw(f); f.querySelector('[data-act=md-next]')?.focus({ preventScroll: true }); };
actions['md-day'] = (el) => {
  const f = el.closest('form'), s0 = mdState(f); mdSync(f);
  const iso = el.dataset.date;
  if (s0.picked.has(iso)) s0.picked.delete(iso);
  else s0.picked.set(iso, f.elements.amount?.value || '');
  mdDraw(f);
  f.querySelector(`.cal [data-date="${iso}"]`)?.focus({ preventScroll: true });
};
actions['md-weekdays'] = (el) => {
  const f = el.closest('form'), s0 = mdState(f); mdSync(f);
  for (let d = 1; d <= daysInMonth(s0.y, s0.m); d++) { const iso = toIso(s0.y, s0.m, d), w = dow(iso); if (iso >= today() && w >= 1 && w <= 5 && !s0.picked.has(iso)) s0.picked.set(iso, f.elements.amount?.value || ''); }
  mdDraw(f);
};
actions['md-clear'] = (el) => { const f = el.closest('form'); mdState(f).picked.clear(); mdDraw(f); };
function submitMulti(fd, form, kind, name) {
  const s = st(), { picked } = mdState(form);
  mdSync(form);
  if (!picked.size) { toast('Tap at least one day on the calendar.'); return false; }
  const base = {
    kind, name, time: fd.get('time') || '', notes: String(fd.get('notes') || '').trim(),
    categoryId: kind === 'event' ? null : idOrNull(fd.get(kind === 'income' ? 'categoryIncome' : 'categoryExpense')),
    accountId: kind === 'event' ? null : idOrNull(fd.get('accountId')),
  };
  const items = [];
  for (const iso of [...picked.keys()].sort()) {
    let amountMinor = 0;
    if (kind !== 'event') {
      amountMinor = parseMinor(String(form.elements['md_' + iso]?.value ?? picked.get(iso) ?? '').trim(), cur().exp);
      if (amountMinor === null || amountMinor <= 0) { showError(form, 'md_' + iso, 'Enter an amount like 80.00.'); toast('Check the amount for ' + dateText(iso, { day: 'numeric', month: 'short' }) + '.'); return false; }
    }
    items.push({ ...base, amountMinor, date: iso });
  }
  for (const it of items) s.addPlanned(it);
  toast(`Added ${items.length} day${items.length === 1 ? '' : 's'}`);
  return true;
}
