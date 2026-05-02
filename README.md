# ShiftBot (Amazon Shift Scanner + Auto-Apply)

ShiftBot is a simple web dashboard that:

- Lets you **log in** to the dashboard
- Connects your **Amazon Hiring** session (tokens + cookies)
- **Scans for shifts** in the background
- Shows shifts on a **Shifts** page (with optional filtering)
- Sends **Telegram alerts** when new shifts match your filters (city + min pay)
- Can optionally **auto-apply** using a Playwright “6-screen” flow (best-effort UI automation)

> Important: Automating job applications may violate Amazon’s terms/policies. Use at your own risk.

---

## What you need (non-developer friendly)

### Install these once

1. **Node.js (LTS)**  
   Download and install from `https://nodejs.org/`  
   After install, restart your PC.

2. **MongoDB (Community Server)**  
   Download and install from `https://www.mongodb.com/try/download/community`  
   During setup, enable **“Install MongoDB as a Service”** if available.

3. **Google Chrome** (recommended)  
   Playwright uses its own browser too, but Chrome helps for manual steps.

---

## Step-by-step: First time setup (Windows)

### 1) Download the project folder
- Put the folder somewhere easy like: `C:\ShiftBot\amazon_shift_bot`

### 2) Open a terminal in the folder
- Open the folder in File Explorer
- Click the address bar, type `powershell`, press Enter

### 3) Install the app (one time)

Run:

```bash
npm install
```

### 4) Create your `.env` file

In the project folder, create a file named `.env` (same level as `package.json`) with:

```env
MONGO_URI=mongodb://localhost:27017/amazon_shift_bot
JWT_SECRET=change_this_to_any_long_random_text
PORT=3000
USE_MOCK_AMAZON=false

# Telegram (optional but recommended)
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN

# Optional: phone call alerts on successful auto-apply (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

### 5) Start ShiftBot

Run:

```bash
npm run dev
```

Leave that window open.

### 6) Open the dashboard

Open this in your browser:

- `http://localhost:3000`

---

## Using the dashboard (non-developer)

### 1) Register + login
- Click **Register**
- Create your account
- Sign in

### 2) Connect Telegram (alerts)

1. Create a Telegram bot using **@BotFather**
2. Copy the bot token into `.env` as `TELEGRAM_BOT_TOKEN`
3. Get your chat id:
   - Message **@userinfobot** in Telegram and copy your numeric **ID**
4. In the dashboard go to **Profile**
   - Paste the chat id into **Telegram chat ID**
   - Click **Save Profile & Session**

### 3) Set your shift filters (for alerts + auto-apply)

In **Profile → Shift Filters**

- **City**: example `Toronto` (match is “contains”, not exact)
- **Min Pay**: example `20`
- Click **Save Profile & Session**

### 4) Add Amazon session (required for scanning & applying)

Use the manual Session JSON method:

If the auto-capture struggles, you can manually extract your session:

1. Log into `https://hiring.amazon.ca` in your normal Chrome browser
2. Open Developer Tools:
   - Press `F12`
   - Click the **Console** tab
3. Paste this snippet and press Enter:

```js
var data = { tokens: { ...localStorage }, cookies: document.cookie };
prompt("Copy this Session JSON and paste it into the Bot Dashboard:", JSON.stringify(data));
```

4. Copy the JSON popup text
5. Dashboard → **Profile → Amazon Session Injection**
6. Paste into **Session JSON Payload**
7. Click **Save Profile & Session**

### 5) Start scanning

- Go to **Bot Control**
- Choose an interval (example: 5 min)
- Click **Start Bot**

### 6) View shifts and filter them

- Go to **Shifts**
- By default it shows only shifts matching your Profile filters (city/min pay)
- Toggle **Show all shifts** to see everything stored in the database

---

## Auto-Apply (6-screen Playwright flow)

Auto-Apply tries to complete the multi-step application flow automatically.

### Enable it

Dashboard → **Profile → Auto-Apply**

- Turn on **Enable Auto-Apply**
- Fill as much as you can:
  - **Gender**
  - **Work Authorization**
  - **DOB**
  - **SIN (encrypted)** (store only encrypted form here)
  - **Assessment replay payload (JSON)** (captured from your first manual application)
  - **Address history JSON array**
  - Interview preference: **Earliest** or **Preferred window**
  - Optional phone number for call alerts (requires Twilio env vars)
- Click **Save Profile & Session**

### What happens

When the bot finds a new shift matching your city/min pay filters:

- It attempts “Create Application” immediately
- Runs through the 6 screens best-effort
- Retries failed claims up to **3** times with **200ms** delay
- Handles:
  - **HTTP 201/200**: success → Telegram + optional phone call + checklist
  - **HTTP 409**: shift taken → logs + keeps scanning
  - **HTTP 401**: token expired → refresh + retry

---

## Troubleshooting

### “DB connected” never appears
- MongoDB service may not be running. Restart PC or start MongoDB service manually.

### Telegram not sending
- Confirm `.env` has `TELEGRAM_BOT_TOKEN`
- Confirm **Profile → Telegram chat ID** is set
- Restart `npm run dev` after editing `.env`

### Session JSON expired / captcha
- Re-login on `hiring.amazon.ca`
- Generate a fresh **Session JSON**
- Save it again in **Profile → Amazon Session Injection**

### Auto-apply clicks the wrong thing
- Amazon UI changes frequently; selector tuning may be required.

---

## Tech overview (for developers)

- **Backend**: Node.js + Express (`backend/server.js`)
- **Database**: MongoDB via Mongoose
- **Browser automation**: Playwright
- **Frontend**: static HTML/CSS/vanilla JS served by Express (`frontend/`)

---

## Security notes

- Do **not** commit your `.env` file.
- Rotate any leaked Telegram bot tokens immediately in **@BotFather**.
- Prefer storing only **encrypted** sensitive values (e.g. SIN) in the database.


