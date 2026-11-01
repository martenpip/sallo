import { app } from './ctx.js';
import { html, raw, icon, money, dateText, pageHeader, progress, chip, actions, badge, emptyState } from './kit.js';
import * as C from '../calc.js';
import { today, periodFor, shiftPeriod, addDays, monthName, dayDiff, formatDate } from '../dates.js';
import { plannedRow } from './rows.js';
import { guardFor, guardLines, guardHeadline, skipRuleId } from './guard.js';
import { planCard } from './plan.js';
import { ACCOUNT_ICON } from './editors.js';

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

  return {
    html: html`
    ${pageHeader('Overview', { right: html`<button class="icon-btn" data-act="toggle-hide" aria-label="${set.hideAmounts ? 'Show amounts' : 'Hide amounts'}" aria-pressed="${set.hideAmounts}">${icon(set.hideAmounts ? 'eyeoff' : 'eye')}</button>
      <a class="icon-btn" href="#/settings" aria-label="Settings">${icon('sliders')}</a>` })}
    ${needBackup ? html`<div class="banner"><div>${icon('download', 18)}</div><div><b>Back up your data</b><p>${lastEx === null ? 'You haven’t exported a backup yet.' : `Your last backup is ${lastEx} days old.`} Your data lives only on this device.</p></div><a class="btn small" href="#/settings/data">Back up</a></div>` : ''}
    ${overdue.count ? html`<a class="banner warn" href="#/upcoming"><div>${icon('clock', 18)}</div><div><b>${overdue.count} overdue</b><p>${overdue.out ? `${money(overdue.out)} to pay` : ''}${overdue.out && overdue.inc ? ' · ' : ''}${overdue.inc ? `${money(overdue.inc)} expected` : ''}</p></div>${icon('next', 18)}</a>` : ''}

    ${set.demo ? html`<div class="banner"><div>${icon('info', 18)}</div><div><b>You’re looking at example data</b><p>Nothing here is real. Start fresh when you’re ready.</p></div><button class="btn small" data-act="demo-clear">Start fresh</button></div>` : ''}
    ${safe ? html`<section class="card hero safe ${safe.safe < 0 ? 'neg' : ''}" aria-label="Safe to spend">
      <div class="hero-head"><span class="badge pie">${icon('wallet', 22)}</span><div><h2 class="hero-title">Safe to spend</h2><p class="muted small-p">${safe.work ? `After bills and your work days${safe.allocated ? ' and savings' : ''}, over the next 30 days` : html`After bills${safe.allocated ? ' and savings' : ''}${safe.until ? `, until ${safe.byIncome ? 'your next income on ' : ''}${dateText(safe.until, { day: 'numeric', month: 'short' })}` : ''}`}</p></div></div>
      <div class="hero-amt" data-test="safe">${safe.safe < 0 ? '−' + money(-safe.safe) : money(safe.safe)}</div>
      ${safe.safe < 0 ? html`<p class="muted">You’re short for what’s coming up. Hold off on non-essentials if you can.</p>`
        : html`<p class="muted">About <b>${money(safe.perDay)}</b> a day · <b>${money(safe.perWeek)}</b> a week</p>`}
      <a class="link" href="#/timeline">See your money timeline</a>
      ${!safe.byIncome ? html`<a class="btn small" href="#/settings/pay">${icon('cash', 16)} Add your pay and payday for a sharper number</a>` : ''}
      <p class="muted small-p">${safe.work ? html`Counts your daily pay and every bill in the next 30 days.` : html`${money(safe.balance)} balance${safe.bills ? ` − ${money(safe.bills)} bills due` : ''}`}${safe.allocated ? ` − ${money(safe.allocated)} set aside` : ''}${safe.byIncome ? html` · <a class="link" href="#/settings/pay">Pay settings</a>` : ''}</p></section>` : ''}
    ${gLines.length ? html`<section class="card guard ${gLines.some((l) => l.level === 'high') ? 'high' : ''}" aria-label="Spending check" role="status">
      <div class="guard-head"><span class="badge">${icon('info', 20)}</span><h2>${guardHeadline(guard)}</h2></div>
      ${gLines.map((l) => html`<p>${l.text}</p>`)}
      ${guard.topWants.length ? html`<p class="muted small-p">Biggest non-essentials this period: ${guard.topWants.map((w, i) => html`${i ? ', ' : ''}${s.category(w.categoryId)?.name} ${money(w.total)}`)}.</p>` : ''}
      <p class="muted small-p">Essentials are things like rent, utilities, groceries and health. You can change which categories count in Settings → Categories, or turn this off in Preferences.</p></section>` : ''}

    ${isCurrent ? planCard(p) : ''}

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

    ${(() => { const dt = C.debtTotals(d.debts, d.repayments, d.planned); return dt.owe || dt.owed ? html`<section class="card" aria-label="Debts and loans"><div class="card-head"><h2>${icon('bank', 18)} Debts and loans</h2><a class="link" href="#/debts">See all</a></div><div class="trio"><div><span class="eyebrow">You owe</span><b class="amt ${dt.owe ? 'out' : ''}">${money(dt.owe)}</b></div><div><span class="eyebrow">Owed to you</span><b class="amt ${dt.owed ? 'in' : ''}">${money(dt.owed)}</b></div></div></section>` : ''; })()}

    ${goals.length ? html`<section class="card" aria-label="Savings goals"><div class="card-head"><h2>Savings</h2><a class="link" href="#/savings">All</a></div>
      <ul class="plain gap">${goals.map((g) => { const gp = C.goalProgress(g, d.contribs, t); return html`<li><a class="goal-mini" href="#/goal/${g.id}"><div class="bar-label"><span>${g.name}</span><span>${gp.pct}%</span></div>${progress(gp.pct, 'sage', g.name)}<small>${money(gp.saved)} of ${money(g.targetMinor)}</small></a></li>`; })}</ul></section>` : ''}`,
  };
}

actions['ov-prev'] = () => { app.ui.overviewShift -= 1; };
actions['ov-next'] = () => { app.ui.overviewShift += 1; };
actions['ov-now'] = () => { app.ui.overviewShift = 0; };
actions['toggle-hide'] = () => { app.store.setSettings({ hideAmounts: !app.store.settings.hideAmounts }); };
