import { app } from './ctx.js';
import { html, icon, money, dateText, chip, avatar, actions, emptyState, toast } from './kit.js';
import { today } from '../dates.js';
import { occurrence } from '../recurrence.js';
import { findSubscriptions, subscriptionTotals } from '../subscriptions.js';

const PERIOD_LABEL = { week: 'weekly', fortnight: 'every 2 weeks', month: 'monthly', quarter: 'every 3 months', year: 'yearly' };

export function findAll() {
  const d = app.store.data;
  return findSubscriptions(d.txns, d.rules, today());
}

function subRow(x) {
  const s = app.store, cat = s.category(x.categoryId);
  return html`<div class="row ${x.active ? '' : 'dim'}"><div class="row-main sub-main">${avatar(cat?.icon || 'repeat', x.key)}
    <span class="row-text"><b>${x.name}</b><small>${money(x.amountMinor)} · ${PERIOD_LABEL[x.period]}${x.active ? html` · next about ${dateText(x.nextDate, { day: 'numeric', month: 'short' })}` : html` · last ${dateText(x.lastDate, { day: 'numeric', month: 'short', year: 'numeric' })}`}
        ${x.priceChange ? html` ${chip(x.priceChange.to > x.priceChange.from ? 'Price went up' : 'Price went down', x.priceChange.to > x.priceChange.from ? 'warn' : 'good')}` : ''}${x.tracked ? html` ${chip('Tracked', 'good')}` : ''}</small></span>
    <span class="row-amt"><span class="amt out">${money(x.yearlyMinor)}</span><small class="sub-yr">a year</small></span></div>
    ${x.active && !x.tracked ? html`<button class="quick wide" data-act="sub-track" data-key="${x.key}" aria-label="Track ${x.name} as recurring">${icon('repeat', 18)}</button>` : ''}</div>`;
}

export function subscriptions() {
  const subs = findAll(), tot = subscriptionTotals(subs);
  const live = subs.filter((x) => x.active), stopped = subs.filter((x) => !x.active);
  return {
    html: html`
    <header class="ph"><button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button><h1>Subscriptions</h1><div class="ph-right"></div></header>
    ${subs.length ? html`
      <section class="card sub-hero"><span class="sl-k">Active subscriptions and regular charges</span>
        <b class="sl-v">${money(tot.monthly)} <small>a month</small></b>
        <span class="sl-s">${tot.count} ${tot.count === 1 ? 'charge' : 'charges'} · ${money(tot.yearly)} a year</span></section>
      ${live.length ? html`<section class="group"><div class="card-head sec"><h2>Still being charged</h2></div><div class="card flush list">${live.map(subRow)}</div>
        <p class="muted small-p pad">Tap the repeat button on a row to add it to your recurring items, so it shows up in Upcoming and in your safe-to-spend number.</p></section>` : ''}
      ${stopped.length ? html`<section class="group"><div class="card-head sec"><h2>Looks like these stopped</h2></div><div class="card flush list">${stopped.map(subRow)}</div></section>` : ''}
      <p class="muted small-p pad">Sallo looks for charges with the same name, a similar price and a steady rhythm in your own transactions. It can miss some and can occasionally guess wrong. Nothing leaves your device.</p>`
    : emptyState('No regular charges found yet', 'Sallo spots a charge once it has repeated a few times at a steady price: three months in a row for a monthly one. Import a bank statement to look back further.', html`<a class="btn primary" href="#/settings/bank">Import a bank statement</a>`)}`,
  };
}

actions['sub-track'] = (el) => {
  const s = app.store, x = findAll().find((y) => y.key === el.dataset.key);
  if (!x) return;
  const t = today();
  let n = 1, start = occurrence(x.lastDate, x.unit, x.every, n);
  while (start < t && n < 500) { n++; start = occurrence(x.lastDate, x.unit, x.every, n); }
  s.addRule({ kind: 'expense', name: x.name, amountMinor: x.amountMinor, categoryId: x.categoryId, accountId: x.accountId, startDate: start, unit: x.unit, every: x.every });
  toast(`${x.name} added to recurring items.`);
};
