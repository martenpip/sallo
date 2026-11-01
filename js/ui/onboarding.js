import { app } from './ctx.js';
import { html, icon, actions, forms, field, options, showError, toast } from './kit.js';
import { CURRENCIES, currencyInfo, parseMinor, minorToPlain } from '../money.js';
import { today, addDays, parse, toIso, daysInMonth } from '../dates.js';
import { detectCategory } from '../categorize.js';
import { buildDemo } from './demo.js';
import { planPicker, readPlan, syncDraft } from './plan.js';
import { monthlyPay } from './guard.js';
import { getLang, languages } from '../i18n.js';

const REGION_CURRENCY = { US: 'USD', GB: 'GBP', SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', PL: 'PLN', CZ: 'CZK', JP: 'JPY', CA: 'CAD', AU: 'AUD' };
function guessCurrency() {
  try { const r = (navigator.language || '').split('-')[1]; return REGION_CURRENCY[r?.toUpperCase()] || 'EUR'; } catch { return 'EUR'; }
}
const ob = { step: 0, currency: null, name: 'Everyday account', type: 'bank', balance: '', accountId: null, pay: { amount: '', freq: 'month', date: '' }, bills: {}, billsDone: false, plan: { income: '', type: '50-30-20', needs: '50', wants: '30', save: '20' } };
const BILLS = [['rent', 'Rent or mortgage'], ['electricity', 'Electricity'], ['water', 'Water and heating'], ['internet', 'Internet'], ['phone', 'Phone'], ['insurance', 'Insurance'], ['subs', 'Subscriptions']];
const BILL_NAME = { rent: 'Rent', electricity: 'Electricity', water: 'Water and heating', internet: 'Internet', phone: 'Phone', insurance: 'Insurance', subs: 'Subscriptions' };
const ordinal = (n) => getLang() === 'et' ? n + '.' : n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
// next date on/after today that falls on `day` of a month (day is 1..28 so it always exists)
function nextOnDay(day) { const t = today(); const { y, m } = parse(t); const a = toIso(y, m, day); if (a >= t) return a; return m === 12 ? toIso(y + 1, 1, day) : toIso(y, m + 1, day); }

export function onboarding() {
  ob.currency ||= guessCurrency();
  if (ob.step === 0) {
    return { html: html`<div class="ob">
      <div class="ob-mark">${icon('piggy', 40)}</div>
      <h1>Your money.<br>Only on your device.</h1>
      <ul class="plain facts big"><li>No account, no sign-up, nothing sent anywhere.</li><li>Track spending, bills, savings goals and budgets.</li><li>Move between phones with a backup file whenever you like.</li></ul>
      <div class="stack"><button class="btn primary block" data-act="ob-next">Get started</button>
        <input type="file" id="import-file" data-change="import-file" accept=".json,.sallo,application/json,text/plain" hidden>
        <button class="btn block" data-act="ob-demo">${icon('eye', 18)} Try it with example data</button>
        <button class="btn block" data-act="import-pick">${icon('upload', 18)} I have a backup to import</button></div>
      <div class="ob-lang" role="group" aria-label="Language">${languages().map(([c, n]) => html`<button type="button" class="pill ${getLang() === c ? 'on' : ''}" data-act="ob-lang" data-lang="${c}" aria-pressed="${getLang() === c}">${n}</button>`)}</div></div>` };
  }
  if (ob.step === 1) {
    const c = currencyInfo(ob.currency);
    return { html: html`<div class="ob">
      <h1>Set up your first account</h1><p class="muted">You can change everything later, and add more accounts in Settings.</p>
      <form data-form="ob-setup" novalidate>
        ${field('Currency', html`<select id="ob-cur" name="currency" data-change="ob-cur">${options(CURRENCIES.map((x) => [x.code, `${x.code} · ${x.name}`]), ob.currency)}</select>`, '', 'ob-cur')}
        ${field('Account name', html`<input id="ob-name" name="name" value="${ob.name}" maxlength="60" autocomplete="off">`, '', 'ob-name')}
        ${field('What’s in it right now?', html`<div class="money-in"><input id="ob-bal" name="balance" inputmode="decimal" autocomplete="off" placeholder="${c.exp ? '0.00' : '0'}" value="${ob.balance}"><b>${c.symbol}</b></div>`, 'Leave it empty for zero.', 'ob-bal')}
        <div class="btn-row"><button type="button" class="btn ghost" data-act="ob-back">Back</button><span class="grow"></span><button class="btn primary" type="submit">Continue</button></div>
        <button type="button" class="link center" data-act="ob-skip">Skip, I’ll add accounts later</button>
      </form></div>` };
  }
  if (ob.step === 2) {
    const c = currencyInfo(ob.currency);
    const money1 = (name, val = '') => html`<div class="money-in"><input name="${name}" inputmode="decimal" autocomplete="off" aria-label="${name}" placeholder="${c.exp ? '0.00' : '0'}" value="${val}"><b>${c.symbol}</b></div>`;
    return { html: html`<div class="ob">
      <h1>Pay and regular bills</h1><p class="muted">Tell Sallo what comes in and goes out regularly and it will set up the reminders and repeat them for you. Skip anything that doesn’t apply. You can change it all later.</p>
      <form data-form="ob-bills" novalidate>
        <fieldset class="repeat"><legend>Your pay</legend>
          ${field('How much do you get each time (or per work day)?', money1('payAmount', ob.pay.amount), '', '')}
          <div class="row2">${field('How often', html`<select name="payFreq">${options([['month', 'Monthly'], ['2week', 'Every 2 weeks'], ['week', 'Weekly'], ['day', 'Per work day (Mon–Fri)']], ob.pay.freq)}</select>`, '', '')}
          ${field('Next payday', html`<input type="date" name="payDate" value="${ob.pay.date || addDays(today(), 7)}">`, '', '')}</div></fieldset>
        <fieldset class="repeat"><legend>Monthly bills</legend>
          ${BILLS.map(([key, label]) => html`<div class="field bill-row"><span class="bill-name">${label}</span>${money1('amt_' + key, ob.bills[key]?.amount || '')}
            <select name="day_${key}" aria-label="${label} due day">${options(Array.from({ length: 28 }, (_, i) => [String(i + 1), 'on the ' + ordinal(i + 1)]), String(ob.bills[key]?.day || 1))}</select><p class="err" role="alert"></p></div>`)}</fieldset>
        <div class="btn-row"><button type="button" class="btn ghost" data-act="ob-back">Back</button><span class="grow"></span><button class="btn primary" type="submit">Continue</button></div>
        <button type="button" class="link center" data-act="ob-next">Skip for now</button>
      </form></div>` };
  }
  if (ob.step === 3) {
    if (!ob.plan.income) { const mp = monthlyPay(); if (mp) ob.plan.income = minorToPlain(mp, currencyInfo(app.store.settings.currency || ob.currency).exp); }
    return { html: html`<div class="ob">
      <h1>How do you want to live?</h1><p class="muted">Pick a simple plan for your monthly money, like the popular 50/30/20 rule: needs, wants and savings. Or do your own thing. You can change it any time in Settings.</p>
      <form data-form="ob-plan" novalidate>${planPicker(ob.plan, 'ob-plan-pick')}
        <div class="btn-row"><button type="button" class="btn ghost" data-act="ob-back">Back</button><span class="grow"></span><button class="btn primary" type="submit">Continue</button></div>
        <button type="button" class="link center" data-act="ob-next">Skip for now</button></form></div>` };
  }
  return { html: html`<div class="ob">
    <div class="ob-mark ok">${icon('check', 40)}</div><h1>You’re set</h1>
    <ul class="plain facts big"><li><b>Activity</b> is where you add what you spend and earn.</li><li><b>Money plan</b> shows how this month is going against your plan.</li><li><b>Safe to spend</b> on Overview shows what’s free after bills and savings.</li><li><b>Upcoming</b> keeps bills, salary and events, and repeats them for you.</li><li>Add Sallo to your home screen to use it like an app. Settings has the steps.</li><li>Make a backup now and then. It’s the only copy of your data.</li></ul>
    <button class="btn primary block" data-act="ob-finish">Open Sallo</button></div>` };
}

actions['ob-lang'] = (el) => { const l = el.dataset.lang; app.store.setSettings({ lang: l, locale: l === 'et' ? 'et-EE' : '' }); };
actions['ob-next'] = () => { ob.step += 1; };
actions['ob-back'] = () => { ob.step = Math.max(0, ob.step - 1); };
actions['ob-skip'] = () => { ob.step = 4; };
actions['ob-finish'] = () => {
  app.store.setSettings({ onboarded: true });
  location.hash = '#/overview';
  app.persist.requestPersistence();
};
import { changes } from './kit.js';
changes['ob-cur'] = (el) => { ob.currency = el.value; const f = el.closest('form'); ob.name = f.elements.name.value; ob.balance = f.elements.balance.value; app.render(); };
forms['ob-setup'] = (fd, form) => {
  const currency = fd.get('currency');
  const exp = currencyInfo(currency).exp;
  const name = String(fd.get('name') || '').trim();
  if (!name) { showError(form, 'name', 'Give the account a name.'); return false; }
  const raw = String(fd.get('balance') || '').trim();
  const bal = raw ? parseMinor(raw, exp) : 0;
  if (bal === null) { showError(form, 'balance', 'Enter an amount like 1250.00.'); return false; }
  ob.currency = currency; ob.name = name; ob.balance = raw;
  app.store.setSettings({ currency });
  if (ob.accountId && app.store.account(ob.accountId)) app.store.update('accounts', ob.accountId, { name, openingMinor: bal });
  else ob.accountId = app.store.add('accounts', { name, type: 'bank', openingMinor: bal, archived: false }).id;
  app.store.commit();
  ob.step = 2;
  app.render();
  return false;
};
actions['ob-demo'] = () => {
  app.store.setSettings({ currency: ob.currency || guessCurrency() });
  buildDemo(app.store);
  app.store.setSettings({ onboarded: true, demo: true });
  location.hash = '#/overview';
};
forms['ob-bills'] = (fd, form) => {
  const s = app.store, cur = currencyInfo(s.settings.currency || ob.currency);
  const cats = s.data.categories;
  const parseAmt = (name) => { const raw = String(fd.get(name) || '').trim(); if (!raw) return 0; const v = parseMinor(raw, cur.exp); return v === null ? null : v; };
  const pay = parseAmt('payAmount');
  if (pay === null || pay < 0) { showError(form, 'payAmount', 'Enter an amount like 2000.00.'); return false; }
  const bills = [];
  for (const [key] of BILLS) {
    const a = parseAmt('amt_' + key);
    if (a === null || a < 0) { showError(form, 'amt_' + key, 'Enter an amount like 45.00.'); return false; }
    if (a > 0) bills.push({ key, amountMinor: a, day: Number(fd.get('day_' + key)) || 1 });
  }
  const accountId = ob.accountId && s.account(ob.accountId) ? ob.accountId : (s.activeAccounts()[0]?.id || null);
  if (!ob.billsDone) {
    if (pay > 0 && fd.get('payFreq') === 'day') {
      s.setSettings({ workPay: { dailyMinor: pay, weekdays: [1, 2, 3, 4, 5], off: [] } });
    } else if (pay > 0) {
      const freq = fd.get('payFreq'), date = String(fd.get('payDate') || addDays(today(), 7));
      const payRule_ = s.addRule({ kind: 'income', name: 'Pay', amountMinor: pay, categoryId: detectCategory('Salary', 'income', cats), accountId, startDate: date, unit: freq === 'month' ? 'month' : 'week', every: freq === '2week' ? 2 : 1 });
      s.setSettings({ pay: { ruleId: payRule_.id } });
    }
    for (const b of bills) s.addRule({ kind: 'expense', name: BILL_NAME[b.key], amountMinor: b.amountMinor, categoryId: detectCategory(BILL_NAME[b.key], 'expense', cats) || null, accountId, startDate: nextOnDay(b.day), unit: 'month', every: 1 });
    ob.billsDone = true;
  }
  ob.step = 3;
  app.render();
  return false;
};
changes['ob-plan-pick'] = (el) => syncDraft(ob.plan, el);
forms['ob-plan'] = (fd, form) => {
  const plan = readPlan(fd, form);
  if (!plan) return false;
  app.store.setSettings({ plan });
  ob.step = 4;
  app.render();
  return false;
};
/** After the last account is deleted: set up from the account step again, keeping the chosen currency. */
export function restartOnboarding() {
  Object.assign(ob, { step: 1, name: 'Everyday account', balance: '', accountId: null, pay: { amount: '', freq: 'month', date: '' }, bills: {}, billsDone: false, plan: { income: '', type: '50-30-20', needs: '50', wants: '30', save: '20' } });
  ob.currency = app.store.settings.currency || ob.currency;
}
