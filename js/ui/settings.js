import { app } from './ctx.js';
import {
  html, icon, money, dateText, pageHeader, actions, forms, changes, emptyState, progress, chip, badge, field, options,
  openSheet, closeSheet, confirmSheet, toast, showError, $,
} from './kit.js';
import * as C from '../calc.js';
import { CURRENCIES, parseMinor, minorToPlain } from '../money.js';
import { today, periodFor, shiftPeriod, dayDiff, addDays, isIso } from '../dates.js';
import { canShareFiles } from './dataio.js';
import { periodLabel } from './overview.js';
import { payRule, monthlyPay, salaryIgnored } from './guard.js';
import { workPayCard } from './workpay.js';
import { nextOnOrAfter } from '../recurrence.js';
import { detectCategory } from '../categorize.js';
import { ACCOUNT_ICON } from './editors.js';

export const APP_VERSION = '1.0.0';
const back = (title, right = '') => pageHeader(title, { back: true, right });
function debtSub() { const d = app.store.data, t = C.debtTotals(d.debts, d.repayments, d.planned); return t.owe || t.owed ? [t.owe ? `You owe ${money(t.owe)}` : '', t.owed ? `Owed to you ${money(t.owed)}` : ''].filter(Boolean).join(' · ') : 'Loans, cards, money lent'; }
const link = (href, ico, title, sub) => html`<a class="row link-row" href="${href}">${badge(ico)}<span class="row-text"><b>${title}</b>${sub ? html`<small>${sub}</small>` : ''}</span>${icon('next', 16)}</a>`;

