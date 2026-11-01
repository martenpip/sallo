// "Paid per work day": a daily rate, the weekdays worked and days off. Feeds the money timeline and safe-to-spend.
import { app } from './ctx.js';
import { html, icon, money, field, actions, forms, toast, showError, dateText } from './kit.js';
import * as C from '../calc.js';
import { parseMinor, minorToPlain, currencyInfo } from '../money.js';
import { today, addDays, parse, dow, monthName } from '../dates.js';
import { monthlyPay } from './guard.js';

const cur = () => currencyInfo(app.store.settings.currency);
const WD = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
const isoDow = (iso) => dow(iso) || 7;

function draft() {
  if (!app.ui.workDraft) {
    const w = app.store.settings.workPay, p = parse(today());
    app.ui.workDraft = { daily: w ? minorToPlain(w.dailyMinor, cur().exp) : '', weekdays: w ? [...w.weekdays] : [...C.DEFAULT_WEEKDAYS], off: w ? [...w.off] : [], extra: w ? [...(w.extra || [])] : [], y: p.y, m: p.m };
  }
  return app.ui.workDraft;
}
const asPay = (d, dailyMinor = 1) => ({ dailyMinor, weekdays: d.weekdays, off: d.off, extra: d.extra });
function readInto(form) { app.ui.workDraft && (draft().daily = form.elements.daily.value); }

export function workPayCard() {
  const d = draft(), c = cur(), t = today(), set = app.store.settings;
  const daily = parseMinor(String(d.daily || '').trim(), c.exp) || 0;
  const wp = asPay(d);
  const days = C.monthGrid(d.y, d.m, set.weekStart);
  const prefix = `${d.y}-${String(d.m).padStart(2, '0')}`;
  const order = Array.from({ length: 7 }, (_, i) => ((set.weekStart - 1 + i) % 7) + 1); // ISO weekdays in display order
  const worked = days.filter((x) => x.startsWith(prefix) && C.isWorkDay(wp, x)).length;
  const monthly = daily ? C.monthlyFromWork({ dailyMinor: daily, weekdays: d.weekdays, extra: d.extra }) : 0;
  return html`<form class="card" data-form="workpay" novalidate>
    <h2>${icon('cash', 18)} Paid per work day</h2>
    <p class="muted">If you earn a set amount for each day you work, tap your work days on the calendar. Sallo adds that pay on every work day in your timeline and in safe to spend.</p>
    ${field('Pay for one work day', html`<div class="money-in"><input id="wp-daily" name="daily" inputmode="decimal" autocomplete="off" placeholder="${c.exp ? '0.00' : '0'}" value="${d.daily}"><b>${c.symbol}</b></div>`, 'Leave it empty to turn this off.', 'wp-daily')}
    <div class="wp-cal">
      <div class="pnav"><button type="button" class="icon-btn" data-act="wp-prev" aria-label="Previous month">${icon('back')}</button>
        <div class="pnav-label" aria-live="polite">${monthName(d.y, d.m, set.locale || undefined)}</div>
        <button type="button" class="icon-btn" data-act="wp-next" aria-label="Next month">${icon('next')}</button></div>
      <div class="cal" role="group" aria-label="Work days">
        ${order.map((n) => html`<button type="button" class="cal-h wd-head ${d.weekdays.includes(n) ? 'on' : ''}" data-act="wp-wd" data-n="${n}" aria-pressed="${d.weekdays.includes(n)}" title="Tap to make every ${WD[n - 1][1]} a work day, or not">${WD[n - 1][1]}</button>`)}
        ${days.map((iso) => {
          if (!iso.startsWith(prefix)) return html`<span class="cell blank" aria-hidden="true"></span>`;
          const work = C.isWorkDay(wp, iso), patt = d.weekdays.includes(isoDow(iso)), off = patt && !work;
          return html`<button type="button" class="cell ${work ? 'sel' : ''} ${off ? 'offday' : ''} ${iso === t ? 'today' : ''}" data-act="wp-day" data-date="${iso}" aria-pressed="${work}" aria-label="${dateText(iso, { weekday: 'long', day: 'numeric', month: 'long' })}, ${work ? 'work day' : off ? 'day off' : 'not working'}"><span class="n">${parse(iso).d}</span></button>`;
        })}
      </div>
      <p class="legend"><i class="lg-work"></i> Work day <i class="lg-off"></i> Day off <small>Tap a weekday name to switch every one of them.</small></p>
      <div class="btn-row spread"><button type="button" class="btn small" data-act="wp-monfri">Mon–Fri</button><button type="button" class="btn small" data-act="wp-clear">Clear all</button></div>
    </div>
    <p class="muted small-p">${monthName(d.y, d.m, set.locale || undefined)}: <b>${worked} work day${worked === 1 ? '' : 's'}</b>${daily ? html` · <b>${money(worked * daily)}</b>` : ''}${monthly ? html`. On average about <b>${money(monthly)}</b> a month.` : ''}</p>
    <div class="btn-row"><span class="grow"></span><button class="btn primary" type="submit">Save</button></div></form>`;
}

