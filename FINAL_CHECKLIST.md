# Final manual check — O3 Car Spaa

Covers everything changed since the last round of fixes. Tick each box as you go.

**Set-up:** open two windows side by side, at phone size if you can (browser DevTools → phone toolbar):
- **Customer:** http://localhost:5173/dev-login?as=customer
- **Admin:** http://localhost:5174/dev-login?as=super_admin

Do one hard refresh (Ctrl+Shift+R) in each window first, so they load today's code. After that you should never need to refresh again.

---

## 1. Live updates (most important)
Keep both windows open. After each admin save, the customer window should change by itself within about 1 second.
- [ ] Admin → Services: change a price → the customer **Services** page shows the new price.
- [ ] Admin → Services: switch a service off → it disappears for the customer.
- [ ] Admin → Packages: change a package price or hide one → the customer **Buy Packages** page updates.
- [ ] Admin → Inventory: change a product price or photo → the customer **Shop** updates.
- [ ] Admin → Settings: change the offer title or code → the customer home banner updates.
- [ ] Customer books a slot → the admin **Dashboard** and **Bookings** show it without refresh.
- [ ] Customer orders a product → admin **Product Orders** shows it.
- [ ] Admin moves a job card to the next stage → the customer **job tracking** screen moves.
- [ ] Switch to another tab or app for a minute, change something in admin, come back → the screen catches up.
- [ ] While typing in a form, a change from the other window does **not** wipe what you typed. The refresh waits until you click out.

## 2. PDFs
- [ ] Job card → Download PDF: opens almost at once (the first open of a card takes about 1 s).
- [ ] The job card PDF has the same look as the invoice: studio photo top-right, customer and vehicle boxes, UPI QR, notes on separate lines.
- [ ] Invoice and quotation PDFs download fast too.

## 3. Admin screens fixed this round (check at phone size)
- [ ] Dashboard: package-expiry popup is clean, with a photo, Remind buttons and "Reminded once / twice".
- [ ] Dashboard: Recent job cards show car pictures, not an icon.
- [ ] Reports: period buttons and Excel / PDF buttons are tidy.
- [ ] Leads: filters are compact. Inquiries: Instagram / Facebook / Website tiles.
- [ ] Referrals: ranked top referrers, and cards on phone.
- [ ] Package Alerts: cards with no vertical text, Remind button and reminded count.
- [ ] Inventory: products show real photos. Edit product → photos sit at the top of Basic Info → **Library** button → tap photos to add or remove.
- [ ] Stock orders: tidy, with "Quick add".
- [ ] Quick Billing: search a customer → tap a result → "✓ Customer filled in below".
- [ ] Pending Payments: cards with paid bar, Remind → "Reminded N times" goes up.
- [ ] Staff & HR: tabs scroll to the end. Leave requests read properly on phone. Salary cards on phone.
- [ ] Customers list: test accounts "Hacker", "Sec CA" and "Sec CB" are gone (archived, not deleted).

## 4. Customer screens
- [ ] Login page: studio photo with no blue glow at the bottom.
- [ ] Shop: 12 products with matching photos. My Orders shows compact cards.

## 5. Not done — waiting on you
- [ ] WhatsApp / Meta API keys (for live WhatsApp leads and messages).
- [ ] Decide whether services and packages stay one catalogue for all studios.
- [ ] Approve the commit. Nothing has been committed yet.
- [ ] Then Phase 3: Play Store / App Store build.

**If something looks wrong:** note the screen and what you did, take a screenshot, and send them all together.
