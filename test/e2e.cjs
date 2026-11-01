const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://127.0.0.1:8123/';
const SH = '/tmp/claude-0/shots/';
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log('  FAIL:', m); } else console.log('  ok:', m); };
const errs = []; const external = [];

async function newPage(b, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, ...opts });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('request', r => { if (!r.url().startsWith(URL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  await p.goto(URL); await p.waitForSelector('#view h1');
  return { ctx, p };
}
const tab = (p, t) => p.click(`#tabs a[data-tab=${t}]`);
const tick = (p) => p.waitForTimeout(150);
const sheet = (p) => p.locator('.sheet-wrap.open .sheet').last();

(async () => {
  const b = await chromium.launch();
  let { ctx, p } = await newPage(b);

  console.log('ONBOARDING');
  await p.click('text=Get started'); await tick(p);
  await p.selectOption('#ob-cur', 'USD'); await tick(p);
  await p.fill('#ob-name', 'Checking'); await p.fill('#ob-bal', '1,250.00');
  await p.click('button:has-text("Continue")'); await tick(p);
  ok(await p.locator('h1').innerText() === 'Pay and regular bills', 'pay and bills step appears');
  await p.click('text=Skip for now'); await tick(p);
  ok(await p.locator('h1').innerText() === 'How do you want to live?', 'money plan step appears');
  await p.click('text=Skip for now'); await tick(p);
  ok(await p.locator('h1').innerText() === 'You’re set', 'reaches final step');
  await p.click('text=Open Sallo'); await tick(p);
  ok((await p.locator('.donut-mid .hero-amt').first().innerText()) === '$1,250.00', 'balance after onboarding is $1,250.00');
  ok(await p.locator('#tabs').isVisible(), 'tabs visible after onboarding');
  await p.screenshot({ path: SH + '02-overview-empty.png' });

  console.log('TRANSACTIONS');
  await tab(p, 'activity'); await tick(p);
  await p.click('.fab'); await tick(p);
  await p.fill('#f-amount', '12,50'); await p.fill('#f-name', 'Lunch');
  await p.selectOption('#f-catx', { label: 'Groceries' });
  await p.click('.sheet button[type=submit]'); await tick(p);
  ok(await p.locator('#act-list').innerText().then(t => t.includes('Lunch') && t.includes('−$12.50')), 'expense listed with real minus');
  await p.click('.fab'); await tick(p);
  await p.click('.seg label:has(input[value="income"])');
  await p.fill('#f-amount', '2000'); await p.fill('#f-name', 'Salary');
  await p.selectOption('#f-cati', { label: 'Salary' });
  await p.click('.sheet button[type=submit]'); await tick(p);
  // validation
  await p.click('.fab'); await tick(p);
  await p.fill('#f-amount', 'abc'); await p.click('.sheet button[type=submit]'); await tick(p);
  ok((await p.locator('.sheet .err').first().innerText()).includes('Enter an amount'), 'invalid amount shows an error and keeps sheet open');
  await p.keyboard.press('Escape'); await tick(p);
  ok(await p.locator('.sheet-wrap').count() === 0, 'Escape closes sheet');
  // transfer needs a second account
  await p.fill('#act-search', 'lunch'); await tick(p);
  ok((await p.locator('#act-list .row').count()) === 1, 'search narrows the list');
  await p.fill('#act-search', '');
  await p.screenshot({ path: SH + '03-activity.png' });
  await tab(p, 'overview'); await tick(p);
  ok((await p.locator('.donut-mid .hero-amt').first().innerText()) === '$3,237.50', 'balance = 1250 - 12.50 + 2000');

  console.log('UPCOMING / RECURRING');
  await tab(p, 'upcoming'); await tick(p);
  const today = await p.evaluate(() => window.__sallo.store.today());
  await p.click('.fab'); await tick(p);
  await p.fill('#f-name', 'Rent'); await p.fill('#f-amount', '800'); await p.fill('#f-date', today);
  await p.click('.sheet button[type=submit]'); await tick(p);
  ok((await p.locator('.group.today').count()) === 1, 'item due today appears in Today group');
  // recurring on the 31st
  await p.click('.fab'); await tick(p);
  await p.fill('#f-name', 'Insurance'); await p.fill('#f-amount', '45.90'); await p.fill('#f-date', '2027-01-31');
  await p.selectOption('#f-unit', 'month'); await p.click('.sheet button[type=submit]'); await tick(p);
  const dates = await p.evaluate(() => window.__sallo.store.data.planned.filter(x => x.name === 'Insurance').map(x => x.date));
  ok(dates[0] === '2027-01-31' && dates[1] === '2027-02-28' && dates[2] === '2027-03-31', '31st clamps to Feb 28 then back to Mar 31: ' + dates.slice(0, 3));
  ok(new Set(dates).size === dates.length, 'no duplicate occurrences');
  // mark rent paid
  await p.locator('.group.today .quick').first().click(); await tick(p);
  await p.click('.sheet button[type=submit]'); await tick(p);
  const bal = await p.evaluate(() => window.__sallo.store.data.txns.length);
  ok(bal === 3, 'paying created exactly one transaction');
  ok((await p.locator('.group.today').count()) === 0, 'paid item leaves the Today group');
  await p.screenshot({ path: SH + '04-upcoming.png' });
  // skip a single occurrence
  await p.click('#tabs a[data-tab=upcoming]');
  await p.goto(URL + '#/recurring'); await tick(p);
  ok((await p.locator('.row').count()) === 1, 'recurring screen lists the series');

  console.log('CALENDAR');
  await tab(p, 'calendar'); await tick(p);
  ok((await p.locator('.cell').count()) % 7 === 0, 'grid is whole weeks');
  await p.locator(`.cell[data-date="${today}"]`).click(); await tick(p);
  ok((await p.locator('section[aria-label="Selected day"] .row').count()) >= 2, 'selected day lists its items');
  await p.click('button:has-text("Add event")'); await tick(p);
  await p.fill('#f-name', 'Dentist'); await p.click('.sheet button[type=submit]'); await tick(p);
  ok((await p.locator('section[aria-label="Selected day"]').innerText()).includes('Dentist'), 'event added on the selected day');
  await p.screenshot({ path: SH + '05-calendar.png' });

  console.log('SAVINGS + BUDGETS');
  await tab(p, 'savings'); await tick(p);
  await p.click('.fab'); await tick(p);
  await p.fill('#f-name', 'Trip'); await p.fill('#f-target', '1000'); await p.click('.sheet button[type=submit]'); await tick(p);
  await p.click('a.goal'); await tick(p);
  await p.click('button:has-text("Add or take out")'); await tick(p);
  await p.fill('#f-amount', '250'); await p.click('.sheet button[type=submit]'); await tick(p);
  ok((await p.locator('.hero-amt').innerText()) === '$250.00', 'goal shows $250.00 saved');
  ok((await p.locator('body').innerText()).includes('25%'), 'goal shows 25%');
  await p.screenshot({ path: SH + '06-goal.png' });
  await p.goto(URL + '#/settings/budgets'); await tick(p);
  await p.click('.ph-right button'); await tick(p);
  await p.selectOption('#f-cat', { label: 'Groceries' }); await p.fill('#f-limit', '20'); await p.click('.sheet button[type=submit]'); await tick(p);
  ok((await p.locator('.budget').innerText()).includes('63%'), 'budget shows 63% (12.50 of 20, rounded)');

  console.log('INSIGHTS / OVERVIEW');
  await p.goto(URL + '#/overview'); await tick(p);
  await p.screenshot({ path: SH + '07-overview.png', fullPage: true });
  await p.goto(URL + '#/insights'); await tick(p);
  await p.screenshot({ path: SH + '08-insights.png', fullPage: true });

  console.log('EXPORT');
  await p.goto(URL + '#/settings/data'); await tick(p);
  let [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Save backup file")')]);
  const jsonPath = '/tmp/claude-0/backup.json'; await dl.saveAs(jsonPath);
  const exported = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  ok(dl.suggestedFilename().startsWith('sallo-backup-') && dl.suggestedFilename().endsWith('.json'), 'plain export filename ' + dl.suggestedFilename());
  ok(exported.app === 'sallo' && exported.txns.length === 3 && exported.goals.length === 1 && !('hideAmounts' in exported.settings), 'export content is complete');
  await p.click('button:has-text("Save encrypted backup")'); await tick(p);
  await p.fill('#f-pass', 'correct horse battery'); await p.fill('#f-pass2', 'correct horse battery');
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('.sheet button[type=submit]')]);
  const encPath = '/tmp/claude-0/backup.sallo'; await dl.saveAs(encPath);
  const encText = fs.readFileSync(encPath, 'utf8');
  ok(JSON.parse(encText).sallo === 'encrypted-backup' && !encText.includes('Lunch') && !encText.includes('Checking'), 'encrypted export contains no plaintext');
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Transactions as spreadsheet")')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  ok(csv.includes('Lunch') && csv.includes('12.50'), 'CSV export has the transactions');
  await p.screenshot({ path: SH + '09-data.png', fullPage: true });

  console.log('IMPORT ON A FRESH DEVICE');
  let B = await newPage(b);
  await B.p.setInputFiles('#import-file', jsonPath); await tick(B.p);
  ok((await sheet(B.p).innerText()).includes('3 transactions'), 'preview shows counts');
  await B.p.screenshot({ path: SH + '10-import-preview.png' });
  await B.p.click('.sheet button[type=submit]'); await tick(B.p);
  await B.p.waitForSelector('.hero-amt');
  ok((await B.p.locator('.donut-mid .hero-amt').first().innerText()) === '$2,437.50', 'second device shows the same balance (3237.50 - 800 rent)');
  ok(await B.p.evaluate(() => window.__sallo.store.data.planned.filter(x => x.name === 'Insurance').length > 10), 'recurring items came across');
  await B.ctx.close();

  console.log('ENCRYPTED IMPORT');
  B = await newPage(b);
  await B.p.setInputFiles('#import-file', encPath); await tick(B.p);
  await B.p.fill('#f-pass', 'wrong one'); await B.p.click('.sheet button[type=submit]'); await B.p.waitForTimeout(800);
  ok((await B.p.locator('.sheet .err').first().innerText()).includes('Wrong passphrase'), 'wrong passphrase rejected');
  await B.p.fill('#f-pass', 'correct horse battery'); await B.p.click('.sheet button[type=submit]'); await B.p.waitForTimeout(800);
  ok((await sheet(B.p).innerText()).includes('3 transactions'), 'right passphrase shows preview');
  await B.p.click('.sheet button[type=submit]'); await tick(B.p);
  ok((await B.p.locator('.donut-mid .hero-amt').first().innerText()) === '$2,437.50', 'encrypted backup restored');
  // garbage file
  fs.writeFileSync('/tmp/claude-0/junk.json', '{"hello":"world"}');
  await B.p.goto(URL + '#/settings/data'); await tick(B.p);
  await B.p.setInputFiles('#import-file', '/tmp/claude-0/junk.json'); await tick(B.p);
  ok((await B.p.locator('#toast').innerText()).includes('not a Sallo backup'), 'junk file rejected with a clear message');
  // merge
  await B.p.setInputFiles('#import-file', jsonPath); await tick(B.p);
  await B.p.check('input[name=mode][value=merge]'); await B.p.click('.sheet button[type=submit]'); await tick(B.p);
  ok(await B.p.evaluate(() => window.__sallo.store.data.txns.length) === 3, 'merging the same backup adds no duplicates');
  await B.ctx.close();

  console.log('PASSCODE LOCK');
  await p.goto(URL + '#/settings/security'); await tick(p);
  await p.click('button:has-text("Turn on passcode lock")'); await tick(p);
  await p.fill('#f-pass', 'hunter2hunter2'); await p.fill('#f-pass2', 'hunter2hunter2');
  await p.click('.sheet button[type=submit]'); await p.waitForTimeout(1500);
  ok((await p.locator('.chip.good').first().innerText()) === 'On', 'lock is on');
  const stored = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('sallo'); r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('doc'); q.onsuccess = () => res(JSON.stringify(q.result)); }; }));
  ok(JSON.parse(stored).format === 'enc' && !stored.includes('Lunch') && !stored.includes('Checking'), 'IndexedDB now holds only ciphertext');
  await p.reload(); await p.waitForSelector('#lock-pass');
  ok(await p.locator('#lock-form').isVisible() && !(await p.locator('#view').innerText()).includes('Balance'), 'reload shows lock screen and no data in the page');
  await p.screenshot({ path: SH + '11-lock.png' });
  await p.fill('#lock-pass', 'nope'); await p.click('#lock-form button'); await p.waitForTimeout(1200);
  ok((await p.locator('#lock-err').innerText()).includes('didn’t work'), 'wrong passcode rejected');
  await p.fill('#lock-pass', 'hunter2hunter2'); await p.click('#lock-form button'); await p.waitForSelector('#view h1', { timeout: 8000 }); await p.goto(URL + '#/overview'); await p.waitForSelector('.hero-amt');
  ok((await p.locator('.donut-mid .hero-amt').first().innerText()) === '$2,437.50', 'right passcode unlocks with data intact');
  await p.evaluate(() => window.__sallo.lockNow()); await p.waitForSelector('#lock-pass');
  ok(true, 'Lock now works');

  console.log('OFFLINE / PWA');
  await p.fill('#lock-pass', 'hunter2hunter2'); await p.click('#lock-form button'); await p.waitForSelector('#view h1');
  const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && (r.active || r.installing || r.waiting)); });
  ok(sw, 'service worker registered');
  await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('#lock-pass, #view h1', { timeout: 8000 });
  ok(true, 'app loads with the network off');
  await ctx.setOffline(false);
  const man = await p.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  ok(man.display === 'standalone' && man.icons.length >= 3, 'manifest is valid for install');

  console.log('DARK THEME');
  await p.fill('#lock-pass', 'hunter2hunter2'); await p.click('#lock-form button'); await p.waitForSelector('#view h1');
  await p.emulateMedia({ colorScheme: 'dark' }); await p.goto(URL + '#/overview'); await tick(p);
  await p.screenshot({ path: SH + '12-dark.png', fullPage: true });

  console.log('ESTONIAN');
  await p.evaluate(() => window.__sallo.store.setSettings({ lang: 'et', locale: 'et-EE' })); await tick(p);
  ok((await p.locator('#tabs').innerText()).includes('Ülevaade') && (await p.locator('#tabs').innerText()).includes('Säästud'), 'tabs are in Estonian');
  ok(/Kogusaldo/.test(await p.locator('#view').innerText()), 'overview is in Estonian');
  ok((await p.locator('.bal').innerText()).includes(','), 'amounts use a decimal comma');
  await p.goto(URL + '#/settings/preferences'); await tick(p);
  ok(/Keel/.test(await p.locator('#view').innerText()), 'preferences are in Estonian');
  await p.evaluate(() => window.__sallo.store.setSettings({ lang: 'en', locale: '' })); await tick(p);
  ok((await p.locator('#tabs').innerText()).includes('Overview'), 'switching back gives English');

  console.log('\nconsole errors:', errs.length ? errs : 'none');
  console.log('external requests:', external.length ? external : 'none');
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await b.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