const shiftMonth = (el, n) => { const f = el.closest('form'), d = draft(); readInto(f); const i = d.y * 12 + d.m - 1 + n; d.y = Math.floor(i / 12); d.m = i % 12 + 1; };
actions['wp-prev'] = (el) => shiftMonth(el, -1);
actions['wp-next'] = (el) => shiftMonth(el, 1);
actions['wp-day'] = (el) => {
  const f = el.closest('form'), d = draft(); readInto(f);
  const iso = el.dataset.date, work = C.isWorkDay(asPay(d), iso), patt = d.weekdays.includes(isoDow(iso));
  const rm = (arr, x) => arr.filter((y) => y !== x);
  if (work) { if (d.extra.includes(iso)) d.extra = rm(d.extra, iso); else d.off = [...new Set([...d.off, iso])].sort(); }
  else if (patt) d.off = rm(d.off, iso);
  else d.extra = [...new Set([...d.extra, iso])].sort();
};
actions['wp-wd'] = (el) => {
  const f = el.closest('form'), d = draft(); readInto(f);
  const n = Number(el.dataset.n), on = d.weekdays.includes(n);
  d.weekdays = on ? d.weekdays.filter((x) => x !== n) : [...d.weekdays, n].sort();
  d.off = d.off.filter((x) => isoDow(x) !== n); d.extra = d.extra.filter((x) => isoDow(x) !== n); // a whole-weekday choice replaces one-off tweaks for that weekday
};
actions['wp-monfri'] = (el) => { const f = el.closest('form'), d = draft(); readInto(f); d.weekdays = [1, 2, 3, 4, 5]; d.off = []; d.extra = []; };
actions['wp-clear'] = (el) => { const f = el.closest('form'), d = draft(); readInto(f); d.weekdays = []; d.off = []; d.extra = []; };

forms.workpay = (fd, form) => {
  const s = app.store, c = cur();
  const d = draft();
  const raw = String(fd.get('daily') || '').trim();
  if (!raw || /^0+([.,]0+)?$/.test(raw)) { s.setSettings({ workPay: null }); app.ui.workDraft = null; toast('Daily pay turned off'); return true; }
  const dailyMinor = parseMinor(raw, c.exp);
  if (dailyMinor === null || dailyMinor <= 0) { showError(form, 'daily', 'Enter an amount like 100.00.'); return false; }
  if (!d.weekdays.length && !d.extra.length) { toast('Tap the days you work on the calendar.'); return false; }
  const t0 = addDays(today(), -31); // keep recent history only
  s.setSettings({ workPay: { dailyMinor, weekdays: d.weekdays, off: d.off.filter((x) => x >= t0), extra: d.extra.filter((x) => x >= t0) } });
  app.ui.workDraft = null;
  const pl = s.settings.plan, mp = monthlyPay();
  if (pl && pl.incomeMinor && mp) { s.setSettings({ plan: { ...pl, incomeMinor: mp } }); app.ui.planDraft = null; } // the money plan follows what you really earn
  toast(pl && pl.incomeMinor && mp ? 'Saved. Your money plan now uses ' + money(mp) + ' a month' : 'Saved');
  return true;
};
