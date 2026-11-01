// Couples: a shared household budget across two phones, with no server.
import { app } from './ctx.js';
import { html, icon, money, dateText, pageHeader, actions, forms, changes, emptyState, progress, chip, badge, field, segmented, openSheet, closeSheet, confirmSheet, toast, showError, $ } from './kit.js';
import { amountField, textField, readAmount, buttons } from './editors.js';
import { periodNav, periodLabel } from './overview.js';
import { ledger, buildShareFile, validateShare, applyShare, sharePct } from '../household.js';
import { cleanHousehold, uid } from '../store.js';
import { saveFile, canShareFiles } from './dataio.js';
import { monthlyPay } from './guard.js';
import { today, periodFor, shiftPeriod, dayDiff } from '../dates.js';
import { minorToPlain, parseMinor, currencyInfo } from '../money.js';

const st = () => app.store;
const hhOf = () => st().settings.household;
const nameOf = (h, id) => h.config.names[id];
const cur = () => currencyInfo(st().settings.currency);

/** What the Overview card needs, without any screen code. */
export function householdSummary() {
  const s = st(), h = hhOf();
  if (!h) return null;
  const p = periodFor(today(), s.settings.monthStart);
  const mine = s.data.txns.filter((t) => t.shared && t.type === 'expense');
  const l = ledger({ household: h, mine, theirs: s.data.sharedIn, start: p.start, endExclusive: p.endExclusive });
  return { h, l, budget: h.config.budgetMinor };
}
const owesText = (h, l) => (l.balance === 0 || l.total === 0 ? 'You’re even' : l.balance > 0 ? `${nameOf(h, h.partnerId)} owes you ${money(l.balance)}` : `You owe ${nameOf(h, h.partnerId)} ${money(-l.balance)}`);
export { owesText };

