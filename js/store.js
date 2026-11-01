// The whole app state and every rule for changing it. Pure JS: no DOM, no storage.
import { occurrencesBetween } from './recurrence.js';
import { addDays, isIso, today as realToday } from './dates.js';
import { ESSENTIAL_DEFAULTS } from './calc.js';
import { CURRENCIES } from './money.js';

export const SCHEMA = 1;
export const COLLS = ['accounts', 'categories', 'txns', 'planned', 'rules', 'goals', 'contribs', 'budgets', 'debts', 'repayments'];
export const HORIZON_DAYS = 400;

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
const nowIso = () => new Date().toISOString();

export const DEFAULT_SETTINGS = () => ({
  currency: 'EUR', locale: '', weekStart: 1, monthStart: 1, theme: 'system', sound: true, nudges: true, guard: true, wantsLimit: 30, demo: false, pay: null, plan: null, workPay: null, orientation: 'auto',
  onboarded: false, hideAmounts: false, lastExportAt: null, createdAt: nowIso(),
});

export const DEFAULT_CATEGORIES = [
  ['Groceries', 'expense', 'cart'], ['Housing', 'expense', 'home'], ['Transport', 'expense', 'car'],
  ['Eating out', 'expense', 'food'], ['Bills & utilities', 'expense', 'bolt'], ['Health', 'expense', 'heart'],
  ['Shopping', 'expense', 'bag'], ['Leisure', 'expense', 'ticket'], ['Travel', 'expense', 'plane'],
  ['Other', 'expense', 'tag'], ['Salary', 'income', 'cash'], ['Other income', 'income', 'gift'],
];

export function emptyData() {
  const data = { settings: DEFAULT_SETTINGS() };
  for (const c of COLLS) data[c] = [];
  data.categories = DEFAULT_CATEGORIES.map(([name, kind, icon], i) => ({ id: uid(), name, kind, icon, archived: false, sort: i, ...(kind === 'expense' ? { essential: ESSENTIAL_DEFAULTS.includes(name.toLowerCase()) } : {}), updatedAt: nowIso() }));
  return data;
}

export class Store {
  constructor(data, { today = realToday, onChange = () => {} } = {}) {
    this.data = data;
    this.today = today;
    this.onChange = onChange;
  }
  get settings() { return this.data.settings; }
  commit() { this.onChange(this.data); }

  // ---------- lookups ----------
  get(coll, id) { return this.data[coll].find((x) => x.id === id) || null; }
  account(id) { return this.get('accounts', id); }
  category(id) { return this.get('categories', id); }
  activeAccounts() { return this.data.accounts.filter((a) => !a.archived).sort((a, b) => a.sort - b.sort); }
  categoriesOf(kind, includeArchived = false) {
    return this.data.categories.filter((c) => c.kind === kind && (includeArchived || !c.archived)).sort((a, b) => a.sort - b.sort);
  }

