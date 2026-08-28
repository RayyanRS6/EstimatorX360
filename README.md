# AutomateX360 — GoHighLevel (GHL) Estimator & Calculator

**AutomateX360** is an interactive, customizable calculator and form builder designed specifically for GoHighLevel (GHL) users, home renovators, contractors, and service businesses.

It allows you to set lower and upper estimated bounds (e.g. **CAD $75,000 – CAD $80,000**) for each answer option, calculate real-time running estimates step-by-step for prospective clients, and transmit lead details + complete itemized breakdown directly into **GoHighLevel** via Webhooks. All prices and estimates are Canadian dollars (CAD).

---

## 🌟 Key Features

1. **Min/Max Lower & Upper Bound Calculation**:
   - Every question option has its own **Min Price (CAD)** and **Max Price (CAD)**.
   - The estimator continuously sums up `Service Base Cost + Sum(Selected Options Min)` and `Service Base Cost + Sum(Selected Options Max)`.

2. **5 Pre-configured Renovation Services Out-of-the-Box**:
   - **Home Extension** (Base: CAD $15,000 | 6 Questions)
   - **Whole Home Renovations** (Base: CAD $50,000 | 5 Questions)
   - **Basement Renovations** (Base: CAD $5,000 | 6 Questions)
   - **Kitchen Renovations** (Base: CAD $5,000 | 7 Questions)
   - **Bathroom Renovations** (Base: CAD $5,000 | 5 Questions)

3. **No-Code Form & Price Builder**:
   - Create new services or edit existing ones.
   - Create, rename, and remove form categories, and assign each form to any number of categories.
   - Existing forms without category data are automatically treated as Residential.
   - Prevent duplicate form names regardless of capitalization or repeated whitespace.
   - Modify Base Costs (call-out or minimum charges).
   - Add/delete questions, toggle Single Choice vs Multiple Choice.
   - Set custom Min and Max price ranges for every individual answer option.
   - Move questions and options up or down.
   - Saves validated form configuration to Firestore through the protected server.

4. **GoHighLevel Webhook Integration**:
   - Assigns a separate protected GHL inbound webhook to every form.
   - Includes lead details, estimates, an itemized answer array, and separate plain-text `answer_fields` values for mapping every question independently.

5. **Flexible Sharing and GHL iFrame Embedding**:
   - Share or embed all forms, every form in one category, or one individual form.
   - Includes ready-to-copy public links and HTML code for GHL Custom Code elements.

---

## ⚡ How It Works (Calculation Formula)

```text
Total Lower Bound = Service Base Cost + Σ (Selected Options Min Prices)
Total Upper Bound = Service Base Cost + Σ (Selected Options Max Prices)

Example Output: CAD $75,000 – CAD $80,000
```

---

## 🔗 How to Connect to GoHighLevel (GHL)

### Step 1: Set Up an Inbound Webhook in GHL
1. Log into your **GoHighLevel** sub-account.
2. Go to **Automations** → **Workflows** → **Create Workflow**.
3. Add a Trigger: Select **Inbound Webhook**.
4. GHL will generate a unique Webhook URL (e.g., `https://services.leadconnectorhq.com/hooks/...`).
5. Repeat this for each form that needs its own workflow, and copy each URL.

### Step 2: Assign each form's webhook
1. Sign in to the **GHL Webhook** administrator tab.
2. Choose a form.
3. Paste that form's GHL inbound webhook URL and click **Save**.
4. Click **Send Mapping Test** so GHL captures that form's separate question fields.
5. Repeat for every form.

Saved webhook URLs are stored in a separate server-only Firestore collection. They are never returned by the API, displayed again, placed in browser storage, or included in public form data. `GHL_WEBHOOK_URL` remains only as an optional legacy fallback.

### Step 3: Authorize and embed the calculator
1. Set `FRAME_ANCESTORS` in the private `.env` file if adding custom domains (by default, `self`, `http://localhost:*`, `http://127.0.0.1:*`, `https://bridgelandbuilders.com`, and `https://*.bridgelandbuilders.com` are allowed).
2. Open the **Embed Generator** tab in AutomateX360.
3. Choose **All forms**, one category, or one specific form.
4. Use **Copy Share Link** for a standalone public calculator URL, or **Copy Embed Code** for an iframe.
5. In GHL Page Builder, drag a **Custom Code / HTML** element onto your landing page.
6. Paste the code into the Custom HTML editor, save, and publish.

