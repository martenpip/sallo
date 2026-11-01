import { app } from './ctx.js';
import { html, raw, icon, money, dateText, pageHeader, actions, emptyState } from './kit.js';
import * as C from '../calc.js';
import { today, parse, monthName, weekdayShort, addDays, dow } from '../dates.js';
import { txnRow, plannedRow } from './rows.js';
import { badge, amountSpan } from './kit.js';

function month() {
  const ui = app.ui;
  if (!ui.calMonth) { const { y, m } = parse(today()); ui.calMonth = { y, m }; }
  return ui.calMonth;
}

export function calendar() {
  const s = app.store, d = s.data, set = s.settings, t = today();
  const { y, m } = month();
  const sel = app.ui.calDay && app.ui.calDay.startsWith(`${y}-${String(m).padStart(2, '0')}`) ? app.ui.calDay : (t.startsWith(`${y}-${String(m).padStart(2, '0')}`) ? t : `${y}-${String(m).padStart(2, '0')}-01`);
  const days = C.monthGrid(y, m, set.weekStart);
  const marks = C.monthDayMarks(d.txns, d.planned, y, m);
  const heads = Array.from({ length: 7 }, (_, i) => weekdayShort((set.weekStart % 7 + i) % 7, set.locale || undefined));
  const dayTx = d.txns.filter((x) => x.date === sel);
  const dayPl = d.planned.filter((x) => x.date === sel && x.status !== 'skipped' && x.status !== 'done').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const wp = set.workPay;
  const cell = (iso) => {
    const work = C.isWorkDay(wp, iso);
    const inMonth = iso.startsWith(`${y}-${String(m).padStart(2, '0')}`);
    const mk = marks.get(iso) || {};
    const n = (mk.txn ? 1 : 0) + (mk.planned ? 1 : 0) + (mk.event ? 1 : 0) + (mk.paid ? 1 : 0);
    const label = `${dateText(iso, { weekday: 'long', day: 'numeric', month: 'long' })}${work ? ', work day' : ''}${n ? ', has activity' : ''}`;
    return html`<button class="cell ${work ? 'work' : ''} ${inMonth ? '' : 'out'} ${iso === t ? 'today' : ''} ${iso === sel ? 'sel' : ''}" data-act="cal-day" data-date="${iso}" aria-label="${label}" ${iso === sel ? raw('aria-current="date"') : ''}>
      <span class="n">${parse(iso).d}</span><span class="dots" aria-hidden="true">${mk.txn || mk.paid ? html`<i class="d1"></i>` : ''}${mk.planned ? html`<i class="d2"></i>` : ''}${mk.event ? html`<i class="d3"></i>` : ''}</span></button>`;
  };
  const workRow = C.isWorkDay(wp, sel) ? html`<div class="list card flush"><div class="row"><div class="row-main">${badge('cash')}<span class="row-text"><b>Work day</b><small>${sel > t ? 'Pay for the day' : 'Counted as a work day'}</small></span><span class="row-amt">${amountSpan(wp.dailyMinor, 'income')}</span></div></div></div>` : '';
  return {
    html: html`
    ${pageHeader('Calendar')}
    <section class="card">
      <div class="pnav"><button class="icon-btn" data-act="cal-prev" aria-label="Previous month">${icon('back')}</button>
        <div class="pnav-label" aria-live="polite">${monthName(y, m, set.locale || undefined)}</div>
        <button class="icon-btn" data-act="cal-next" aria-label="Next month">${icon('next')}</button>
        ${!(y === parse(t).y && m === parse(t).m) ? html`<button class="link" data-act="cal-today">Today</button>` : ''}</div>
      <div class="cal" role="grid" aria-label="${monthName(y, m, set.locale || undefined)}">
        ${heads.map((h) => html`<div class="cal-h" role="columnheader">${h}</div>`)}${days.map(cell)}</div>
      <p class="legend"><i class="d1"></i> Transactions <i class="d2"></i> Planned <i class="d3"></i> Events${wp ? html` <i class="lg-work"></i> Work day` : ''}</p>
    </section>
    <section aria-label="Selected day"><div class="day-head"><h2>${dateText(sel, { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div>
      ${workRow}
      ${dayPl.length || dayTx.length ? html`<div class="list card flush">${dayPl.map((p) => plannedRow(p, { showDate: false }))}${dayTx.map((x) => txnRow(x))}</div>`
        : workRow ? '' : emptyState('Nothing on this day', 'Add an event, a reminder or a planned payment.')}
      <div class="btn-row spread"><button class="btn" data-act="planned-new" data-kind="event" data-date="${sel}">${icon('calendar', 18)} Add event</button>
        <button class="btn" data-act="planned-new" data-kind="expense" data-date="${sel}">${icon('plus', 18)} Add payment</button></div></section>`,
  };
}
const shift = (n) => { const c = month(); const idx = c.y * 12 + (c.m - 1) + n; app.ui.calMonth = { y: Math.floor(idx / 12), m: idx % 12 + 1 }; app.ui.calDay = null; };
actions['cal-prev'] = () => shift(-1);
actions['cal-next'] = () => shift(1);
actions['cal-today'] = () => { app.ui.calMonth = null; app.ui.calDay = today(); };
actions['cal-day'] = (el) => { app.ui.calDay = el.dataset.date; const p = parse(el.dataset.date); app.ui.calMonth = { y: p.y, m: p.m }; };
