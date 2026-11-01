// The money timeline: what happens to your balance day by day, told in the order a person lives it.
import { app } from './ctx.js';
import { html, icon, money, pageHeader, actions, emptyState, dateText } from './kit.js';
import * as C from '../calc.js';
import { today, addDays } from '../dates.js';
import { skipRuleId, salaryIgnored, payRule } from './guard.js';

const RANGES = [30, 45, 60, 90];
const dt = (iso) => dateText(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const dshort = (iso) => dateText(iso, { day: 'numeric', month: 'short' });

export function timeline() {
  const s = app.store, d = s.data, t = today();
  const days = app.ui.timelineDays || 45;
  const to = addDays(t, days);
  const wp = s.settings.workPay;
  const pr = C.projectCashflow({ accounts: d.accounts, txns: d.txns, planned: d.planned, workPay: wp, skipRuleId: skipRuleId() }, t, to);
  const alloc = C.totalAllocated(d.goals, d.contribs);
  const empty = !pr.steps.length;
  const short = pr.firstShort;
  const billSteps = pr.steps.filter((x) => x.type === 'bills');
  const low = billSteps.length ? billSteps.reduce((m, x) => (x.balanceAfter < m.balanceAfter ? x : m)) : null;
  const verdict = short
    ? html`<section class="card tl-verdict bad" role="status"><h2>${icon('info', 18)} Not enough on ${dt(short.date)}</h2>
        <p>You’d be about <b>${money(short.short)}</b> short when ${short.items.map((i) => i.name).join(', ')} come${short.items.length === 1 ? 's' : ''} due.${pr.needDays ? html` That’s roughly <b>${pr.needDays} more work day${pr.needDays === 1 ? '' : 's'}</b> before then, or you could move something later.` : ' Moving a payment later or adding income before then would fix it.'}</p></section>`
    : html`<section class="card tl-verdict good" role="status"><h2>${icon('check', 18)} You’re covered until ${dshort(to)}</h2>
        <p>${low ? html`Everything planned can be paid. After paying, the lowest you’d be is <b>${money(low.balanceAfter)}</b> on ${dt(low.date)}.` : 'Nothing is planned yet in this period.'}${alloc ? html` Money set aside for goals (${money(alloc)}) is still part of that balance.` : ''}</p></section>`;
  return {
    html: html`${pageHeader('Money timeline', { back: true })}
    <p class="muted pad">Your balance day by day: ${wp ? `${money(wp.dailyMinor)} for each work day, plus ` : ''}every bill and income you’ve planned.</p>
    ${salaryIgnored() ? html`<p class="note-ignored" role="status">${icon('info', 16)} Your regular pay (${money(payRule().amountMinor)}) isn’t counted here, because you’re paid per work day.</p>` : ''}
    <div class="chips tl-chips" role="group" aria-label="How far ahead">${RANGES.map((n) => html`<button class="pill ${n === days ? 'on' : ''}" data-act="tl-range" data-v="${n}" aria-pressed="${n === days}">${n} days</button>`)}</div>
    ${empty && !wp ? emptyState('Nothing to show yet', 'Add bills and income in Upcoming, or set pay per work day, and this shows what happens to your money.', html`<a class="btn primary" href="#/settings/pay">Set up pay</a>`) : html`${verdict}
    <ol class="timeline" aria-label="Timeline">
      <li class="tl-node start"><span class="dot"></span><div class="tl-body"><b>Today</b><span>You have <b>${money(pr.start)}</b></span></div></li>
      ${pr.steps.map((x) => x.type === 'work'
        ? html`<li class="tl-node work"><span class="dot"></span><div class="tl-body"><b>Work ${x.days} day${x.days === 1 ? '' : 's'}</b><span>${dshort(x.from)} – ${dshort(x.to)} · <b class="amt in">+${money(x.total)}</b></span><small>Balance after: ${money(x.balanceAfter)}</small></div></li>`
        : html`<li class="tl-node bills ${x.short ? 'bad' : ''}"><span class="dot"></span><div class="tl-body"><b>${dt(x.date)}</b>
            <ul class="plain tl-items">${x.items.map((i) => html`<li><span>${i.name}</span><b class="amt ${i.kind === 'income' ? 'in' : 'out'}">${i.kind === 'income' ? '+' : '−'}${money(i.amountMinor)}</b></li>`)}</ul>
            ${x.items.length > 1 ? html`<span>Total <b class="amt ${x.net >= 0 ? 'in' : 'out'}">${money(x.net, { sign: true })}</b></span>` : ''}
            <small class="${x.short ? 'warn-t' : ''}">${x.short ? `Short by ${money(x.short)}` : `Left after: ${money(x.balanceAfter)}`}</small></div></li>`)}
      <li class="tl-node end"><span class="dot"></span><div class="tl-body"><b>By ${dshort(to)}</b><span>You’d have <b>${money(pr.end)}</b></span></div></li>
    </ol>
    ${wp ? '' : html`<p class="muted small-p">Paid per work day? <a class="link" href="#/settings/pay">Add your daily pay</a> and the days you work.</p>`}
    <p class="muted small-p">A forecast, not a promise: it assumes you work your usual days and that planned items happen on their dates. ${wp ? html`<a class="link" href="#/settings/pay">Change work days</a>.` : ''}</p>`}`,
  };
}
actions['tl-range'] = (el) => { app.ui.timelineDays = Number(el.dataset.v) || 45; };