  // ---------- generic CRUD ----------
  add(coll, obj) {
    const rec = { ...obj, id: obj.id || uid(), updatedAt: nowIso() };
    if (!('sort' in rec) && (coll === 'accounts' || coll === 'categories')) rec.sort = this.data[coll].length;
    this.data[coll].push(rec);
    return rec;
  }
  update(coll, id, patch) {
    const r = this.get(coll, id);
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: nowIso() });
    return r;
  }
  remove(coll, id) {
    const i = this.data[coll].findIndex((x) => x.id === id);
    if (i >= 0) this.data[coll].splice(i, 1);
  }

  setSettings(patch) { Object.assign(this.data.settings, patch); this.commit(); }

  // ---------- transactions ----------
  addTxn(t) {
    const rec = this.add('txns', { notes: '', name: '', categoryId: null, toAccountId: null, plannedId: null, ...t });
    this.commit();
    return rec;
  }
  updateTxn(id, patch) { const r = this.update('txns', id, patch); this.commit(); return r; }
  /** Deleting the transaction of a paid planned item re-opens that item. */
  deleteTxn(id) {
    const t = this.get('txns', id);
    if (!t) return;
    if (t.plannedId) {
      const p = this.get('planned', t.plannedId);
      if (p && p.status === 'done') this.update('planned', p.id, { status: 'planned', txnId: null });
    }
    this.remove('txns', id);
    this.commit();
  }

  // ---------- planned items ----------
  addPlanned(p) {
    const rec = this.add('planned', { time: '', categoryId: null, accountId: null, status: 'planned', ruleId: null, overridden: false, notes: '', txnId: null, amountMinor: 0, ...p });
    this.commit();
    return rec;
  }
  /** Editing one occurrence of a recurring item marks it so a series edit won't overwrite it. */
  updatePlanned(id, patch) {
    const p = this.get('planned', id);
    if (!p) return null;
    const r = this.update('planned', id, { ...patch, overridden: p.ruleId ? true : p.overridden });
    this.commit();
    return r;
  }
  deletePlanned(id) {
    const p = this.get('planned', id);
    if (!p) return;
    if (p.status === 'done' && p.txnId) this.remove('txns', p.txnId);
    if (p.ruleId) { // keep a skipped marker so the series never regenerates this date
      if (p.status === 'done') this.update('planned', id, { status: 'skipped', txnId: null });
      else this.update('planned', id, { status: 'skipped' });
    } else this.remove('planned', id);
    this.commit();
  }
  skipPlanned(id, skip = true) { this.update('planned', id, { status: skip ? 'skipped' : 'planned' }); this.commit(); }

  markPaid(id, { date, amountMinor, accountId } = {}) {
    const p = this.get('planned', id);
    if (!p || p.status === 'done' || p.kind === 'event') return null;
    const acc = accountId || p.accountId || this.activeAccounts()[0]?.id;
    if (!acc) throw new Error('Add an account first.');
    const t = this.add('txns', {
      type: p.kind, amountMinor: amountMinor ?? p.amountMinor, name: p.name, categoryId: p.categoryId,
      accountId: acc, toAccountId: null, date: date || this.today(), notes: p.notes || '', plannedId: p.id,
    });
    this.update('planned', id, { status: 'done', txnId: t.id });
    this.commit();
    return t;
  }
  undoPaid(id) {
    const p = this.get('planned', id);
    if (!p || p.status !== 'done') return;
    if (p.txnId) this.remove('txns', p.txnId);
    this.update('planned', id, { status: 'planned', txnId: null });
    this.commit();
  }

  // ---------- recurring rules ----------
  /** Creates occurrences for [trackFrom, today + horizon]. Never duplicates (ruleId, date). */
  ensureHorizon() {
    const to = addDays(this.today(), HORIZON_DAYS);
    let changed = false;
    const seen = new Set(this.data.planned.filter((p) => p.ruleId).map((p) => p.ruleId + '|' + p.date));
    for (const r of this.data.rules) {
      if (r.paused) continue;
      for (const d of occurrencesBetween(r, r.trackFrom || r.startDate, to)) {
        const k = r.id + '|' + d;
        if (seen.has(k)) continue;
        seen.add(k);
        this.data.planned.push({
          id: uid(), kind: r.kind, name: r.name, amountMinor: r.amountMinor, date: d, time: r.time || '',
          categoryId: r.categoryId || null, accountId: r.accountId || null, status: 'planned', ruleId: r.id,
          overridden: false, notes: r.notes || '', txnId: null, updatedAt: nowIso(),
        });
        changed = true;
      }
    }
    if (changed) this.commit();
    return changed;
  }

  addRule(r) {
    const t = this.today();
    const rule = this.add('rules', {
      time: '', categoryId: null, accountId: null, endDate: null, every: 1, paused: false, notes: '',
      trackFrom: r.startDate >= t ? r.startDate : t, ...r,
    });
    if (r.trackFrom === undefined) rule.trackFrom = r.startDate >= t ? r.startDate : t;
    this.ensureHorizon();
    this.commit();
    return rule;
  }

  /** Series edit: changes the rule and rebuilds untouched, still-pending future occurrences. */
  updateRule(id, patch) {
    const rule = this.get('rules', id);
    if (!rule) return null;
    const t = this.today();
    Object.assign(rule, patch, { updatedAt: nowIso() });
    if (patch.startDate || patch.unit || patch.every) rule.trackFrom = rule.startDate >= t ? rule.startDate : t;
    this.data.planned = this.data.planned.filter((p) => !(p.ruleId === id && p.status === 'planned' && !p.overridden && p.date >= t));
    this.ensureHorizon();
    this.commit();
    return rule;
  }
  pauseRule(id, paused) {
    const rule = this.get('rules', id);
    if (!rule) return;
    const t = this.today();
    rule.paused = paused; rule.updatedAt = nowIso();
    if (paused) this.data.planned = this.data.planned.filter((p) => !(p.ruleId === id && p.status === 'planned' && !p.overridden && p.date >= t));
    else rule.trackFrom = t;
    this.ensureHorizon();
    this.commit();
  }
  /** Ends the series after endDate and removes pending occurrences beyond it. */
  endRule(id, endDate) {
    const rule = this.get('rules', id);
    if (!rule) return;
    rule.endDate = endDate; rule.updatedAt = nowIso();
    this.data.planned = this.data.planned.filter((p) => !(p.ruleId === id && p.status === 'planned' && p.date > endDate));
    this.commit();
  }
  deleteRule(id) {
    this.data.planned = this.data.planned.filter((p) => !(p.ruleId === id && p.status !== 'done'));
    for (const p of this.data.planned) if (p.ruleId === id) p.ruleId = null; // keep paid history
    this.remove('rules', id);
    this.commit();
  }

  // ---------- accounts / categories / goals / budgets ----------
  accountInUse(id) {
    const d = this.data;
    return d.txns.some((t) => t.accountId === id || t.toAccountId === id) || d.planned.some((p) => p.accountId === id) || d.rules.some((r) => r.accountId === id);
  }
  removeAccount(id) {
    if (this.accountInUse(id)) this.update('accounts', id, { archived: true });
    else this.remove('accounts', id);
    this.commit();
    return this.get('accounts', id) ? 'archived' : 'deleted';
  }
  /** What deleting an account for good would remove, for showing before the person confirms. */
  accountFootprint(id) {
    const d = this.data;
    const last = !d.accounts.some((a) => a.id !== id && !a.archived);
    const txns = d.txns.filter((t) => t.accountId === id || t.toAccountId === id);
    const ids = new Set(txns.map((t) => t.id));
    const rules = d.rules.filter((r) => last || r.accountId === id);
    const ruleIds = new Set(rules.map((r) => r.id));
    const planned = d.planned.filter((p) => last || p.accountId === id || ids.has(p.txnId) || ruleIds.has(p.ruleId));
    return { txns: txns.length, planned: planned.length, rules: rules.length, goals: last ? d.goals.length : 0, budgets: last ? d.budgets.length : 0, last };
  }
  /**
   * Permanent delete: the account and everything done in it: transactions in or out of it, upcoming and repeating items
   * linked to it. If it was the only account there is nothing left to attach anything to, so upcoming items, goals and
   * budgets go too and the person starts completely fresh. Categories and settings stay.
   */
  deleteAccountForGood(id) {
    const d = this.data;
    const last = !d.accounts.some((a) => a.id !== id && !a.archived);
    const gone = new Set(d.txns.filter((t) => t.accountId === id || t.toAccountId === id).map((t) => t.id));
    d.txns = d.txns.filter((t) => !gone.has(t.id));
    const deadRules = new Set(d.rules.filter((r) => last || r.accountId === id).map((r) => r.id));
    d.rules = d.rules.filter((r) => !deadRules.has(r.id));
    d.planned = d.planned.filter((p) => !(last || p.accountId === id || (p.txnId && gone.has(p.txnId)) || (p.ruleId && deadRules.has(p.ruleId))));
    if (last) { d.goals = []; d.contribs = []; d.budgets = []; d.debts = []; d.repayments = []; d.settings.plan = null; d.settings.demo = false; }
    if (d.settings.pay && !d.rules.some((r) => r.id === d.settings.pay.ruleId)) d.settings.pay = null;
    this.remove('accounts', id);
    this.commit();
    return { txns: gone.size, everything: last };
  }
  /** Removes a debt, its repayment notes and its repeating payment. Transactions already recorded stay. */
  removeDebt(id) {
    const d = this.get('debts', id);
    if (!d) return;
    if (d.ruleId && this.get('rules', d.ruleId)) this.deleteRule(d.ruleId);
    this.data.repayments = this.data.repayments.filter((x) => x.debtId !== id);
    this.remove('debts', id);
    this.commit();
  }
  categoryInUse(id) {
    const d = this.data;
    return d.txns.some((t) => t.categoryId === id) || d.planned.some((p) => p.categoryId === id) || d.rules.some((r) => r.categoryId === id) || d.budgets.some((b) => b.categoryId === id);
  }
  removeCategory(id) {
    if (this.categoryInUse(id)) this.update('categories', id, { archived: true });
    else this.remove('categories', id);
    this.commit();
    return this.get('categories', id) ? 'archived' : 'deleted';
  }
  removeGoal(id) {
    this.data.contribs = this.data.contribs.filter((c) => c.goalId !== id);
    this.remove('goals', id);
    this.commit();
  }
  setBudget(categoryId, limitMinor) {
    const cat = categoryId || '';
    const ex = this.data.budgets.find((b) => (b.categoryId || '') === cat);
    if (limitMinor <= 0) { if (ex) this.remove('budgets', ex.id); }
    else if (ex) this.update('budgets', ex.id, { limitMinor });
    else this.add('budgets', { categoryId: cat, limitMinor });
    this.commit();
  }

  deleteEverything() {
    this.data = emptyData();
    this.commit();
  }
}