export function household() {
  const s = st(), h = hhOf();
  const head = pageHeader('Couples', { back: true, right: h ? html`<button class="icon-btn" data-act="hh-edit" aria-label="Names, split and budget">${icon('sliders')}</button>` : '' });
  if (!h) return {
    html: html`${head}
    <section class="card hero"><span class="trophy-badge">${icon('heart', 30)}</span><h2>A budget for two</h2>
      <p class="muted">Each of you keeps your own Sallo on your own phone, with your own private accounts. You mark some expenses as <b>shared</b>, send each other a small file now and then, and Sallo shows the household total, who paid what, and who owes whom.</p>
      <p class="muted">Nothing goes through a server. Only expenses you tick as shared are in the file.</p>
      <button class="btn primary block" data-act="hh-setup">Set it up</button>
      <p class="hint">Already got a file from your partner? <button class="link" data-act="hh-import-pick">Import it</button> and Sallo sets this up for you.</p>
      <input type="file" id="hh-file" data-change="hh-file" accept=".json,.sallo,application/json,text/plain" hidden></section>`,
  };
  const t = today();
  app.ui.hhShift ||= 0;
  const p = shiftPeriod(periodFor(t, s.settings.monthStart), app.ui.hhShift);
  const mineAll = s.data.txns.filter((x) => x.shared && x.type === 'expense');
  const l = ledger({ household: h, mine: mineAll, theirs: s.data.sharedIn, start: p.start, endExclusive: p.endExclusive });
  const me = nameOf(h, h.personId), her = nameOf(h, h.partnerId);
  const budget = h.config.budgetMinor, pct = budget ? Math.min(100, Math.round((l.total * 100) / budget)) : 0;
  const list = [
    ...mineAll.filter((x) => x.date >= p.start && x.date < p.endExclusive).map((x) => ({ date: x.date, name: x.name || s.category(x.categoryId)?.name || 'Expense', cat: s.category(x.categoryId)?.name || '', amt: x.amountMinor, by: me, mine: true, id: x.id })),
    ...s.data.sharedIn.filter((x) => x.date >= p.start && x.date < p.endExclusive).map((x) => ({ date: x.date, name: x.name || x.categoryName || 'Expense', cat: x.categoryName, amt: x.amountMinor, by: her, mine: false, id: x.id })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const age = h.lastImportAt ? dayDiff(t, h.lastImportAt.slice(0, 10)) : null;
  const maxCat = l.byCategory[0]?.amount || 1;
  return {
    html: html`${head}
    <section class="card">${periodNav(p, periodLabel(p, s.settings.monthStart, s.settings.locale), 'hh-prev', 'hh-next', app.ui.hhShift === 0, 'hh-now')}
      <p class="eyebrow">Spent together</p><div class="hero-amt">${money(l.total)}</div>
      ${budget ? html`${progress(pct, l.total > budget ? 'over' : pct >= 85 ? 'near' : 'sage', 'Shared budget used')}<p class="muted">${l.total > budget ? html`Over the shared budget by <b>${money(l.total - budget)}</b>` : html`<b>${money(budget - l.total)}</b> left of the ${money(budget)} shared budget`}</p>`
        : html`<p class="muted">No shared budget set. <button class="link" data-act="hh-edit">Add one</button></p>`}</section>
    <section class="card"><h2>Who paid, who owes</h2>
      <div class="trio"><div><span class="eyebrow">${me} paid</span><b class="amt">${money(l.paidMe)}</b></div><div><span class="eyebrow">${her} paid</span><b class="amt">${money(l.paidThem)}</b></div>
        <div><span class="eyebrow">Split</span><b>${Math.round(l.pct)} / ${100 - Math.round(l.pct)}</b></div></div>
      <p class="owes ${l.balance === 0 || !l.total ? '' : l.balance > 0 ? 'in' : 'out'}">${icon(l.balance === 0 || !l.total ? 'check' : 'transfer', 18)} <b>${owesText(h, l)}</b></p>
      <p class="hint">${me}’s fair share is ${money(l.shareMe)} and ${her}’s is ${money(l.shareThem)}, ${h.config.split.mode === 'income' ? 'split by income' : h.config.split.mode === 'custom' ? 'split your own way' : 'split evenly'}. This is for the month shown. Settle up however you like, it doesn’t move any money here.</p></section>
    ${l.byCategory.length ? html`<section class="card"><h2>What it went on</h2><ul class="plain bars">${l.byCategory.slice(0, 6).map((c) => html`<li><div class="bar-label"><span>${c.name}</span><b>${money(c.amount)}</b></div><div class="bar"><i style="width:${Math.max(3, Math.round((c.amount / maxCat) * 100))}%"></i></div></li>`)}</ul></section>` : ''}
    <h2 class="sec">Shared expenses</h2>
    ${list.length ? html`<div class="list card flush">${list.map((x) => html`<div class="row"><button class="row-main" ${x.mine ? html`data-act="txn-open" data-id="${x.id}"` : ''}>${badge(x.mine ? 'wallet' : 'heart')}<span class="row-text"><b>${x.name}</b><small>${dateText(x.date, { day: 'numeric', month: 'short' })}${x.cat ? ' · ' + x.cat : ''} ${chip(x.by + ' paid', x.mine ? 'accent' : '')}</small></span><span class="row-amt"><span class="amt out">${money(x.amt)}</span></span></button></div>`)}</div>`
      : emptyState('Nothing shared this month', 'When you add an expense, tick “Shared with ' + her + '”. Your partner’s shared expenses appear after you import their file.')}
    <section class="card"><h2>Keep in step</h2>
      <p class="muted">Send ${her} your shared expenses, and import theirs. Do it whenever you want fresh numbers, for example once a week.</p>
      <div class="stack"><button class="btn primary" data-act="hh-send">${icon('upload', 18)} Send my shared expenses</button>
        <button class="btn" data-act="hh-import-pick">${icon('download', 18)} Import ${her}’s file</button></div>
      <input type="file" id="hh-file" data-change="hh-file" accept=".json,.sallo,application/json,text/plain" hidden>
      <p class="hint">${h.lastImportAt ? `${her}’s file was imported ${age === 0 ? 'today' : age === 1 ? 'yesterday' : age + ' days ago'}${age > 14 ? '. It’s getting old, ask for a fresh one.' : '.'}` : `You haven’t imported anything from ${her} yet.`}${h.lastExportAt ? ` You last sent yours ${dateText(h.lastExportAt.slice(0, 10), { day: 'numeric', month: 'short' })}.` : ''}</p>
      <p class="hint">The file contains only the expenses you ticked as shared, plus names, your split and the shared budget. Anyone who gets the file can read those, so send it only to ${her}.</p></section>`,
  };
}
actions['hh-prev'] = () => { app.ui.hhShift = (app.ui.hhShift || 0) - 1; };
actions['hh-next'] = () => { app.ui.hhShift = (app.ui.hhShift || 0) + 1; };
actions['hh-now'] = () => { app.ui.hhShift = 0; };

// ---------- set up / edit ----------
function editor(h) {
  const me = h ? nameOf(h, h.personId) : '', her = h ? nameOf(h, h.partnerId) : '';
  const c = h?.config;
  const mode = c?.split.mode || 'half';
  const myInc = c?.incomes[h.personId] || monthlyPay() || null, herInc = c?.incomes[h?.partnerId] || null;
  return html`<form data-form="household" novalidate>
    ${textField('me', 'Your name', me === 'Me' ? '' : me, { required: true, ph: 'Joe', max: 30 })}
    ${textField('her', 'Your partner’s name', her === 'Partner' ? '' : her, { required: true, ph: 'Darla', max: 30 })}
    <fieldset class="seg-field"><legend>How do you split shared costs?</legend>${segmented('mode', [['half', 'Half each'], ['income', 'By income'], ['custom', 'My own split']], mode)}</fieldset>
    ${amountField('myInc', myInc, 'Your monthly income', { hint: 'Used when splitting by income. Your partner sees it in the file.' })}
    ${amountField('herInc', herInc, 'Your partner’s monthly income', { hint: 'Ask them. Only used when splitting by income.' })}
    ${field('Your share for “my own split” (%)', html`<input id="f-pct" name="pct" type="number" min="0" max="100" inputmode="numeric" value="${Math.round(c?.split.pctById[h.personId] ?? 50)}">`, 'Your partner pays the rest.', 'f-pct')}
    ${amountField('budget', c?.budgetMinor || null, 'Shared monthly budget (optional)', { hint: 'What you two want to spend together in a month.' })}
    ${buttons({ saveLabel: h ? 'Save' : 'Start' })}</form>`;
}
actions['hh-setup'] = () => openSheet('Set up couples', editor(null));
actions['hh-edit'] = () => openSheet('Couples settings', editor(hhOf()));
forms.household = (fd, form) => {
  const s = st(), exp = cur().exp;
  const me = String(fd.get('me') || '').trim(), her = String(fd.get('her') || '').trim();
  if (!me) { showError(form, 'me', 'Enter your name.'); return false; }
  if (!her) { showError(form, 'her', 'Enter your partner’s name.'); return false; }
  const num = (k) => { const raw = String(fd.get(k) || '').trim(); if (!raw) return 0; const v = parseMinor(raw, exp); return v === null || v < 0 ? undefined : v; };
  const myInc = num('myInc'), herInc = num('herInc'), budget = num('budget');
  if (myInc === undefined) { showError(form, 'myInc', 'Enter an amount like 1400.'); return false; }
  if (herInc === undefined) { showError(form, 'herInc', 'Enter an amount like 1400.'); return false; }
  if (budget === undefined) { showError(form, 'budget', 'Enter an amount like 800.'); return false; }
  const mode = ['half', 'income', 'custom'].includes(fd.get('mode')) ? fd.get('mode') : 'half';
  const pct = Number(fd.get('pct'));
  if (mode === 'custom' && !(pct >= 0 && pct <= 100)) { showError(form, 'pct', 'Enter a percentage from 0 to 100.'); return false; }
  if (mode === 'income' && !(myInc > 0 && herInc > 0)) { showError(form, 'herInc', 'Enter both incomes to split by income.'); return false; }
  const old = hhOf();
  const personId = old?.personId || uid(), partnerId = old?.partnerId || uid(); // a not-yet-linked partner gets an id that the first file replaces
  const config = { names: { [personId]: me, [partnerId]: her }, incomes: { [personId]: myInc, [partnerId]: herInc }, split: { mode, pctById: { [personId]: pct || 50, [partnerId]: 100 - (pct || 50) } }, budgetMinor: budget, configAt: new Date().toISOString() };
  s.setSettings({ household: cleanHousehold({ personId, partnerId, partnerLinked: old ? old.partnerLinked : false, lastImportAt: old?.lastImportAt || null, lastExportAt: old?.lastExportAt || null, config }) });
  toast(old ? 'Saved' : 'Couples is on. Tick “Shared” on expenses you split.');
  return true;
};

// ---------- send / receive ----------
actions['hh-send'] = async () => {
  const s = st(), h = hhOf(); if (!h) return;
  const file = buildShareFile(s.data, { today: today() });
  const her = nameOf(h, h.partnerId);
  const res = await saveFile(`sallo-shared-${nameOf(h, h.personId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}.json`, JSON.stringify(file), 'application/json', { share: canShareFiles() });
  if (res === 'cancelled') return;
  s.setSettings({ household: { ...h, lastExportAt: new Date().toISOString() } });
  toast(res === 'shared' ? `Ready to send to ${her}` : `File saved. Send it to ${her}.`);
};
actions['hh-import-pick'] = () => { const i = $('#hh-file'); if (i) { i.value = ''; i.click(); } };
changes['hh-file'] = async (input) => {
  const f = input.files?.[0]; if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('That file is too large.'); return; }
  let obj; try { obj = JSON.parse(await f.text()); } catch { toast('That doesn’t look like a Sallo shared file.'); return; }
  await importShare(obj);
};
export async function importShare(obj) {
  let v;
  try { v = validateShare(obj); } catch (e) { toast(e.message); return; }
  const s = st();
  let r = applyShare(s.data, v);
  if (!r.ok) {
    const ok = await confirmSheet({ title: 'A different partner?', message: `Your couples setup is linked to someone else. Importing this file from ${v.fromName} replaces the shared expenses you received before.`, confirmLabel: 'Replace', danger: true });
    if (!ok) return;
    r = applyShare(s.data, v, { force: true });
  }
  s.commit();
  location.hash = '#/household';
  toast(r.created ? `Linked with ${v.fromName}. Check your names and split.` : `Imported ${r.count} shared expense${r.count === 1 ? '' : 's'} from ${v.fromName}`);
  if (r.created) setTimeout(() => actions['hh-edit']?.(), 400);
}
app.importHousehold = importShare;
