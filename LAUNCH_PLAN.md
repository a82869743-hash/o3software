# O3 Car Spaa — Launch Plan (Web → Play Store → App Store)

This plan picks the cheapest and safest option at every step. ⏱ = how long it takes. 💰 = cost.

> **Start the paperwork in Phase 1 TODAY.** Approvals (Meta, SMS DLT, Apple, Google) take days to weeks, and they run alongside everything else.

---

## Phase 0 — Finish the web app (you + me) · ⏱ 2–4 days

1. **You:** test manually on phone and laptop with the logins in `LOGINS.local.txt`. Send me anything that looks wrong; I fix it.
2. **You:** enter real data.
   - Super admin: **Services and prices**, packages, price visibility.
   - Admin: **slots**, **staff**, studio info, payment QR, offers banner, loyalty and referral rules.
3. **Me:** commit the code, then remove the test records ("Test …", "Flow …", "Sec …").

## Phase 1 — Accounts and paperwork (start today, all in parallel) · ⏱ 1–3 weeks

| # | What | Why | 💰 | ⏱ |
|---|---|---|---|---|
| 1 | **D-U-N-S number** (free, from dnb.com, for your registered business) | Lets you open **organisation** developer accounts. Google then skips the "12 testers × 14 days" rule, and the store shows "O3 Car Spaa" instead of your personal name | Free | 5–14 days |
| 2 | **Meta Business verification + WhatsApp Cloud API number** | WhatsApp messages and AI replies (see `INTEGRATIONS_SETUP.md` §3.1) | Free (pay per message) | 1–7 days |
| 3 | **SMS DLT registration + 2Factor account** | OTP login SMS (§3.3) | ~₹5,900 once + ~₹0.20/SMS | 2–7 days |
| 4 | **Business email** (Hostinger mailbox) or Gmail app password | Invoices and reports by email (§3.2) | Free | 10 min |
| 5 | **Claude API key** (console.anthropic.com, set a monthly limit) | AI auto-reply (§3.4) | ~₹100–300/month | 5 min |
| 7 | **Google Play Console** (organisation account, needs D-U-N-S) | Android app | **$25 once** | 2–7 days |
| 8 | **Apple Developer Program** (organisation, needs D-U-N-S) | iPhone app | **$99/year** (~₹8,500) | 2–14 days |

## Phase 2 — Go live as a website (me + you) · ⏱ 1–2 days

1. Deploy to the Hostinger VPS. The scripts are already in `deploy/` and `DEPLOYMENT.md`: domain, free SSL, MySQL, PM2, nightly backups.
2. Put the API keys in `server/.env` on the server. Set `ENABLE_BAILEYS_DEMO=false` and `NOTIFICATION_SANDBOX=false`.
3. Open **Settings → Connections**. All rows should show a green tick ✅. Press every **Test** button.
4. Do one full real job: booking → job card → stages → bill → WhatsApp → feedback.
5. Run it as a website with a few real customers for a week. This is the cheapest way to catch real-world issues before the stores.

## Phase 3 — Turn it into a mobile app (me) · ⏱ 3–5 days

- **Capacitor** wraps the same code into Android and iOS apps. It is free, and there is one codebase for web, Android and iPhone. The code is already prepared for it (`utils/endpoints.ts`).
- **One app: "O3 Car Spaa".** Customers and staff log in to the same app. Admins keep using the website (and can also log in on the app). One app means one review and less work.
- **Things the stores require** (Apple rejects plain "website in a box" apps), all of which I will add:
  - Push notifications (Firebase Cloud Messaging, free) for job updates and offers.
  - Native GPS for pickup and delivery, and the native camera for car photos.
  - An **"Delete my account" button** inside the app. Both stores require it.
  - **Privacy Policy** and **Terms** pages, available on a public link.
  - App icon, splash screen, and a "no internet" screen.
  - A **demo login** for the store reviewers (a customer account with sample data).
- You test the Android version by installing the APK on your phone.

## Phase 4 — Google Play Store · ⏱ 3–10 days

1. In Play Console, create the app and fill in:
   - store listing: name, short and full description, **phone screenshots** (I'll make them), 512×512 icon, 1024×500 banner;
   - **Data safety form** (I'll give you the answers);
   - content rating questionnaire;
   - privacy policy link;
   - target audience 18+;
   - reviewer demo login.
2. Upload the **AAB file** (I build it) to **Internal testing** and try it yourself.
3. Then **Production**: submit for review, which takes 1–7 days for a first app.
   - With a *personal* account, you must first run Closed testing with 12 testers for 14 days. That is why the organisation account in Phase 1 matters.

## Phase 5 — Apple App Store · ⏱ 5–14 days

1. **No Mac needed.** Build in the cloud with **Codemagic** (free tier, about 500 build minutes/month).
2. In App Store Connect, create the app and fill in:
   - screenshots (6.7" and 6.5" iPhone);
   - description, keywords and support URL;
   - **App Privacy labels**;
   - privacy policy link;
   - reviewer demo login with notes.
3. Use **TestFlight** first: install it on your iPhone and check everything.
4. Submit for review (usually 1–3 days). If Apple rejects it, they say why. We fix it and resubmit, which is common the first time.

## Phase 6 — After launch (ongoing)

- **Changes to the backend, prices, services and offers go live instantly**, with no app update needed.
- Design or app changes need a new build. Submit the update to both stores (review takes 1–3 days).
- Check daily backups and the server logs. Renew the Apple membership yearly.
- Reply to store reviews and ask happy customers to rate you (the app already sends feedback links).

---

## Money summary

| One-time | |
|---|---|
| Google Play | $25 (~₹2,100) |
| SMS DLT registration | ~₹5,900 |
| D-U-N-S, Capacitor, Firebase, Codemagic | Free |

| Yearly / monthly | |
|---|---|
| Apple Developer | $99/year (~₹8,500) |
| WhatsApp + SMS + AI + email (about 300 cars/month) | ~₹400–650/month |
| Hostinger VPS + domain | what you already pay |

## Rough timeline

- **Week 1:** your testing, real data, paperwork started, website live.
- **Week 2:** mobile app built, Android internal test.
- **Week 3:** Play Store review, TestFlight, then App Store review.

**Live on both stores in about 3–4 weeks.** The slowest parts are the outside approvals (D-U-N-S, Meta, DLT, Apple), not the code.