// ======================= import / export =======================

export function buildExport(data) {
  const { settings, ...rest } = data;
  const { hideAmounts, ...portable } = settings;
  return { app: 'sallo', schema: SCHEMA, exportedAt: nowIso(), settings: portable, ...rest };
}

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const optStr = (v, max = 200) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const bool = (v) => v === true;
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const isoOr = (v) => (isIso(v) ? v : null);
const stamp = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : nowIso());
const idOf = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 80 ? v : null);

const CLEAN = {
  accounts: (r) => (idOf(r.id) && str(r.name) ? { id: r.id, name: str(r.name), type: oneOf(r.type, ['bank', 'cash', 'card', 'savings', 'other'], 'bank'), openingMinor: int(r.openingMinor) ?? 0, archived: bool(r.archived), sort: int(r.sort) ?? 0, updatedAt: stamp(r.updatedAt) } : null),
  categories: (r) => (idOf(r.id) && str(r.name) ? { id: r.id, name: str(r.name), kind: oneOf(r.kind, ['expense', 'income'], 'expense'), icon: str(r.icon, 20) || 'tag', archived: bool(r.archived), sort: int(r.sort) ?? 0, ...(typeof r.essential === 'boolean' ? { essential: r.essential } : {}), updatedAt: stamp(r.updatedAt) } : null),
  txns: (r) => {
    const type = oneOf(r.type, ['expense', 'income', 'transfer'], null);
    const amt = int(r.amountMinor);
    if (!idOf(r.id) || !type || amt === null || amt < 0 || !isoOr(r.date) || !idOf(r.accountId)) return null;
    if (type === 'transfer' && !idOf(r.toAccountId)) return null;
    return { id: r.id, type, amountMinor: amt, name: str(r.name), categoryId: idOf(r.categoryId), accountId: r.accountId, toAccountId: type === 'transfer' ? r.toAccountId : null, date: r.date, notes: str(r.notes, 2000), plannedId: idOf(r.plannedId), updatedAt: stamp(r.updatedAt) };
  },
  planned: (r) => {
    const kind = oneOf(r.kind, ['expense', 'income', 'event'], null);
    const amt = int(r.amountMinor) ?? 0;
    if (!idOf(r.id) || !kind || !isoOr(r.date) || !str(r.name) || amt < 0) return null;
    return { id: r.id, kind, name: str(r.name), amountMinor: amt, date: r.date, time: /^\d{2}:\d{2}$/.test(r.time || '') ? r.time : '', categoryId: idOf(r.categoryId), accountId: idOf(r.accountId), status: oneOf(r.status, ['planned', 'done', 'skipped'], 'planned'), ruleId: idOf(r.ruleId), overridden: bool(r.overridden), notes: str(r.notes, 2000), txnId: idOf(r.txnId), updatedAt: stamp(r.updatedAt) };
  },
  rules: (r) => {
    const kind = oneOf(r.kind, ['expense', 'income', 'event'], null);
    const unit = oneOf(r.unit, ['day', 'week', 'month', 'year'], null);
    const every = int(r.every);
    if (!idOf(r.id) || !kind || !unit || !every || every < 1 || every > 999 || !isoOr(r.startDate) || !str(r.name)) return null;
    return { id: r.id, kind, name: str(r.name), amountMinor: Math.max(0, int(r.amountMinor) ?? 0), categoryId: idOf(r.categoryId), accountId: idOf(r.accountId), time: /^\d{2}:\d{2}$/.test(r.time || '') ? r.time : '', startDate: r.startDate, trackFrom: isoOr(r.trackFrom) || r.startDate, endDate: isoOr(r.endDate), unit, every, paused: bool(r.paused), notes: str(r.notes, 2000), updatedAt: stamp(r.updatedAt) };
  },
  goals: (r) => (idOf(r.id) && str(r.name) && int(r.targetMinor) > 0 ? { id: r.id, name: str(r.name), targetMinor: r.targetMinor, deadline: isoOr(r.deadline), autoPct: Number.isInteger(r.autoPct) && r.autoPct >= 0 && r.autoPct <= 50 ? r.autoPct : 0, icon: str(r.icon, 20) || 'piggy', archived: bool(r.archived), note: str(r.note, 1000), updatedAt: stamp(r.updatedAt) } : null),
  contribs: (r) => (idOf(r.id) && idOf(r.goalId) && int(r.amountMinor) !== null && isoOr(r.date) ? { id: r.id, goalId: r.goalId, amountMinor: r.amountMinor, date: r.date, note: str(r.note, 500), updatedAt: stamp(r.updatedAt) } : null),
  debts: (r) => (idOf(r.id) && str(r.name) && int(r.startMinor) > 0 ? { id: r.id, name: str(r.name), direction: oneOf(r.direction, ['owe', 'owed'], 'owe'), startMinor: r.startMinor, aprBp: Number.isInteger(r.aprBp) && r.aprBp >= 0 && r.aprBp <= 10000 ? r.aprBp : 0, monthlyMinor: Math.max(0, int(r.monthlyMinor) ?? 0), ruleId: idOf(r.ruleId), accountId: idOf(r.accountId), startDate: isoOr(r.startDate), note: str(r.note, 1000), archived: bool(r.archived), updatedAt: stamp(r.updatedAt) } : null),
  repayments: (r) => (idOf(r.id) && idOf(r.debtId) && int(r.amountMinor) && isoOr(r.date) ? { id: r.id, debtId: r.debtId, amountMinor: r.amountMinor, date: r.date, txnId: idOf(r.txnId), note: str(r.note, 500), updatedAt: stamp(r.updatedAt) } : null),
  budgets: (r) => (idOf(r.id) && int(r.limitMinor) > 0 ? { id: r.id, categoryId: typeof r.categoryId === 'string' ? r.categoryId : '', limitMinor: r.limitMinor, updatedAt: stamp(r.updatedAt) } : null),
};

