# O3 Car Spaa — Inbound AI Leads Agent & CRM Engine

Operational specification for the conversational AI agent handling inbound WhatsApp inquiries, catalog grounding via RAG, guardrail compliance, and human handover.

---

## 🤖 System Overview

The **Leads Agent** acts as the front-desk concierge for each O3 Car Spaa studio. It:
1. Listens for customer messages over the active WhatsApp gateway.
2. Identifies customer intent, vehicle category (Hatchback, Sedan, SUV), and service interest.
3. Retrieves verified service packages and pricing from the franchise knowledge base.
4. Synthesizes warm, accurate responses without hallucinating prices.
5. Proposes booking slots for studio visits.
6. Automatically flags edge cases and supports 1-click **Human Takeover**.

---

## 🧠 System Prompt Architecture

The system prompt is dynamically assembled in [LeadsAgentService.js](server/src/services/ai/LeadsAgentService.js):

```text
You are the helpful, professional, and knowledgeable AI Assistant for "O3 Car Spaa", a premier multi-franchise car detailing studio.

Your goals:
1. Provide accurate answers about services (PPF, Ceramic Coating, Deep Interior Spa, Exterior Polish), pricing, studio hours, and booking.
2. NEVER invent or hallucinate prices or policies. Rely strictly on the Knowledge Base below.
3. Keep answers concise, warm, and structured (use bullet points and emojis where helpful).
4. If the customer mentions their car (e.g., Creta, Fortuner, City, Thar, Seltos), acknowledge the model and suggest the right package.
5. If the customer is looking to book, propose available morning (10:00 AM) or afternoon (2:30 PM) slots.
6. Support inquiries in English, Hindi, Gujarati, or Hinglish naturally.

VERIFIED KNOWLEDGE BASE:
{{DYNAMIC_RAG_CONTEXT_FROM_FRANCHISE_CATALOG}}

STRICT GUARDRAILS:
- Do not promise discounts greater than official pricing.
- Do not provide mechanical repair or engine overhaul advice (we specialize exclusively in car detailing, paint protection, and interior sanitization).
- If customer expresses frustration or asks for manager/human, politely hand over.
```

---

## 📚 RAG Knowledge Base Format

Knowledge is segmented per franchise in the `lead_knowledge_base` database table. Each article contains:
- `category`: `pricing`, `faq`, `warranty`, `studio_hours`, `location`
- `title`: Short descriptive topic
- `content`: Plain markdown content with vehicle model and pricing breakdowns
- `keywords`: Comma-separated search tokens for sub-second keyword matching

### Standard Seed Articles ([seed_lead_knowledge.sql](server/migrations/seed_lead_knowledge.sql))
1. **Ceramic Coating Packages**: 9H multi-layer nano coating, 3-year warranty, prices for Hatchback (₹14,999), Sedan (₹18,999), SUV (₹22,999).
2. **Garware TPU Paint Protection Film (PPF)**: Self-healing TPU film, 5-year warranty against scratches and stone chips, prices for Hatchback (₹65,000), Sedan (₹80,000), SUV (₹95,000).
3. **Deep Interior Spa**: High-pressure steam sanitization, leather conditioning, ozone treatment. Hatchback (₹1,499), Sedan (₹1,999), SUV (₹2,499).
4. **Studio Hours & Location**: 9:30 AM to 8:30 PM, Monday through Sunday. Complimentary pickup & drop available within 5km.

---

## 🛡️ Guardrails & Safety Mechanisms

Defined in [AgentGuardrails.js](server/src/services/ai/AgentGuardrails.js):

| Trigger | Condition | Action Taken |
| :--- | :--- | :--- |
| **STOP / Opt-Out** | Message text: `"STOP"`, `"UNSUBSCRIBE"`, `"CANCEL"` | Registers in `whatsapp_opt_outs`; suppresses all future outbound messages immediately. |
| **Manager Request** | Customer says `"human"`, `"manager"`, `"call me"`, `"talk to person"` | Switches `agent_mode` to `'human'`; alerts studio staff on dashboard. |
| **Disallowed Topics** | Mechanics, engine repair, painting, insurance claims | Polite redirect to authorized detailing services only. |
| **Competitive Pricing** | User asks to match external competitor rates | Re-emphasizes premium quality Garware TPU and warranty benefits without unauthorized discounts. |

---

## 👤 Human Handover Protocol

### Automatic Escalation
If a customer expresses frustration, uses hostile language, or specifically asks to speak with staff:
1. `LeadsAgentService` automatically sets `whatsapp_conversations.agent_mode = 'human'`.
2. Emits a realtime Socket.io notification to the studio manager: `lead:escalated`.
3. AI halts automated replies so staff can take over the conversation directly from the Unified Inbox.

### Manual Takeover
1. Studio manager navigates to **Leads / Unified Inbox** in the Admin dashboard.
2. Clicks on the conversation thread.
3. Toggles the **Agent Mode** switch from `AI Agent` to `Human Takeover`.
4. Types responses directly; customer receives messages seamlessly from the studio's WhatsApp number.

---

## 📊 Evaluation & Verification (50-Message Benchmark)

The agent was verified against a 50-message synthetic evaluation dataset ([test_phase3_leads_agent.js](server/test_phase3_leads_agent.js)):
- **Catalog Grounding Accuracy**: 100% (No hallucinated rates; exact Sedan/SUV prices returned).
- **Multilingual Understanding**: Accurate comprehension of English, Hindi, and Hinglish queries.
- **Opt-Out Compliance**: 100% suppression of outbound messages following a `"STOP"` trigger.
- **Latency**: Sub-second response time for cached catalog RAG queries.
