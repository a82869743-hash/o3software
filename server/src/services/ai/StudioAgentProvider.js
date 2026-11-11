/**
 * StudioAgentProvider.js — the studio's own WhatsApp / leads agent. No outside AI, no cost, no limits.
 * Used when Groq has no key, is down, or its free daily limit is used up.
 *
 * Answers ONLY from live studio data passed in `context` (built by LeadsAgentService.buildLiveContext):
 * services & prices per car type, packages, products in stock, the active offer, free slots, studio
 * address / hours / UPI / pickup charges, the knowledge base, and — when the sender is a known
 * customer — their name, car, first-wash eligibility and current booking.
 * It never invents prices, offers or times. When it doesn't know, it hands the chat to the team
 * (result.handover = true) so a person replies.
 *
 * Replies in English, Hinglish or Gujarati (Latin letters), matching how the customer writes.
 * Remembers the car and service from earlier messages, so "and for SUV?" or "kal?" work as follow-ups.
 */
const ILLMProvider = require('./ILLMProvider');
const MODEL_MAP = require('../../utils/carModelCategories.json');
const { CAR_TYPE_LABELS } = require('../../utils/carCategory');

const inr = (n) => `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;

// ── Language ──────────────────────────────────────────────────────────────────
const HI_WORDS = /\b(kya|kyaa|hai|hain|kitna|kitne|kitni|chahiye|chaiye|kab|kal|aaj|parso|karna|karwana|karwani|krna|mujhe|muje|mera|meri|gaadi|gadi|bhai|bhaiya|ji|haan|nahi|nahin|kaha|kahan|kidhar|batao|bataiye|bata|kaise|kaisa|wala|wali|abhi|thik|theek|accha|acha|dhanyawad|shukriya|lagega|milega|hoga|sakte|sakta|kitne|paisa|paise)\b/;
const GU_WORDS = /\b(che|chhe|ketla|ketlu|ketlo|ketli|kem|karvanu|karavu|karavanu|joie|joiye|joiea|kyare|kyaare|aaje|kale|saru|haa|na|nathi|tame|tamaru|tamari|mare|maru|mari|amne|avu|aavu|aavi|aavo|kya|kevi|kevu|bhav|aabhar|majama|thase|thashe|madse|malse|ane)\b/;

// Common words written in Hindi or Gujarati script → the Latin words the matching below understands
const SCRIPT_WORDS = [
  [/सिरेमिक|સિરામિક|સિરેમિક/g, 'ceramic'], [/कोटिंग|કોટિંગ/g, 'coating'], [/ग्राफीन|ગ્રાફીન/g, 'graphene'],
  [/वॉश|वाश|धुलाई|વોશ|ધોવા/g, 'wash'], [/फोम|ફોમ/g, 'foam'], [/पॉलिश|पोलिश|પોલિશ/g, 'polish'], [/रबिंग|રબિંગ/g, 'rubbing'],
  [/इंटीरियर|ઇન્ટીરિયર/g, 'interior'], [/सर्विस|સર્વિસ/g, 'service'], [/एसी|એસી/g, 'ac'], [/पैकेज|પેકેજ/g, 'package'],
  [/कितने|कितना|कितनी/g, 'kitna'], [/કેટલા|કેટલું|કેટલો/g, 'ketla'], [/कीमत|दाम|रेट|ભાવ|કિંમત/g, 'price'],
  [/कल|કાલે/g, 'kal'], [/आज|આજે/g, 'aaj'], [/बुक|બુક/g, 'book'], [/स्लॉट|સ્લોટ/g, 'slot'],
  [/पता|लोकेशन|કયાં|ક્યાં|સરનામું/g, 'address'], [/ऑफर|डिस्काउंट|ઓફર|ડિસ્કાઉન્ટ/g, 'offer'],
  [/धन्यवाद|शुक्रिया|આભાર/g, 'thanks'], [/नमस्ते|નમસ્તે/g, 'namaste'], [/गाड़ी|ગાડી/g, 'gaadi'],
];
const toLatin = (t) => SCRIPT_WORDS.reduce((acc, [re, w]) => acc.replace(re, ` ${w} `), t);

function detectLang(text) {
  if (/[઀-૿]/.test(text)) return 'gu';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  const l = text.toLowerCase();
  const gu = (l.match(new RegExp(GU_WORDS, 'g')) || []).length;
  const hi = (l.match(new RegExp(HI_WORDS, 'g')) || []).length;
  if (gu > hi && gu > 0) return 'gu';
  if (hi > 0) return 'hi';
  return 'en';
}

// Every sentence the agent says, in three languages. {x} = filled in.
const T = {
  en: {
    hi: 'Hi{name}! 👋 Welcome to {studio}.',
    weOffer: 'We offer:', askWhat: 'Ask me for prices, packages or free slots, or reply BOOK to book.',
    pricesFor: 'Prices for your {car}:', prices: 'Our prices:', askCar: 'Tell me your car model and I will give the exact price.',
    takes: 'takes about', bookHere: 'Book here: {url}', replyBook: 'Reply BOOK and the slot you want, and our team will confirm.',
    slots: 'Free slots{day}:', noSlots: 'No free slots{day} right now. Our team will suggest the nearest time.',
    pkgs: 'Our care packages{car}:', washes: 'washes', valid: 'valid {m} months', noPkgs: 'Our team will share the package details with you.',
    products: 'Available at the studio:', outOfStock: '{p} is out of stock right now; our team will tell you when it is back.',
    productsNote: 'Order in the app and collect at the studio, or ask us here.', noProducts: 'Our team will share the product details with you.',
    offer: '🎉 Current offer: {offer}', firstWash: '🎁 Your first wash is 50% off (wash services).', noOffer: 'There is no running offer right now. Our team will tell you if one starts.',
    address: '📍 {studio}: {address}', hours: '🕘 Timings: {hours}', mapsNote: 'Map: {url}',
    pay: 'You can pay at the studio by UPI, cash or card.{upi}', upi: ' UPI: {upi}',
    pickup: '🚗 Pickup and drop is available{charge}. Share your address and preferred time.', pickupCharge: ' (charge {amt})', pickupFree: ' (free)',
    status: '{name}your {car} booking ({service}) for {when}: {status}.', noBooking: 'I can’t find an open booking on this number. Our team will check and reply.',
    thanks: 'Thank you{name}! 🙏 Happy to help anytime.', ok: '👍 Anything else I can help with?',
    handOff: 'Thanks for your message! 🙏 Our team will reply to you here shortly.{call}', call: ' For anything urgent, call us on {mobile}.',
    offTopic: 'I can only help with car care at {studio}: services, prices and bookings. 😊',
    status_pending: 'waiting for confirmation', status_confirmed: 'confirmed ✅', status_in_progress: 'your car is being worked on 🧽', status_completed: 'done ✅ — ready for pickup',
    status_ready: 'ready for pickup ✅', status_reschedule_required: 'needs a new time — our team will call you',
    today: 'today', tomorrow: 'tomorrow', dayAfter: 'day after tomorrow', nextFree: 'Nearest free slots:',
  },
  hi: {
    hi: 'Namaste{name}! 👋 {studio} mein aapka swagat hai.',
    weOffer: 'Hamari services:', askWhat: 'Price, package ya free slot poochiye, ya book karne ke liye BOOK likhiye.',
    pricesFor: 'Aapki {car} ke liye price:', prices: 'Hamare price:', askCar: 'Apni gaadi ka model bataiye, main exact price bata dunga.',
    takes: 'mein lagbhag', bookHere: 'Yahan book kariye: {url}', replyBook: 'BOOK aur apna time likhiye, team confirm kar degi.',
    slots: 'Free slots{day}:', noSlots: 'Abhi{day} koi slot free nahi hai. Team aapko nearest time batayegi.',
    pkgs: 'Hamare care packages{car}:', washes: 'wash', valid: '{m} mahine valid', noPkgs: 'Team aapko package ki details bhejegi.',
    products: 'Studio par available:', outOfStock: '{p} abhi stock mein nahi hai; aate hi team bata degi.',
    productsNote: 'App mein order karke studio se le jaiye, ya yahan poochiye.', noProducts: 'Team aapko product ki details bhejegi.',
    offer: '🎉 Abhi ka offer: {offer}', firstWash: '🎁 Aapka pehla wash 50% off hai (wash services par).', noOffer: 'Abhi koi offer nahi chal raha. Offer aate hi team bata degi.',
    address: '📍 {studio}: {address}', hours: '🕘 Timing: {hours}', mapsNote: 'Map: {url}',
    pay: 'Payment studio par UPI, cash ya card se kar sakte hain.{upi}', upi: ' UPI: {upi}',
    pickup: '🚗 Pickup aur drop available hai{charge}. Apna address aur time bhejiye.', pickupCharge: ' (charge {amt})', pickupFree: ' (free)',
    status: '{name}aapki {car} ki booking ({service}), {when}: {status}.', noBooking: 'Is number par koi open booking nahi mili. Team check karke reply karegi.',
    thanks: 'Dhanyavaad{name}! 🙏 Kabhi bhi poochiye.', ok: '👍 Aur kuch madad chahiye?',
    handOff: 'Message ke liye dhanyavaad! 🙏 Hamari team aapko yahin jaldi reply karegi.{call}', call: ' Urgent ho to {mobile} par call kariye.',
    offTopic: 'Main sirf {studio} ki car care mein madad kar sakta hoon: services, price aur booking. 😊',
    status_pending: 'confirmation baaki hai', status_confirmed: 'confirm hai ✅', status_in_progress: 'gaadi par kaam chal raha hai 🧽', status_completed: 'ho gaya ✅ — gaadi le ja sakte hain',
    status_ready: 'gaadi ready hai ✅', status_reschedule_required: 'naya time chahiye — team call karegi',
    today: 'aaj', tomorrow: 'kal', dayAfter: 'parso', nextFree: 'Sabse paas ke free slots:',
  },
  gu: {
    hi: 'Kem cho{name}! 👋 {studio} ma tamaru swagat che.',
    weOffer: 'Amari services:', askWhat: 'Price, package ke free slot puchho, ke book karva BOOK lakho.',
    pricesFor: 'Tamari {car} mate price:', prices: 'Amara price:', askCar: 'Tamari gadi nu model kaho, hu exact price kahis.',
    takes: 'ma lagbhag', bookHere: 'Ahiya book karo: {url}', replyBook: 'BOOK ane tamaro time lakho, team confirm kari deshe.',
    slots: 'Free slots{day}:', noSlots: 'Atyare{day} koi slot free nathi. Team tamne najik no time kaheshe.',
    pkgs: 'Amara care packages{car}:', washes: 'wash', valid: '{m} mahina valid', noPkgs: 'Team tamne package ni details mokalse.',
    products: 'Studio par malse:', outOfStock: '{p} atyare stock ma nathi; aavta j team kaheshe.',
    productsNote: 'App ma order karo ane studio thi lai jao, ke ahiya puchho.', noProducts: 'Team tamne product ni details mokalse.',
    offer: '🎉 Atyare no offer: {offer}', firstWash: '🎁 Tamaro pehlo wash 50% off che (wash services par).', noOffer: 'Atyare koi offer nathi. Offer aavta j team kaheshe.',
    address: '📍 {studio}: {address}', hours: '🕘 Timing: {hours}', mapsNote: 'Map: {url}',
    pay: 'Payment studio par UPI, cash ke card thi kari shako.{upi}', upi: ' UPI: {upi}',
    pickup: '🚗 Pickup ane drop available che{charge}. Tamaru address ane time mokalo.', pickupCharge: ' (charge {amt})', pickupFree: ' (free)',
    status: '{name}tamari {car} ni booking ({service}), {when}: {status}.', noBooking: 'Aa number par koi open booking nathi mali. Team check kari ne reply karshe.',
    thanks: 'Aabhar{name}! 🙏 Kyare pan puchho.', ok: '👍 Biju kai madad joie?',
    handOff: 'Message mate aabhar! 🙏 Amari team tamne ahiya j jaldi reply karshe.{call}', call: ' Urgent hoy to {mobile} par call karo.',
    offTopic: 'Hu fakt {studio} ni car care ma madad kari shaku: services, price ane booking. 😊',
    status_pending: 'confirmation baki che', status_confirmed: 'confirm che ✅', status_in_progress: 'gadi par kaam chalu che 🧽', status_completed: 'thai gayu ✅ — gadi lai jai shako',
    status_ready: 'gadi ready che ✅', status_reschedule_required: 'navo time joie — team call karshe',
    today: 'aaje', tomorrow: 'kale', dayAfter: 'parmdivse', nextFree: 'Najik na free slots:',
  },
};
const say = (lang, key, vars = {}) => String((T[lang] && T[lang][key]) ?? T.en[key] ?? '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

// ── Understanding the message ─────────────────────────────────────────────────
// Words customers use → words in our service names (matched against the live catalogue, not hard-coded prices)
const SERVICE_WORDS = {
  ceramic: ['ceramic', 'ceramik', 'seramic', 'coating 9h', '9h', 'nano'],
  graphene: ['graphene', 'graphine', 'grafin'],
  ppf: ['ppf', 'paint protection', 'protection film', 'film'],
  wash: ['wash', 'washing', 'dhulai', 'dhona', 'dhovanu', 'saaf', 'foam', 'snow foam', 'safai'],
  wax: ['wax', 'waxing', 'shine', 'chamak'],
  interior: ['interior', 'inside', 'andar', 'andar ni', 'cabin', 'vacuum', 'deep clean', 'dry clean', 'seat clean'],
  leather: ['leather', 'seat conditioning', 'conditioning'],
  engine: ['engine', 'bonnet', 'engine bay'],
  headlight: ['headlight', 'head light', 'headlamp', 'light restoration', 'yellow light'],
  rubbing: ['rubbing', 'polish', 'polishing', 'scratch', 'scratches', 'swirl', 'compound', 'compounding'],
  underbody: ['underbody', 'anti rust', 'anti-rust', 'rust', 'teflon', 'under body', 'undershield'],
  rodent: ['rodent', 'rat', 'rats', 'chuha', 'chuhe', 'undar', 'undar', 'mouse'],
  ozone: ['ozone', 'odour', 'odor', 'smell', 'badbu', 'gandh', 'vaas', 'sanitize', 'sanitise'],
  windshield: ['windshield', 'windscreen', 'glass coating', 'glass'],
  alloy: ['alloy', 'wheel', 'wheels', 'rim', 'rims'],
  maintenance: ['maintenance', 'coatcare', 'coat care', 'top up', 'topup'],
  trim: ['trim', 'plastic'],
  fabric: ['fabric', 'seat cover shield', 'cloth seat'],
};
const PRODUCT_HINT = /\b(product|products|buy|kharid|kharidna|levu|shampoo|perfume|freshener|cloth|microfib|polish bottle|spray|sealant|wax tin|vacuum cleaner|cordless|inflator|seat cover|floor mat|mats|mat|accessor\w*)\b/;

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

const has = (text, word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^a-z0-9])`).test(text);