function cleanWorkPay(w) {
  if (!w || typeof w !== 'object' || !Number.isInteger(w.dailyMinor) || w.dailyMinor <= 0) return null;
  const weekdays = [...new Set((Array.isArray(w.weekdays) ? w.weekdays : []).filter((x) => Number.isInteger(x) && x >= 1 && x <= 7))].sort();
  const off = [...new Set((Array.isArray(w.off) ? w.off : []).filter((x) => isIso(x)))].sort().slice(0, 400);
  const extra = [...new Set((Array.isArray(w.extra) ? w.extra : []).filter((x) => isIso(x)))].sort().slice(0, 800);
  return { dailyMinor: w.dailyMinor, weekdays: weekdays.length || extra.length ? weekdays : [1, 2, 3, 4, 5], off, extra };
}
function cleanPlan(p) {
  if (!p || typeof p !== 'object') return null;
  const type = ['50-30-20', '60-30-10', '70-20-10', '40-30-30', 'custom', 'own'].includes(p.type) ? p.type : null;
  if (!type) return null;
  const inc = Number.isInteger(p.incomeMinor) && p.incomeMinor >= 0 ? p.incomeMinor : 0;
  if (type === 'own') return { type, incomeMinor: inc };
  const n = (v) => (Number.isInteger(v) && v >= 0 && v <= 100 ? v : null);
  const needs = n(p.needs), wants = n(p.wants), save = n(p.save);
  if (needs === null || wants === null || save === null || needs + wants + save !== 100) return null;
  return { type, needs, wants, save, incomeMinor: inc };
}

