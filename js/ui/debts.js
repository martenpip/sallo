// Debts and loans: what you owe, what you're owed, and how long it takes to clear.
import { app } from './ctx.js';
import { html, icon, money, dateText, pageHeader, actions, forms, emptyState, progress, chip, badge, field, options, segmented, openSheet, closeSheet, confirmSheet, toast, showError, sheetOpen } from './kit.js';
import { play } from '../sound.js';
import { readAmount, amountField, textField, dateField, buttons, delBtn } from './editors.js';
import * as C from '../calc.js';
import { today, addDays, isIso, addMonthsClamped, dayDiff } from '../dates.js';

const st = () => app.store;
const LOAN_CAT = 'Loans & debt';
const aprText = (bp) => (bp ? `${(bp / 100).toFixed(bp % 100 ? 2 : 0).replace(/\.?0+$/, '')}% a year` : 'No interest');
const planned = () => st().data.planned;

function loanCategory(kind) {
  const s = st();
  if (kind === 'income') return s.categoriesOf('income').find((c) => c.name === 'Other income')?.id || null;
  let c = s.data.categories.find((x) => x.kind === 'expense' && x.name === LOAN_CAT);
  if (!c) c = s.add('categories', { name: LOAN_CAT, kind: 'expense', icon: 'bank', archived: false, essential: true });
  if (c.archived) s.update('categories', c.id, { archived: false });
  return c.id;
}
function when(months) {
  if (months === null) return '';
  const dt = addDays(today(), Math.round(months * 30.44));
  return dateText(dt, { month: 'long', year: 'numeric' });
}
const monthsText = (n) => (n < 12 ? `${n} month${n === 1 ? '' : 's'}` : `${Math.floor(n / 12)} yr${Math.floor(n / 12) === 1 ? '' : 's'}${n % 12 ? ` ${n % 12} mo` : ''}`);

// ---------- list ----------
export function debts() {
  const s = st(), d = s.data;
  const all = d.debts.filter((x) => !x.archived);
  const left_ = (x) => C.debtLeft(x, d.repayments, d.planned);
  const list = all.filter((x) => left_(x) > 0), done = all.filter((x) => left_(x) === 0);
  const tot = C.debtTotals(d.debts, d.repayments, d.planned);
  const row = (x) => {
    const left = C.debtLeft(x, d.repayments, d.planned), paid = x.startMinor - left;
    const pct = Math.min(100, Math.round((paid * 100) / x.startMinor));
    const plan = left && x.monthlyMinor ? C.payoffPlan(left, x.aprBp, x.monthlyMinor) : null;
    if (!left) return html`<a class="card goal paid-off" href="#/debt/${x.id}"><div class="goal-top">${badge('check')}<div class="row-text"><b>${x.name}</b><small>${x.direction === 'owed' ? 'Fully received' : 'Fully paid off'}${x.settledAt ? ' · ' + dateText(x.settledAt, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</small></div>${chip('Paid off', 'good')}</div></a>`;
    return html`<a class="card goal" href="#/debt/${x.id}"><div class="goal-top">${badge(x.direction === 'owed' ? 'wallet' : 'bank')}<div class="row-text"><b>${x.name}</b>
      <small>${left ? (x.monthlyMinor ? `${money(x.monthlyMinor)} a month` : 'No monthly payment set') + (plan && !plan.never ? ` · done ${when(plan.months)}` : '') : 'All settled'}</small></div>
      ${left ? html`<b>${money(left)}</b>` : chip('Settled', 'good')}</div>
      ${progress(pct, x.direction === 'owed' ? 'sage' : '', x.name + ' progress')}<div class="bar-label"><small>${money(paid)} ${x.direction === 'owed' ? 'received' : 'paid'}</small><small>${money(x.startMinor)} total</small></div></a>`;
  };
  return {
    html: html`${pageHeader('Debts and loans', { back: true })}
    ${all.length ? html`${list.length ? html`<section class="card hero"><div class="trio">
        <div><span class="eyebrow">You owe</span><b class="amt ${tot.owe ? 'out' : ''}">${money(tot.owe)}</b></div>
        <div><span class="eyebrow">Owed to you</span><b class="amt ${tot.owed ? 'in' : ''}">${money(tot.owed)}</b></div></div>
        <p class="muted">${tot.nOwe ? `${tot.nOwe} debt${tot.nOwe === 1 ? '' : 's'} to pay off` : 'Nothing to pay off'}${tot.nOwed ? ` · ${tot.nOwed} to collect` : ''}</p></section>
      <div class="stack">${list.map(row)}</div>` : html`<section class="card hero"><p class="eyebrow">Nothing left to pay</p><p class="muted">Every debt here is cleared. Nicely done.</p></section>`}
      ${done.length ? html`<h2 class="sec">Paid off</h2><div class="stack">${done.map(row)}</div>` : ''}`
      : emptyState('No debts or loans', 'Track a loan, a credit card, or money a friend owes you. See how long it takes to clear and watch it shrink.', html`<button class="btn primary" data-act="debt-new">Add one</button>`)}
    <button class="fab" data-act="debt-new" aria-label="Add a debt or loan">${icon('plus', 26)}</button>`,
  };
}

