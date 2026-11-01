// Guesses a category from what the person typed as the name. Runs on the device, no network.
// Order of trust: 1) what they chose last time for the same name, 2) a category whose own name appears in the text,
// 3) built-in keywords. Returns a category id, or null when nothing matches.
const RULES = [
  // [category name, kind, keywords]
  ['Housing', 'expense', ['rent', 'mortgage', 'landlord', 'hoa', 'property tax', 'home insurance', 'house insurance', 'renovation', 'plumber', 'electrician', 'repairs', 'apartment', 'flat', 'housing', 'maintenance fee', 'condo']],
  ['Bills & utilities', 'expense', ['electricity', 'electric', 'water bill', 'water', 'gas bill', 'heating', 'internet', 'wifi', 'broadband', 'phone bill', 'phone', 'mobile plan', 'mobile', 'utilities', 'utility', 'trash', 'garbage', 'sewer', 'tv license', 'telia', 'verizon', 'vodafone', 'comcast', 'bill', 'tax', 'insurance']],
  ['Groceries', 'expense', ['groceries', 'grocery', 'supermarket', 'market', 'lidl', 'aldi', 'tesco', 'walmart', 'costco', 'rimi', 'maxima', 'prisma', 'selver', 'coop', 'whole foods', 'kroger', 'bakery', 'butcher', 'carrefour', 'spar']],
  ['Transport', 'expense', ['fuel', 'petrol', 'gas station', 'diesel', 'bus', 'train', 'metro', 'subway', 'taxi', 'uber', 'bolt', 'lyft', 'parking', 'toll', 'car insurance', 'car payment', 'car loan', 'car wash', 'lease', 'tires', 'tyres', 'bike', 'scooter', 'transit', 'commute', 'mot', 'oil change', 'car']],
  ['Eating out', 'expense', ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonalds', 'mcdonald', 'burger', 'pizza', 'sushi', 'takeaway', 'takeout', 'take away', 'lunch', 'dinner', 'breakfast', 'brunch', 'bar', 'pub', 'doordash', 'deliveroo', 'wolt', 'foodora', 'bistro', 'kebab', 'ice cream', 'snack']],
  ['Health', 'expense', ['dentist', 'dental', 'doctor', 'gp', 'pharmacy', 'chemist', 'medicine', 'medication', 'prescription', 'hospital', 'clinic', 'therapy', 'therapist', 'optician', 'glasses', 'contact lenses', 'vitamins', 'physio', 'physiotherapy', 'health insurance', 'checkup', 'check-up', 'dermatologist', 'surgery', 'vaccine', 'massage', 'health']],
  ['Shopping', 'expense', ['clothes', 'clothing', 'shoes', 'amazon', 'ikea', 'furniture', 'electronics', 'zara', 'h&m', 'mall', 'bed', 'mattress', 'sofa', 'laptop', 'phone case', 'jacket', 'shopping', 'ebay', 'cosmetics', 'perfume', 'shop']],
  ['Leisure', 'expense', ['netflix', 'spotify', 'disney', 'hbo', 'youtube', 'apple music', 'prime video', 'cinema', 'movie', 'movies', 'concert', 'theatre', 'theater', 'game', 'games', 'steam', 'playstation', 'xbox', 'nintendo', 'gym', 'fitness', 'hobby', 'subscription', 'party', 'museum', 'club', 'sports', 'books', 'twitch']],
  ['Travel', 'expense', ['flight', 'flights', 'hotel', 'airbnb', 'booking', 'hostel', 'vacation', 'holiday', 'trip', 'airline', 'ferry', 'visa', 'luggage', 'ryanair', 'cruise', 'resort']],
  ['Salary', 'income', ['salary', 'paycheck', 'paycheque', 'payroll', 'wage', 'wages', 'payday', 'pay day', 'bonus', 'employer', 'stipend', 'pension']],
  ['Other income', 'income', ['freelance', 'refund', 'cashback', 'cash back', 'interest', 'dividend', 'dividends', 'gift', 'rent', 'sold', 'sale', 'reimbursement', 'tax return', 'allowance', 'side job', 'commission']],
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}&\- ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hit(text, kw) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc(kw)}(s|es)?($|[^\\p{L}\\p{N}])`, 'u').test(text);
}

/**
 * @param name        what the person typed
 * @param kind        'expense' | 'income'
 * @param categories  [{id, name, kind, archived}]
 * @param history     [{name, categoryId, kind|type}] earlier items, newest last (optional)
 */
export function detectCategory(name, kind, categories, history = []) {
  const text = norm(name);
  if (text.length < 2 || (kind !== 'expense' && kind !== 'income')) return null;
  const live = categories.filter((c) => !c.archived && c.kind === kind);
  const byId = new Map(live.map((c) => [c.id, c]));

  for (let i = history.length - 1; i >= 0; i--) { // 1) same name as before
    const h = history[i];
    if (h.categoryId && byId.has(h.categoryId) && norm(h.name) === text) return h.categoryId;
  }
  const own = live.filter((c) => norm(c.name).length >= 3 && hit(text, norm(c.name))) // 2) their own category names
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (own) return own.id;

  let best = null, bestLen = 0; // 3) keywords: the most specific (longest) match wins
  for (const [catName, k, words] of RULES) {
    if (k !== kind) continue;
    const cat = live.find((c) => norm(c.name) === norm(catName));
    if (!cat) continue;
    for (const w of words) if (w.length > bestLen && hit(text, w)) { best = cat; bestLen = w.length; }
  }
  return best ? best.id : null;
}
