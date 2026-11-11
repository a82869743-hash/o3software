/**
 * MockLLMProvider.js — rule-based replies used when no AI key is connected (or the AI vendor is down).
 * Answers ONLY from live studio data passed in `context` (services & prices, free slots, studio info,
 * knowledge base). It never invents prices or times — when it doesn't know, it hands over to the team.
 */
const ILLMProvider = require('./ILLMProvider');

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const CAT_WORDS = [
  ['suv', ['suv', 'creta', 'seltos', 'fortuner', 'scorpio', 'thar', 'xuv', 'harrier', 'safari', 'innova', 'hector', 'carens', 'ertiga']],
  ['sedan', ['sedan', 'city', 'verna', 'ciaz', 'dzire', 'amaze', 'slavia', 'virtus', 'aura']],
  ['hatchback', ['hatchback', 'swift', 'baleno', 'i20', 'i10', 'alto', 'wagon', 'tiago', 'altroz', 'glanza', 'celerio']],
];

function priceLine(s, cat) {
  const p = { hatchback: s.price_hatchback, sedan: s.price_sedan, suv: s.price_suv };
  if (cat && Number(p[cat]) > 0) return `${s.name}: ${inr(p[cat])}`;
  const parts = [['Hatchback', p.hatchback], ['Sedan', p.sedan], ['SUV', p.suv]].filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${inr(v)}`);
  return parts.length ? `${s.name}: ${parts.join(' | ')}` : `${s.name}`;
}

class MockLLMProvider extends ILLMProvider {
  getProviderName() {
    return 'mock';
  }

  async generateResponse({ messages, context = {} }) {
    const last = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const lower = last.toLowerCase();
    const ok = (text, confidence = 0.9) => ({ text, tokensUsed: 0, confidence });
    const studio = context.studio || {};
    const services = context.services || [];
    const slots = context.slots || [];
    const bookUrl = context.bookUrl;
    const handOff = `Thanks for your message! 🙏 Our team will reply to you here shortly.${studio.mobile ? ` For anything urgent, call us on ${studio.mobile}.` : ''}`;

    // 1. Prompt-injection / off-topic attempts
    if (/ignore (all |previous )?instructions|system prompt|jailbreak|dan mode|bypass (your )?rules|reveal secrets/.test(lower)) {
      return ok('I can only help with car care at O3 Car Spaa — services, prices and bookings. 😊 How can I help with your car?', 1);
    }

    // 2. Car type mentioned → price for that type
    let cat = null;
    for (const [c, words] of CAT_WORDS) if (words.some(w => lower.includes(w))) { cat = c; break; }

    // 3. Find services the customer is asking about (by words in the service name / knowledge base)
    const tokens = lower.split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const matched = services.filter(s => {
      const name = s.name.toLowerCase();
      return tokens.some(t => name.includes(t)) || (lower.includes('ppf') && name.includes('ppf'));
    });

    const asksPrice = /price|cost|rate|charge|kitna|kitne|bhav|how much|₹|\brs\b/.test(lower);
    const asksBook = /book|slot|appointment|tomorrow|today|kal|aaj|available|schedule|time/.test(lower);
    const asksWhere = /where|address|location|map|kaha|kidhar/.test(lower);
    const asksHours = /open|close|timing|hours|sunday|holiday/.test(lower);
    const greeting = /^(hi+|hello|hey|hii+|namaste|kem cho|good (morning|afternoon|evening))\b/.test(lower.trim());

    if (matched.length || (asksPrice && services.length)) {
      const list = (matched.length ? matched : services).slice(0, 6).map(s => `• ${priceLine(s, cat)}`).join('\n');
      return ok(`Here are our prices${cat ? ` for your ${cat === 'suv' ? 'SUV' : cat}` : ''}:\n${list}\n\n${bookUrl ? `Book here: ${bookUrl}` : 'Reply BOOK to book a slot.'}`);
    }
    if (asksBook) {
      if (slots.length) {
        const list = slots.slice(0, 4).map(s => `• ${s.label}`).join('\n');
        return ok(`These slots are free:\n${list}\n\n${bookUrl ? `Book in 1 minute here: ${bookUrl}` : 'Reply with the slot you want and your car number, and our team will confirm.'}`);
      }
      return ok(`Our team will share the free slots with you shortly. ${bookUrl ? `You can also book here: ${bookUrl}` : ''}`.trim());
    }
    if (asksWhere && studio.address) {
      return ok(`📍 ${studio.studio_name || 'O3 Car Spaa'}: ${studio.address}${studio.hours ? `\n🕘 ${studio.hours}` : ''}`);
    }
    if (asksHours && studio.hours) {
      return ok(`🕘 We are open: ${studio.hours}`);
    }
    if (context.knowledge && context.knowledge.length) {
      const k = context.knowledge[0];
      return ok(`${k.content}`.slice(0, 900), 0.75);
    }
    if (greeting) {
      const top = services.slice(0, 4).map(s => `• ${s.name}`).join('\n');
      return ok(`Hi! 👋 Welcome to ${studio.studio_name || 'O3 Car Spaa'}.${top ? `\nWe offer:\n${top}` : ''}\n\nAsk me for prices or reply BOOK to book a slot.`);
    }
    return ok(handOff, 0.4);
  }
}

module.exports = MockLLMProvider;