/** Service groups the text talks about (exact words, or a one-letter typo of a longer word). */
function serviceGroups(text) {
  const words = text.split(/[^a-z0-9]+/).filter(w => w.length >= 5);
  return Object.entries(SERVICE_WORDS)
    .filter(([, list]) => list.some(w => has(text, w) || (w.length >= 6 && !w.includes(' ') && words.some(x => lev(x, w) <= 1))))
    .map(([g]) => g);
}

/** Car type from a car model / type word in the text (uses the same model list as the app). */
const MODEL_KEYS = Object.keys(MODEL_MAP).filter(k => k.length >= 3 && !/^\d+$/.test(k)).sort((a, b) => b.length - a.length);
function carFromText(text) {
  if (/\bpremium suv\b|\bluxury suv\b/.test(text)) return { cat: 'premium_suv' };
  if (/\bpremium sedan\b|\bluxury\b/.test(text)) return { cat: 'premium_sedan' };
  if (/\bmini suv\b|\bcompact suv\b|\bsmall suv\b/.test(text)) return { cat: 'semi_sedan' }; // stored key for Mini SUV
  if (/\bcompact sedan\b|\bsemi[- ]?sedan\b/.test(text)) return { cat: 'sedan' };
  if (/\bsuv\b|\bjeep\b/.test(text)) return { cat: 'suv' };
  if (/\bsedan\b/.test(text)) return { cat: 'sedan' };
  if (/\bhatch(back)?\b|\bsmall car\b|\bnani gadi\b|\bchhoti gaadi\b/.test(text)) return { cat: 'hatchback' };
  const key = MODEL_KEYS.find(k => has(text, k) || (k.includes('-') && has(text, k.replace(/-/g, ' '))));
  if (key) return { cat: MODEL_MAP[key], model: key.replace(/\b\w/g, c => c.toUpperCase()) };
  return null;
}

