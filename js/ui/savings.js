import { app } from './ctx.js';
import { html, icon, money, dateText, pageHeader, actions, emptyState, progress, chip, badge } from './kit.js';
import * as C from '../calc.js';
import { today, addDays } from '../dates.js';

export function savings() {
  const s = app.store, d = s.data, t = today();
  const goals = d.goals.filter((g) => !g.archived);
  const allocated = C.totalAllocated(d.goals, d.contribs);
  const total = C.totalBalance(d.accounts, C.accountBalances(d.accounts, d.txns));
  const bills = C.pendingTotals(d.planned, t, addDays(t, 30));
  const safe = total - allocated - bills.out ; // free money after goals and the next 30 days of planned payments
  const active = goals.filter((g) => !C.goalProgress(g, d.contribs, t).done);
  const monthly = active.reduce((n, g) => n + (C.goalProgress(g, d.contribs, t).perMonth || 0), 0);
  const target = goals.reduce((n, g) => n + g.targetMinor, 0);
  return {
    html: html`
    ${pageHeader('Savings')}
    ${goals.length ? html`<section class="card hero"><p class="eyebrow">Set aside for goals</p><div class="hero-amt">${money(allocated)}</div>
      <p class="muted">of ${money(target)} across ${goals.length} goal${goals.length === 1 ? '' : 's'}${allocated > 0 ? html` · ${money(total - allocated)} left to spend` : ''}</p></section>
      <section class="card tip" aria-label="Smart saving">
        <div class="card-head"><h2>${icon('target', 18)} Smart saving</h2></div>
        <p>${safe > 0 ? html`After your goals and the payments planned for the next 30 days, about <b>${money(safe)}</b> is free.` : html`Your goals and the next 30 days of planned payments use up all of your balance, so it’s best to hold off on setting more aside.`}</p>
        ${monthly > 0 ? html`<p class="muted">Your goals with a date need about <b>${money(monthly)}</b> a month in total.${safe > 0 && safe >= monthly ? ' You can cover that right now.' : ''}</p>` : ''}
        <p class="muted">When income arrives, Sallo offers to put a share toward each goal. You choose every time.</p></section>
      <div class="stack">${goals.map((g) => { const gp = C.goalProgress(g, d.contribs, t);
        return html`<a class="card goal" href="#/goal/${g.id}"><div class="goal-top">${badge(g.icon)}<div class="row-text"><b>${g.name}</b><small>${g.deadline ? 'By ' + dateText(g.deadline, { day: 'numeric', month: 'short', year: 'numeric' }) : 'No deadline'}</small></div>${gp.done ? chip('Reached', 'good') : html`<b>${gp.pct}%</b>`}</div>
          ${progress(gp.pct, 'sage', g.name + ' progress')}<div class="bar-label"><small>${money(gp.saved)} saved</small><small>${money(g.targetMinor)} goal</small></div></a>`; })}</div>`
      : emptyState('No savings goals yet', 'Set a target, put money aside bit by bit and watch it fill up.', html`<button class="btn primary" data-act="goal-new">Create a goal</button>`)}
    ${(() => { const dt = C.debtTotals(d.debts, d.repayments, d.planned); return html`<a class="card link-card" href="#/debts">${badge('bank')}<span class="row-text"><b>Debts and loans</b><small>${dt.owe || dt.owed ? [dt.owe ? 'You owe ' + money(dt.owe) : '', dt.owed ? 'Owed to you ' + money(dt.owed) : ''].filter(Boolean).join(' · ') : 'Track a loan or money you’ve lent'}</small></span>${icon('next', 16)}</a>`; })()}
    <button class="fab" data-act="goal-new" aria-label="New goal">${icon('plus', 26)}</button>`,
  };
}

export function goalDetail({ id }) {
  const s = app.store, d = s.data, t = today();
  const g = s.get('goals', id);
  if (!g) return { html: html`${pageHeader('Goal', { back: true })}${emptyState('This goal no longer exists', '', html`<a class="btn" href="#/savings">Back to savings</a>`)}` };
  const gp = C.goalProgress(g, d.contribs, t);
  const list = d.contribs.filter((c) => c.goalId === g.id).sort((a, b) => b.date.localeCompare(a.date));
  return {
    html: html`
    ${pageHeader(g.name, { back: true, right: html`<button class="icon-btn" data-act="goal-edit" data-id="${g.id}" aria-label="Edit goal">${icon('edit')}</button>` })}
    <section class="card hero"><p class="eyebrow">Saved</p><div class="hero-amt">${money(gp.saved)}</div><p class="muted">of ${money(g.targetMinor)} · ${gp.pct}%</p>
      ${progress(gp.pct, 'sage', 'Progress')}
      <ul class="plain facts">
        ${gp.done ? html`<li>${icon('check', 16)} Goal reached.</li>` : html`<li>${money(gp.remaining)} to go</li>`}
        ${g.deadline ? html`<li>Target date ${dateText(g.deadline, { day: 'numeric', month: 'long', year: 'numeric' })}</li>` : ''}
        ${gp.perMonth ? html`<li>About <b>${money(gp.perMonth)}</b> a month to get there</li>` : ''}
      </ul>
      <button class="btn primary" data-act="contrib-new" data-goal="${g.id}">${icon('plus', 18)} Add or take out</button></section>
    <h2 class="sec">History</h2>
    ${list.length ? html`<div class="list card flush">${list.map((c) => html`<div class="row"><button class="row-main" data-act="contrib-open" data-id="${c.id}" data-goal="${g.id}"><span class="row-text"><b>${c.note || (c.amountMinor < 0 ? 'Taken out' : 'Put aside')}</b><small>${dateText(c.date, { day: 'numeric', month: 'short', year: 'numeric' })}</small></span><span class="row-amt"><span class="amt ${c.amountMinor < 0 ? 'out' : 'in'}">${money(c.amountMinor, { sign: true })}</span></span></button></div>`)}</div>`
      : emptyState('Nothing saved yet', 'Add the first amount to start filling this goal.')}`,
  };
}
