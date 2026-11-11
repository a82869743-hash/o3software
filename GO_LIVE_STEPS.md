# O3 Car Spaa: go-live steps (manual work)

Everything you or the client must do by hand to launch: the outside services, the live server and the Google Play listing.
The App Store is not included. Steps marked **→ me** are where you hand something to me.

**Never paste keys or passwords in chat.** Put them in `server/.env` on the server yourself (step 6).

---

## Order and timing: start 1 and 2 today, because they wait on other companies

| # | Task | Your time | Waiting on others |
|---|---|---|---|
| 1 | D-U-N-S number + Google Play organisation account | 30 min | D-U-N-S: up to ~30 days (often faster). Google verification: a few days. |
| 2 | Meta Business verification + WhatsApp | 1–2 h | Business verification: 1–3 days. Each template: minutes to 1 day. |
| 3 | Groq key (free) | 5 min | none |
| 4 | Gmail app password (app emails) | 10 min | none |
| 5 | Domain pointed at the VPS | 10 min | DNS: up to a few hours |
| 6 | Server set-up and keys | 1–2 h, with me | none |
| 7 | Play Store listing and release | 1–2 h | Google review: hours to 7 days for a new app |

---

## 1. Google Play developer account (organisation)

Register as an **organisation**, not a personal account. New personal accounts must run a closed test with 12 testers for 14 days before going live; organisation accounts don't.

1. **Get a D-U-N-S number** (free) from Dun & Bradstreet India. The legal business name and address must exactly match the GST or Udyam certificate.
2. Go to **play.google.com/console/signup** → **An organisation** → enter the D-U-N-S number.
3. Use the studio's Gmail as the account email. Add a business phone and the website, e.g. `https://o3carspaa.in`.
4. Pay the **$25 one-time fee** by card.
5. Finish identity verification: upload the business documents Google asks for, and verify the phone and email.
6. **→ me:** tell me when the account is verified. Send nothing else.

## 2. WhatsApp

**Decided 11 Nov 2026: launch on the linked-phone WhatsApp (Baileys).** The studio number is linked by scanning a QR in Admin → WhatsApp, just like WhatsApp Web. You don't need Meta verification, templates or a webhook for this. Login and sign-up codes also go out on WhatsApp.
- Live `server/.env`: `WHATSAPP_PROVIDER=baileys_demo`, `ENABLE_BAILEYS_DEMO=true`, `DEMO_WHITELIST=*`.
- After the server is live: Admin → WhatsApp → scan the QR with the studio phone (WhatsApp → Linked devices → Link a device).
- The app runs as a single copy while this is on (`ecosystem.config.js` does it automatically), because a number allows one link.
- Risk: this is not Meta's official service. Mass promotional messages can get the number blocked. Replies, booking messages and codes are paced and limited to stay safe.

The Meta Cloud API steps below are only needed if you switch to the official service later.

### Optional later: Meta Cloud API

Needs: GST or Udyam certificate, the owner's PAN, a card, and a **mobile number that is not on the WhatsApp app**. If the number is on WhatsApp now, delete that WhatsApp account first: WhatsApp → Settings → Account → Delete account.

1. **business.facebook.com** → create a **Business portfolio** named exactly as on the GST certificate.
2. **Business settings → Security centre → Start verification.** Upload the GST or Udyam certificate and confirm by phone or email. This takes 1–3 days.
3. **developers.facebook.com → My apps → Create app → type "Business"** → link it to the portfolio → **Add product → WhatsApp**.
4. **WhatsApp → API set-up → Add phone number:**
   - enter the studio number and verify it by SMS
   - display name **O3 Car Spaa**; Meta approves the name
5. **WhatsApp Manager → Payment methods → add the card.** Messages stop without a card on file.
6. **Business settings → Users → System users → Add**:
   1. Name it `o3-server` with the **Admin** role.
   2. **Assign assets**: give it the app and the WhatsApp account, with full control.
   3. **Generate token**: choose the app, expiry **Never**, and the permissions `whatsapp_business_messaging` and `whatsapp_business_management`.
   4. Copy the token.
