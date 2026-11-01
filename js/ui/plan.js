// The money plan: split a monthly income into needs, wants and savings (50/30/20 and friends), then show how this month is going.
import { app } from './ctx.js';
import { html, icon, money, progress, field, actions, forms, changes, showError, toast, pageHeader } from './kit.js';
import * as C from '../calc.js';
import { parseMinor, minorToPlain, currencyInfo } from '../money.js';
import { periodFor, today } from '../dates.js';
import { guardFor, monthlyPay } from './guard.js';

const cur = () => currencyInfo(app.store.settings.currency);
const planLabel = (p) => (p.type === 'custom' ? `${p.needs}/${p.wants}/${p.save}` : p.type.replace(/-/g, '/'));

export function draftFromSettings() {
  const p = app.store.settings.plan;
  const inc = p?.incomeMinor || monthlyPay();
  return { income: inc ? minorToPlain(inc, cur().exp) : '', type: p?.type || '50-30-20', needs: String(p?.needs ?? 50), wants: String(p?.wants ?? 30), save: String(p?.save ?? 20) };
}
const parseIncome = (draft) => { const raw = String(draft.income || '').trim(); const v = raw ? parseMinor(raw, cur().exp) : 0; return v && v > 0 ? v : 0; };
function splitFor(draft, income) {
  if (!income) return null;
  if (draft.type === 'own') return null;
  if (draft.type === 'custom') { const n = [draft.needs, draft.wants, draft.save].map(Number); return n.every((x) => Number.isInteger(x) && x >= 0) && n[0] + n[1] + n[2] === 100 ? C.planSplit(income, { needs: n[0], wants: n[1], save: n[2] }) : null; }
  const pl = C.planById(draft.type); return pl ? C.planSplit(income, pl) : null;
}

/** The picker used in setup and in settings. `change` names the data-change handler that stores the draft and redraws. */
export function planPicker(draft, change) {
  const s = app.store, income = parseIncome(draft), symbol = cur().symbol;
  const fixed = C.fixedEssentialsMonthly(s.data.rules, s.data.categories);
  const fixedPct = income && fixed ? Math.round((fixed * 100) / income) : 0;
  const fit = fixedPct ? C.fittingPlan(fixedPct) : null;
  const opt = (id, head, ratio, blurb, extra = '') => {
    const split = id === 'custom' || id === 'own' ? splitFor({ ...draft, type: id }, income) : splitFor({ ...draft, type: id }, income);
    return html`<label class="plan-opt ${draft.type === id ? 'on' : ''}"><input type="radio" name="planType" value="${id}" ${draft.type === id ? 'checked' : ''} data-change="${change}">
      <span class="plan-body"><span class="plan-head"><b>${head}</b>${ratio ? html`<span class="plan-ratio">${ratio}</span>` : ''}${fit && fit.id === id ? html`<span class="plan-fit">Fits your bills</span>` : ''}</span>
        <small>${blurb}</small>
        ${split ? html`<span class="plan-split"><i><span class="lbl">Needs</span> ${money(split.needs)}</i><i><span class="lbl">Wants</span> ${money(split.wants)}</i><i><span class="lbl">Savings</span> ${money(split.save)}</i></span>` : ''}${extra}</span></label>`;
  };
  return html`
    ${field('Your monthly income (after tax)', html`<div class="money-in"><input id="pl-income" name="income" inputmode="decimal" autocomplete="off" placeholder="${cur().exp ? '0.00' : '0'}" value="${draft.income}" data-change="${change}"><b>${symbol}</b></div>`, 'For example 1400. Sallo splits it for you below.', 'pl-income')}
    ${fixedPct ? html`<p class="note">${icon('info', 16)}<span>Your regular essential bills come to about <b>${fixedPct}%</b> of your income. ${fixedPct > 50 ? html`<b>${fit.name} (${fit.id.replace(/-/g, '/')})</b> is the plan that fits that best.` : 'That fits comfortably in any of these plans.'}</span></p>` : ''}
    <fieldset class="plans"><legend>How do you want to live?</legend>
      ${C.PLANS.map((pl) => opt(pl.id, pl.name, `${pl.needs} / ${pl.wants} / ${pl.save}`, pl.blurb))}
      ${opt('custom', 'My own split', '', 'Choose your own percentages for needs, wants and savings.', draft.type === 'custom' ? html`<span class="field plan-custom"><span class="row3">
        <label>Needs % <input name="c_needs" inputmode="numeric" value="${draft.needs}"></label>
        <label>Wants % <input name="c_wants" inputmode="numeric" value="${draft.wants}"></label>
        <label>Savings % <input name="c_save" inputmode="numeric" value="${draft.save}"></label></span><small class="err" role="alert"></small></span>` : '')}
      ${opt('own', 'I’ll do my own thing', '', 'No plan. Sallo still tracks everything, and just won’t compare you to percentages.')}
    </fieldset>
    <small class="hint">Needs are things like rent, utilities, groceries and health. Wants are everything else you choose to spend on.</small>`;
}

