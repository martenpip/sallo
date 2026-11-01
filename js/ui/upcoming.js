import { app } from './ctx.js';
import { html, icon, money, dateText, pageHeader, actions, emptyState, chip } from './kit.js';
import * as C from '../calc.js';
import { today, addDays } from '../dates.js';
import { plannedRow } from './rows.js';
import { skipRuleId } from './guard.js';
import { describeRecurrence, nextOnOrAfter } from '../recurrence.js';

const FILTERS = [['all', 'All'], ['expense', 'Payments'], ['income', 'Income'], ['event', 'Events']];

export function upcoming() {
  const s = app.store, d = s.data, set = s.settings, t = today(), ui = app.ui;
  const items = d.planned.filter((p) => ui.upcomingFilter === 'all' || p.kind === ui.upcomingFilter);
  const groups = C.groupUpcoming(items, t, set.weekStart, { includeDone: ui.upcomingShowDone });
  // completed items are only useful for recent history; keep the list tidy
  const horizon = addDays(t, 120);
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((p) => p.date <= horizon) })).filter((g) => g.items.length);
  const skip = skipRuleId();
  const counted = skip ? d.planned.filter((x) => x.ruleId !== skip) : d.planned;
  const week = C.pendingTotals(counted, t, addDays(t, 6));
  const fortnight = C.pendingTotals(counted, t, addDays(t, 13));
  week.inc += C.workIncome(set.workPay, t, addDays(t, 6)); // pay for work days counts as money coming in
  fortnight.inc += C.workIncome(set.workPay, t, addDays(t, 13));
  const overdue = C.overdueTotals(counted, t);
  const bal = C.totalBalance(d.accounts, C.accountBalances(d.accounts, d.txns));
  const needed = fortnight.out + overdue.out;
  const short = needed - (bal + fortnight.inc + overdue.inc);
  const hasAny = d.planned.length > 0;

  return {
    html: html`
    ${pageHeader('Upcoming', { right: html`<a class="icon-btn" href="#/recurring" aria-label="Recurring items">${icon('repeat')}</a>` })}
    ${hasAny ? html`<section class="card" aria-label="Summary">
      <div class="trio small"><div><span class="eyebrow">Out, 7 days</span><b class="amt out">${money(week.out)}</b></div><div><span class="eyebrow">In, 7 days</span><b class="amt in">${money(week.inc)}</b></div>
        <div><span class="eyebrow">Overdue</span><b class="amt ${overdue.count ? 'warn-t' : ''}">${overdue.count}</b></div></div>
      ${needed > 0 ? html`<p class="prep ${short > 0 ? 'warn' : ''}">${icon(short > 0 ? 'info' : 'check', 16)} ${short > 0
        ? html`Over the next two weeks you need ${money(needed)} but expect ${money(Math.max(0, bal + fortnight.inc + overdue.inc))}. You may be short by <b>${money(short)}</b>.`
        : html`Your balance covers the ${money(needed)} due in the next two weeks.`}</p>` : ''}</section>` : ''}
    <div class="chips" role="group" aria-label="Filter">${FILTERS.map(([v, l]) => html`<button class="pill ${ui.upcomingFilter === v ? 'on' : ''}" data-act="up-filter" data-v="${v}" aria-pressed="${ui.upcomingFilter === v}">${l}</button>`)}
      <button class="pill ${ui.upcomingShowDone ? 'on' : ''}" data-act="up-done" aria-pressed="${ui.upcomingShowDone}">Show completed</button></div>
    ${shown.length ? shown.map((g) => html`<section class="group ${g.key}" aria-label="${g.label}"><div class="day-head"><h2>${g.label}</h2><span class="muted">${g.items.length}</span></div>
      <div class="list card flush">${g.items.map((p) => plannedRow(p))}</div></section>`)
      : emptyState(hasAny ? 'All clear' : 'Nothing planned yet', hasAny ? 'No upcoming items match this filter.' : 'Add bills, salary, subscriptions and events. Repeating ones are created for you.', html`<button class="btn primary" data-act="planned-new">Add one</button>`)}
    <button class="fab" data-act="planned-new" aria-label="Add planned item">${icon('plus', 26)}</button>`,
  };
}

export function recurring() {
  const s = app.store, d = s.data, t = today();
  const rules = [...d.rules].sort((a, b) => Number(a.paused) - Number(b.paused) || a.name.localeCompare(b.name));
  return {
    html: html`
    <header class="ph"><button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button><h1>Recurring</h1><div class="ph-right"><button class="icon-btn" data-act="planned-new" aria-label="Add recurring item">${icon('plus')}</button></div></header>
    ${rules.length ? html`<div class="list card flush">${rules.map((r) => {
      const nxt = r.paused ? null : nextOnOrAfter(r, r.trackFrom > t ? r.trackFrom : t);
      return html`<div class="row"><button class="row-main" data-act="rule-open" data-id="${r.id}"><span class="badge">${icon(r.kind === 'event' ? 'calendar' : r.kind === 'income' ? 'cash' : 'repeat', 18)}</span>
        <span class="row-text"><b>${r.name}</b><small>${describeRecurrence(r.unit, r.every)}${r.paused ? ' · paused' : nxt ? ' · next ' + dateText(nxt) : r.endDate ? ' · ended' : ''}</small></span>
        <span class="row-amt">${r.kind === 'event' ? '' : html`<span class="amt ${r.kind === 'income' ? 'in' : 'out'}">${money(r.kind === 'income' ? r.amountMinor : -r.amountMinor)}</span>`}</span></button></div>`;
    })}</div>` : emptyState('No recurring items', 'Create a payment, income or event and choose how often it repeats.', html`<button class="btn primary" data-act="planned-new">Add recurring item</button>`)}`,
  };
}

actions['up-filter'] = (el) => { app.ui.upcomingFilter = el.dataset.v; };
actions['up-done'] = () => { app.ui.upcomingShowDone = !app.ui.upcomingShowDone; };
