import { app } from './ctx.js';
import { html, icon, money, dateText, pageHeader, actions, inputs, emptyState, segmented, esc, $ } from './kit.js';
import * as C from '../calc.js';
import { today, periodFor, shiftPeriod } from '../dates.js';
import { txnRow } from './rows.js';
import { periodNav, periodLabel } from './overview.js';

const FILTERS = [['all', 'All'], ['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']];

function filtered() {
  const s = app.store, ui = app.ui, set = s.settings;
  const p = shiftPeriod(periodFor(today(), set.monthStart), ui.activityShift);
  const q = ui.activityQuery.trim().toLowerCase();
  const list = s.data.txns.filter((t) => {
    if (t.date < p.start || t.date >= p.endExclusive) return false;
    if (ui.activityFilter !== 'all' && t.type !== ui.activityFilter) return false;
    if (!q) return true;
    const hay = [t.name, t.notes, s.category(t.categoryId)?.name, s.account(t.accountId)?.name, s.account(t.toAccountId)?.name, (t.amountMinor / 100).toFixed(2)].join(' ').toLowerCase();
    return hay.includes(q);
  }).sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return { list, p };
}

function listHtml() {
  const { list } = filtered();
  if (!list.length) {
    return app.ui.activityQuery || app.ui.activityFilter !== 'all'
      ? emptyState('Nothing matches', 'Try a different search or filter.')
      : emptyState('No transactions in this period', 'Add your first expense or income with the + button.', html`<button class="btn primary" data-act="txn-new">Add a transaction</button>`);
  }
  const days = new Map();
  for (const t of list) { if (!days.has(t.date)) days.set(t.date, []); days.get(t.date).push(t); }
  return html`${[...days].map(([date, items]) => {
    const net = items.reduce((n, t) => n + (t.type === 'income' ? t.amountMinor : t.type === 'expense' ? -t.amountMinor : 0), 0);
    return html`<section class="day"><div class="day-head"><h3>${dateText(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><span class="muted">${money(net, { sign: true })}</span></div>
      <div class="list card flush">${items.map((t) => txnRow(t))}</div></section>`;
  })}`;
}

export function activity() {
  const set = app.store.settings;
  const { list, p } = filtered();
  const inc = list.filter((t) => t.type === 'income').reduce((n, t) => n + t.amountMinor, 0);
  const exp = list.filter((t) => t.type === 'expense').reduce((n, t) => n + t.amountMinor, 0);
  return {
    html: html`
    ${pageHeader('Activity')}
    <div class="card">${periodNav(p, periodLabel(p, set.monthStart, set.locale), 'act-prev', 'act-next', app.ui.activityShift === 0, 'act-now')}
      <div class="trio small"><div><span class="eyebrow">In</span><b class="amt in">${money(inc)}</b></div><div><span class="eyebrow">Out</span><b class="amt out">${money(exp)}</b></div><div><span class="eyebrow">Net</span><b class="amt ${inc - exp >= 0 ? 'in' : 'out'}">${money(inc - exp, { sign: true })}</b></div></div></div>
    <div class="search">${icon('search', 18)}<input id="act-search" type="search" data-input="activity-search" placeholder="Search description, category, account" aria-label="Search transactions" value="${app.ui.activityQuery}" autocomplete="off"></div>
    <div class="chips" role="group" aria-label="Filter">${FILTERS.map(([v, l]) => html`<button class="pill ${app.ui.activityFilter === v ? 'on' : ''}" data-act="act-filter" data-v="${v}" aria-pressed="${app.ui.activityFilter === v}">${l}</button>`)}</div>
    <div id="act-list">${listHtml()}</div>
    <button class="fab" data-act="txn-new" aria-label="Add transaction">${icon('plus', 26)}</button>`,
  };
}

inputs['activity-search'] = (el) => {
  app.ui.activityQuery = el.value;
  const box = $('#act-list');
  if (box) box.innerHTML = listHtml().s;
};
actions['act-filter'] = (el) => { app.ui.activityFilter = el.dataset.v; };
actions['act-prev'] = () => { app.ui.activityShift -= 1; };
actions['act-next'] = () => { app.ui.activityShift += 1; };
actions['act-now'] = () => { app.ui.activityShift = 0; };
