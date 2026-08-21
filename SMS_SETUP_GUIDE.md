# 📱 GK AutoHerb — SMS Setup Guide (2Factor.in)

## Overview

The CRM uses **2Factor.in** for all transactional SMS (booking confirmations, job card updates, campaigns).

---

## Step 1: Get Your 2Factor.in API Key

1. Go to [https://2factor.in](https://2factor.in) and log in
2. Navigate to **Dashboard → API Key**
3. Copy your API Key (looks like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

---

## Step 2: Get Your DLT Sender ID

1. Your sender ID is the 6-character alphanumeric ID registered on DLT portal
2. Example: `GKAHER` or `GKAUTO`
3. This must be approved by your telecom operator (Jio, Airtel, etc.)

---

## Step 3: Register DLT Templates

**⚠️ CRITICAL: Every SMS message must EXACTLY match a DLT-approved template.**

Go to your DLT portal (e.g., Jio DLT, Airtel DLT) and register these templates:

### Template 1: Job Card Ready
```
GK AutoHerb: Your job card {#var#} is ready. Track here {#var#}
```

### Template 2: Booking Approved (customize as needed)
```
Dear {#var#}, your booking at GK AutoHerb on {#var#} has been approved. Services: {#var#}
```

### Template 3: Bulk Campaign (customize as needed)
```
Dear {#var#}, your {#var#} ({#var#}) service is complete at GK AutoHerb! Services: {#var#}
```

> After registering, templates take 24-48 hours to get approved.

---

## Step 4: Update Environment Variables

### File: `server/.env` (on your local machine)
### File: `~/app/server/.env` (on your VPS)

Find these lines and update:

```env
# ─── MSG91 / 2Factor.in ─────────────────────
MSG91_AUTH_KEY=YOUR_2FACTOR_API_KEY_HERE
MSG91_SENDER_ID=GKAHER
```

### What's there currently:
```env
MSG91_AUTH_KEY=YOUR_2FACTOR_API_KEY
MSG91_SENDER_ID=GKAUTO
```

### What to change:

| Variable | Current Value | What to Put |
|----------|--------------|-------------|
| `MSG91_AUTH_KEY` | `YOUR_2FACTOR_API_KEY` | Your **2Factor.in API Key** (keep this if it's already your 2Factor key) |
| `MSG91_SENDER_ID` | `GKAUTO` | Your **DLT-approved 6-char Sender ID** (e.g. `GKAHER`) |

> **Note:** The variable is named `MSG91_AUTH_KEY` for legacy reasons, but it holds your 2Factor.in key.

---

## Step 5: Update on VPS

SSH into your server and edit the env file:

```bash
ssh root@YOUR_SERVER_IP

# Edit the env file
nano ~/app/server/.env

# Update these two lines:
# MSG91_AUTH_KEY=your_2factor_api_key
# MSG91_SENDER_ID=your_dlt_sender_id

# Save: Ctrl+O, Enter, Ctrl+X

# Restart the server to pick up new env vars
pm2 restart all
```

---

## Step 6: Test SMS Delivery

1. Go to **Admin → Messages → New Campaign**
2. Send a test message to yourself
3. Check VPS logs for success/failure:

```bash
pm2 logs --lines 30
```

**Success output:**
```
[SMS] SENT — To: 9876543210 | SessionId: abc123...
```

**Failure output:**
```
[SMS] FAILED — To: 9876543210 | Response: { Status: 'Error', Details: '...' }
```

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid API Key` | Wrong key in `.env` | Get correct key from 2factor.in dashboard |
| `Insufficient Credits` | No SMS balance | Recharge at 2factor.in |
| `Template Not Matched` | Message doesn't match DLT template exactly | Check your DLT portal, ensure message matches character-by-character |
| `Invalid Sender` | Sender ID not approved | Use your DLT-approved sender ID |
| `DND Number` | User registered on Do Not Disturb | Transactional SMS bypasses DND. If still blocked, check template category |

---

## Where SMS is Sent From (Code Reference)

| Feature | File | When it Triggers |
|---------|------|-----------------|
| Job Card Updates | `server/src/utils/sendSms.js` | Job card completed |
| Booking Approve/Reject | `server/src/controllers/bookingsController.js` | Admin approves/rejects booking |
| Bulk Campaigns | `server/src/services/messagingService.js` | Admin sends from Messages page |
| Single Messages | `server/src/services/messagingService.js` | Admin sends to individual customer |

---

## ⚠️ Important Notes

1. **DLT Compliance**: India requires all SMS to be DLT registered. Non-compliant messages will be blocked.
2. **Credits**: 2Factor.in charges per SMS. Check your balance at their dashboard.
3. **Rate Limits**: Don't send more than 100 SMS/minute to avoid throttling.
4. **Test First**: Always test with your own number before sending bulk campaigns.