/** Price for a car type, falling back to the nearest type the studio has priced. */
const FALLBACK = { semi_sedan: ['suv', 'sedan'], premium_sedan: ['sedan', 'suv'], premium_suv: ['suv'], hatchback: [], sedan: [], suv: [] };
function priceFor(item, cat) {
  for (const c of [cat, ...(FALLBACK[cat] || [])]) if (Number(item[`price_${c}`]) > 0) return Number(item[`price_${c}`]);
  return 0;
}
function priceRange(item) {
  const main = [['Hatchback', item.price_hatchback], ['Sedan', item.price_sedan], ['Mini SUV', item.price_semi_sedan], ['SUV', item.price_suv]].filter(([, v]) => Number(v) > 0);
  return main.map(([k, v]) => `${k} ${inr(v)}`).join(' | ');
}
const duration = (min) => {
  const m = Number(min) || 0;
  if (!m) return '';
  if (m >= 1440) return `${Math.round(m / 1440)} day${m >= 2880 ? 's' : ''}`;
  if (m >= 60) return `${+(m / 60).toFixed(1)} hr`;
  return `${m} min`;
};

/** Which day the customer means: { date: 'YYYY-MM-DD', label } or null. */
function dayFromText(text, now = new Date()) {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plus = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
  if (/\b(parso|parson|day after tomorrow|parmdivse)\b/.test(text)) return { date: ymd(plus(2)), key: 'dayAfter' };
  if (/\b(today|aaj|aje|aaje|abhi)\b/.test(text)) return { date: ymd(now), key: 'today' };
  if (/\b(tomorrow|tmrw|tmr|kal|kale|kaale)\b/.test(text)) return { date: ymd(plus(1)), key: 'tomorrow' };
  const i = DAYS.findIndex(d => has(text, d) || has(text, d.slice(0, 3)));
  if (i >= 0) { const n = (i - now.getDay() + 7) % 7 || 7; return { date: ymd(plus(n)), label: DAYS[i][0].toUpperCase() + DAYS[i].slice(1) }; }
  return null;
}