function cleanSettings(s = {}) {
  const d = DEFAULT_SETTINGS();
  return {
    ...d,
    currency: CURRENCIES.some((c) => c.code === s.currency) ? s.currency : d.currency,
    locale: typeof s.locale === 'string' && /^[A-Za-z-]{0,12}$/.test(s.locale) ? s.locale : '',
    weekStart: Number.isInteger(s.weekStart) && s.weekStart >= 1 && s.weekStart <= 7 ? s.weekStart : 1,
    monthStart: Number.isInteger(s.monthStart) && s.monthStart >= 1 && s.monthStart <= 28 ? s.monthStart : 1,
    theme: oneOf(s.theme, ['system', 'light', 'dark'], 'system'),
    sound: s.sound !== false, nudges: s.nudges !== false, guard: s.guard !== false, demo: s.demo === true, pay: s.pay && typeof s.pay.ruleId === 'string' ? { ruleId: s.pay.ruleId } : null,
    plan: cleanPlan(s.plan),
    workPay: cleanWorkPay(s.workPay), wantsLimit: [20, 30, 40, 50].includes(s.wantsLimit) ? s.wantsLimit : 30, orientation: oneOf(s.orientation, ['auto', 'portrait'], 'auto'),
    onboarded: true, lastExportAt: typeof s.lastExportAt === 'string' ? s.lastExportAt : null,
    createdAt: stamp(s.createdAt),
  };
}

