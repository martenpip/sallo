import { app } from './ctx.js';
import { html, raw, icon, avatar, money, dateText, pageHeader, progress, chip, actions, badge, emptyState } from './kit.js';
import * as C from '../calc.js';
import { today, periodFor, shiftPeriod, addDays, monthName, dayDiff, formatDate } from '../dates.js';
import { plannedRow, txnRow } from './rows.js';
import { guardFor, guardLines, guardHeadline, skipRuleId } from './guard.js';
import { planCard } from './plan.js';
import { ledger } from '../household.js';
import { ACCOUNT_ICON } from './editors.js';
import { findAll } from './subscriptions.js';
import { subscriptionTotals } from '../subscriptions.js';

// distinct, calm colours that stay readable on both light and dark cards
export const SLICE_COLORS = ['#8A7090', '#A4AF69', '#C98B5E', '#5F8FB8', '#C77D96', '#4F8A6A', '#D1A24A', '#7C79C2'];
const GREY = '#9A93A3';

export function spendSlices(s, cats) {
  const total = cats.reduce((n, c) => n + c.total, 0);
  if (!total) return { total: 0, slices: [] };
  const top = cats.slice(0, 6), rest = cats.slice(6);
  const rows = top.map((c, i) => { const cat = s.category(c.categoryId); return { name: cat?.name || 'No category', icon: cat?.icon || 'tag', amount: c.total, color: SLICE_COLORS[i % SLICE_COLORS.length] }; });
  if (rest.length) rows.push({ name: 'Everything else', icon: 'tag', amount: rest.reduce((n, c) => n + c.total, 0), color: GREY });
  let acc = 0;
  const slices = rows.map((r) => { const frac = r.amount / total; const out = { ...r, pct: Math.round(frac * 100), start: acc, frac }; acc += frac; return out; });
  return { total, slices };
}

export function donut(total, slices, balanceText) {
  const R = 15.9155, gap = slices.length > 1 ? 0.7 : 0;
  const label = slices.length ? `Spending by category: ${slices.map((x) => `${x.name} ${x.pct < 1 ? 'under 1' : x.pct} percent`).join(', ')}` : 'No spending recorded in this period';
  const arcs = slices.length ? slices.map((x, i) => {
    const len = Math.max(0.4, x.frac * 100 - gap);
    return `<circle class="seg" style="animation-delay:${i * 90}ms" cx="21" cy="21" r="${R}" fill="none" stroke="${x.color}" stroke-width="5.2" stroke-dasharray="${len.toFixed(2)} ${(100 - len).toFixed(2)}" stroke-dashoffset="${(-(x.start * 100 + gap / 2)).toFixed(2)}"/>`;
  }).join('') : `<circle cx="21" cy="21" r="${R}" fill="none" stroke="var(--track)" stroke-width="5.2"/>`;
  return html`<div class="donut"><svg viewBox="0 0 42 42" role="img" aria-label="${label}"><g transform="rotate(-90 21 21)">${raw(arcs)}</g></svg>
    <div class="donut-mid"><span class="eyebrow">Total balance</span><b class="hero-amt">${balanceText}</b></div></div>`;
}

export function periodLabel(p, monthStart, locale) {
  if (monthStart === 1) return monthName(p.year, p.month, locale || undefined);
  return `${formatDate(p.start, locale || undefined)} – ${formatDate(addDays(p.endExclusive, -1), locale || undefined)}`;
}

export function periodNav(p, label, actPrev, actNext, atCurrent, actNow) {
  return html`<div class="pnav"><button class="icon-btn" data-act="${actPrev}" aria-label="Previous period">${icon('back')}</button>
    <div class="pnav-label" aria-live="polite">${label}</div>
    <button class="icon-btn" data-act="${actNext}" aria-label="Next period">${icon('next')}</button>
    ${!atCurrent ? html`<button class="link" data-act="${actNow}">Today</button>` : ''}</div>`;
}