7. Copy two IDs from **WhatsApp → API set-up**: the **Phone number ID** and the **WhatsApp Business Account ID**.
8. Copy the **App secret** from **App settings → Basic → Show**.
9. Make up a **verify token**: any random word, for example `o3-hook-7381`.
10. Create the **message templates** in WhatsApp Manager → Message templates:

    | Template | Category | Language | Body |
    |---|---|---|---|
    | `o3_service_update` | Utility | English | `Hi {{1}}, {{2}}` |
    | `o3_login_code` | Authentication | English | Meta's standard code text, with a **Copy code** button |

    The first sends booking confirmations, reminders, bills, and payment and package alerts. The second sends login codes.
11. **Webhook:** do this step **after the server is live** (step 6).
    1. Go to **WhatsApp → Configuration → Edit**.
    2. Callback URL: `https://YOUR-DOMAIN/api/whatsapp/webhook`. Verify token: the word from step 9.
    3. Click **Verify and save**, then **Manage → subscribe to `messages`**.
12. **→ me:** tell me when the templates are approved. I'll then switch login codes to WhatsApp, which is the app change still pending on my side.

## 3. Groq (leads and WhatsApp AI agent, free)

1. **console.groq.com** → sign up with the studio Gmail. No card needed.
2. **API Keys → Create API key** → name it `o3-server` → copy it. It is shown only once.
3. Don't add billing. The free tier allows about 1,000 replies a day. Above that, or if Groq is down, the studio's own rule-based agent replies from live services, prices and slots.

## 4. Gmail app password (receipts and app emails)

1. Sign in to the studio Gmail → **Google Account → Security → turn on 2-Step Verification**.
2. **Security → App passwords** → create one named `O3 app` → copy the 16-letter password.

## 5. Point the domain at the VPS

1. **hPanel → VPS → Overview** → copy the server's **IP address**.
2. **hPanel → Domains → your domain → DNS / Nameservers → DNS records** → add:
   - `A` record, name `@`, value = the VPS IP, TTL default
   - `A` record, name `www`, value = the VPS IP
3. Delete any older `A` record for `@` or `www` that points to a different address. The change spreads within minutes to a few hours.

## 6. Live server set-up (we do this together)

The full commands are in `DEPLOYMENT.md`, steps 1–8. What you do by hand:
1. **hPanel → VPS → OS:** choose **Ubuntu 24.04**. Set a strong root password and keep it private.
2. Open a terminal connection to the server; I'll guide you through each command. If you give this session a terminal on the server, I'll run them while you type the passwords.
3. **Put the keys in `server/.env` on the server**, never in chat:

   | Setting | Value |
   |---|---|
   | `WHATSAPP_PROVIDER` | `baileys_demo` (linked phone, see step 2) |
   | `ENABLE_BAILEYS_DEMO` | `true` |
   | `DEMO_WHITELIST` | `*` |
   | `GROQ_API_KEY` | already on this PC's `server/.env`: copied over during set-up |
   | `SMTP_USER` | the studio Gmail |
   | `SMTP_PASS` | app password from 4.2 |

   I generate the database password, login secret and encryption key on the server.
4. Link WhatsApp: Admin → WhatsApp → scan the QR with the studio phone.
5. Log in to the live admin. The clean studio data is already loaded (staff, services, prices, packages, stock, roles, UPI QR). Do:
   - **Staff:** Admin → Staff → open each person → Edit → put their real mobile and a new password. All except the admin still have placeholder numbers.
   - **Stock:** Inventory → set the real quantity of each item.
   - **Settings:** check the studio address and UPI ID. **Fill in "Studio timings"** (it is empty), so the WhatsApp agent can answer "what time do you open?".
   - **Leads agent:** add the studio's common questions and answers in the Knowledge Base (it is empty).
6. Demo data and test customers were already cleared on 11 Nov 2026. Nothing to clear on the live server.

## 6b. Off-server backup copy to Google Drive (week 1, 15 min)