The generated `/embed` page contains only the public calculator. It excludes the navigation, form builder, webhook settings, and administrator session lookup. Its resize message contains only a numeric height, and the generated parent script verifies both the iframe window and its origin before resizing. The main dashboard cannot be framed by external sites.

### Private dashboard and public form links

The root URL redirects unauthenticated visitors to `/login`. The dashboard routes (`/app` and `/index.html`) are enforced by the server and require the signed administrator session cookie. This is not a client-side visibility toggle: without a valid session, the dashboard HTML is never served.

Public recipients use the links produced by the Embed Generator. `/embed` exposes all forms, `/embed?category=...` exposes one category, and `/embed?service=...` opens one form directly. These public routes intentionally contain no dashboard navigation or administrator controls.

---

## 📦 Webhook Payload Format Sent to GHL

```json
{
  "event": "estimate_submitted",
  "lead": {
    "full_name": "John Smith",
    "email": "john@example.com",
    "phone": "+1 (555) 019-2834",
    "address": "123 Main St, Toronto, ON",
    "notes": "Looking for summer completion"
  },
  "estimate": {
    "service_id": "home-extension",
    "service_name": "Home Extension",
    "base_cost": 15000,
    "estimated_lower_bound": 75000,
    "estimated_upper_bound": 80000,
    "formatted_estimate_range": "$75,000 - $80,000",
    "currency": "CAD"
  },
  "answers": [
    {
      "question_id": "q_ext_size",
      "question_title": "What is the size of the extension you are considering?",
      "selected_options": [
        {
          "label": "Small (up to 200 sq ft)",
          "min_price": 15000,
          "max_price": 20000
        }
      ]
    }
  ],
  "answer_fields": {
    "what_is_the_size_of_the_extension_you_are_considering": "Small (up to 200 sq ft)",
    "what_extras_do_you_need": "Extra bedroom, Larger windows"
  },
  "submitted_at": "2026-08-03T22:05:00.000Z"
}
```

### Generated GHL custom fields

Every form question automatically produces a reference name in the format `Form Name: Question`. This plain-text list appears at the bottom of that form in the Form & Price Builder, with a copy button so an administrator knows which custom fields to create manually in GHL. Each `answer_fields` key is generated from the actual question text, for example `answer_fields.what_extras_do_you_need`, making GHL mapping readable. Multiple selections are combined into one comma-separated string. Question names within a form must generate unique keys; after renaming a question, send a new mapping test and update its GHL mapping.

---

## 🚀 Running Locally

This application requires its security server; do not expose `dashboard.html` directly or deploy the project as a static-only site.

```powershell
npm install
npm start
```

Then open `http://localhost:3000`. The generated administrator password is stored only in the ignored `.env` file. Configure server-only integration values there and never commit or upload that file.

### Firestore server authentication

The application has no local/default service catalogue. It reads the `services` and `categories` collections directly from Firestore and fails closed when the database is unavailable. If the `categories` collection is initially empty, the server exposes a default Residential category and assigns legacy service documents to it; the first administrator save persists that migration.

For local or non-Google hosting, set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` from a least-privilege Firebase service account. On Google Cloud hosting, use Application Default Credentials and set `FIREBASE_USE_ADC=true`. A Firebase browser API key is not a server credential.

Deploy [firestore.rules](firestore.rules) from Firebase Console or an authenticated Firebase CLI before publishing. These rules deny every browser/client read and write; the authenticated server library continues to work.

### `.env` versus `.env.example`

- `.env` is the real private configuration read by the server. Change `ADMIN_PASSWORD` and integration credentials only in this file or in your hosting provider's encrypted environment settings. `GHL_WEBHOOK_URL` is an optional legacy fallback; new form-specific URLs are managed in the authenticated GHL Webhook screen.
- `.env.example` contains variable names and harmless placeholders so another developer knows what to configure. It is safe to commit, but real passwords, API keys, secrets, and webhook URLs must never be added to it.

After changing `ADMIN_PASSWORD`, restart the server. To immediately invalidate all existing administrator sessions, also replace `SESSION_SECRET` with a new random value of at least 32 characters.

For production, set `NODE_ENV=production`, serve the Node application behind HTTPS, and configure `FRAME_ANCESTORS` in `.env` or your hosting environment settings (by default, `self`, `http://localhost:*`, `http://127.0.0.1:*`, `https://bridgelandbuilders.com`, and `https://*.bridgelandbuilders.com` are allowed for `/embed`). See `SECURITY.md` before deployment.
