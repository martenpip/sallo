// Two people, two phones, one shared budget. No server: each person sends the other a small file of the
// expenses they marked "shared"; importing it replaces what was last received from that person.
import { addDays } from './dates.js';
import { cleanHousehold, uid } from './store.js';

/** My share of the shared spending, in percent (0-100). */
export function sharePct(config, id, otherId) {
  const mode = config.split.mode;
  if (mode === 'custom') return config.split.pctById[id] ?? 50;
  if (mode === 'income') {
    const a = config.incomes[id] || 0, b = config.incomes[otherId] || 0;
    return a > 0 && b > 0 ? (a * 100) / (a + b) : 50;
  }
  return 50;
}

/**
 * The household's month: what was spent together, who paid what, who owes whom.
 * mine/theirs: [{date, amountMinor, name, categoryName, ...}] already limited to shared expenses.
 * balance > 0 means the partner owes me, < 0 means I owe the partner.
 */
export function ledger({ household, mine, theirs, start, endExclusive }) {
  const inRange = (x) => x.date >= start && x.date < endExclusive;
  const m = mine.filter(inRange), t = theirs.filter(inRange);
  const paidMe = m.reduce((n, x) => n + x.amountMinor, 0), paidThem = t.reduce((n, x) => n + x.amountMinor, 0);
  const total = paidMe + paidThem;
  const pct = sharePct(household.config, household.personId, household.partnerId);
  const shareMe = Math.round((total * pct) / 100), shareThem = total - shareMe;
  const byCat = new Map();
  for (const x of [...m, ...t]) byCat.set(x.categoryName || 'Other', (byCat.get(x.categoryName || 'Other') || 0) + x.amountMinor);
  return { total, paidMe, paidThem, pct, shareMe, shareThem, balance: paidMe - shareMe, byCategory: [...byCat].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount), count: m.length + t.length };
}

// ---------- the file that goes between phones ----------
export function buildShareFile(data, { now = new Date().toISOString(), today }) {
  const h = data.settings.household;
  const cats = new Map(data.categories.map((c) => [c.id, c.name]));
  const since = addDays(today, -400);
  const txns = data.txns.filter((t) => t.shared && t.type === 'expense' && t.date >= since).map((t) => ({ id: t.id, date: t.date, amountMinor: t.amountMinor, name: t.name || '', category: cats.get(t.categoryId) || '' }));
  return { app: 'sallo', kind: 'household', v: 1, exportedAt: now, from: { id: h.personId, name: h.config.names[h.personId] }, config: h.config, txns };
}

/** Checks a received file. Throws an Error with a message a person can act on. */
export function validateShare(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== 'sallo') throw new Error('This file is not from Sallo.');
  if (obj.kind !== 'household') throw new Error('This is a normal Sallo backup, not a shared-budget file. Use "Import a backup" in Settings for that.');
  if (obj.v !== 1) throw new Error('This shared file is from a newer version of Sallo. Update the app first.');
  const id = obj.from?.id;
  if (typeof id !== 'string' || !id || id.length > 80) throw new Error('This shared file is damaged.');
  const raw = Array.isArray(obj.txns) ? obj.txns.slice(0, 5000) : [];
  const seen = new Set(), txns = [];
  for (const t of raw) {
    if (!t || typeof t.id !== 'string' || !t.id || t.id.length > 80 || seen.has(t.id)) continue;
    if (!Number.isSafeInteger(t.amountMinor) || t.amountMinor <= 0 || typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) continue;
    seen.add(t.id);
    txns.push({ id: t.id, personId: id, date: t.date, amountMinor: t.amountMinor, name: String(t.name || '').slice(0, 80), categoryName: String(t.category || '').slice(0, 60) });
  }
  return { fromId: id, fromName: String(obj.from?.name || '').slice(0, 40) || 'Partner', config: obj.config, exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : null, txns };
}

/**
 * Applies a validated file to the data. Returns {ok:true, created, count} or {ok:false, needsConfirm:'other-partner'}.
 * Everything previously received from this person is replaced, so deleted or edited items stay correct.
 * The newer shared settings (names, split, budget) win.
 */
export function applyShare(data, v, { force = false, now = new Date().toISOString() } = {}) {
  let h = data.settings.household;
  let created = false;
  if (h && !h.partnerLinked) { // first file from the partner: swap the placeholder id for their real one
    const old = h.partnerId, rekey = (o) => { if (o && old in o) { o[v.fromId] = o[old]; delete o[old]; } };
    rekey(h.config.names); rekey(h.config.incomes); rekey(h.config.split.pctById);
    h.partnerId = v.fromId; h.partnerLinked = true;
  }
  if (h && h.partnerId !== v.fromId) {
    if (!force) return { ok: false, needsConfirm: 'other-partner' };
    data.sharedIn = []; h = null;
  }
  if (!h) {
    const cfg = v.config && typeof v.config === 'object' ? v.config : {};
    const me = uid();
    const names = { ...(cfg.names || {}) }; names[me] = names[me] || 'Me'; names[v.fromId] = names[v.fromId] || v.fromName;
    const split = cfg.split && typeof cfg.split === 'object' ? { ...cfg.split, pctById: { ...(cfg.split.pctById || {}) } } : { mode: 'half', pctById: {} };
    if (split.mode === 'custom') { const theirs = split.pctById[v.fromId]; if (Number.isFinite(theirs)) split.pctById[me] = 100 - theirs; else split.mode = 'half'; }
    data.settings.household = h = cleanHousehold({ personId: me, partnerId: v.fromId, config: { names, incomes: cfg.incomes || {}, split, budgetMinor: cfg.budgetMinor, configAt: cfg.configAt } });
    created = true;
  } else if (v.config && typeof v.config === 'object') {
    const theirs = cleanHousehold({ personId: v.fromId, partnerId: h.personId, config: v.config })?.config;
    if (theirs && theirs.configAt > h.config.configAt) {
      const mePct = theirs.split.pctById[v.fromId];
      const merged = { ...theirs, names: { ...theirs.names, [h.personId]: h.config.names[h.personId] }, incomes: { ...theirs.incomes } };
      if (merged.split.mode === 'custom' && Number.isFinite(mePct)) merged.split = { mode: 'custom', pctById: { [v.fromId]: mePct, [h.personId]: 100 - mePct } };
      h.config = merged;
    }
  }
  data.sharedIn = data.sharedIn.filter((x) => x.personId !== v.fromId);
  const stamp = now;
  for (const t of v.txns) data.sharedIn.push({ ...t, updatedAt: stamp });
  h.lastImportAt = now;
  return { ok: true, created, count: v.txns.length };
}
