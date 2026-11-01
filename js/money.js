// Money is always an integer count of minor units (cents). Never floats.
export const CURRENCIES = [
  { code: 'EUR', symbol: '€', exp: 2, name: 'Euro' },
  { code: 'USD', symbol: '$', exp: 2, name: 'US dollar' },
  { code: 'GBP', symbol: '£', exp: 2, name: 'Pound sterling' },
  { code: 'SEK', symbol: 'kr', exp: 2, name: 'Swedish krona' },
  { code: 'NOK', symbol: 'kr', exp: 2, name: 'Norwegian krone' },
  { code: 'DKK', symbol: 'kr', exp: 2, name: 'Danish krone' },
  { code: 'CHF', symbol: 'CHF', exp: 2, name: 'Swiss franc' },
  { code: 'PLN', symbol: 'zł', exp: 2, name: 'Polish złoty' },
  { code: 'CZK', symbol: 'Kč', exp: 2, name: 'Czech koruna' },
  { code: 'JPY', symbol: '¥', exp: 0, name: 'Japanese yen' },
  { code: 'CAD', symbol: 'CA$', exp: 2, name: 'Canadian dollar' },
  { code: 'AUD', symbol: 'A$', exp: 2, name: 'Australian dollar' },
];

export const currencyInfo = (code) => CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];

/** 1234 -> "12.34" (always a dot; for files and input prefill). */
export function minorToPlain(minor, exp = 2) {
  const neg = minor < 0;
  const a = String(Math.abs(minor));
  if (exp === 0) return (neg ? '-' : '') + a;
  const s = a.padStart(exp + 1, '0');
  return (neg ? '-' : '') + s.slice(0, -exp) + '.' + s.slice(-exp);
}

/**
 * Parses what a person types ("12,50", "1 234.5", "1.234,56", "€5") into minor
 * units. Returns null for anything ambiguous or invalid instead of guessing.
 */
export function parseMinor(text, exp = 2) {
  if (text == null) return null;
  let s = String(text).replace(/[\s  ]/g, '').replace(/−/g, '-');
  s = s.replace(/[^0-9.,-]/g, '');
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.includes('-') || s === '' || !/[0-9]/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart, fracPart = '';
  const nDot = (s.match(/\./g) || []).length;
  const nComma = (s.match(/,/g) || []).length;

  const groupsOk = (str, sep) => {
    const parts = str.split(sep);
    return parts[0].length >= 1 && parts[0].length <= 3 && parts.slice(1).every((p) => p.length === 3);
  };

  if (nDot && nComma) {
    const dec = lastDot > lastComma ? '.' : ',';
    const grp = dec === '.' ? ',' : '.';
    const [i, f, ...rest] = s.split(dec);
    if (rest.length || (dec === '.' ? nDot : nComma) !== 1) return null;
    if (!groupsOk(i, grp)) return null;
    intPart = i.split(grp).join('');
    fracPart = f;
  } else if (nDot || nComma) {
    const sep = nDot ? '.' : ',';
    const n = nDot || nComma;
    if (n > 1) {
      if (!groupsOk(s, sep)) return null;
      intPart = s.split(sep).join('');
    } else {
      const [i, f] = s.split(sep);
      if (f.length === 3 && i.length >= 1 && i.length <= 3 && !/^0/.test(i)) {
        intPart = i + f; // "1.234" is one thousand two hundred thirty-four
      } else if (f.length <= exp) {
        intPart = i; fracPart = f;
      } else return null;
    }
  } else {
    intPart = s;
  }
  if (intPart === '') intPart = '0';
  if (!/^[0-9]+$/.test(intPart) || (fracPart && !/^[0-9]+$/.test(fracPart))) return null;
  if (intPart.replace(/^0+/, '').length > 12) return null;
  if (fracPart.length > exp) return null;
  const frac = fracPart.padEnd(exp, '0');
  const value = Number(intPart) * 10 ** exp + (exp ? Number(frac) : 0);
  return neg ? -value : value;
}

/** Display formatting. Real minus sign, optional "+" for positive. */
export function formatMoney(minor, code = 'EUR', { sign = false, locale } = {}) {
  const { exp } = currencyInfo(code);
  let text;
  try {
    text = new Intl.NumberFormat(locale || undefined, {
      style: 'currency', currency: code, minimumFractionDigits: exp, maximumFractionDigits: exp,
    }).format(Math.abs(minor) / 10 ** exp);
  } catch {
    text = minorToPlain(Math.abs(minor), exp) + ' ' + code;
  }
  if (minor < 0) return '−' + text;
  if (sign && minor > 0) return '+' + text;
  return text;
}