/** Pulls the picker's values into the draft and redraws. */
export function syncDraft(draft, el) {
  const f = el.closest('form');
  draft.income = f.elements.income.value;
  draft.type = f.querySelector('input[name=planType]:checked')?.value || draft.type;
  for (const k of ['needs', 'wants', 'save']) { const i = f.elements['c_' + k]; if (i) draft[k] = i.value; }
  app.render();
}

export function readPlan(fd, form) {
  const exp = cur().exp;
  const type = fd.get('planType') || 'own';
  const rawIncome = String(fd.get('income') || '').trim();
  let incomeMinor = 0;
  if (rawIncome) { incomeMinor = parseMinor(rawIncome, exp); if (incomeMinor === null || incomeMinor < 0) { showError(form, 'income', 'Enter an amount like 1400.00.'); return false; } }
  if (type === 'own') return { type, incomeMinor };
  if (incomeMinor <= 0) { showError(form, 'income', 'Enter your monthly income so Sallo can split it.'); return false; }
  if (type === 'custom') {
    const v = ['needs', 'wants', 'save'].map((k) => Number(fd.get('c_' + k)));
    if (v.some((x) => !Number.isInteger(x) || x < 0 || x > 100) || v[0] + v[1] + v[2] !== 100) { showError(form, 'c_save', 'Needs, wants and savings must add up to 100.'); return false; }
    return { type, needs: v[0], wants: v[1], save: v[2], incomeMinor };
  }
  const pl = C.planById(type);
  return pl ? { type, needs: pl.needs, wants: pl.wants, save: pl.save, incomeMinor } : false;
}

// ---------- how this month is going ----------
function status(p) {
  const s = app.store, plan = s.settings.plan, d = s.data;
  const t = C.planSplit(plan.incomeMinor, plan);
  const g = guardFor(p);
  const saved = d.contribs.filter((c) => c.date >= p.start && c.date < p.endExclusive).reduce((n, c) => n + c.amountMinor, 0);
  const row = (key, label, used, target, kind) => {
    const pct = target > 0 ? Math.max(0, Math.round((used * 100) / target)) : 0;
    return { key, label, used, target, pct, tone: kind === 'save' ? 'sage' : pct > 100 ? 'over' : pct >= 85 ? 'near' : '' };
  };
  return { plan, t, rows: [row('needs', 'Needs', g.essentialSpent, t.needs, 'spend'), row('wants', 'Wants', g.wantsSpent, t.wants, 'spend'), row('save', 'Savings', saved, t.save, 'save')] };
}
const bars = (rows) => html`<ul class="plain plan-bars">${rows.map((r) => html`<li><div class="bar-label"><span>${r.label}</span><span>${money(r.used)} of ${money(r.target)}</span></div>${progress(Math.min(100, r.pct), r.tone, r.label + ' used')}
  ${r.tone === 'over' ? html`<small class="warn-t">Over by ${money(r.used - r.target)}</small>` : r.key === 'save' && r.pct >= 100 ? html`<small>Target reached</small>` : ''}</li>`)}</ul>`;