/**
 * Services the text asks about, best matches only: words from the service name and the customer's
 * own words (SERVICE_WORDS) both count, and so do numbers ("ceramic 3 years" → the 3-year coatings).
 * Maintenance and CoatCare versions only come first when the customer asks for them.
 */
const NAME_STOP = ['coating', 'service', 'cleaning', 'full', 'body', 'premium', 'year', 'years', 'time', 'steps', 'shield', 'armor', 'treatment'];
function findServices(text, services) {
  const groups = serviceGroups(text);
  const inGroup = (n) => groups.some(g => n.includes(g === 'rubbing' ? 'polish' : g) || (g === 'rubbing' && /rubbing|compound/.test(n))
    || (g === 'wash' && /wash|foam/.test(n)) || (g === 'underbody' && /underbody|rust/.test(n)));
  const scored = services.map(sv => {
    const n = sv.name.toLowerCase();
    const words = n.split(/[^a-z0-9]+/);
    const named = words.filter(w => w.length > 3 && !NAME_STOP.includes(w) && has(text, w)).length;
    if (!named && !inGroup(n)) return null;
    let score = named + (inGroup(n) ? 1 : 0) + words.filter(w => /^\d$/.test(w) && has(text, w)).length;
    if (/coatcare|maintenance/.test(n) && !/coat ?care|maintenance|top ?up/.test(text)) score -= 0.5;
    return { sv, score };
  }).filter(Boolean);
  const best = Math.max(0, ...scored.map(x => x.score));
  return scored.filter(x => x.score === best).map(x => x.sv);
}