export function overview() {
  const s = app.store, d = s.data, set = s.settings, t = today();
  const ui = app.ui;
  const bal = C.accountBalances(d.accounts, d.txns);
  const total = C.totalBalance(d.accounts, bal);
  const allocated = C.totalAllocated(d.goals, d.contribs);
  const cur0 = periodFor(t, set.monthStart);
  const p = shiftPeriod(cur0, ui.overviewShift);
  const isCurrent = ui.overviewShift === 0;
  const tot = C.periodTotals(d.txns, p.start, p.endExclusive);
  const cats = C.expenseByCategory(d.txns, p.start, p.endExclusive);
  const accounts = s.activeAccounts();
  const overdue = C.overdueTotals(d.planned, t);
  const next = C.groupUpcoming(d.planned, t, set.weekStart).flatMap((g) => g.items).filter((x) => x.kind !== 'event' || true).slice(0, 4);
  const budgets = d.budgets.map((b) => ({ b, st: C.budgetStatus(b, d.txns, p.start, p.endExclusive) })).sort((a, b) => b.st.pct - a.st.pct).slice(0, 3);
  const goals = d.goals.filter((g) => !g.archived).slice(0, 2);
  const lastEx = set.lastExportAt ? dayDiff(t, set.lastExportAt.slice(0, 10)) : null;
  const needBackup = !set.demo && d.txns.length >= 5 && (lastEx === null || lastEx > 30);
  const fcEnd = addDays(p.endExclusive, -1), skip = skipRuleId();
  const fc = isCurrent ? C.forecast(total, skip ? d.planned.filter((x) => x.ruleId !== skip) : d.planned, t, fcEnd) + C.workIncome(set.workPay, t, fcEnd) : null;
  const maxCat = cats[0]?.total || 1;
  const sp = spendSlices(s, cats);
  const wpay = set.workPay;
  const safe = isCurrent ? (wpay ? (() => { const x = C.safeToSpendProjected({ ...d, workPay: wpay, skipRuleId: skipRuleId() }, t, 30); return { safe: x.safe, perDay: x.perDay, perWeek: x.perWeek, until: x.lowDate, byIncome: true, bills: 0, allocated: x.allocated, balance: x.balance, work: true }; })() : C.safeToSpend(d, t, cur0.endExclusive)) : null;
  const guard = set.guard !== false && isCurrent ? guardFor(p) : null;
  const gLines = guard ? guardLines(guard) : [];

  const recent = d.txns.slice().sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0)).slice(0, 5);
  const nextUp = next.find((x) => x.kind !== 'event');
  const dt = C.debtTotals(d.debts, d.repayments, d.planned);
  const topGoal = goals[0] ? { g: goals[0], gp: C.goalProgress(goals[0], d.contribs, t) } : null;
  function carousel() {
    const sl = [];
    if (safe) sl.push(html`<div class="slide safe ${safe.safe < 0 ? 'neg' : ''}"><a class="sl-main" href="#/timeline"><span class="sl-k">Safe to spend</span>
      <b class="sl-v" data-test="safe">${safe.safe < 0 ? '−' + money(-safe.safe) : money(safe.safe)}</b>
      <span class="sl-s">${safe.safe < 0 ? 'You’re short for what’s coming up.' : html`About ${money(safe.perDay)} a day · ${money(safe.perWeek)} a week`}</span>
      <span class="sl-f">${safe.work ? 'After bills, work days' : 'After bills'}${safe.allocated ? ' and savings' : ''}${safe.until && !safe.work ? `, until ${dateText(safe.until, { day: 'numeric', month: 'short' })}` : safe.work ? ', next 30 days' : ''}</span></a>
      ${!safe.byIncome ? html`<a class="sl-link" href="#/settings/pay">Add your pay for a sharper number</a>` : html`<a class="sl-link" href="#/afford">Can I afford something?</a>`}</div>`);
    if (nextUp) sl.push(html`<a class="slide" href="#/upcoming"><span class="sl-k">Next up</span><b class="sl-v">${nextUp.name}</b><span class="sl-s">${money(nextUp.amountMinor)} · ${dateText(nextUp.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span></a>`);
    sl.push(html`<a class="slide" href="#/insights"><span class="sl-k">${isCurrent ? 'Spent this period' : periodLabel(p, set.monthStart, set.locale)}</span><b class="sl-v">${money(tot.expense)}</b><span class="sl-s">${money(tot.income)} came in</span></a>`);
    if (topGoal) sl.push(html`<a class="slide" href="#/goal/${topGoal.g.id}"><span class="sl-k">${topGoal.g.name}</span><b class="sl-v">${topGoal.gp.pct}%</b>${progress(topGoal.gp.pct, 'sage', topGoal.g.name)}<span class="sl-s">${money(topGoal.gp.saved)} of ${money(topGoal.g.targetMinor)}</span></a>`);
    { const st = subscriptionTotals(findAll()); if (st.count) sl.push(html`<a class="slide" href="#/subscriptions"><span class="sl-k">Subscriptions</span><b class="sl-v">${money(st.monthly)}</b><span class="sl-s">a month across ${st.count} regular ${st.count === 1 ? 'charge' : 'charges'}</span></a>`); }
    if (dt.owe || dt.owed) sl.push(html`<a class="slide" href="#/debts"><span class="sl-k">${dt.owe ? 'You owe' : 'Owed to you'}</span><b class="sl-v">${money(dt.owe || dt.owed)}</b><span class="sl-s">${dt.owe && dt.owed ? `${money(dt.owed)} owed to you` : 'Debts and loans'}</span></a>`);
    if (set.household) { const h = set.household; const l = ledger({ household: h, mine: d.txns.filter((x) => x.shared && x.type === 'expense'), theirs: d.sharedIn, start: p.start, endExclusive: p.endExclusive }); const her = h.config.names[h.partnerId];
      sl.push(html`<a class="slide" href="#/household"><span class="sl-k">With ${her}</span><b class="sl-v">${money(l.total)}</b><span class="sl-s">${!l.total || !l.balance ? 'You’re even' : l.balance > 0 ? `${her} owes you ${money(l.balance)}` : `You owe ${her} ${money(-l.balance)}`}</span></a>`); }
    return html`<section class="car-wrap" aria-label="Highlights"><div class="car" tabindex="0">${sl}</div><div class="dots" aria-hidden="true">${sl.map((_, i) => html`<i class="${i ? '' : 'on'}"></i>`)}</div></section>`;
  }

  return {
    html: html`
    <section class="wallet" aria-label="Total balance">
      <h1 class="sr">Overview</h1>
      <div class="wallet-top"><a class="glass-btn" href="#/settings" aria-label="Settings">${icon('sliders', 20)}</a>
        <a class="wallet-chip" href="#/settings/accounts">${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}</a>
        <button class="glass-btn" data-act="toggle-hide" aria-label="${set.hideAmounts ? 'Show amounts' : 'Hide amounts'}" aria-pressed="${set.hideAmounts}">${icon(set.hideAmounts ? 'eyeoff' : 'eye', 20)}</button></div>
      <p class="wallet-k">Total balance</p>
      <b class="bal" data-count="${total}">${money(total)}</b>
      <p class="wallet-s">${allocated ? html`${money(total - allocated)} free after ${money(allocated)} set aside` : (tot.net >= 0 ? html`${money(tot.net, { sign: true })} so far this period` : html`${money(tot.net, { sign: true })} so far this period`)}</p>
      <div class="qa" role="group" aria-label="Quick actions">
        <button class="qa-b" data-act="txn-new" data-type="expense"><span class="qa-c">${icon('minus', 22)}</span>Expense</button>
        <button class="qa-b" data-act="txn-new" data-type="income"><span class="qa-c">${icon('plus', 22)}</span>Income</button>
        <button class="qa-b" data-act="txn-new" data-type="transfer"><span class="qa-c">${icon('transfer', 22)}</span>Transfer</button>
        <a class="qa-b" href="#/afford"><span class="qa-c">${icon('cart', 22)}</span>Can I afford</a>
      </div>
    </section>
    <div class="mini" aria-hidden="true"><b>${money(total)}</b></div>
    ${needBackup ? html`<div class="banner"><div>${icon('download', 18)}</div><div><b>Back up your data</b><p>${lastEx === null ? 'You haven’t exported a backup yet.' : `Your last backup is ${lastEx} days old.`} Your data lives only on this device.</p></div><a class="btn small" href="#/settings/data">Back up</a></div>` : ''}
    ${overdue.count ? html`<a class="banner warn" href="#/upcoming"><div>${icon('clock', 18)}</div><div><b>${overdue.count} overdue</b><p>${overdue.out ? `${money(overdue.out)} to pay` : ''}${overdue.out && overdue.inc ? ' · ' : ''}${overdue.inc ? `${money(overdue.inc)} expected` : ''}</p></div>${icon('next', 18)}</a>` : ''}

    ${set.demo ? html`<div class="banner"><div>${icon('info', 18)}</div><div><b>You’re looking at example data</b><p>Nothing here is real. Start fresh when you’re ready.</p></div><button class="btn small" data-act="demo-clear">Start fresh</button></div>` : ''}
    ${carousel()}

    ${gLines.length ? (() => { const high = gLines.some((l) => l.level === 'high'); const wi = guard.warnings.find((w) => w.code === 'wants-income');
      return html`<section class="card guard ${high ? 'high' : ''}" aria-label="Spending check" role="status">
      <div class="g-top"><span class="g-ic">${icon(high ? 'bell' : 'info', 22)}</span><div class="g-txt"><h2>${guardHeadline(guard)}</h2><p>${gLines[0].text}</p></div></div>
      ${wi ? html`<div class="g-meter" role="img" aria-label="Non-essentials are ${wi.pct} percent of income; comfortable level is ${wi.limit} percent"><div class="g-fill" style="width:${Math.min(100, wi.pct)}%"></div><i class="g-mark" style="left:${Math.min(100, wi.limit)}%"></i></div>
        <div class="g-scale"><span>${wi.pct}% of income</span><span>comfortable: ${wi.limit}%</span></div>` : ''}
      ${gLines.slice(1).map((l) => html`<p class="g-more-line">${l.text}</p>`)}
      ${guard.topWants.length ? html`<div class="g-chips" aria-label="Biggest non-essentials">${guard.topWants.map((w) => { const c = s.category(w.categoryId); return html`<span class="g-chip">${avatar(c?.icon || 'tag', w.categoryId)}<span><b>${c?.name || 'No category'}</b><small>${money(w.total)}</small></span></span>`; })}</div>` : ''}
      <details class="g-how"><summary>How this works</summary><p class="muted small-p">Essentials are things like rent, utilities, groceries and health. You can change which categories count in Settings → Categories, or turn this off in Preferences.</p></details></section>`; })() : ''}

    ${isCurrent ? planCard(p) : ''}

    ${recent.length ? html`<section class="group" aria-label="Recent activity"><div class="card-head sec"><h2>Recent</h2><a class="link" href="#/activity">See all</a></div><div class="card flush list">${recent.map((x) => txnRow(x, { showDate: true }))}</div></section>` : ''}

    <section class="card hero" aria-label="Total balance and where it went">
      <div class="hero-head"><span class="badge pie">${icon('pie', 22)}</span><div><h2 class="hero-title">Where your money went</h2><p class="muted small-p">${periodLabel(p, set.monthStart, set.locale)} · share of what you spent</p></div></div>
      <div class="hero-body">
        ${donut(sp.total, sp.slices, money(total))}
        ${sp.slices.length ? html`<ul class="plain legend-list">${sp.slices.map((x) => html`<li><span class="swatch" style="background:${x.color}" aria-hidden="true"></span><span class="lg-ic">${icon(x.icon, 16)}</span><span class="lg-name">${x.name}</span><b class="lg-pct">${x.pct < 1 ? '<1' : x.pct}%</b><span class="lg-amt">${money(x.amount)}</span></li>`)}</ul>`
          : html`<p class="muted">Nothing spent in this period yet. Add an expense and the chart fills in.</p>`}
      </div>
      ${allocated ? html`<p class="muted">${money(total - allocated)} free after ${money(allocated)} set aside for goals</p>` : ''}
      ${accounts.length ? html`<ul class="plain accts">${accounts.map((a) => html`<li><button class="row-main slim" data-act="account-open" data-id="${a.id}">${badge(ACCOUNT_ICON[a.type] || 'wallet')}<span class="row-text"><b>${a.name}</b></span><span class="row-amt">${money(bal.get(a.id) || 0)}</span></button></li>`)}</ul>`
        : html`<p class="muted">No accounts yet.</p><button class="btn primary" data-act="account-new">Add an account</button>`}
    </section>

    <section class="card" aria-label="This period">
      ${periodNav(p, periodLabel(p, set.monthStart, set.locale), 'ov-prev', 'ov-next', isCurrent, 'ov-now')}
      <div class="trio">
        <div><span class="eyebrow">Income</span><b class="amt in">${money(tot.income)}</b></div>
        <div><span class="eyebrow">Spent</span><b class="amt out">${money(tot.expense)}</b></div>
        <div><span class="eyebrow">Net</span><b class="amt ${tot.net >= 0 ? 'in' : 'out'}">${money(tot.net, { sign: true })}</b></div>
      </div>
      ${fc !== null ? html`<p class="muted small-p">Expected balance at the end of this period: <b>${money(fc)}</b>, counting what’s still planned${set.workPay ? ' and your work days' : ''}.</p>` : ''}
      ${cats.length ? html`<h3 class="sub">Where it went</h3><ul class="plain bars">${cats.slice(0, 5).map((c) => { const cat = s.category(c.categoryId); return html`<li><div class="bar-label"><span>${cat?.name || 'No category'}</span><b>${money(c.total)}</b></div><div class="bar"><i style="width:${Math.max(3, Math.round((c.total / maxCat) * 100))}%"></i></div></li>`; })}</ul>
        <a class="link" href="#/insights">More insights ${icon('next', 14)}</a>`
        : html`<p class="muted">No spending recorded in this period.</p>`}
    </section>

    ${budgets.length ? html`<section class="card" aria-label="Budgets"><div class="card-head"><h2>Budgets</h2><a class="link" href="#/settings/budgets">All</a></div>
      <ul class="plain gap">${budgets.map(({ b, st }) => html`<li><div class="bar-label"><span>${b.categoryId ? s.category(b.categoryId)?.name : 'All spending'}</span><span>${money(st.spent)} of ${money(st.limit)}</span></div>${progress(st.pct, st.state, 'Budget used')}
        ${st.state === 'over' ? html`<small class="warn-t">Over by ${money(-st.remaining)}</small>` : st.state === 'near' ? html`<small class="warn-t">${money(st.remaining)} left</small>` : ''}</li>`)}</ul></section>` : ''}

    <section class="card" aria-label="Coming up"><div class="card-head"><h2>Coming up</h2><a class="link" href="#/upcoming">See all</a></div>
      ${next.length ? html`<div class="list">${next.map((x) => plannedRow(x))}</div>` : html`<p class="muted">Nothing planned. Add bills, income or events in Upcoming.</p>`}</section>

    ${goals.length ? html`<section class="card" aria-label="Savings goals"><div class="card-head"><h2>Savings</h2><a class="link" href="#/savings">All</a></div>
      <ul class="plain gap">${goals.map((g) => { const gp = C.goalProgress(g, d.contribs, t); return html`<li><a class="goal-mini" href="#/goal/${g.id}"><div class="bar-label"><span>${g.name}</span><span>${gp.pct}%</span></div>${progress(gp.pct, 'sage', g.name)}<small>${money(gp.saved)} of ${money(g.targetMinor)}</small></a></li>`; })}</ul></section>` : ''}`,
  };
}

actions['ov-prev'] = () => { app.ui.overviewShift -= 1; };
actions['ov-next'] = () => { app.ui.overviewShift += 1; };
actions['ov-now'] = () => { app.ui.overviewShift = 0; };
actions['toggle-hide'] = () => { app.store.setSettings({ hideAmounts: !app.store.settings.hideAmounts }); };
