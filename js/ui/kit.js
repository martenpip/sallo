// Small UI toolkit: safe HTML templates, icons, formatting, sheets, toasts.
import { app, S } from './ctx.js';
import { formatMoney, currencyInfo } from '../money.js';
import { formatDate } from '../dates.js';
import { getLang, tr, compile } from '../i18n.js';

// ---------- safe html templates (everything interpolated is escaped) ----------
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const str = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(str).join('') : v == null || v === false ? '' : esc(v));
const compiled = new WeakMap();
export function html(strings, ...vals) {
  if (getLang() === 'en') {
    let out = strings[0];
    vals.forEach((v, i) => { out += str(v) + strings[i + 1]; });
    return new Raw(out);
  }
  let c = compiled.get(strings);
  if (!c || c.lang !== getLang()) { c = { lang: getLang(), parts: compile(strings) }; compiled.set(strings, c); }
  let out = '';
  for (const p of c.parts) {
    if (typeof p === 'string') out += p;
    else if (p.pl !== undefined) out += str(vals[p.i]) ? p.pl : '';
    else { const v = vals[p.i]; out += str(typeof v === 'string' ? tr(v) : v); }
  }
  return new Raw(out);
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- icons ----------
const P = {
  pie: 'M12 3a9 9 0 109 9h-9zM15 2.6A9 9 0 0121.4 9H15z',
  home: 'M3 11l9-8 9 8M5 10v10h14V10', list: 'M4 6h16M4 12h16M4 18h10',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  piggy: 'M5 11c0-3 3-5 7-5s7 2 7 5c0 2-1 3-2 4v3h-3v-2h-4v2H7v-3c-1-1-2-2-2-4zM16 10h.01',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  back: 'M15 5l-7 7 7 7', next: 'M9 5l7 7-7 7', down: 'M6 9l6 6 6-6', check: 'M5 12l5 5 9-10', x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', edit: 'M4 20l4-1 11-11-3-3L5 16l-1 4z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  eyeoff: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM3 3l18 18',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18', cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  card: 'M3 6h18v12H3zM3 10h18M6 15h4', wallet: 'M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V7zM4 7l12-3v3M16 14h2',
  cart: 'M3 4h2l2 11h11l2-8H6M9 20h.01M17 20h.01', food: 'M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 3c-2 2-2 6 0 8v10',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6l1-7z', heart: 'M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z',
  bag: 'M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 016 0v2', ticket: 'M4 8h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4V8z',
  plane: 'M3 13l18-8-6 16-3-7-9-1z', tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01',
  gift: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0',
  car: 'M5 16v-5l2-5h10l2 5v5M3 16h18M7 19v-3M17 19v-3M7 12h10',
  repeat: 'M17 3l3 3-3 3M20 6H8a4 4 0 00-4 4M7 21l-3-3 3-3M4 18h12a4 4 0 004-4',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14', upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3', info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8h.01',
  target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  transfer: 'M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4', share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4l2-2zM10 20h4', pause: 'M8 5v14M16 5v14', play: 'M7 4l12 8-12 8z',
};
export const ICON_KEYS = ['cart', 'home', 'car', 'food', 'bolt', 'heart', 'bag', 'ticket', 'plane', 'tag', 'cash', 'gift', 'bank', 'wallet', 'card', 'piggy', 'target'];
export function icon(name, size = 20) {
  const d = P[name] || P.tag;
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`);
}

// ---------- formatting bound to settings ----------
export const cur = () => currencyInfo(S().currency);
export function money(minor, opts = {}) {
  if (S().hideAmounts && !opts.force) return '••••';
  return formatMoney(minor, S().currency, { locale: S().locale || undefined, ...opts });
}
export const dateText = (iso, o) => formatDate(iso, S().locale || undefined, o);
export function amountSpan(minor, type) {
  const cls = type === 'income' ? 'amt in' : type === 'expense' ? 'amt out' : 'amt';
  const signed = type === 'income' ? money(minor, { sign: true }) : type === 'expense' ? money(-Math.abs(minor)) : money(minor);
  return html`<span class="${cls}">${signed}</span>`;
}

// ---------- shared bits ----------
const AV = ['#8A7090', '#A4AF69', '#C98B5E', '#5F8FB8', '#C77D96', '#4F8A6A', '#D1A24A', '#7C79C2'];
export function avatar(key, seed = '') {
  let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return html`<span class="badge av" style="--c:${AV[h % AV.length]}" aria-hidden="true">${icon(key, 20)}</span>`;
}
export const badge = (key, label) => html`<span class="badge" aria-hidden="true">${icon(key, 18)}</span>`;
export const emptyState = (title, text, action) => html`<div class="empty"><div class="empty-ico">${icon('piggy', 28)}</div><h3>${title}</h3><p>${text}</p>${action || ''}</div>`;
export const chip = (label, tone = '') => html`<span class="chip ${tone}">${label}</span>`;
export function progress(pct, tone = '', label = '') {
  const p = Math.max(0, Math.min(100, pct));
  return html`<div class="bar ${tone}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${label}"><i style="width:${p}%"></i></div>`;
}
export function pageHeader(title, { back = false, right = '' } = {}) {
  return html`<header class="ph">${back ? html`<button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>` : ''}<h1>${title}</h1><div class="ph-right">${right}</div></header>`;
}

// ---------- actions registry (event delegation) ----------
export const actions = {};
export const forms = {};
export const inputs = {};
export const changes = {};

// ---------- toast ----------
let toastTimer;
export function toast(msg, { undo, label = 'Undo', ms = 4500 } = {}) {
  const el = $('#toast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.innerHTML = html`<span>${msg}</span>${undo ? html`<button data-act="toast-undo">${label}</button>` : ''}`.s;
  el.classList.add('show');
  el._undo = undo || null;
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
actions['toast-undo'] = () => {
  const el = $('#toast');
  const u = el._undo; el._undo = null; el.classList.remove('show');
  if (u) u();
};

// ---------- sheets (stackable, focus-trapped) ----------
const stack = [];
export function openSheet(title, body, { wide = false, onClose } = {}) {
  const root = $('#sheet-root');
  const id = 'sheet-' + (stack.length + 1) + '-' + Math.random().toString(36).slice(2, 6);
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = html`<div class="scrim" data-act="sheet-close"></div>
    <section class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <div class="sheet-head"><h2 id="${id}">${title}</h2><button class="icon-btn" data-act="sheet-close" aria-label="Close">${icon('x')}</button></div>
      <div class="sheet-body">${body}</div></section>`.s;
  wrap.style.zIndex = String(50 + stack.length * 2);
  root.appendChild(wrap);
  document.body.classList.add('noscroll');
  const entry = { wrap, prev: document.activeElement, onClose };
  stack.push(entry);
  const first = wrap.querySelector('[autofocus], input:not([type=hidden]):not([type=radio]), select, textarea') || wrap.querySelector('.sheet');
  requestAnimationFrame(() => { wrap.classList.add('open'); (first.focus ? first : wrap).focus?.({ preventScroll: true }); });
  return entry;
}
export function closeSheet() {
  const e = stack.pop();
  if (!e) return;
  e.wrap.remove();
  if (!stack.length) document.body.classList.remove('noscroll');
  try { e.prev?.focus?.({ preventScroll: true }); } catch { /* element gone */ }
  e.onClose?.();
}
export const closeAllSheets = () => { while (stack.length) closeSheet(); };
export const sheetOpen = () => stack.length > 0;
actions['sheet-close'] = () => closeSheet();
document.addEventListener('keydown', (e) => {
  if (!stack.length) return;
  const top = stack[stack.length - 1].wrap;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key === 'Tab') {
    const f = [...top.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !top.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/** Promise-based confirmation inside a sheet (window.confirm is unreliable in installed web apps). */
export function confirmSheet({ title, message, confirmLabel = 'Confirm', danger = false, requireText = '' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    openSheet(title, html`<p class="muted">${message}</p>
      ${requireText ? html`<label class="field"><span>Type ${requireText} to continue</span><input id="confirm-text" autocomplete="off" autocapitalize="characters"></label>` : ''}
      <div class="btn-row"><button class="btn ghost" data-act="confirm-no">Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirm-yes" ${requireText ? 'disabled' : ''}>${confirmLabel}</button></div>`, { onClose: () => finish(false) });
    const wrap = stack[stack.length - 1].wrap;
    wrap.querySelector('[data-act=confirm-no]').addEventListener('click', () => { closeSheet(); });
    wrap.querySelector('[data-act=confirm-yes]').addEventListener('click', () => { finish(true); closeSheet(); });
    const t = wrap.querySelector('#confirm-text');
    t?.addEventListener('input', () => { wrap.querySelector('[data-act=confirm-yes]').disabled = (v => v !== requireText.toUpperCase() && v !== tr(requireText).toUpperCase())(t.value.trim().toUpperCase()); });
  });
}

// ---------- form helpers ----------
export const field = (label, control, hint = '', id = '') => html`<label class="field"${id ? raw(` for="${esc(id)}"`) : ''}><span>${label}</span>${control}${hint ? html`<small class="hint">${hint}</small>` : ''}<small class="err" role="alert"></small></label>`;
export function showError(formEl, name, msg) {
  const input = formEl.elements[name];
  const f = input?.closest?.('.field');
  const err = f?.querySelector('.err');
  if (err) err.textContent = tr(msg || '');
  if (msg) input?.focus?.();
}
export const clearErrors = (formEl) => $$('.err', formEl).forEach((e) => { e.textContent = ''; });
export function segmented(name, options, value) {
  return html`<div class="seg" role="radiogroup">${options.map(([v, label]) => html`<label><input type="radio" name="${name}" value="${v}" ${v === value ? 'checked' : ''}><span>${label}</span></label>`)}</div>`;
}
export function options(list, selected, { empty } = {}) {
  return html`${empty !== undefined ? html`<option value="">${empty}</option>` : ''}${list.map(([v, l]) => html`<option value="${v}" ${v === selected ? 'selected' : ''}>${l}</option>`)}`;
}