// ---------- detail ----------
export function debtDetail({ id }) {
  const s = st(), d = s.data, t = today();
  const x = s.get('debts', id);
  if (!x) return { html: html`${pageHeader('Debt', { back: true })}${emptyState('This debt no longer exists', '', html`<a class="btn" href="#/debts">Back to debts</a>`)}` };
  const left = C.debtLeft(x, d.repayments, d.planned), paid = x.startMinor - left;
  const pct = Math.min(100, Math.round((paid * 100) / x.startMinor));
  const owed = x.direction === 'owed';
  const settled = left === 0;
  const plan = left && x.monthlyMinor ? C.payoffPlan(left, x.aprBp, x.monthlyMinor) : null;
  const more = x.monthlyMinor ? Math.max(1, Math.round(x.monthlyMinor * 0.25)) : 0;
  const faster = left && x.monthlyMinor && plan && !plan.never ? C.payoffPlan(left, x.aprBp, x.monthlyMinor + more) : null;
  const hist = [
    ...d.repayments.filter((r) => r.debtId === x.id).map((r) => ({ id: r.id, date: r.date, label: r.note || (r.amountMinor < 0 ? 'Added to balance' : owed ? 'Received' : 'Payment'), amt: r.amountMinor, manual: true })),
    ...(x.ruleId ? d.planned.filter((p) => p.ruleId === x.ruleId && p.status === 'done').map((p) => ({ id: p.id, date: p.date, label: 'Scheduled payment', amt: p.amountMinor, manual: false })) : []),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const nextPay = x.ruleId ? d.planned.find((p) => p.ruleId === x.ruleId && p.status === 'planned' && p.date >= t) : null;
  return {
    html: html`${pageHeader(x.name, { back: true, right: settled ? '' : html`<button class="icon-btn" data-act="debt-edit" data-id="${x.id}" aria-label="Edit">${icon('edit')}</button>` })}
    ${settled ? html`<section class="card hero trophy"><span class="trophy-badge">${icon('check', 34)}</span><h2>${owed ? 'Fully received' : 'Paid off'}</h2>
      <p class="muted">${money(x.startMinor)} cleared${x.settledAt ? ' on ' + dateText(x.settledAt, { day: 'numeric', month: 'long', year: 'numeric' }) : ''}${x.startDate && x.settledAt && dayDiff(x.settledAt, x.startDate) > 1 ? ` · ${took(dayDiff(x.settledAt, x.startDate))} from start to finish` : ''}.</p>
      <p class="muted">This one is finished, so it can’t take any more payments. It stays here as a record of what you achieved.</p>
      <div class="btn-row"><button class="btn danger-ghost" data-act="debt-delete" data-id="${x.id}">${icon('trash', 16)} Remove from list</button></div></section>` : html`<section class="card hero"><p class="eyebrow">${owed ? 'Still owed to you' : 'Left to pay'}</p><div class="hero-amt">${money(left)}</div>
      <p class="muted">of ${money(x.startMinor)} · ${pct}% ${owed ? 'received' : 'paid'}</p>${progress(pct, owed ? 'sage' : '', 'Progress')}
      <ul class="plain facts"><li>${aprText(x.aprBp)}</li>${x.monthlyMinor ? html`<li>${money(x.monthlyMinor)} a month${nextPay ? html`, next on ${dateText(nextPay.date, { day: 'numeric', month: 'short' })}` : ''}</li>` : ''}</ul>
      <div class="btn-row spread"><button class="btn primary" data-act="debt-pay" data-id="${x.id}">${icon('plus', 18)} ${owed ? 'Money received' : 'Add payment'}</button>
        <button class="btn" data-act="debt-add" data-id="${x.id}">${x.aprBp && !owed ? 'Add interest' : 'Add to balance'}</button></div></section>`}
    ${left ? (plan ? (plan.never
      ? html`<section class="card tl-verdict bad" role="status"><h2>${icon('info', 18)} This payment doesn’t cover the interest</h2><p>${money(x.monthlyMinor)} a month is less than the interest that builds up, so the balance would never go down. Try a higher monthly payment.</p></section>`
      : html`<section class="card tl-verdict good" role="status"><h2>${icon('check', 18)} ${owed ? 'Collected' : 'Debt-free'} around ${when(plan.months)}</h2>
          <p>At ${money(x.monthlyMinor)} a month that’s about <b>${monthsText(plan.months)}</b>${plan.interest ? html`, with about <b>${money(plan.interest)}</b> of interest on top` : ''}.${faster && !faster.never && faster.months < plan.months ? html` Paying <b>${money(x.monthlyMinor + more)}</b> instead would finish <b>${monthsText(plan.months - faster.months)}</b> sooner${plan.interest > faster.interest ? ` and save about ${money(plan.interest - faster.interest)} in interest` : ''}.` : ''}</p>
          <p class="hint">An estimate: it assumes you pay on time every month and the rate stays the same.</p></section>`)
      : html`<section class="card"><p class="muted">Set a monthly payment to see how long this will take. <button class="link" data-act="debt-edit" data-id="${x.id}">Add one</button></p></section>`) : ''}
    <h2 class="sec">History</h2>
    ${hist.length ? html`<div class="list card flush">${hist.map((h) => { const inner = html`<span class="row-text"><b>${h.label}</b><small>${dateText(h.date, { day: 'numeric', month: 'short', year: 'numeric' })}</small></span><span class="row-amt"><span class="amt ${(h.amt < 0) === owed ? 'in' : 'out'}">${money(Math.abs(h.amt))}</span></span>`; return html`<div class="row">${h.manual ? html`<button class="row-main" data-act="debt-rep-open" data-id="${h.id}">${inner}</button>` : html`<div class="row-main">${inner}</div>`}</div>`; })}</div>`
      : emptyState('Nothing recorded yet', 'Record each payment and the balance here goes down.')}`,
  };
}

const took = (days) => (days < 60 ? `${days} days` : days < 700 ? `${Math.round(days / 30.44)} months` : `${(days / 365.25).toFixed(1).replace('.0', '')} years`);

// ---------- paying one off ----------
/** Marks debts that just reached zero as settled (once), stops their repeating payment, and celebrates. Re-opens one if a payment was removed. */
export function checkSettled() {
  const s = st();
  if (!s || !s.settings.onboarded) return;
  let win = null, changed = false;
  for (const x of s.data.debts) {
    const left = C.debtLeft(x, s.data.repayments, s.data.planned);
    if (left === 0 && !x.settledAt && !sheetOpen()) {
      x.settledAt = today(); x.updatedAt = new Date().toISOString(); changed = true; win = x;
      if (x.ruleId && s.get('rules', x.ruleId)) { s.data.planned = s.data.planned.filter((q) => !(q.ruleId === x.ruleId && q.status === 'planned')); s.pauseRule(x.ruleId, true); }
    } else if (left > 0 && x.settledAt) {
      x.settledAt = null; x.updatedAt = new Date().toISOString(); changed = true;
      if (x.ruleId && s.get('rules', x.ruleId)?.paused) s.pauseRule(x.ruleId, false);
    }
  }
  if (changed) s.commit();
  if (win) celebrate(win);
}
function celebrate(x) {
  const owed = x.direction === 'owed';
  play('success');
  openSheet(owed ? 'All received!' : 'Debt-free!', html`<div class="celebrate"><span class="trophy-badge pop">${icon('check', 40)}</span>
    <h3>${owed ? `${x.name} is fully repaid to you` : `You paid off ${x.name}`}</h3>
    <p class="muted">${money(x.startMinor)} ${owed ? 'came back to you' : 'cleared'}${x.startDate && dayDiff(today(), x.startDate) > 1 ? ' in ' + took(dayDiff(today(), x.startDate)) : ''}. That’s real progress, well done.</p>
    <p class="muted small-p">It stays in your list as paid off, and its monthly reminders are switched off.</p>
    <div class="btn-row"><span class="grow"></span><button class="btn primary" data-act="sheet-close">Thank you</button></div></div>`);
}

// ---------- add / edit ----------
export function openDebtEditor(id) {
  const s = st(), x = id ? s.get('debts', id) : null;
  const rule = x?.ruleId ? s.get('rules', x.ruleId) : null;
  const nextDate = rule ? (planned().find((p) => p.ruleId === rule.id && p.status === 'planned')?.date || rule.startDate) : addMonthsClamped(today(), 1, +today().slice(8));
  openSheet(x ? 'Edit debt or loan' : 'Add a debt or loan', html`
    <form data-form="debt" novalidate><input type="hidden" name="id" value="${x?.id || ''}">
      ${textField('name', 'Name', x?.name || '', { required: true, ph: 'Car loan, credit card, lent to a friend…', max: 60 })}
      <fieldset class="seg-field"><legend>Who owes who?</legend>${segmented('direction', [['owe', 'I owe'], ['owed', 'Owed to me']], x?.direction || 'owe')}</fieldset>
      ${amountField('amount', x?.startMinor, 'Amount', { hint: 'What is owed in total. If you’ve already paid part of it, enter what’s left today.' })}
      ${field('Yearly interest (optional)', html`<div class="money-in"><input id="f-apr" name="apr" inputmode="decimal" autocomplete="off" placeholder="0" value="${x?.aprBp ? (x.aprBp / 100).toString() : ''}"><b>%</b></div>`, 'Leave empty if there is none.', 'f-apr')}
      ${amountField('monthly', x?.monthlyMinor || null, 'Monthly payment (optional)', { hint: 'Sallo adds it to Upcoming and your timeline so safe to spend stays honest.' })}
      ${dateField('next', 'Next payment date', nextDate, { required: false })}
      ${field('Account it’s paid from or to', html`<select id="f-acc" name="account">${options(s.activeAccounts().map((a) => [a.id, a.name]), x?.accountId || rule?.accountId || s.activeAccounts()[0]?.id)}</select>`, '', 'f-acc')}
      ${buttons({ del: x ? delBtn('debt-delete', x.id) : '' })}
    </form>`);
}
forms.debt = (fd, form) => {
  const s = st();
  const name = String(fd.get('name') || '').trim();
  if (!name) { showError(form, 'name', 'Give it a name.'); return false; }
  const amount = readAmount(form, 'amount');
  if (amount === undefined) return false;
  const aprRaw = String(fd.get('apr') || '').trim().replace(',', '.');
  let aprBp = 0;
  if (aprRaw) { const v = Number(aprRaw); if (!Number.isFinite(v) || v < 0 || v > 100) { showError(form, 'apr', 'Enter a percentage like 5.5.'); return false; } aprBp = Math.round(v * 100); }
  const monthly = readAmount(form, 'monthly', { optional: true });
  if (monthly === undefined) return false;
  const next = String(fd.get('next') || '');
  if (monthly && !isIso(next)) { showError(form, 'next', 'Choose the date of the next payment.'); return false; }
  const direction = fd.get('direction') === 'owed' ? 'owed' : 'owe';
  const account = fd.get('account') || null;
  const id = fd.get('id');
  const existing = id ? s.get('debts', id) : null;
  let ruleId = existing?.ruleId || null;
  const kind = direction === 'owed' ? 'income' : 'expense';
  if (ruleId && !s.get('rules', ruleId)) ruleId = null;
  if (monthly) {
    const base = { name: direction === 'owed' ? `${name} (repayment)` : name, amountMinor: monthly, kind, categoryId: loanCategory(kind), accountId: account };
    if (ruleId) { const r = s.get('rules', ruleId); s.updateRule(ruleId, { ...base, ...(r.startDate !== next ? { startDate: next } : {}) }); }
    else ruleId = s.addRule({ ...base, startDate: next, unit: 'month', every: 1 }).id;
  } else if (ruleId) { s.deleteRule(ruleId); ruleId = null; }
  const rec = { name, direction, startMinor: amount, aprBp, monthlyMinor: monthly, ruleId, accountId: account };
  if (existing) s.update('debts', id, rec); else s.add('debts', { ...rec, startDate: today(), note: '', archived: false });
  s.commit();
  toast('Saved');
  return true;
};
actions['debt-new'] = () => { if (!st().activeAccounts().length) { toast('Add an account first.'); return; } openDebtEditor(); };
actions['debt-edit'] = (el) => { const x = st().get('debts', el.dataset.id); if (x && !C.debtLeft(x, st().data.repayments, st().data.planned)) { toast('Paid-off debts are kept as they are.'); return; } openDebtEditor(el.dataset.id); };
actions['debt-delete'] = async (el) => {
  const ok = await confirmSheet({ title: 'Delete this debt?', message: 'The debt, its history and its repeating payment are removed. Transactions you already recorded in Activity stay.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  st().removeDebt(el.dataset.id);
  closeSheet(); closeSheet();
  location.hash = '#/debts';
  toast('Deleted');
};

// ---------- payments ----------
actions['debt-pay'] = (el) => {
  const s = st(), x = s.get('debts', el.dataset.id); if (!x) return;
  const owed = x.direction === 'owed';
  const left = C.debtLeft(x, s.data.repayments, s.data.planned);
  if (!left) { toast('This one is already paid off.'); return; }
  openSheet(owed ? 'Money received' : 'Record a payment', html`
    <form data-form="debt-pay" novalidate><input type="hidden" name="id" value="${x.id}">
      ${amountField('amount', x.monthlyMinor ? Math.min(x.monthlyMinor, left) : null, 'Amount')}
      ${dateField('date', 'Date', today())}
      ${field('Account', html`<select id="f-acc" name="account">${options(s.activeAccounts().map((a) => [a.id, a.name]), x.accountId || s.activeAccounts()[0]?.id)}</select>`, '', 'f-acc')}
      <label class="check inline"><input type="checkbox" name="txn" checked><span><b>Also add it to Activity</b><small>Moves your account balance. ${x.ruleId ? 'If this is one of your scheduled payments, mark it paid in Upcoming instead so it isn’t counted twice.' : ''}</small></span></label>
      ${buttons()}</form>`);
};
forms['debt-pay'] = (fd, form) => {
  const s = st(), x = s.get('debts', fd.get('id')); if (!x) return true;
  if (!C.debtLeft(x, s.data.repayments, s.data.planned)) { toast('This one is already paid off.'); return true; }
  const amount = readAmount(form, 'amount'); if (amount === undefined) return false;
  const date = String(fd.get('date') || ''); if (!isIso(date)) { showError(form, 'date', 'Choose a date.'); return false; }
  const owed = x.direction === 'owed';
  let txnId = null;
  if (fd.get('txn') && fd.get('account')) {
    const kind = owed ? 'income' : 'expense';
    txnId = s.add('txns', { type: kind, amountMinor: amount, name: owed ? `${x.name} (repayment)` : x.name, categoryId: loanCategory(kind), accountId: fd.get('account'), toAccountId: null, date, notes: 'Debt payment', plannedId: null }).id;
  }
  s.add('repayments', { debtId: x.id, amountMinor: amount, date, txnId, note: '' });
  s.commit();
  toast(owed ? 'Recorded' : 'Payment recorded');
  return true;
};
actions['debt-add'] = (el) => {
  const x = st().get('debts', el.dataset.id); if (!x) return;
  if (!C.debtLeft(x, st().data.repayments, st().data.planned)) { toast('This one is already paid off.'); return; }
  openSheet(x.direction === 'owed' ? 'Add to balance' : x.aprBp ? 'Add interest or fees' : 'Add to balance', html`
    <form data-form="debt-add" novalidate><input type="hidden" name="id" value="${x.id}">
      <p class="muted">Use this when the balance grows: interest your lender added, a fee, or you borrowed more. It doesn’t move any account money.</p>
      ${amountField('amount', null, 'Amount')}${dateField('date', 'Date', today())}
      ${textField('note', 'Note (optional)', '', { ph: 'Interest for November', max: 80 })}${buttons()}</form>`);
};
forms['debt-add'] = (fd, form) => {
  const s = st(), x = s.get('debts', fd.get('id')); if (!x) return true;
  const amount = readAmount(form, 'amount'); if (amount === undefined) return false;
  const date = String(fd.get('date') || ''); if (!isIso(date)) { showError(form, 'date', 'Choose a date.'); return false; }
  s.add('repayments', { debtId: x.id, amountMinor: -amount, date, txnId: null, note: String(fd.get('note') || '').trim() || 'Added to balance' });
  s.commit();
  toast('Added to balance');
  return true;
};
actions['debt-rep-open'] = async (el) => {
  const s = st(), r = s.get('repayments', el.dataset.id); if (!r) return;
  const ok = await confirmSheet({ title: 'Remove this entry?', message: r.txnId ? 'It is removed from the debt, and the matching transaction in Activity is deleted too.' : 'It is removed from the debt history.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  if (r.txnId) s.deleteTxn(r.txnId);
  s.remove('repayments', r.id); s.commit();
  toast('Removed');
};