export function settings() {
  const s = app.store, set = s.settings;
  return {
    html: html`${back('Settings')}
    <div class="list card flush">
      ${link('#/settings/preferences', 'sliders', 'Preferences', `${set.currency} · week starts ${['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][set.weekStart]}`)}
      ${link('#/settings/pay', 'cash', 'Pay and income', monthlyPay() ? `${money(monthlyPay())} a month` : 'Add your salary or daily pay')}
      ${link('#/debts', 'bank', 'Debts and loans', debtSub())}
      ${link('#/settings/plan', 'target', 'Money plan', set.plan ? (set.plan.type === 'own' ? 'My own way' : set.plan.type === 'custom' ? `${set.plan.needs}/${set.plan.wants}/${set.plan.save}` : set.plan.type.replace(/-/g, '/')) : 'Choose how you want to live')}
      ${link('#/settings/accounts', 'bank', 'Accounts', `${s.activeAccounts().length} active`)}
      ${link('#/settings/categories', 'tag', 'Categories')}
      ${link('#/settings/budgets', 'target', 'Budgets', `${s.data.budgets.length} set`)}
      ${link('#/recurring', 'repeat', 'Recurring items', `${s.data.rules.length} total`)}
    </div>
    <div class="list card flush">
      ${link('#/settings/data', 'download', 'Backup, import and export', set.lastExportAt ? 'Last backup ' + dateText(set.lastExportAt.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : 'No backup yet')}
      ${link('#/settings/security', 'lock', 'Security', app.persist.lockEnabled() ? 'Passcode lock is on' : 'Passcode lock is off')}
      ${link('#/settings/about', 'info', 'About and privacy', 'Version ' + APP_VERSION)}
    </div>`,
  };
}

// ---------- preferences ----------
const LOCALES = [['', 'Device default'], ['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['de-DE', 'Deutsch'], ['fr-FR', 'Français'], ['es-ES', 'Español'], ['it-IT', 'Italiano'], ['nl-NL', 'Nederlands'], ['sv-SE', 'Svenska'], ['fi-FI', 'Suomi'], ['et-EE', 'Eesti'], ['pl-PL', 'Polski'], ['pt-PT', 'Português']];
export function preferences() {
  const set = app.store.settings;
  return {
    html: html`${back('Preferences')}
    <form class="card" data-change="pref" novalidate>
      ${field('Currency', html`<select id="p-cur" name="currency">${options(CURRENCIES.map((c) => [c.code, `${c.code} · ${c.name}`]), set.currency)}</select>`, 'Changing it relabels your amounts. It does not convert them.', 'p-cur')}
      ${field('Number and date format', html`<select id="p-loc" name="locale">${options(LOCALES, set.locale)}</select>`, 'The app’s wording stays in English.', 'p-loc')}
      ${field('Week starts on', html`<select id="p-ws" name="weekStart">${options([['1', 'Monday'], ['7', 'Sunday'], ['6', 'Saturday']], String(set.weekStart))}</select>`, '', 'p-ws')}
      ${field('Month starts on day', html`<select id="p-ms" name="monthStart">${options(Array.from({ length: 28 }, (_, i) => [String(i + 1), String(i + 1)]), String(set.monthStart))}</select>`, 'Set this to your payday and your “month” will run from then.', 'p-ms')}
      ${field('Theme', html`<select id="p-th" name="theme">${options([['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']], set.theme)}</select>`, '', 'p-th')}
      ${field('Sounds', html`<select id="p-snd" name="sound">${options([['on', 'Soft sounds on'], ['off', 'Off']], set.sound === false ? 'off' : 'on')}</select>`, 'Gentle tones for taps and saved changes. Made on your device; nothing is downloaded.', 'p-snd')}
      ${field('Saving prompts', html`<select id="p-nud" name="nudges">${options([['on', 'Suggest setting money aside'], ['off', 'Off']], set.nudges === false ? 'off' : 'on')}</select>`, 'When income arrives, Sallo offers to put some toward your goals. You choose every time.', 'p-nud')}
      ${field('Spending warnings', html`<select id="p-grd" name="guard">${options([['on', 'Warn me about non-essentials'], ['off', 'Off']], set.guard === false ? 'off' : 'on')}</select>`, 'Gentle heads-ups when non-essential spending may crowd out rent, utilities and other priorities.', 'p-grd')}
      ${field('Comfortable limit for non-essentials', html`<select id="p-wl" name="wantsLimit">${options([['20', '20% of income'], ['30', '30% of income'], ['40', '40% of income'], ['50', '50% of income']], String(set.wantsLimit || 30))}</select>`, 'Spending on non-essentials above this share of your income triggers a heads-up.', 'p-wl')}
      ${field('Phone orientation', html`<select id="p-ori" name="orientation">${options([['auto', 'Allow rotating'], ['portrait', 'Portrait only']], set.orientation || 'auto')}</select>`, 'Portrait only locks the screen upright where the browser allows it, and otherwise asks you to turn the phone back.', 'p-ori')}
    </form>`,
  };
}
changes['pref'] = (el) => {
  const form = el.closest('form');
  const fd = new FormData(form);
  app.store.setSettings({
    currency: fd.get('currency'), locale: fd.get('locale'), weekStart: Number(fd.get('weekStart')),
    monthStart: Number(fd.get('monthStart')), theme: fd.get('theme'), sound: fd.get('sound') !== 'off', nudges: fd.get('nudges') !== 'off', guard: fd.get('guard') !== 'off', wantsLimit: Number(fd.get('wantsLimit')) || 30, orientation: fd.get('orientation') === 'portrait' ? 'portrait' : 'auto',
  });
  app.ui.overviewShift = 0; app.ui.activityShift = 0;
};

// ---------- accounts / categories / budgets ----------
export function accountsScreen() {
  const s = app.store;
  const bal = C.accountBalances(s.data.accounts, s.data.txns);
  const row = (a) => html`<div class="row ${a.archived ? 'dim' : ''}"><button class="row-main" data-act="account-open" data-id="${a.id}">${badge(ACCOUNT_ICON[a.type])}<span class="row-text"><b>${a.name}</b><small>${{ bank: 'Bank account', cash: 'Cash', card: 'Card', savings: 'Savings', other: 'Other' }[a.type]}${a.archived ? ' · archived' : ''}</small></span><span class="row-amt">${money(bal.get(a.id) || 0)}</span></button></div>`;
  const active = s.activeAccounts(), arch = s.data.accounts.filter((a) => a.archived);
  return {
    html: html`${back('Accounts', html`<button class="icon-btn" data-act="account-new" aria-label="Add account">${icon('plus')}</button>`)}
    ${active.length ? html`<div class="list card flush">${active.map(row)}</div>` : emptyState('No accounts', 'Add where your money lives: a bank account, cash, a card.', html`<button class="btn primary" data-act="account-new">Add account</button>`)}
    ${arch.length ? html`<h2 class="sec">Archived</h2><div class="list card flush">${arch.map(row)}</div>` : ''}`,
  };
}
export function categoriesScreen() {
  const s = app.store;
  const sect = (kind, title) => { const all = s.data.categories.filter((c) => c.kind === kind).sort((a, b) => Number(a.archived) - Number(b.archived) || a.sort - b.sort);
    return html`<div class="day-head"><h2>${title}</h2><button class="link" data-act="category-new" data-kind="${kind}">Add</button></div>
      <div class="list card flush">${all.map((c) => html`<div class="row ${c.archived ? 'dim' : ''}"><button class="row-main" data-act="category-open" data-id="${c.id}">${badge(c.icon)}<span class="row-text"><b>${c.name}</b>${c.archived ? html`<small>archived</small>` : c.kind === 'expense' && C.isEssential(c) ? html`<small>Priority expense</small>` : ''}</span>${icon('next', 16)}</button></div>`)}</div>`; };
  return { html: html`${back('Categories')}${sect('expense', 'Spending')}${sect('income', 'Income')}` };
}
export function budgetsScreen() {
  const s = app.store, set = s.settings;
  const p = periodFor(today(), set.monthStart);
  const rows = s.data.budgets.map((b) => ({ b, st: C.budgetStatus(b, s.data.txns, p.start, p.endExclusive) })).sort((a, b) => b.st.pct - a.st.pct);
  return {
    html: html`${back('Budgets', html`<button class="icon-btn" data-act="budget-new" aria-label="Add budget">${icon('plus')}</button>`)}
    <p class="muted pad">${periodLabel(p, set.monthStart, set.locale)}. Budgets reset every period and never block spending.</p>
    ${rows.length ? html`<div class="stack">${rows.map(({ b, st }) => html`<button class="card budget" data-act="budget-open" data-id="${b.categoryId || '-'}">
      <div class="bar-label"><b>${b.categoryId ? s.category(b.categoryId)?.name : 'All spending'}</b><span>${st.pct}%</span></div>${progress(st.pct, st.state, 'Budget used')}
      <div class="bar-label"><small>${money(st.spent)} spent</small><small class="${st.state === 'over' ? 'warn-t' : ''}">${st.state === 'over' ? 'Over by ' + money(-st.remaining) : money(st.remaining) + ' left'}</small></div></button>`)}</div>`
      : emptyState('No budgets yet', 'Set a limit for a category, or for all spending, and see how you’re doing.', html`<button class="btn primary" data-act="budget-new">Add a budget</button>`)}`,
  };
}

// ---------- security ----------
export function security() {
  const on = app.persist.lockEnabled();
  const min = app.persist.autoLockMin();
  return {
    html: html`${back('Security')}
    <section class="card"><div class="card-head"><h2>Passcode lock</h2>${chip(on ? 'On' : 'Off', on ? 'good' : '')}</div>
      <p class="muted">${on ? 'Your data is encrypted on this device with AES-256 and the app asks for your passcode when you open it or come back after a while.' : 'Encrypts everything stored on this device with a passcode you choose, and asks for it when you open the app.'}</p>
      ${on ? html`<form data-change="autolock">${field('Lock after being away for', html`<select id="s-al" name="min">${options([['1', '1 minute'], ['5', '5 minutes'], ['15', '15 minutes'], ['30', '30 minutes'], ['0', 'Every time I leave the app']], String(min))}</select>`, '', 's-al')}</form>
        <div class="stack"><button class="btn" data-act="lock-now">${icon('lock', 18)} Lock now</button><button class="btn" data-act="pass-change">Change passcode</button><button class="btn danger-ghost" data-act="pass-off">Turn off passcode lock</button></div>`
        : html`<button class="btn primary" data-act="pass-on">Turn on passcode lock</button>`}
    </section>
    <section class="card"><h2>Good to know</h2><ul class="plain facts">
      <li>There is no account, so there is no “forgot password”. If you forget the passcode, the only way back is a backup file.</li>
      <li>A longer passcode is much safer than a short one. Use 8 or more characters.</li>
      <li>Your device’s own lock screen is your first protection. This adds a second one inside the app.</li></ul></section>`,
  };
}
changes['autolock'] = async (el) => { await app.persist.setAutoLockMin(Number(el.value)); toast('Saved'); };
actions['lock-now'] = () => app.lockNow();
actions['pass-on'] = () => openSheet('Set a passcode', html`<form data-form="passon" novalidate>
  <p class="muted">Use at least 8 characters. Everything stored on this device will be encrypted with it. <b>If you forget it, your data cannot be recovered</b> except from a backup file.</p>
  ${field('Passcode', html`<input id="f-pass" name="pass" type="password" autocomplete="new-password">`, '', 'f-pass')}
  ${field('Repeat passcode', html`<input id="f-pass2" name="pass2" type="password" autocomplete="new-password">`, '', 'f-pass2')}
  <div class="btn-row"><span class="grow"></span><button type="button" class="btn ghost" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit">Turn on</button></div></form>`);
forms.passon = async (fd, form) => {
  const a = String(fd.get('pass') || ''), b = String(fd.get('pass2') || '');
  if (a.length < 8) { showError(form, 'pass', 'Use at least 8 characters.'); return false; }
  if (a !== b) { showError(form, 'pass2', 'The two entries don’t match.'); return false; }
  const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Encrypting…';
  await app.persist.enableLock(a, app.store.data);
  toast('Passcode lock is on');
  app.render();
  return true;
};
actions['pass-change'] = () => openSheet('Change passcode', html`<form data-form="passchange" novalidate>
  ${field('Current passcode', html`<input id="f-cur" name="cur" type="password" autocomplete="current-password">`, '', 'f-cur')}
  ${field('New passcode', html`<input id="f-pass" name="pass" type="password" autocomplete="new-password">`, 'At least 8 characters.', 'f-pass')}
  ${field('Repeat new passcode', html`<input id="f-pass2" name="pass2" type="password" autocomplete="new-password">`, '', 'f-pass2')}
  <div class="btn-row"><span class="grow"></span><button type="button" class="btn ghost" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit">Change</button></div></form>`);
forms.passchange = async (fd, form) => {
  if (!(await app.persist.verifyPasscode(String(fd.get('cur') || '')))) { showError(form, 'cur', 'That isn’t your current passcode.'); return false; }
  const a = String(fd.get('pass') || ''), b = String(fd.get('pass2') || '');
  if (a.length < 8) { showError(form, 'pass', 'Use at least 8 characters.'); return false; }
  if (a !== b) { showError(form, 'pass2', 'The two entries don’t match.'); return false; }
  await app.persist.changePasscode(a, app.store.data);
  toast('Passcode changed');
  return true;
};
actions['pass-off'] = () => openSheet('Turn off passcode lock', html`<form data-form="passoff" novalidate>
  <p class="muted">Your data will be stored without encryption on this device.</p>
  ${field('Current passcode', html`<input id="f-cur" name="cur" type="password" autocomplete="current-password">`, '', 'f-cur')}
  <div class="btn-row"><span class="grow"></span><button type="button" class="btn ghost" data-act="sheet-close">Cancel</button><button class="btn danger" type="submit">Turn off</button></div></form>`);
forms.passoff = async (fd, form) => {
  if (!(await app.persist.verifyPasscode(String(fd.get('cur') || '')))) { showError(form, 'cur', 'That isn’t your current passcode.'); return false; }
  await app.persist.disableLock(app.store.data);
  toast('Passcode lock is off');
  app.render();
  return true;
};

// ---------- data ----------
export function dataScreen() {
  const set = app.store.settings;
  const last = set.lastExportAt;
  return {
    html: html`${back('Backup and transfer')}
    <section class="card"><h2>Move to another phone</h2>
      <ol class="steps"><li>Here: <b>Save backup file</b> below, then send the file to yourself (AirDrop, email, cloud drive, messages).</li>
        <li>On the other device, open Sallo and choose <b>Import a backup</b>.</li><li>Pick the file. Everything appears: accounts, transactions, recurring items, goals and budgets.</li></ol>
      <p class="muted">This works between iPhone, Android and computers, in any direction.</p></section>
    <section class="card"><div class="card-head"><h2>Export</h2></div>
      <p class="muted">${last ? 'Last backup: ' + dateText(last.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) + (dayDiff(today(), last.slice(0, 10)) > 30 ? ' (over a month ago)' : '') + '.' : 'You haven’t made a backup yet.'}</p>
      <div class="stack">
        <button class="btn primary" data-act="export-json" data-share="${canShareFiles() ? 1 : 0}">${icon('download', 18)} Save backup file</button>
        <button class="btn" data-act="export-enc">${icon('lock', 18)} Save encrypted backup</button>
        <button class="btn" data-act="export-csv">${icon('list', 18)} Transactions as spreadsheet (CSV)</button></div>
      <p class="hint">The plain backup can be read by anyone who gets the file. Use the encrypted one when you send it through email or cloud storage.</p></section>
    <section class="card"><h2>Import</h2><p class="muted">Choose a backup made by Sallo (.json or .sallo). You’ll see what it contains before anything changes.</p>
      <input type="file" id="import-file" data-change="import-file" accept=".json,.sallo,application/json,text/plain" hidden>
      <button class="btn" data-act="import-pick">${icon('upload', 18)} Import a backup</button></section>
    <section class="card"><h2>Bank statement</h2><p class="muted">Bring in transactions from a CSV file your bank gave you. Sallo reads it on this device and fills in categories for you.</p><a class="btn" href="#/settings/bank">${icon('list', 18)} Import a bank statement (CSV)</a></section>
    <section class="card danger-zone"><h2>Delete everything</h2><p class="muted">Erases all data and settings stored by Sallo on this device.</p><button class="btn danger-ghost" data-act="wipe">${icon('trash', 18)} Delete all data</button></section>`,
  };
}

// ---------- about ----------
export function about() {
  return {
    html: html`${back('About and privacy')}
    <section class="card"><h2>Sallo ${APP_VERSION}</h2><p>A private place for your money. Everything you enter stays on this device.</p>
      <ul class="plain facts"><li>No account, no sign-up, no server.</li><li>No analytics, ads or tracking.</li><li>The app can’t make network requests of its own. Once installed it works offline.</li></ul></section>
    <section class="card"><h2>Add it to your home screen</h2>
      <p><b>iPhone / iPad:</b> open this page in Safari, tap the Share button, then <b>Add to Home Screen</b>.</p>
      <p><b>Android:</b> open it in Chrome, tap the menu (⋮), then <b>Install app</b> or <b>Add to Home screen</b>.</p>
      <p class="muted">Installing also stops the browser from clearing your data when you haven’t opened the app for a while.</p></section>
    <section class="card"><h2>Be aware</h2><ul class="plain facts">
      <li>Your data lives in this browser’s storage on this device. Clearing site data or uninstalling the app erases it. <b>Make backups.</b></li>
      <li>Reminders appear inside the app. A website can’t schedule alerts on its own, so Sallo shows what is due today and overdue when you open it.</li>
      <li>Without the passcode lock, data is stored unencrypted. Turn it on in Security.</li></ul></section>`,
  };
}

// ---------- insights ----------
const MONTHLY = { day: 30.4375, week: 4.345, month: 1, year: 1 / 12 };
export function insights() {
  const s = app.store, d = s.data, set = s.settings, t = today();
  const p = periodFor(t, set.monthStart), prev = shiftPeriod(p, -1);
  const tot = C.periodTotals(d.txns, p.start, p.endExclusive);
  const cmp = C.spendingVsPrevious(d.txns, p, prev);
  const cats = C.expenseByCategory(d.txns, p.start, p.endExclusive);
  const prevCats = new Map(C.expenseByCategory(d.txns, prev.start, prev.endExclusive).map((c) => [c.categoryId, c.total]));
  const day = C.mostExpensiveDay(d.txns, p.start, p.endExclusive);
  const elapsed = Math.max(1, Math.min(dayDiff(t, p.start) + 1, dayDiff(p.endExclusive, p.start)));
  const biggest = d.txns.filter((x) => x.type === 'expense' && x.date >= p.start && x.date < p.endExclusive).sort((a, b) => b.amountMinor - a.amountMinor)[0];
  const trend = Array.from({ length: 6 }, (_, i) => { const q = shiftPeriod(p, i - 5); return { q, ...C.periodTotals(d.txns, q.start, q.endExclusive) }; });
  const maxT = Math.max(1, ...trend.map((x) => Math.max(x.income, x.expense)));
  const fixed = Math.round(d.rules.filter((r) => r.kind === 'expense' && !r.paused && !(r.endDate && r.endDate < t)).reduce((n, r) => n + (r.amountMinor * MONTHLY[r.unit]) / r.every, 0));
  const rate = tot.income > 0 ? Math.round((tot.net * 100) / tot.income) : null;
  return {
    html: html`${back('Insights')}
    <section class="card"><p class="eyebrow">${periodLabel(p, set.monthStart, set.locale)}</p>
      <div class="trio"><div><span class="eyebrow">Spent</span><b class="amt out">${money(tot.expense)}</b></div><div><span class="eyebrow">Per day</span><b class="amt">${money(Math.round(tot.expense / elapsed))}</b></div>
        <div><span class="eyebrow">Saved</span><b class="amt ${rate !== null && rate < 0 ? 'out' : 'in'}">${rate === null ? '–' : rate + '%'}</b></div></div>
      ${cmp.prev > 0 ? html`<p class="muted small-p">${cmp.diff === 0 ? 'The same as' : cmp.diff > 0 ? `${money(cmp.diff)} more than` : `${money(-cmp.diff)} less than`} the previous period (${cmp.pct > 0 ? '+' : ''}${cmp.pct}%).</p>` : ''}
      ${day ? html`<p class="small-p">Most expensive day: <b>${dateText(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</b> (${money(day.total)}).</p>` : ''}
      ${biggest ? html`<p class="small-p">Biggest single expense: <b>${biggest.name || s.category(biggest.categoryId)?.name || 'Expense'}</b> (${money(biggest.amountMinor)}).</p>` : ''}
      ${fixed ? html`<p class="small-p">Your recurring payments add up to about <b>${money(fixed)}</b> a month.</p>` : ''}</section>
    <section class="card"><h2>Last 6 periods</h2><div class="trend" role="img" aria-label="Income and spending for the last six periods">${trend.map((x) => html`<div class="tcol"><div class="tbars"><i class="ti" style="height:${Math.round((x.income / maxT) * 100)}%"></i><i class="to" style="height:${Math.round((x.expense / maxT) * 100)}%"></i></div><small>${new Intl.DateTimeFormat(set.locale || undefined, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(x.q.year, x.q.month - 1, 1)))}</small></div>`)}</div>
      <p class="legend"><i class="d4"></i> Income <i class="d1"></i> Spending</p></section>
    <section class="card"><h2>By category</h2>${cats.length ? html`<ul class="plain gap">${cats.map((c) => { const was = prevCats.get(c.categoryId) || 0; const diff = c.total - was; return html`<li><div class="bar-label"><span>${s.category(c.categoryId)?.name || 'No category'}</span><b>${money(c.total)}</b></div><div class="bar"><i style="width:${Math.max(3, Math.round((c.total / cats[0].total) * 100))}%"></i></div>${was ? html`<small class="muted">${diff === 0 ? 'Same as last period' : (diff > 0 ? '+' : '−') + money(Math.abs(diff), { force: false }).replace('−', '') + ' vs last period'}</small>` : html`<small class="muted">New this period</small>`}</li>`; })}</ul>` : html`<p class="muted">Nothing spent yet in this period.</p>`}</section>`,
  };
}


// ---------- pay and income: drives safe-to-spend and the priorities check ----------
const FREQ = { month: ['month', 1], '2week': ['week', 2], week: ['week', 1] };
export function payScreen() {
  const s = app.store, r = payRule(), t = today();
  const freq = !r ? 'month' : r.unit === 'week' && r.every === 2 ? '2week' : r.unit === 'week' ? 'week' : 'month';
  const next = r ? (nextOnOrAfter(r, r.trackFrom > t ? r.trackFrom : t) || r.startDate) : addDays(t, 7);
  const cur0 = CURRENCIES.find((c) => c.code === s.settings.currency) || { exp: 2, symbol: '' };
  return {
    html: html`${back('Pay and income')}
    <p class="muted pad">Tell Sallo what you earn and when it arrives. “Safe to spend” then counts the bills due before your next payday, and the priorities check compares your spending with your income.</p>
    <form class="card ${salaryIgnored() ? 'ignored' : ''}" data-form="pay" novalidate>
      <h2>${icon('cash', 18)} Regular pay (salary)</h2>
      ${salaryIgnored() ? html`<p class="note-ignored" role="status">${icon('info', 16)} <span><b>Not being counted.</b> You’re paid per work day (below), so Sallo uses that instead and leaves this salary out of safe to spend, the timeline and the plan. Turn off daily pay to count it again.</span></p>` : ''}
      ${field('Your pay each time', html`<div class="money-in"><input id="pay-amt" name="amount" inputmode="decimal" autocomplete="off" placeholder="${cur0.exp ? '0.00' : '0'}" value="${r ? minorToPlain(r.amountMinor, cur0.exp) : ''}"><b>${cur0.symbol}</b></div>`, 'For example your monthly salary after tax. Leave it empty to clear it.', 'pay-amt')}
      ${field('How often', html`<select id="pay-freq" name="freq">${options([['month', 'Monthly'], ['2week', 'Every 2 weeks'], ['week', 'Weekly']], freq)}</select>`, '', 'pay-freq')}
      ${field('Next payday', html`<input type="date" id="pay-date" name="date" value="${next}">`, 'It repeats from this date. It also appears in Upcoming as repeating income.', 'pay-date')}
      <div class="btn-row"><span class="grow"></span><button class="btn primary" type="submit">Save</button></div>
    </form>
    ${workPayCard()}
    <a class="link center" href="#/timeline">See your money timeline</a>`,
  };
}
forms.pay = (fd, form) => {
  const s = app.store, cur0 = CURRENCIES.find((c) => c.code === s.settings.currency) || { exp: 2 };
  const raw = String(fd.get('amount') || '').trim();
  const r = payRule();
  if (!raw || /^0+([.,]0+)?$/.test(raw)) {
    if (r) s.deleteRule(r.id);
    s.setSettings({ pay: null });
    toast('Pay removed');
    return true;
  }
  const amountMinor = parseMinor(raw, cur0.exp);
  if (amountMinor === null || amountMinor <= 0) { showError(form, 'amount', 'Enter an amount like 2000.00.'); return false; }
  const date = fd.get('date');
  if (!isIso(date)) { showError(form, 'date', 'Choose a date.'); return false; }
  const [unit, every] = FREQ[fd.get('freq')] || FREQ.month;
  if (r) s.updateRule(r.id, { amountMinor, unit, every, startDate: date, paused: false });
  else {
    const accountId = s.activeAccounts()[0]?.id || null;
    const rule = s.addRule({ kind: 'income', name: 'Pay', amountMinor, categoryId: detectCategory('Salary', 'income', s.data.categories), accountId, startDate: date, unit, every });
    s.setSettings({ pay: { ruleId: rule.id } });
  }
  toast('Saved');
  return true;
};