/**
 * Validates untrusted file contents. Returns { data, counts, dropped } or throws Error with a
 * message a person can act on. Never trusts the shape of the input.
 */
export function validateImport(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== 'sallo') throw new Error('This file is not a Sallo backup.');
  if (!Number.isInteger(obj.schema) || obj.schema < 1) throw new Error('This backup has no version number.');
  if (obj.schema > SCHEMA) throw new Error('This backup was made by a newer version of Sallo. Update the app first.');
  const data = { settings: cleanSettings(obj.settings) };
  const counts = {};
  let dropped = 0;
  for (const c of COLLS) {
    const raw = Array.isArray(obj[c]) ? obj[c] : [];
    const seen = new Set();
    data[c] = [];
    for (const r of raw) {
      const rec = r && typeof r === 'object' ? CLEAN[c](r) : null;
      if (!rec || seen.has(rec.id)) { dropped++; continue; }
      seen.add(rec.id);
      data[c].push(rec);
    }
    counts[c] = data[c].length;
  }
  dropped += repairReferences(data);
  counts.txns = data.txns.length; counts.accounts = data.accounts.length;
  return { data, counts, dropped };
}

/** Removes records that point at things that no longer exist. Returns how many were dropped. */
export function repairReferences(data) {
  let dropped = 0;
  const acc = new Set(data.accounts.map((a) => a.id));
  const cat = new Set(data.categories.map((c) => c.id));
  const goals = new Set(data.goals.map((g) => g.id));
  const before = data.txns.length + data.contribs.length;
  data.txns = data.txns.filter((t) => acc.has(t.accountId) && (t.type !== 'transfer' || acc.has(t.toAccountId)));
  data.contribs = data.contribs.filter((c) => goals.has(c.goalId));
  dropped += before - data.txns.length - data.contribs.length;
  for (const t of data.txns) if (t.categoryId && !cat.has(t.categoryId)) t.categoryId = null;
  for (const p of data.planned) { if (p.categoryId && !cat.has(p.categoryId)) p.categoryId = null; if (p.accountId && !acc.has(p.accountId)) p.accountId = null; }
  for (const r of data.rules) { if (r.categoryId && !cat.has(r.categoryId)) r.categoryId = null; if (r.accountId && !acc.has(r.accountId)) r.accountId = null; }
  data.budgets = data.budgets.filter((b) => !b.categoryId || cat.has(b.categoryId));
  const debts = new Set(data.debts.map((x) => x.id)), rules = new Set(data.rules.map((x) => x.id)), txIds = new Set(data.txns.map((x) => x.id));
  const rb = data.repayments.length;
  data.repayments = data.repayments.filter((x) => debts.has(x.debtId));
  dropped += rb - data.repayments.length;
  for (const x of data.repayments) if (x.txnId && !txIds.has(x.txnId)) x.txnId = null;
  for (const x of data.debts) { if (x.ruleId && !rules.has(x.ruleId)) x.ruleId = null; if (x.accountId && !acc.has(x.accountId)) x.accountId = null; }
  // one occurrence per (rule, date); prefer a paid one
  const best = new Map();
  for (const p of data.planned) {
    if (!p.ruleId) continue;
    const k = p.ruleId + '|' + p.date;
    const cur = best.get(k);
    if (!cur || (p.status === 'done' && cur.status !== 'done')) best.set(k, p);
  }
  data.planned = data.planned.filter((p) => !p.ruleId || best.get(p.ruleId + '|' + p.date) === p);
  const txnIds = new Set(data.txns.map((t) => t.id));
  for (const p of data.planned) if (p.status === 'done' && p.txnId && !txnIds.has(p.txnId)) { p.status = 'planned'; p.txnId = null; }
  return dropped;
}

