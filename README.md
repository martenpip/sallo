# Sallo (web app)

Private personal finance that installs to the home screen from a web address. No account, no server,
no analytics. All data is stored in the browser on the person's own device.

## Put it online (needed once, so phones can open and install it)
Upload the contents of this folder (index.html, manifest.webmanifest, sw.js, css/, js/, icons/) to any
static host with HTTPS. Free options: GitHub Pages, Cloudflare Pages, Netlify (drag-and-drop deploy).
Works from a sub-path too (all links are relative). The host only serves these files. It never receives data.

Then, on the phone:
- iPhone: open the address in Safari, Share, Add to Home Screen.
- Android: open it in Chrome, menu, Install app.

## Moving between devices
Settings, Backup and transfer: save a backup file (.json, or encrypted .sallo), send it to the other device,
open Sallo there and import it (also offered on the very first screen). Works iPhone, Android and desktop, both ways.
Import can replace everything or combine (newest edit of each item wins).

## Run locally / test
    python3 -m http.server 8123      # then open http://localhost:8123
    npm test                         # 26 unit tests (Node 20+, no dependencies)
    node test/e2e.cjs                # browser test (needs Playwright + Chromium and the server above)

## Layout
    js/money.js dates.js recurrence.js calc.js   pure logic (integer money, date-only strings)
    js/store.js                                  all data rules, import/export/merge validation
    js/vault.js persist.js                       AES-GCM + PBKDF2, IndexedDB, passcode lock
    js/ui/*                                      screens and editors
    sw.js                                        offline cache of the app's own files only

## Bank statements and debts
- **Bank statement import** (Settings → Backup, import and export): reads a CSV on the device, guesses the columns (comma or semicolon files, comma decimals, separate in/out columns, D/K columns), fills in categories, skips what looks already added, and offers Undo. Tested on made-up files only, not on real bank exports.
- **Debts and loans**: track what you owe or are owed, record payments, add interest, and see an estimated payoff date. A monthly payment becomes a repeating item in Upcoming. The payoff estimate assumes steady monthly payments and a fixed rate.

## Limits
- Data lives in browser storage: clearing site data or uninstalling the app deletes it. Back up.
- Reminders are shown inside the app (Upcoming, Overview). A website cannot schedule alerts on its own.
- Passcode lock encrypts stored data (AES-256-GCM, key from PBKDF2) but there is no Face ID / fingerprint.
- Merging backups does not carry deletions across devices.
- English-only wording; currency/date formats follow the chosen locale. Changing currency does not convert amounts.
- Not tested on a real iPhone or Android phone, only in desktop Chromium at phone size.

## Opening it
- **Double-click `index.html`** works on a computer (the app is one bundled script, `js/sallo.bundle.js`). Data then lives in that browser for that file location; offline install is not available from a file.
- **To install on a phone or computer**, host the folder over HTTPS (GitHub Pages: the included workflow deploys it; set Settings → Pages → Source to "GitHub Actions") and use Add to Home Screen / Install.
- After editing anything in `js/`, run `node build.mjs` to regenerate the bundle (no dependencies needed).
- Layout: bottom tabs on phones, side navigation and multi-column screens from 900px wide.
