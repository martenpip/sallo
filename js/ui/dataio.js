// Export and import. Everything happens in the browser; files go only where the person saves them.
import { app } from './ctx.js';
import { html, esc, openSheet, closeSheet, closeAllSheets, confirmSheet, toast, actions, forms, changes, field, segmented, showError, $ } from './kit.js';
import { buildExport, validateImport, mergeData, transactionsCsv } from '../store.js';
import { minorToPlain, currencyInfo } from '../money.js';
import { today } from '../dates.js';
import * as V from '../vault.js';

const MAX_BYTES = 30 * 1024 * 1024;
const stamp = () => today();

/** Saves a text file: share sheet where available and asked for, otherwise a normal download. */
export async function saveFile(filename, text, mime, { share = false } = {}) {
  const file = new File([text], filename, { type: mime });
  if (share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return 'downloaded';
}
export const canShareFiles = () => { try { return !!navigator.canShare?.({ files: [new File(['x'], 'x.json', { type: 'application/json' })] }); } catch { return false; } };

const markExported = () => app.store.setSettings({ lastExportAt: new Date().toISOString() });

actions['export-json'] = async (el) => {
  const res = await saveFile(`sallo-backup-${stamp()}.json`, JSON.stringify(buildExport(app.store.data)), 'application/json', { share: el.dataset.share === '1' });
  if (res !== 'cancelled') { markExported(); toast(res === 'shared' ? 'Backup shared' : 'Backup file saved'); }
};
actions['export-csv'] = async () => {
  const csv = '﻿' + transactionsCsv(app.store.data, minorToPlain, currencyInfo(app.store.settings.currency));
  const res = await saveFile(`sallo-transactions-${stamp()}.csv`, csv, 'text/csv');
  if (res !== 'cancelled') toast('Spreadsheet file saved');
};

actions['export-enc'] = () => openSheet('Encrypted backup', html`
  <form data-form="encexport" novalidate>
    <p class="muted">The file is locked with a passphrase you choose. Without it, nobody can read the file, including you. Write it down somewhere safe.</p>
    ${field('Passphrase', html`<input id="f-pass" name="pass" type="password" autocomplete="new-password" minlength="8">`, 'At least 8 characters. A few random words works well.', 'f-pass')}
    ${field('Repeat passphrase', html`<input id="f-pass2" name="pass2" type="password" autocomplete="new-password">`, '', 'f-pass2')}
    <div class="btn-row"><span class="grow"></span><button type="button" class="btn ghost" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit">Save encrypted file</button></div>
  </form>`);
forms.encexport = async (fd, form) => {
  const p1 = String(fd.get('pass') || ''), p2 = String(fd.get('pass2') || '');
  if (p1.length < 8) { showError(form, 'pass', 'Use at least 8 characters.'); return false; }
  if (p1 !== p2) { showError(form, 'pass2', 'The two passphrases don’t match.'); return false; }
  const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Encrypting…';
  try {
    const text = await V.encryptBackup(buildExport(app.store.data), p1);
    const res = await saveFile(`sallo-backup-${stamp()}.sallo`, text, 'application/json', { share: canShareFiles() });
    if (res === 'cancelled') { btn.disabled = false; btn.textContent = 'Save encrypted file'; return false; }
    markExported(); toast('Encrypted backup saved');
    return true;
  } catch (e) { btn.disabled = false; btn.textContent = 'Save encrypted file'; showError(form, 'pass', 'Could not encrypt: ' + e.message); return false; }
};

// ---------- import ----------
actions['import-pick'] = () => { const i = $('#import-file'); if (i) { i.value = ''; i.click(); } };
changes['import-file'] = async (input) => {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > MAX_BYTES) { toast('That file is too large to be a Sallo backup.'); return; }
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { toast('That file isn’t a Sallo backup. Choose the .json or .sallo file you exported.'); return; }
  await handleImportObject(obj);
};