/** Combines an imported dataset into the current one. Newer record (updatedAt) wins. Deletions are not carried over. */
export function mergeData(current, incoming) {
  const out = { settings: current.settings };
  const stats = { added: 0, updated: 0 };
  for (const c of COLLS) {
    const map = new Map(current[c].map((r) => [r.id, r]));
    for (const r of incoming[c]) {
      const ex = map.get(r.id);
      if (!ex) { map.set(r.id, r); stats.added++; }
      else if (r.updatedAt > ex.updatedAt) { map.set(r.id, r); stats.updated++; }
    }
    out[c] = [...map.values()];
  }
  // budgets: one per category
  const seenB = new Set();
  out.budgets = out.budgets.filter((b) => { const k = b.categoryId || ''; if (seenB.has(k)) return false; seenB.add(k); return true; });
  repairReferences(out);
  return { data: out, stats };
}

// ---------- CSV (for spreadsheets; transactions only) ----------
function csvCell(v) {
  let s = String(v ?? '');
  if (s && '=+-@\t\r'.includes(s[0])) s = "'" + s; // spreadsheet formula injection guard
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
export function transactionsCsv(data, minorToPlain, currency) {
  const acc = new Map(data.accounts.map((a) => [a.id, a.name]));
  const cat = new Map(data.categories.map((c) => [c.id, c.name]));
  const rows = ['date,type,amount,currency,name,category,account,to_account,notes'];
  for (const t of [...data.txns].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([t.date, t.type, minorToPlain(t.amountMinor, currency.exp), currency.code, csvCell(t.name), csvCell(cat.get(t.categoryId) || ''), csvCell(acc.get(t.accountId) || ''), csvCell(acc.get(t.toAccountId) || ''), csvCell(t.notes)].join(','));
  }
  return rows.join('\r\n') + '\r\n';
}