// ── The agent ─────────────────────────────────────────────────────────────────
class StudioAgentProvider extends ILLMProvider {
  getProviderName() {
    return 'studio';
  }

  async generateResponse({ messages = [], context = {} }) {
    const userMsgs = messages.filter(m => m.role === 'user').map(m => String(m.content || ''));
    const raw = userMsgs[userMsgs.length - 1] || '';
    const text = toLatin(raw.toLowerCase()).replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
    // the last few customer messages (newest first) give the car / service when this message doesn't
    const earlier = userMsgs.slice(-5, -1).reverse().map(m => m.toLowerCase());
    const lang = detectLang(raw);
    const s = (key, vars) => say(lang, key, vars);
    const reply = (lines, confidence = 0.9, extra = {}) => ({ text: lines.filter(Boolean).join('\n'), tokensUsed: 0, confidence, ...extra });

    const studio = context.studio || {};
    const studioName = studio.studio_name || 'O3 Car Spaa';
    const services = context.services || [];
    const packages = context.packages || [];
    const products = context.products || [];
    const slots = context.slots || [];
    const customer = context.customer || null;
    const bookUrl = context.bookUrl;
    const firstName = customer?.name ? String(customer.name).split(' ')[0] : '';
    const nameVar = firstName ? ` ${firstName}` : '';
    const handOff = () => reply([s('handOff', { call: studio.mobile ? s('call', { mobile: studio.mobile }) : '' })], 0.4, { handover: true });
    const bookLine = () => (bookUrl ? s('bookHere', { url: bookUrl }) : s('replyBook'));

    if (!text) return handOff();

    // 1. Tricks and off-topic
    if (/ignore (all |previous )?instructions|system prompt|jailbreak|dan mode|bypass (your )?rules|reveal (your )?(secrets|instructions)|developer mode/.test(text)) {
      return reply([s('offTopic', { studio: studioName })], 1);
    }

    // 2. Car: this message → earlier messages → the customer's saved car
    let car = carFromText(text);
    if (!car) for (const m of earlier) { car = carFromText(m); if (car) break; }
    if (!car && customer?.car?.cat) car = { cat: customer.car.cat, model: customer.car.model };
    const carLabel = car ? (car.model || CAR_TYPE_LABELS[car.cat] || car.cat) : '';

    // 3. Services: this message → (for follow-ups like "and for SUV?") earlier messages
    let groups = serviceGroups(text);
    // products first: "seat cover" is a product, not a seat service
    const productWords = text.split(/[^a-z0-9]+/).filter(w => w.length > 3 && !['have', 'available', 'price', 'want', 'need', 'kitna', 'ketla', 'chahiye', 'joie', 'your', 'with'].includes(w));
    const productHits = products.filter(p => {
      const pw = p.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
      const hits = productWords.filter(w => pw.some(x => x === w || x.startsWith(w) || (w.length >= 5 && lev(x, w) <= 1)));
      return hits.length >= (pw.length >= 3 ? 2 : 1) || (PRODUCT_HINT.test(text) && hits.length >= 1);
    });
    let matched = productHits.length && !groups.length ? [] : findServices(text, services);
    const isFollowUp = !matched.length && (carFromText(text) || /\b(and|aur|ane|for|mate|ke liye|what about|ka|ni|nu)\b/.test(text)) && text.split(' ').length <= 6;
    if (isFollowUp) for (const m of earlier) { const r = findServices(m, services); if (r.length) { matched = r; groups = serviceGroups(m); break; } }

    // 4. What they want
    const has_ = (re) => re.test(text);
    const asksPrice = has_(/price|prize|cost|rate|charge|kitna|kitne|kitni|ketla|ketlu|bhav|how much|₹|\brs\b|rupees|paisa|paise|kimat|keemat|quote|estimate/);
    const asksBook = (has_(/\bbook|booking|slot|appointment|available|availability|schedule|free time|kab aa|kyare aav|kab|kyare|aaj|kal|kale|parso|tomorrow|today/) || !!dayFromText(text))
      && !(PRODUCT_HINT.test(text) && !/\bbook|slot/.test(text)); // "is X available" is about stock, not slots
    const asksStatus = has_(/status|\bready\b|ho gaya|hogaya|thai gayu|\bthayu\b|kab milegi|kyare malse|where is my car|is my car done|car done|update on my|my booking|meri booking|mari booking/);
    const asksPkg = has_(/package|packages|membership|plan|subscription|amc|yearly|monthly|annual|combo|pack\b/);
    const asksProduct = (PRODUCT_HINT.test(text) || productHits.length > 0) && !matched.length;
    const isComplaint = has_(/complain|complaint|compensat|refund|damage|damaged|broke|broken|scratch(ed)? (by|at|while)|worst|very bad|bad service|not happy|unhappy|angry|cheat|fraud|police|consumer court|kharab|ghatiya|bakwas|bekar|bigad|nuksan|kharab kaam|kharab kyu/);
    const asksOffer = has_(/offer|discount|coupon|\bcode\b|\bdeal|\bsale\b|\bkam\b|\bochu\b|\bless\b|first wash|diwali|festival/);
    const asksWhere = has_(/where|address|location|located|map|kaha|kahan|kidhar|kai jagya|kya aavel|direction|reach/);
    const asksHours = has_(/open|close|closing|timing|timings|hours|sunday|holiday|time table|khulla|band|kab tak|kyare sudhi/) && !asksBook;
    const asksPay = has_(/pay|payment|upi|gpay|google pay|phonepe|paytm|cash|card|online|qr/);
    const asksPickup = has_(/pickup|pick up|pick-up|drop|home service|doorstep|ghar|ghare|lene aa|leva aav/);
    const asksTime = has_(/how long|kitna time|kitni der|ketlo time|ketli var|duration|hours will|time lagega|time lage/);
    const asksMenu = has_(/services|service list|what do you do|kya kya|shu shu|menu|list|options|what all/) && !matched.length;
    const isThanks = has_(/^(thanks|thank you|thx|ty|dhanyavad|dhanyawad|shukriya|aabhar|thank u)\b/);
    const isOk = has_(/^(ok|okay|okk|k|fine|done|great|sure|theek|thik|accha|acha|saru|haa|ha|yes|hmm|👍)[.! ]*$/);
    const isGreeting = has_(/^(hi+|hello+|hey+|hii+|helo|namaste|namaskar|kem cho|jai shree krishna|jsk|good (morning|afternoon|evening)|gm)\b/);
    const isBookCmd = has_(/^book\b/);

    // 5. Answers, most specific first
    if (isComplaint) return handOff();
    if (isThanks && text.split(' ').length <= 5) return reply([s('thanks', { name: nameVar })], 1);
    if (isOk && !asksBook) return reply([s('ok')], 0.9);

    // Current booking status (known customers only)
    if (asksStatus && !asksPrice && !asksPkg) {
      const b = customer?.booking;
      if (!b) return customer ? reply([s('noBooking')], 0.5, { handover: true }) : handOff();
      const st = s(`status_${b.status}`) || b.status.replace(/_/g, ' ');
      return reply([s('status', { name: firstName ? `${firstName}, ` : '', car: b.car || carLabel || 'car', service: b.service || '-', when: b.when || '', status: st })], 0.9);
    }

    const lines = [];

    // Prices for the services asked about
    if (matched.length) {
      lines.push(car ? s('pricesFor', { car: carLabel }) : s('prices'));
      if (matched.length > 5) matched = [...matched].sort((a, b) => (Number(a.price_hatchback) || 0) - (Number(b.price_hatchback) || 0));
      for (const sv of matched.slice(0, 5)) {
        const p = car ? priceFor(sv, car.cat) : 0;
        const time = duration(sv.duration_minutes);
        lines.push(car && p ? `• ${sv.name}: ${inr(p)}${time && (asksTime || matched.length <= 2) ? ` (${s('takes')} ${time})` : ''}` : `• ${sv.name}: ${priceRange(sv)}`);
      }
      if (!car) lines.push('', s('askCar'));
    } else if (asksMenu || (asksPrice && !asksPkg && !asksProduct && services.length)) {
      lines.push(car ? s('pricesFor', { car: carLabel }) : s('prices'));
      for (const sv of services.slice(0, 8)) {
        const p = car ? priceFor(sv, car.cat) : Number(sv.price_hatchback) || 0;
        lines.push(`• ${sv.name}: ${car ? inr(p) : `${p ? `from ${inr(p)}` : ''}`}`);
      }
      if (!car) lines.push('', s('askCar'));
    }

    // Packages
    if (asksPkg) {
      if (packages.length) {
        lines.push(s('pkgs', { car: car ? ` (${carLabel})` : '' }));
        for (const pk of packages.slice(0, 5)) {
          const p = car ? priceFor(pk, car.cat) : 0;
          const bits = [pk.wash_count ? `${pk.wash_count} ${s('washes')}` : '', pk.package_validity ? s('valid', { m: pk.package_validity }) : ''].filter(Boolean).join(', ');
          lines.push(`• ${pk.name}: ${car && p ? inr(p) : priceRange(pk)}${bits ? ` — ${bits}` : ''}`);
        }
        if (!car) lines.push('', s('askCar'));
      } else lines.push(s('noPkgs'));
    }

    // Products
    if (asksProduct) {
      const list = productHits.length ? productHits : products.filter(p => p.in_stock);
      if (list.length) {
        const inStock = list.filter(p => p.in_stock);
        if (inStock.length) {
          lines.push(s('products'));
          for (const p of inStock.slice(0, 6)) lines.push(`• ${p.name}: ${inr(p.price)}`);
        }
        for (const p of list.filter(x => !x.in_stock).slice(0, 2)) lines.push(s('outOfStock', { p: p.name }));
        lines.push(s('productsNote'));
      } else lines.push(s('noProducts'));
    }

    // Offers (only what the studio has actually set up)
    if (asksOffer) {
      const o = context.offer;
      if (o) lines.push(s('offer', { offer: o.text }));
      if (context.firstWash) lines.push(s('firstWash'));
      if (!o && !context.firstWash) lines.push(s('noOffer'));
    }

    // Slots
    if (asksBook || isBookCmd) {
      const day = dayFromText(text);
      const list = day ? slots.filter(sl => sl.date === day.date) : slots;
      const dayWord = day ? s(day.key) : '';
      if (list.length) {
        lines.push(lines.length ? '' : null, s('slots', { day: day ? ` (${dayWord})` : '' }));
        for (const sl of list.slice(0, 5)) lines.push(`• ${sl.label}`);
      } else if (slots.length) {
        lines.push(lines.length ? '' : null, s('noSlots', { day: ` ${dayWord}` }).split('.')[0] + '.', s('nextFree'));
        for (const sl of slots.slice(0, 4)) lines.push(`• ${sl.label}`);
      } else {
        lines.push(lines.length ? '' : null, s('noSlots', { day: day ? ` ${dayWord}` : '' }));
        if (!bookUrl) return reply(lines.filter(l => l !== null), 0.5, { handover: true });
      }
    }

    // Duration on its own ("how long does ceramic take?") is covered above; without a service, list the common ones
    if (asksTime && !matched.length) {
      for (const sv of services.slice(0, 6)) if (sv.duration_minutes) lines.push(`• ${sv.name}: ${duration(sv.duration_minutes)}`);
    }

    if (asksPickup) {
      const amt = Number(context.pickupCharge) || 0;
      if (context.pickupAvailable === false) lines.push(s('handOff', { call: '' }).split('\n')[0]);
      else lines.push(s('pickup', { charge: amt > 0 ? s('pickupCharge', { amt: inr(amt) }) : '' }));
    }
    if (asksPay) lines.push(s('pay', { upi: studio.upi_id ? s('upi', { upi: studio.upi_id }) : '' }));
    if (asksWhere && studio.address) {
      lines.push(s('address', { studio: studioName, address: studio.address }));
      if (studio.maps_url) lines.push(s('mapsNote', { url: studio.maps_url }));
      if (studio.hours) lines.push(s('hours', { hours: studio.hours }));
    }
    if (asksHours) {
      if (studio.hours) lines.push(s('hours', { hours: studio.hours }));
      else if (!lines.length) return handOff();
    }

    if (lines.filter(Boolean).length) {
      // anything about prices or services ends with how to book
      if ((matched.length || asksPrice || asksPkg || asksMenu) && !(asksBook || isBookCmd)) lines.push('', bookLine());
      else if ((asksBook || isBookCmd) && bookUrl) lines.push('', bookLine());
      return reply(lines.filter(l => l !== null), 0.9);
    }

    // 6. The studio's own FAQ (knowledge base) — only a real match, never a random article
    const kb = (context.knowledge || [])
      .map(k => {
        const kws = String(k.keywords || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
        const title = String(k.title || '').toLowerCase().split(/\W+/).filter(w => w.length > 3);
        return { k, score: kws.filter(w => has(text, w)).length * 3 + title.filter(w => has(text, w)).length * 2 };
      })
      .filter(x => x.score >= 3)
      .sort((a, b) => b.score - a.score)[0];
    if (kb) return reply([String(kb.k.content).slice(0, 900)], 0.8);

    // 7. Hello
    if (isGreeting || text.split(' ').length <= 2) {
      const top = services.slice(0, 5).map(sv => `• ${sv.name}`).join('\n');
      return reply([s('hi', { name: nameVar, studio: studioName }), top ? `${s('weOffer')}\n${top}` : '', '', s('askWhat')], 0.9);
    }

    // 8. Not sure → a person replies
    return handOff();
  }
}

module.exports = StudioAgentProvider;
module.exports.detectLang = detectLang;
module.exports.dayFromText = dayFromText;
module.exports.findServices = findServices;
module.exports.carFromText = carFromText;