let pendingEnvelope = null;
export async function handleImportObject(obj) {
  if (V.isEncryptedBackup(obj)) {
    pendingEnvelope = obj;
    openSheet('Encrypted backup', html`<form data-form="importpass" novalidate>
      <p class="muted">Enter the passphrase you chose when you made this backup.</p>
      ${field('Passphrase', html`<input id="f-pass" name="pass" type="password" autocomplete="off">`, '', 'f-pass')}
      <div class="btn-row"><span class="grow"></span><button type="button" class="btn ghost" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit">Unlock</button></div></form>`);
    return;
  }
  previewImport(obj);
}
forms.importpass = async (fd, form) => {
  const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Unlocking…';
  try {
    const obj = await V.decryptBackup(pendingEnvelope, String(fd.get('pass') || ''));
    pendingEnvelope = null;
    closeSheet();
    previewImport(obj);
    return false; // already closed
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Unlock';
    showError(form, 'pass', e instanceof V.WrongSecretError ? 'Wrong passphrase, or the file was changed.' : e.message);
    return false;
  }
};

let pendingImport = null;
function previewImport(obj) {
  let v;
  try { v = validateImport(obj); } catch (e) { toast(e.message); return; }
  pendingImport = v;
  const have = app.store.data.txns.length + app.store.data.accounts.length + app.store.data.goals.length > 0;
  const c = v.counts;
  openSheet('Import backup', html`<form data-form="importapply" novalidate>
    <p>This backup contains <b>${c.accounts}</b> account${c.accounts === 1 ? '' : 's'}, <b>${c.txns}</b> transaction${c.txns === 1 ? '' : 's'}, <b>${c.rules}</b> recurring item${c.rules === 1 ? '' : 's'}, <b>${c.goals}</b> goal${c.goals === 1 ? '' : 's'} and <b>${c.budgets}</b> budget${c.budgets === 1 ? '' : 's'}.</p>
    ${v.dropped ? html`<p class="note">${v.dropped} damaged or inconsistent entr${v.dropped === 1 ? 'y was' : 'ies were'} skipped.</p>` : ''}
    ${have ? html`<fieldset class="choice"><legend>What should happen to what’s on this device?</legend>
      <label><input type="radio" name="mode" value="replace" checked><span><b>Replace everything</b><small>This device will match the backup exactly.</small></span></label>
      <label><input type="radio" name="mode" value="merge"><span><b>Combine</b><small>Add what’s missing. If both have the same item, the most recently edited one is kept. Things you deleted elsewhere come back.</small></span></label></fieldset>`
      : html`<input type="hidden" name="mode" value="replace">`}
    <div class="btn-row"><span class="grow"></span><button type="button" class="btn ghost" data-act="sheet-close">Cancel</button><button class="btn primary" type="submit">Import</button></div></form>`);
}
forms.importapply = (fd) => {
  const v = pendingImport; pendingImport = null;
  if (!v) return true;
  const s = app.store;
  if (fd.get('mode') === 'merge') {
    const { data, stats } = mergeData(s.data, v.data);
    s.data = data;
    s.ensureHorizon(); s.commit();
    toast(`Combined: ${stats.added} added, ${stats.updated} updated`);
  } else {
    s.data = { ...v.data, settings: { ...v.data.settings, hideAmounts: s.settings.hideAmounts } };
    s.ensureHorizon(); s.commit();
    toast('Backup imported');
  }
  location.hash = '#/overview';
  closeAllSheets();
  return true;
};

// ---------- delete everything ----------
actions['wipe'] = async () => {
  const ok = await confirmSheet({ title: 'Delete all data?', message: 'Every account, transaction, goal and setting on this device is erased permanently. Export a backup first if you might want it back.', confirmLabel: 'Delete everything', danger: true, requireText: 'DELETE' });
  if (!ok) return;
  await app.persist.wipe();
  location.hash = '';
  location.reload();
};

actions['demo-clear'] = async () => {
  const ok = await confirmSheet({ title: 'Start fresh?', message: 'The example data is removed and you set up your own. Nothing else is affected.', confirmLabel: 'Start fresh' });
  if (!ok) return;
  await app.persist.wipe();
  location.hash = '';
  location.reload();
};
