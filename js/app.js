// Start-up, routing, event delegation, locking. Nothing here uses the network except loading its own files.
import { app } from './ui/ctx.js';
import * as persist from './persist.js';
import { Store, emptyData, COLLS, DEFAULT_SETTINGS } from './store.js';
import { html, $, $$, actions, forms, inputs, changes, toast, closeSheet, closeAllSheets, sheetOpen, clearErrors, pageHeader, emptyState, icon } from './ui/kit.js';
import { syncSwitch, autoCategorize, refreshMulti } from './ui/editors.js';
import './ui/dataio.js';
import { overview } from './ui/overview.js';
import { activity } from './ui/activity.js';
import { calendar } from './ui/calendar.js';
import { upcoming, recurring } from './ui/upcoming.js';
import { savings, goalDetail } from './ui/savings.js';
import * as St from './ui/settings.js';
import { onboarding } from './ui/onboarding.js';
import { planScreen } from './ui/plan.js';
import { timeline } from './ui/timeline.js';
import './ui/workpay.js';
import { bankImport } from './ui/bankimport.js';
import { debts, debtDetail } from './ui/debts.js';
import { showLock } from './ui/lock.js';
import { today } from './dates.js';
import { play, setSoundEnabled } from './sound.js';

app.persist = persist;

const ROUTES = [
  [/^\/overview$/, overview, 'overview'], [/^\/activity$/, activity, 'activity'], [/^\/calendar$/, calendar, 'calendar'],
  [/^\/upcoming$/, upcoming, 'upcoming'], [/^\/savings$/, savings, 'savings'], [/^\/goal\/(.+)$/, (m) => goalDetail({ id: m[1] }), 'savings'],
  [/^\/recurring$/, recurring, 'upcoming'], [/^\/insights$/, St.insights, 'overview'],
  [/^\/settings$/, St.settings, 'overview'], [/^\/settings\/preferences$/, St.preferences, 'overview'],
  [/^\/settings\/pay$/, St.payScreen, 'overview'], [/^\/settings\/plan$/, planScreen, 'overview'], [/^\/timeline$/, timeline, 'overview'], [/^\/settings\/accounts$/, St.accountsScreen, 'overview'], [/^\/settings\/categories$/, St.categoriesScreen, 'overview'],
  [/^\/settings\/budgets$/, St.budgetsScreen, 'overview'], [/^\/settings\/security$/, St.security, 'overview'],
  [/^\/settings\/data$/, St.dataScreen, 'overview'], [/^\/settings\/bank$/, bankImport, 'overview'], [/^\/debts$/, debts, 'savings'], [/^\/debt\/(.+)$/, (m) => debtDetail({ id: m[1] }), 'savings'], [/^\/settings\/about$/, St.about, 'overview'],
];
const TITLES = { overview: 'Overview', activity: 'Activity', calendar: 'Calendar', upcoming: 'Upcoming', savings: 'Savings' };

// ---------- rendering ----------
let queued = false;
export function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; doRender(); });
}
app.render = render;

function applyTheme() {
  const t = app.store?.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]')?.setAttribute('content', dark ? '#1C1822' : '#CFD6EA');
}

