// Turns the spending-guard numbers into calm, plain sentences. Never scolds, never blocks.
import { app } from './ctx.js';
import { html, money } from './kit.js';
import * as C from '../calc.js';
import { today, addDays, periodFor } from '../dates.js';

export function guardFor(period) {
  const s = app.store, d = s.data, set = s.settings, t = today();
  const p = period || periodFor(t, set.monthStart);
  const skip = skipRuleId();
  const data = skip ? { ...d, planned: d.planned.filter((x) => x.ruleId !== skip) } : d;
  return C.spendingGuard(data, { workIncome: C.workIncome(set.workPay, t, addDays(t, 30)), start: p.start, endExclusive: p.endExclusive, today: t, addDaysFn: addDays, limitPct: set.plan && set.plan.wants ? set.plan.wants : (set.wantsLimit || 30), expectedIncome: Math.max(monthlyPay(), set.plan?.incomeMinor || 0) });
}

export function guardLines(g) {
  return g.warnings.map((w) => {
    if (w.code === 'shortfall') return { level: 'high', text: html`Your balance doesn’t fully cover the essential bills due in the next 30 days. You’re about <b>${money(w.short)}</b> short. Holding off on non-essentials would help.` };
    if (w.code === 'tight') return { level: 'watch', text: html`Only <b>${money(Math.max(0, w.left))}</b> would be left after the essential bills due in the next 30 days. Worth going easy on non-essentials.` };
    if (w.code === 'wants-income') return { level: w.level, text: html`Non-essentials are <b>${w.pct}%</b> of what you earned this period, above your comfortable ${w.limit}%.` };
    return { level: 'watch', text: html`You’ve spent more on non-essentials than on essentials this period.` };
  });
}

export function guardHeadline(g) { return g.warnings.some((w) => w.level === 'high') ? 'Priorities check' : 'Heads up'; }

/** The person's pay as a monthly amount (0 when they haven't set one). */
export function payRule() { const id = app.store.settings.pay?.ruleId; return id ? app.store.get('rules', id) : null; }
/** True when pay per work day is on, so the regular salary is left out of every sum. */
export function salaryIgnored() { return !!(app.store.settings.workPay && payRule()); }
/** The rule id to leave out of calculations, or null. */
export function skipRuleId() { return salaryIgnored() ? payRule().id : null; }
export function monthlyPay() { const r = payRule(); const work = C.monthlyFromWork(app.store.settings.workPay); return (r && !r.paused && !work ? C.monthlyOf(r) : 0) + work; }