Backups are made on the server twice a day. This sends a copy to the studio's Google Drive too, so they survive even if the server is lost or hacked.
1. On the server: `apt-get install -y rclone`, then `rclone config`:
   1. `n` (new remote), name `gdrive`, storage `drive`. Leave client id and secret empty. Scope `1` (full access).
   2. "Use web browser to automatically authenticate?" → `n`.
   3. It prints an `rclone authorize "drive" ...` command. Run that on your Windows PC ([rclone.org/downloads](https://rclone.org/downloads/)), sign in with the studio Gmail, and paste the code it gives you back into the server.
   4. Shared drive `n` → `y` to save → `q` to quit.
2. Add `BACKUP_REMOTE=gdrive:O3-backups` to `server/.env`.
3. Test it: `bash /var/www/o3-car-spaa/scripts/backup.sh`. A folder named **O3-backups** should appear in the studio's Google Drive.

## 7. Google Play listing and release

**From me first:**
- the signed app file (`.aab`)
- the privacy policy page `https://YOUR-DOMAIN/privacy`
- the account-deletion page `https://YOUR-DOMAIN/delete-account`
- a reviewer test login
- the listing texts and images: icon 512×512, feature graphic 1024×500, 4–8 phone screenshots

**In Play Console:**
1. **Create app:**
   - name **O3 Car Spaa**
   - default language **English (India)**
   - **App** · **Free**
   - tick the declarations
2. **Dashboard → "Set up your app"**, one form at a time:
   - **Privacy policy:** `https://YOUR-DOMAIN/privacy`
   - **App access:** "All or some functionality is restricted" → add the reviewer mobile and password I give you. Reviewers can't receive OTPs.
   - **Ads:** No ads.
   - **Content rating:** start the questionnaire, choose the category for all other app types, and answer No to violence, gambling and so on. The result should be rated for everyone.
   - **Target audience:** 18 and over.
   - **News app:** No. **Government app:** No. **Health app:** No. **Financial features:** none.
   - **Data safety:**

     | Question | Answer |
     |---|---|
     | Data collected | Name; phone number; email address (optional); approximate and precise location (pickup address, staff check-in); photos (car and check-in photos); purchase history (bookings, orders) |
     | Purpose | App functionality and account management |
     | Shared with third parties | No (Meta and Groq process data for us; that is not "sharing") |
     | Encrypted in transit | Yes |
     | Users can ask for deletion | Yes, with the `/delete-account` link |
   - **Data deletion:** `https://YOUR-DOMAIN/delete-account`.
3. **Store listing:**
   - app name, short description and full description (from me)
   - icon, feature graphic and screenshots
   - category **Auto & Vehicles**
   - contact email; website optional
4. **Testing → Internal testing → Create release:**
   1. Accept **Play App Signing**.
   2. Upload the `.aab`, add your own and the client's Gmail as testers, and save.
   3. Open the tester link on your phones and install from Play.
   4. Check sign-in, booking, a product order, the job tracking screen and a PDF download.
5. **Production → Countries/regions → India → Create release:**
   1. Pick the same `.aab` from the library.
   2. Release notes: "First release."
   3. **Review release → Start rollout to production.**
6. Google's review takes hours to about 7 days for a new app. You get an email when it's live.
7. **Keep safe for ever:** the upload key file and its password, which I'll hand you. Every future update must be signed with it.

## My side (no action from you)

- **WhatsApp login codes:** switch them on once `o3_login_code` is approved.
- **Policy pages:** privacy policy, terms and refund pages.
- **Account deletion:** in the app (Profile → Delete account) and on the website.
- **Saved secrets:** remove them from `server/.env.production` in git. Fresh ones get generated on the server.
- **Server set-up:** together with you (step 6). The live database is loaded from `backups/golive/` (clean data, no test customers), as in `DEPLOYMENT.md` step 4.
- **Photo backups:** switch them to snapshots that store only new photos, so 34 kept copies don't fill the disk as job photos grow. Do this within the first month.
- **Team and rate card:** already inside the go-live data. Do **not** run `seed.js`, `seed_staff.js` or `seed_rate_card.js` on the live server; they would add test logins or old prices.
- **Android app:** wrap it, set the camera and location permissions (foreground only), and create the upload key and the signed `.aab`.
- **Store material:** listing texts, icon, feature graphic and screenshots.
- **Commit:** save everything to git once you approve.
