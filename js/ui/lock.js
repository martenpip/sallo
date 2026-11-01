import { app } from './ctx.js';
import { html, icon, $, actions, forms, openSheet, closeSheet, confirmSheet, field } from './kit.js';
import { WrongSecretError } from '../vault.js';

let tick = null;

export function showLock(onUnlocked) {
  const root = $('#lock-root');
  document.body.classList.add('locked');
  root.hidden = false;
  root.innerHTML = html`<div class="lock-card" role="dialog" aria-modal="true" aria-labelledby="lock-h">
    <div class="lock-ico">${icon('lock', 32)}</div><h1 id="lock-h">Sallo is locked</h1>
    <form id="lock-form" novalidate><label class="field"><span class="sr">Passcode</span><input id="lock-pass" type="password" autocomplete="current-password" placeholder="Passcode" autofocus></label>
      <p class="err" id="lock-err" role="alert"></p><button class="btn primary block" type="submit">Unlock</button></form>
    <button class="link" id="lock-forgot">Forgot your passcode?</button></div>`.s;
  const form = $('#lock-form'), input = $('#lock-pass'), err = $('#lock-err');
  const countdown = () => {
    clearInterval(tick);
    const s = app.persist.lockoutSeconds();
    if (s > 0) {
      err.textContent = `Too many attempts. Try again in ${s} s.`;
      tick = setInterval(() => { const r = app.persist.lockoutSeconds(); if (r <= 0) { clearInterval(tick); err.textContent = ''; } else err.textContent = `Too many attempts. Try again in ${r} s.`; }, 500);
    }
  };
  countdown();
  setTimeout(() => input.focus(), 50);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Unlocking…'; err.textContent = '';
    try {
      const data = await app.persist.unlock(input.value);
      input.value = '';
      root.hidden = true; root.innerHTML = ''; document.body.classList.remove('locked');
      onUnlocked(data);
    } catch (ex) {
      err.textContent = ex instanceof WrongSecretError ? 'That passcode didn’t work.' : ex.message;
      input.select();
      countdown();
    } finally { btn.disabled = false; btn.textContent = 'Unlock'; }
  });
  $('#lock-forgot').addEventListener('click', async () => {
    const ok = await confirmSheet({ title: 'Forgot your passcode?', message: 'There is no way to recover the data without it. You can erase this device and start again, then import a backup file if you have one.', confirmLabel: 'Erase and start over', danger: true, requireText: 'ERASE' });
    if (!ok) return;
    await app.persist.wipe();
    location.hash = ''; location.reload();
  });
}
