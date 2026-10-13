/**
 * MockLLMProvider.js — High-fidelity Knowledge-grounded Mock AI Engine
 * Provides deterministic, zero-cost, grounded responses for local evaluation,
 * automated testing, and offline demonstrations.
 */
const ILLMProvider = require('./ILLMProvider');

class MockLLMProvider extends ILLMProvider {
  getProviderName() {
    return 'mock';
  }

  async generateResponse({ messages, temperature = 0.3, maxTokens = 500 }) {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const lower = lastUserMessage.toLowerCase();

    // 1. Prompt Injection Defenses
    if (
      lower.includes('ignore previous instructions') ||
      lower.includes('system prompt') ||
      lower.includes('dan mode') ||
      lower.includes('jailbreak') ||
      lower.includes('bypass your rules') ||
      lower.includes('bypass rules') ||
      lower.includes('reveal secrets') ||
      lower.includes('developer mode') ||
      lower.includes('system override') ||
      lower.includes('admin database') ||
      lower.includes('customer database')
    ) {
      return {
        text: 'I am the automated assistant for O3 Car Spaa and cannot modify my operating parameters or disclose confidential customer database systems. How can I help you with our car detailing services today?',
        tokensUsed: 45,
        confidence: 0.99
      };
    }

    // 2. Off-Topic Queries
    if (
      lower.includes('recipe') ||
      lower.includes('write code') ||
      lower.includes('python') ||
      lower.includes('weather in') ||
      lower.includes('who is president') ||
      lower.includes('world cup') ||
      lower.includes('fifa') ||
      lower.includes('cricket') ||
      lower.includes('football')
    ) {
      return {
        text: 'I can only assist with automotive detailing, ceramic coating, paint protection film, and booking inquiries at O3 Car Spaa. Let me know if you would like information on detailing packages for your vehicle!',
        tokensUsed: 40,
        confidence: 0.98
      };
    }

    // 3. Human Escalation Triggers (Complaints, Anger, Disputes, Explicit Human Request)
    if (
      lower.includes('talk to a human') ||
      lower.includes('human manager') ||
      lower.includes('talk to human') ||
      lower.includes('scam') ||
      lower.includes('cheat') ||
      lower.includes('kharab') ||
      lower.includes('bakwas') ||
      lower.includes('complaint') ||
      lower.includes('manager') ||
      lower.includes('owner') ||
      lower.includes('refund') ||
      lower.includes('dispute') ||
      lower.includes('double charged') ||
      lower.includes('scratch kar diya') ||
      lower.includes('connect me')
    ) {
      return {
        text: 'I understand your concern and apologize for any inconvenience. I have flagged this conversation for human takeover and transferred you to our senior studio manager who will review your query and respond shortly.',
        tokensUsed: 50,
        confidence: 0.95,
        escalateToHuman: true
      };
    }

    // 4. Booking & Slot Proposals (Takes priority over general service queries when booking intent is clear)
    if (
      lower.includes('slot') ||
      lower.includes('book') ||
      lower.includes('appointment') ||
      lower.includes('schedule an inspection') ||
      lower.includes('aavti kaale subah') ||
      (lower.includes('kal') && (lower.includes('morning') || lower.includes('dopahar') || lower.includes('subah')))
    ) {
      return {
        text: 'We have morning slots available tomorrow at 10:00 AM and afternoon slots at 2:30 PM. Would you like me to reserve the 10:00 AM slot for your vehicle? Please provide your vehicle registration number and preferred service.',
        tokensUsed: 55,
        confidence: 0.94,
        isBookingIntent: true
      };
    }

    // 5. Discount & Bargaining Queries (Takes priority when asking for discount on any service)
    if (
      lower.includes('discount') ||
      lower.includes('offer') ||
      lower.includes('kam karo') ||
      lower.includes('sasta') ||
      lower.includes('rahem karo') ||
      lower.includes('best offer') ||
      lower.includes('bargain')
    ) {
      return {
        text: 'Per O3 Car Spaa policy, we offer up to 10% promotional discount on premium detailing packages above ₹2,000 for advance bookings. We maintain fixed transparent rates to guarantee top-tier materials and workmanship.',
        tokensUsed: 50,
        confidence: 0.95
      };
    }

    // 6. Timings, Location & Pickup
    if (
      lower.includes('pickup') ||
      lower.includes('drop') ||
      lower.includes('kilometers') ||
      lower.includes('distance') ||
      lower.includes('km') ||
      lower.includes('where is') ||
      lower.includes('address') ||
      lower.includes('location') ||
      lower.includes('open') ||
      lower.includes('timing') ||
      lower.includes('hours') ||
      lower.includes('sunday') ||
      lower.includes('monday')
    ) {
      return {
        text: 'O3 Car Spaa is open Tuesday to Sunday from 9:30 AM to 8:30 PM (Mondays closed for maintenance). We are located at O3 Car Spaa Detailing Hub, Surat, Gujarat. Free pickup & drop service is available within a 7 km radius! Would you like to reserve a slot?',
        tokensUsed: 60,
        confidence: 0.98
      };
    }

    // 7. Ceramic Coating Inquiries (English / Hinglish / Hindi / Gujarati)
    if (lower.includes('ceramic') || lower.includes('coating') || lower.includes('9h') || lower.includes('10h')) {
      return {
        text: 'At O3 Car Spaa, our 9H & 10H Nano Ceramic Glass Coating provides a deep mirror gloss, extreme hydrophobicity, and UV protection with a 3-year warranty (including free annual top-up maintenance). Pricing: Small Hatchback ₹14,999 | Sedan ₹18,999 | SUV ₹22,999. Which car model do you drive?',
        tokensUsed: 75,
        confidence: 0.96
      };
    }

    // 8. PPF (Paint Protection Film) Inquiries
    if (lower.includes('ppf') || lower.includes('paint protection') || lower.includes('garware') || lower.includes('scratch protection')) {
      return {
        text: 'Our Paint Protection Film (PPF) uses premium self-healing TPU (Garware) with 5-year and 7-year warranty options, protecting against stone chips, scratches, and swirl marks. Full body pricing: Small ₹65,000 | Sedan ₹80,000 | SUV ₹95,000. Would you like to schedule an inspection slot?',
        tokensUsed: 80,
        confidence: 0.96
      };
    }

    // 9. Deep Interior Cleaning / Car Wash Inquiries
    if (lower.includes('interior') || lower.includes('deep clean') || lower.includes('steam') || lower.includes('wash') || lower.includes('dhona') || lower.includes('ozone') || lower.includes('upholstery')) {
      return {
        text: 'Our Deep Interior Detailing includes high-pressure steam sanitization, leather conditioning, roof upholstery dry-cleaning, dashboard rejuvenation, and AC duct ozone deodorization (Duration: ~3-4 hrs). Pricing: Small ₹1,499 | Sedan ₹1,999 | SUV ₹2,499. What day would you like to bring your car in?',
        tokensUsed: 70,
        confidence: 0.97
      };
    }

    // 10. Exterior Spa, Polish & Rubbing
    if (lower.includes('exterior') || lower.includes('rubbing') || lower.includes('polish') || lower.includes('compound') || lower.includes('swirl') || lower.includes('wax') || lower.includes('clay bar')) {
      return {
        text: 'Our Full Exterior Spa & Polish includes 3-stage compound rubbing, swirl mark removal, clay bar decontamination, and high-gloss polymer wax seal (Duration: ~2.5 hrs). Pricing: Small ₹1,499 | Sedan ₹1,999 | SUV ₹2,499.',
        tokensUsed: 65,
        confidence: 0.97
      };
    }

    // 11. General Pricing / Rate Queries ("kitna lagega", "cost", "price")
    if (lower.includes('price') || lower.includes('cost') || lower.includes('rate') || lower.includes('charges') || lower.includes('kitna') || lower.includes('bhav')) {
      return {
        text: 'Here are standard prices at O3 Car Spaa: Deep Interior Spa starts at ₹1,499 (Hatchback) / ₹1,999 (Sedan) / ₹2,499 (SUV). Ceramic Coating starts at ₹14,999 (3-Year Warranty). PPF TPU Full Body starts at ₹65,000. Which service are you interested in?',
        tokensUsed: 65,
        confidence: 0.95
      };
    }

    // Default polite qualification response
    return {
      text: 'Namaste! Welcome to O3 Car Spaa. We specialize in Ceramic Coating (9H/10H), TPU Paint Protection Film (PPF), and Deep Interior Steam Spa. Could you share your vehicle model and the service you are looking for today?',
      tokensUsed: 45,
      confidence: 0.90
    };
  }
}

module.exports = MockLLMProvider;