export function planCard(p) {
  const s = app.store, plan = s.settings.plan;
  if (!plan) return s.settings.demo ? '' : html`<section class="card" aria-label="Money plan"><div class="card-head"><h2>${icon('target', 18)} Plan your month</h2></div>
    <p class="muted">Tell Sallo what you earn and how you want to live, like the 50/30/20 rule, and it shows what’s left to spend and save.</p><a class="btn primary" href="#/settings/plan">Set up my plan</a></section>`;
  if (plan.type === 'own' || !plan.incomeMinor) return '';
  const st = status(p);
  const mp = monthlyPay(), stale = s.settings.workPay && mp && Math.abs(mp - plan.incomeMinor) > plan.incomeMinor * 0.05;
  return html`<section class="card" aria-label="Your money plan"><div class="card-head"><h2>${icon('target', 18)} Your plan · ${planLabel(plan)}</h2><a class="link" href="#/settings/plan">Details</a></div>${bars(st.rows)}${stale ? html`<p class="note">${icon('info', 16)}<span>This plan is based on ${money(plan.incomeMinor)} a month, but your work days add up to about ${money(mp)}. <a class="link" href="#/settings/plan">Update it</a></span></p>` : ''}</section>`;
}

export function planScreen() {
  const s = app.store, plan = s.settings.plan, t = today();
  app.ui.planDraft ||= draftFromSettings();
  const draft = app.ui.planDraft;
  const p = periodFor(t, s.settings.monthStart);
  let summary = '';
  if (plan && plan.type !== 'own' && plan.incomeMinor) {
    const st = status(p), x = st.t;
    const weekly = Math.round((x.wants * 12) / 52);
    const cushion = x.needs * 3;
    const months = x.save > 0 ? Math.ceil(cushion / x.save) : null;
    const goalNeed = s.data.goals.filter((g) => !g.archived).reduce((n, g) => n + (C.goalProgress(g, s.data.contribs, t).perMonth || 0), 0);
    summary = html`<section class="card" aria-label="This month"><h2>On ${money(plan.incomeMinor)} a month · ${planLabel(plan)}</h2>
      <div class="trio small"><div><span class="eyebrow">Needs</span><b>${money(x.needs)}</b></div><div><span class="eyebrow">Wants</span><b>${money(x.wants)}</b></div><div><span class="eyebrow">Savings</span><b>${money(x.save)}</b></div></div>
      <h3 class="sub">This month so far</h3>${bars(st.rows)}</section>
      <section class="card" aria-label="What this means"><h2>What this means for you</h2><ul class="plain facts">
        <li>About <b>${money(weekly)}</b> a week for wants: eating out, shopping, fun.</li>
        <li>Saving <b>${money(x.save)}</b> a month adds up to <b>${money(x.save * 12)}</b> in a year.</li>
        ${months ? html`<li>A 3-month safety cushion for needs (<b>${money(cushion)}</b>) takes about <b>${months} month${months === 1 ? '' : 's'}</b> at this pace.</li>` : ''}
        ${goalNeed > 0 ? html`<li>Your dated goals need about <b>${money(goalNeed)}</b> a month. ${goalNeed <= x.save ? 'Your plan covers that.' : html`That’s more than the <b>${money(x.save)}</b> your plan saves. Try a plan that saves more, or move a goal’s date.`}</li>` : ''}
      </ul></section>`;
  }
  return {
    html: html`${pageHeader('Money plan', { back: true })}
    <p class="muted pad">A plan splits your monthly income into needs, wants and savings so you can live comfortably and still save. You can change it any time.</p>
    ${summary}
    <form class="card" data-form="plan" novalidate><h2>${plan ? 'Change my plan' : 'Choose a plan'}</h2>${planPicker(draft, 'plan-pick')}
      <div class="btn-row"><span class="grow"></span><button class="btn primary" type="submit">Save plan</button></div></form>`,
  };
}
changes['plan-pick'] = (el) => syncDraft(app.ui.planDraft ||= draftFromSettings(), el);
forms.plan = (fd, form) => {
  const plan = readPlan(fd, form);
  if (!plan) return false;
  app.store.setSettings({ plan });
  app.ui.planDraft = null;
  toast('Plan saved');
  return true;
};