function doRender() {
  if (!app.store) return;
  applyTheme();
  setSoundEnabled(app.store.settings.sound !== false);
  const portrait = app.store.settings.orientation === 'portrait';
  document.body.classList.toggle('portrait-only', portrait);
  try { if (portrait) screen.orientation?.lock?.('portrait').catch(() => {}); else screen.orientation?.unlock?.(); } catch { /* not supported here */ }
  const view = $('#view');
  const onboarding_ = !app.store.settings.onboarded;
  document.body.classList.toggle('onboarding', onboarding_);
  let out, tab = 'overview', hash = '';
  try {
    if (onboarding_) { out = onboarding(); hash = '#onboarding'; }
    else {
      hash = location.hash || '#/overview';
      const path = hash.replace(/^#/, '') || '/overview';
      let found = null;
      for (const [re, fn, t] of ROUTES) { const m = path.match(re); if (m) { found = { fn, m, t }; break; } }
      if (!found) { location.replace('#/overview'); return; }
      tab = found.t;
      out = found.fn(found.m);
    }
    view.innerHTML = out.html.s;
    const goalOrDetail = /^#\/goal\//.test(hash);
    view.className = onboarding_ ? '' : (tab === 'overview' && /^#\/overview$/.test(hash) ? 'dash' : tab === 'savings' && !goalOrDetail ? 'dash' : tab === 'calendar' ? 'cal' : 'narrow');
  } catch (err) {
    console.error(err);
    view.innerHTML = html`${pageHeader('Something went wrong')}<div class="card"><p>This screen couldn’t be shown. Your data is safe.</p><p class="muted">${String(err.message || err)}</p><a class="btn" href="#/overview">Back to overview</a></div>`.s;
  }
  $$('#tabs a').forEach((a) => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (app.route !== hash) {
    view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
    window.scrollTo(0, 0);
    const h1 = $('#view h1');
    if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
    document.title = onboarding_ ? 'Sallo' : (TITLES[tab] ? TITLES[tab] + ' · ' : '') + 'Sallo';
    app.route = hash;
  }
  const banner = $('#storage-banner');
  if (banner) banner.hidden = persist.status.ok;
}

// ---------- start / lock ----------
function migrate(data) {
  data.settings = { ...DEFAULT_SETTINGS(), ...(data.settings || {}) };
  for (const c of COLLS) if (!Array.isArray(data[c])) data[c] = [];
  return data;
}
function start(data) {
  app.store = new Store(migrate(data), { onChange: (d) => { persist.save(d); render(); } });
  app.store.ensureHorizon();
  $('#lock-root').hidden = true;
  document.body.classList.remove('locked');
  render();
}
app.lockNow = async () => {
  if (!persist.lockEnabled()) return;
  await persist.lockNow();
  app.store = null; app.route = '';
  closeAllSheets();
  $('#view').innerHTML = '';
  showLock(start);
};

async function boot() {
  const r = await persist.init();
  if (r.state === 'locked') { showLock(start); }
  else if (r.state === 'empty') { const d = emptyData(); await persist.createFirst(d); start(d); }
  else start(r.data);
  registerSW();
}

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const tabLink = e.target.closest('#tabs a');
  if (tabLink) play('tab');
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  play(/paid|done|complete|contrib|import|save/.test(el.dataset.act) ? 'success' : /new|open|edit/.test(el.dataset.act) ? 'open' : /close|cancel|back/.test(el.dataset.act) ? 'close' : 'tap');
  if (el.tagName === 'BUTTON' || el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault();
  try { await fn(el, e); } catch (err) { console.error(err); toast(err.message || 'Something went wrong.'); }
  render();
});
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) { if (e.target.closest('form')) e.preventDefault(); return; }
  e.preventDefault();
  clearErrors(form);
  const h = forms[form.dataset.form];
  if (!h) return;
  let stayPut = false;
  try {
    const ok = await h(new FormData(form), form);
    stayPut = ok === false && !form.closest('.sheet') && !!form.querySelector('.err:not(:empty)');
    if (ok !== false) play('success');
    if (ok !== false && form.closest('.sheet')) closeSheet();
  } catch (err) { console.error(err); toast(err.message || 'Something went wrong.'); }
  if (!stayPut) render(); // a rejected form keeps its error messages on screen
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el) inputs[el.dataset.input]?.(el, e);
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  const form = t.closest?.('form');
  if (t.type === 'radio' && form?.dataset.switch === t.name) { syncSwitch(form); autoCategorize(form); refreshMulti(form); }
  const el = t.closest?.('[data-change]');
  if (el) {
    const name = el.dataset.change;
    try { await changes[name]?.(el === form ? t : el, e); } catch (err) { console.error(err); toast(err.message || 'Something went wrong.'); }
    render();
  }
});
actions.back = () => { if (history.length > 1 && document.referrer !== undefined && app.route) history.back(); else location.hash = '#/settings'; };
window.addEventListener('hashchange', () => { closeAllSheets(); render(); });

// Lock when the app has been away, and cover the screen in app switchers.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    persist.flush();
    if (persist.lockEnabled() && app.store) document.body.classList.add('shield');
  } else {
    document.body.classList.remove('shield');
    if (!app.store) return;
    if (persist.lockEnabled()) {
      const away = (Date.now() - hiddenAt) / 60000;
      if (hiddenAt && away >= persist.autoLockMin()) { app.lockNow(); return; }
    }
    if (app.store.ensureHorizon()) { /* new day: rolling window extended */ }
    render();
  }
});
window.addEventListener('pagehide', () => { persist.flush(); });

// ---------- offline support ----------
function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('A new version is ready.', { undo: () => location.reload(), label: 'Reload', ms: 12000 });
      });
    });
  }).catch(() => { /* offline support is optional */ });
}

boot().catch((err) => {
  console.error(err);
  $('#view').innerHTML = html`<div class="card"><h2>Sallo couldn’t start</h2><p class="muted">${String(err.message || err)}</p></div>`.s;
});
window.__sallo = app; // handy for debugging in the console; holds no secrets beyond what is already on screen
