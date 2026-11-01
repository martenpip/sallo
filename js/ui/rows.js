import { app } from './ctx.js';
import { html, icon, amountSpan, money, dateText, chip, badge } from './kit.js';
import { displayStatus } from '../calc.js';
import { today } from '../dates.js';
import { KIND_LABEL } from './editors.js';
import { skipRuleId } from './guard.js';

export function txnRow(t, { showDate = false } = {}) {
  const s = app.store;
  const cat = s.category(t.categoryId), acc = s.account(t.accountId), to = s.account(t.toAccountId);
  const title = t.name || cat?.name || (t.type === 'transfer' ? 'Transfer' : t.type === 'income' ? 'Income' : 'Expense');
  const sub = t.type === 'transfer' ? `${acc?.name || '?'} → ${to?.name || '?'}` : [cat?.name, acc?.name].filter(Boolean).join(' · ');
  const ico = t.type === 'transfer' ? 'transfer' : cat?.icon || (t.type === 'income' ? 'cash' : 'tag');
  return html`<div class="row"><button class="row-main" data-act="txn-open" data-id="${t.id}">
    ${badge(ico)}<span class="row-text"><b>${title}</b><small>${showDate ? dateText(t.date) + (sub ? ' · ' : '') : ''}${sub}${t.shared ? html` ${chip('Shared', 'accent')}` : ''}</small></span>
    <span class="row-amt">${amountSpan(t.amountMinor, t.type)}</span></button></div>`;
}

const STATUS = {
  overdue: ['Overdue', 'warn'], due: ['Due today', 'accent'], paid: ['Done', 'good'], skipped: ['Skipped', ''], upcoming: ['', ''], past: ['Past', ''],
};
export function plannedRow(p, { showDate = true, quick = true } = {}) {
  const s = app.store;
  const t = today();
  const st = displayStatus(p, t);
  const cat = s.category(p.categoryId);
  const ico = p.kind === 'event' ? 'calendar' : cat?.icon || (p.kind === 'income' ? 'cash' : 'bolt');
  const [label, tone] = STATUS[st];
  const doneLabel = st === 'paid' ? (p.kind === 'income' ? 'Received' : 'Paid') : label;
  const ignored = p.kind === 'income' && p.status === 'planned' && p.ruleId && p.ruleId === skipRuleId();
  const canQuick = quick && p.kind !== 'event' && p.status === 'planned';
  return html`<div class="row ${st === 'skipped' ? 'dim' : ''}"><button class="row-main" data-act="planned-open" data-id="${p.id}">
    ${badge(ico)}<span class="row-text"><b>${p.name}</b>
      <small>${showDate ? dateText(p.date, { weekday: 'short', day: 'numeric', month: 'short' }) + (p.time ? ' ' + p.time : '') : KIND_LABEL[p.kind]}${p.ruleId ? html` · ${icon('repeat', 12)}` : ''}${doneLabel ? html` ${chip(doneLabel, tone)}` : ''}${ignored ? html` ${chip('Not counted', 'neutral')}` : ''}</small></span>
    <span class="row-amt">${p.kind === 'event' ? '' : amountSpan(p.amountMinor, p.kind)}</span></button>
    ${canQuick ? html`<button class="quick" data-act="mark-paid" data-id="${p.id}" aria-label="${p.kind === 'income' ? 'Mark received' : 'Mark paid'}: ${p.name}">${icon('check', 18)}</button>` : ''}</div>`;
}
