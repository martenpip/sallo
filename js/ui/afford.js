// "Can I afford this?": try a purchase against your real balance, bills and income before you make it.
import { app } from './ctx.js';
import { html, icon, money, dateText, pageHeader, actions, forms, field, toast, showError } from './kit.js';
import { amountField, textField, dateField, readAmount } from './editors.js';
import * as C from '../calc.js';
import { today, isIso } from '../dates.js';
import { skipRuleId } from './guard.js';

const dt = (iso) => dateText(iso, { weekday: 'short', day: 'numeric', month: 'short' });

export function afford() {
  const s = app.store, d = s.data, t = today();
  const a = app.ui.afford || null;
  const r = a?.result || null;
  const alloc = C.totalAllocated(d.goals, d.contribs);
  const hasMoney = d.accounts.length > 0;
  const verdict = !r ? '' : r.verdict === 'yes'
    ? html`<section class="card tl-verdict good" role="status"><h2>${icon('check', 18)} Yes, you can afford it</h2>
        <p>${a.date > t ? `On ${dt(a.date)}, your` : 'Your'} balance stays above zero for the next 45 days, and your goal savings (${money(alloc)}) are untouched. The lowest you’d be is <b>${money(r.lowestAfter)}</b>.</p></section>`
    : r.verdict === 'tight'
      ? html`<section class="card tl-verdict warn" role="status"><h2>${icon('info', 18)} Possible, but it would be tight</h2>
        <p>You could pay for it, but the lowest you’d be is only <b>${money(r.lowestAfter)}</b>, less than a week of your essential bills (about ${money(r.cushion)}).${r.earliest ? html` Waiting until <b>${dt(r.earliest)}</b> would leave more room.` : ''}</p></section>`
      : html`<section class="card tl-verdict bad" role="status"><h2>${icon('info', 18)} Not right now</h2>
        <p>${r.firstShort ? html`${r.firstShort === a.date ? 'You’d be short straight away' : html`From <b>${dt(r.firstShort)}</b> you’d be short`}, by as much as <b>${money(r.shortBy)}</b> once your planned bills are paid.` : html`You’d be about <b>${money(r.shortBy)}</b> short.`}${alloc ? ` That counts your goal savings (${money(alloc)}) as off limits.` : ''}${r.earliest ? html` The first day it would work is <b>${dt(r.earliest)}</b>.` : ' Nothing in the next three months gets you there, so it may need more saving first.'}</p></section>`;
  return {
    html: html`${pageHeader('Can I afford this?', { back: true })}
    <p class="muted pad">Type what you’re thinking of buying. Sallo checks it against your balance, your planned bills and your income over the next 45 days. It doesn’t save anything unless you choose to.</p>
    ${hasMoney ? html`<form class="card" data-form="afford" novalidate>
      ${textField('name', 'What is it?', a?.name || '', { ph: 'New phone, bed, holiday…', max: 60 })}
      ${amountField('price', a?.priceMinor || null, 'Price')}
      ${dateField('date', 'When would you buy it?', a?.date || t)}
      <div class="btn-row"><span class="grow"></span><button class="btn primary" type="submit">Check</button></div></form>` : html`<p class="note">${icon('info', 16)}<span>Add an account first, so Sallo knows your balance.</span></p>`}
    ${verdict}
    ${r ? html`<section class="card"><h2>The numbers</h2><ul class="plain facts">
      <li>Lowest balance in that time without it: <b>${money(r.lowestNow)}</b> (${dt(r.lowestNowDate)})</li>
      <li>Lowest with it: <b>${money(r.lowestAfter)}</b></li>
      ${alloc ? html`<li>Set aside for goals, kept out of reach: <b>${money(alloc)}</b></li>` : ''}</ul>
      <p class="hint">An estimate from what you’ve planned. Unplanned spending and late payments aren’t included${s.settings.workPay ? '. Your work-day pay is counted' : ''}.</p>
      <div class="stack">
        <button class="btn" data-act="afford-goal">${icon('piggy', 18)} Save up for it as a goal</button>
        ${r.verdict === 'yes' ? html`<button class="btn" data-act="afford-plan">${icon('calendar', 18)} Add it to Upcoming</button>` : ''}</div></section>` : ''}`,
  };
}
forms.afford = (fd, form) => {
  const s = app.store, d = s.data, t = today();
  const priceMinor = readAmount(form, 'price');
  if (priceMinor === undefined) return false;
  const date = String(fd.get('date') || '');
  if (!isIso(date) || date < t) { showError(form, 'date', date < t ? 'Choose today or a later day.' : 'Choose a date.'); return false; }
  const alloc = C.totalAllocated(d.goals, d.contribs);
  const cushion = Math.round(C.fixedEssentialsMonthly(d.rules, d.categories) / 4); // about a week of essential bills
  const result = C.affordCheck({ ...d, workPay: s.settings.workPay, skipRuleId: skipRuleId() }, { price: priceMinor, date, today: t, allocated: alloc, cushion });
  app.ui.afford = { name: String(fd.get('name') || '').trim(), priceMinor, date, result };
  return true;
};
actions['afford-goal'] = () => {
  const s = app.store, a = app.ui.afford; if (!a) return;
  const deadline = a.result.earliest || (a.date > today() ? a.date : null);
  s.add('goals', { name: a.name || 'Something new', targetMinor: a.priceMinor, deadline, autoPct: 0, icon: 'piggy', archived: false, note: '' });
  s.commit();
  toast('Goal created. Put money aside for it in Savings.');
  location.hash = '#/savings';
};
actions['afford-plan'] = () => {
  const s = app.store, a = app.ui.afford; if (!a) return;
  s.addPlanned({ kind: 'expense', name: a.name || 'Purchase', amountMinor: a.priceMinor, date: a.date, categoryId: null, accountId: null });
  toast('Added to Upcoming');
  app.ui.afford = null;
  location.hash = '#/upcoming';
};
