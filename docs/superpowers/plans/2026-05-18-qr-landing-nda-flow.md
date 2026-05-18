# QR Landing Page + NDA Flow + Handout Delivery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `/apply` landing page where UHNW prospects fill in contact + profile info, accept an NDA with a single click, and immediately receive the confidential handout PDF by email.

**Architecture:** New route `GET /apply` serves `public/apply.html` (vanilla HTML/CSS/JS, no React). A new `POST /api/apply` endpoint in `server.js` validates the form, stores the lead in `db.json`, and sends two emails via Nodemailer + Outlook SMTP: one to the applicant (NDA confirmation + handout PDF attachment), one to the admin with the full profile. No external automation tool needed.

**Tech Stack:** Node.js + Express (existing), Nodemailer 6.x, Outlook SMTP (smtp.office365.com:587), vanilla HTML/CSS/JS for the frontend.

---

## Pre-Implementation Checklist (manual steps — do before coding)

- [ ] Copy `30.04 Final Handout Version.pdf` into `private/handout.pdf` in the project root
- [ ] Generate an Outlook App Password for `membershippyc@outlook.de`:
  - Go to outlook.live.com → Settings → View all Outlook settings → Mail → Sync email → Manage app passwords
  - Create a new app password, copy it
- [ ] Create a `.env` file at project root:
  ```
  OUTLOOK_PASS=<your-app-password-here>
  ```
- [ ] Add `.env` and `private/` to `.gitignore` (to keep password + PDF out of git)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `public/apply.html` | **Create** | Landing page + multi-step form (standalone, no React) |
| `server.js` | **Modify** | Add `GET /apply`, `POST /api/apply`, Nodemailer config |
| `db.json` | **Modify** | Add `"leads": []` top-level key |
| `package.json` | **Modify** | Add `nodemailer` dependency |
| `private/handout.pdf` | **Manual copy** | The PDF — never tracked in git |
| `.gitignore` | **Create/Modify** | Exclude `.env` and `private/` |

---

## Task 1: Install Nodemailer + Gitignore Setup

**Files:**
- Modify: `package.json`
- Create/Modify: `.gitignore`

- [ ] **Step 1: Install nodemailer**

```bash
cd "/Users/philipp/Library/CloudStorage/OneDrive-Persönlich/Chris yacht Project/.claude/worktrees/elastic-bose-835ea8"
npm install nodemailer
```

Expected: `added 1 package` (or similar), no errors.

- [ ] **Step 2: Verify nodemailer is in package.json**

Check that `package.json` now contains:
```json
"nodemailer": "^6.x.x"
```

- [ ] **Step 3: Create/update .gitignore**

Create `.gitignore` at project root with:
```
node_modules/
.env
private/
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "feat: install nodemailer, add .gitignore for env and private PDF"
```

---

## Task 2: Update db.json + loadDb Initialisation

**Files:**
- Modify: `db.json`
- Modify: `server.js` lines 71–82 (`buildInitialState`)

- [ ] **Step 1: Add `leads` array to db.json**

Open `db.json`. After the `"requests"` key, add:
```json
"leads": []
```
The top-level structure must be:
```json
{
  "meta": { ... },
  "weeks": [ ... ],
  "requests": [ ... ],
  "leads": []
}
```

- [ ] **Step 2: Update buildInitialState in server.js to include leads**

In `server.js`, find `buildInitialState()` (line 71). Change the return statement from:
```js
  return {
    meta: { year0: YEAR0, weekPrice: WP, charterRate: CR },
    weeks,
    requests: DEMO_REQUESTS,
  };
```
To:
```js
  return {
    meta: { year0: YEAR0, weekPrice: WP, charterRate: CR },
    weeks,
    requests: DEMO_REQUESTS,
    leads: [],
  };
```

- [ ] **Step 3: Commit**

```bash
git add db.json server.js
git commit -m "feat: add leads array to db state"
```

---

## Task 3: Add Nodemailer Config + /api/apply Route to server.js

**Files:**
- Modify: `server.js`

Add the following **right after** the `require` statements at the top of `server.js` (after line 3, before line 5 `const app = express()`):

- [ ] **Step 1: Add nodemailer require + transporter**

Insert after `const path = require('path');`:
```js
const nodemailer = require('nodemailer');

const mailer = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: {
    user: 'membershippyc@outlook.de',
    pass: process.env.OUTLOOK_PASS,
  },
  tls: { ciphers: 'SSLv3' },
});
```

- [ ] **Step 2: Add GET /apply route**

Add this route anywhere in the `── API ROUTES ──` section (e.g. before `app.get('/api/state', ...)`):
```js
app.get('/apply', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'apply.html'));
});
```

- [ ] **Step 3: Add POST /api/apply route**

Add this route directly after the `GET /apply` route:
```js
app.post('/api/apply', async (req, res) => {
  const { firstName, lastName, email, phone, jobTitle, company, industry, linkedin, social, ndaAccepted } = req.body;

  if (!firstName || !lastName || !email || !phone || !jobTitle || !industry || !ndaAccepted) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  db = loadDb();
  if (!db.leads) db.leads = [];

  const lead = {
    id: `lead_${Date.now()}`,
    submittedAt: new Date().toISOString(),
    contact: { firstName, lastName, email, phone },
    profile: {
      jobTitle,
      company: company || '',
      industry,
      linkedin: linkedin || '',
      social: social || '',
    },
    ndaAccepted: true,
  };
  db.leads.push(lead);
  saveDb(db);

  const handoutPath = path.join(__dirname, 'private', 'handout.pdf');
  const handoutExists = require('fs').existsSync(handoutPath);

  // Email to applicant
  await mailer.sendMail({
    from: '"Private Yacht Club" <membershippyc@outlook.de>',
    to: email,
    subject: 'Your NDA Confirmation & Exclusive Handout – Private Yacht Club',
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
        <h2 style="color: #c9a84c;">Private Yacht Club</h2>
        <p>Dear ${firstName},</p>
        <p>Thank you for your interest in the Private Yacht Club. We have received your application and confirm that you have accepted our Non-Disclosure Agreement on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
        ${handoutExists
          ? '<p>Please find attached our exclusive membership handout. The contents are strictly confidential.</p>'
          : '<p>Our membership team will be in touch shortly with further information.</p>'
        }
        <p style="margin-top: 32px; color: #888; font-size: 13px;">Private Yacht Club · membershippyc@outlook.de</p>
      </div>
    `,
    attachments: handoutExists
      ? [{ filename: 'PYC_Membership_Handout.pdf', path: handoutPath }]
      : [],
  });

  // Email to admin
  await mailer.sendMail({
    from: '"PYC System" <membershippyc@outlook.de>',
    to: 'membershippyc@outlook.de',
    subject: `New Membership Enquiry: ${firstName} ${lastName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>New Membership Enquiry</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td style="padding: 8px; font-weight: bold;">Name</td><td style="padding: 8px;">${firstName} ${lastName}</td></tr>
          <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;">${email}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Phone</td><td style="padding: 8px;">${phone}</td></tr>
          <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Job Title</td><td style="padding: 8px;">${jobTitle}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Company</td><td style="padding: 8px;">${company || '–'}</td></tr>
          <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Industry</td><td style="padding: 8px;">${industry}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">LinkedIn</td><td style="padding: 8px;">${linkedin || '–'}</td></tr>
          <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Social Media</td><td style="padding: 8px;">${social || '–'}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">NDA Accepted</td><td style="padding: 8px;">✓ Yes</td></tr>
          <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Submitted</td><td style="padding: 8px;">${new Date().toISOString()}</td></tr>
        </table>
      </div>
    `,
  });

  res.json({ ok: true });
});
```

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add /apply route and /api/apply endpoint with nodemailer"
```

---

## Task 4: Create public/apply.html — Landing Page

**Files:**
- Create: `public/apply.html`

- [ ] **Step 1: Create the landing page**

Create `public/apply.html` with the full content below. This is a self-contained, premium-styled page with a 4-step form (Contact → Profile → NDA → Confirmation):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Apply for Membership – Private Yacht Club</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy: #0d1b2a;
      --navy-mid: #1a2f45;
      --gold: #c9a84c;
      --gold-light: #e2c87a;
      --white: #f8f6f1;
      --text: #d4cfc7;
      --muted: #7a8a99;
      --error: #e05a5a;
    }

    body {
      font-family: 'Georgia', serif;
      background: var(--navy);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ── HERO ── */
    .hero {
      background: linear-gradient(160deg, #0d1b2a 0%, #1a2f45 60%, #0d2235 100%);
      border-bottom: 1px solid rgba(201, 168, 76, 0.25);
      padding: 64px 24px 56px;
      text-align: center;
    }
    .hero-eyebrow {
      font-family: 'Arial', sans-serif;
      font-size: 11px;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: var(--gold);
      margin-bottom: 20px;
    }
    .hero h1 {
      font-size: clamp(28px, 5vw, 52px);
      font-weight: 400;
      color: var(--white);
      line-height: 1.2;
      margin-bottom: 20px;
      letter-spacing: -0.5px;
    }
    .hero h1 em { color: var(--gold); font-style: italic; }
    .hero-sub {
      font-size: 16px;
      color: var(--muted);
      max-width: 540px;
      margin: 0 auto 40px;
      line-height: 1.7;
      font-family: 'Arial', sans-serif;
    }
    .hero-placeholder {
      background: rgba(201,168,76,0.06);
      border: 1px dashed rgba(201,168,76,0.3);
      border-radius: 6px;
      padding: 16px 24px;
      font-size: 13px;
      color: var(--gold);
      font-family: 'Arial', sans-serif;
      max-width: 480px;
      margin: 0 auto 40px;
      display: none; /* shown if SHOW_PLACEHOLDER is set */
    }
    .hero-cta {
      display: inline-block;
      background: var(--gold);
      color: var(--navy);
      font-family: 'Arial', sans-serif;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 16px 40px;
      border-radius: 2px;
      cursor: pointer;
      border: none;
      transition: background 0.2s;
    }
    .hero-cta:hover { background: var(--gold-light); }

    /* ── FORM WRAPPER ── */
    .form-section {
      display: none;
      flex: 1;
      padding: 48px 24px 64px;
    }
    .form-section.active { display: block; }
    .form-inner {
      max-width: 560px;
      margin: 0 auto;
    }

    /* ── PROGRESS ── */
    .progress {
      display: flex;
      align-items: center;
      gap: 0;
      margin-bottom: 48px;
      font-family: 'Arial', sans-serif;
    }
    .progress-step {
      flex: 1;
      text-align: center;
      font-size: 11px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--muted);
      position: relative;
      padding-bottom: 10px;
    }
    .progress-step::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 2px;
      background: var(--navy-mid);
    }
    .progress-step.active { color: var(--gold); }
    .progress-step.active::after { background: var(--gold); }
    .progress-step.done { color: rgba(201,168,76,0.4); }
    .progress-step.done::after { background: rgba(201,168,76,0.3); }

    /* ── FORM ELEMENTS ── */
    .step-title {
      font-size: 24px;
      font-weight: 400;
      color: var(--white);
      margin-bottom: 8px;
      letter-spacing: -0.3px;
    }
    .step-desc {
      font-size: 14px;
      color: var(--muted);
      font-family: 'Arial', sans-serif;
      margin-bottom: 36px;
      line-height: 1.6;
    }
    .notice {
      background: rgba(201,168,76,0.08);
      border-left: 3px solid var(--gold);
      padding: 14px 18px;
      border-radius: 0 4px 4px 0;
      font-size: 13px;
      font-family: 'Arial', sans-serif;
      color: var(--text);
      margin-bottom: 32px;
      line-height: 1.6;
    }
    .field {
      margin-bottom: 24px;
    }
    .field label {
      display: block;
      font-family: 'Arial', sans-serif;
      font-size: 11px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--gold);
      margin-bottom: 8px;
    }
    .field label .optional {
      color: var(--muted);
      font-weight: 400;
      letter-spacing: 0;
      text-transform: none;
      font-size: 11px;
    }
    .field input, .field select, .field textarea {
      width: 100%;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 3px;
      padding: 13px 16px;
      font-size: 15px;
      color: var(--white);
      font-family: 'Arial', sans-serif;
      transition: border-color 0.2s;
      outline: none;
      appearance: none;
    }
    .field input:focus, .field select:focus, .field textarea:focus {
      border-color: rgba(201,168,76,0.6);
    }
    .field input::placeholder { color: var(--muted); }
    .field select option { background: var(--navy); color: var(--white); }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 480px) { .two-col { grid-template-columns: 1fr; } }

    /* ── NDA SECTION ── */
    .nda-box {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px;
      padding: 24px;
      max-height: 280px;
      overflow-y: auto;
      font-family: 'Arial', sans-serif;
      font-size: 13px;
      line-height: 1.8;
      color: var(--text);
      margin-bottom: 24px;
    }
    .nda-box h3 { color: var(--white); margin-bottom: 16px; font-size: 14px; letter-spacing: 1px; text-transform: uppercase; }
    .nda-box p { margin-bottom: 12px; }
    .checkbox-row {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 32px;
    }
    .checkbox-row input[type=checkbox] {
      width: 20px; height: 20px;
      flex-shrink: 0;
      margin-top: 2px;
      accent-color: var(--gold);
      cursor: pointer;
    }
    .checkbox-row label {
      font-family: 'Arial', sans-serif;
      font-size: 14px;
      color: var(--text);
      line-height: 1.6;
      cursor: pointer;
    }

    /* ── BUTTONS ── */
    .btn-row { display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px; }
    .btn {
      font-family: 'Arial', sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 14px 32px;
      border-radius: 2px;
      border: none;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }
    .btn-primary { background: var(--gold); color: var(--navy); }
    .btn-primary:hover { background: var(--gold-light); }
    .btn-primary:disabled { background: #5a5040; color: #888; cursor: not-allowed; }
    .btn-ghost { background: transparent; color: var(--muted); border: 1px solid rgba(255,255,255,0.15); }
    .btn-ghost:hover { color: var(--white); border-color: rgba(255,255,255,0.3); }
    .error-msg { color: var(--error); font-size: 13px; font-family: Arial, sans-serif; margin-top: 16px; display: none; }

    /* ── CONFIRMATION ── */
    .confirmation {
      display: none;
      flex: 1;
      padding: 80px 24px;
      text-align: center;
    }
    .confirmation.active { display: block; }
    .confirmation-icon {
      width: 64px; height: 64px;
      border: 2px solid var(--gold);
      border-radius: 50%;
      margin: 0 auto 32px;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
    }
    .confirmation h2 {
      font-size: 32px;
      font-weight: 400;
      color: var(--white);
      margin-bottom: 16px;
    }
    .confirmation p {
      font-size: 16px;
      color: var(--muted);
      font-family: Arial, sans-serif;
      max-width: 480px;
      margin: 0 auto;
      line-height: 1.7;
    }

    /* ── FOOTER ── */
    footer {
      text-align: center;
      padding: 24px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      color: rgba(122,138,153,0.5);
      border-top: 1px solid rgba(255,255,255,0.05);
    }
  </style>
</head>
<body>

  <!-- HERO -->
  <div class="hero" id="hero">
    <div class="hero-eyebrow">Private Membership · By Invitation</div>
    <h1>A Different Way to<br>Experience the <em>Sea</em></h1>
    <p class="hero-sub">
      <!-- PLACEHOLDER: Insert advertising copy here -->
      An exclusive fractional ownership community for those who demand the extraordinary.
      Private access. Zero compromise.
    </p>
    <button class="hero-cta" onclick="startForm()">Apply for Membership</button>
  </div>

  <!-- FORM SECTION -->
  <div class="form-section active" id="formSection" style="display:none;">
    <div class="form-inner">

      <!-- Progress -->
      <div class="progress">
        <div class="progress-step active" id="prog1">Contact</div>
        <div class="progress-step" id="prog2">Profile</div>
        <div class="progress-step" id="prog3">Agreement</div>
      </div>

      <!-- Step 1: Contact -->
      <div id="step1">
        <div class="step-title">Your Contact Details</div>
        <p class="step-desc">All information is treated with the strictest confidentiality.</p>
        <div class="two-col">
          <div class="field">
            <label>First Name</label>
            <input type="text" id="firstName" placeholder="James" autocomplete="given-name" />
          </div>
          <div class="field">
            <label>Last Name</label>
            <input type="text" id="lastName" placeholder="Richardson" autocomplete="family-name" />
          </div>
        </div>
        <div class="field">
          <label>Email Address</label>
          <input type="email" id="email" placeholder="james@example.com" autocomplete="email" />
        </div>
        <div class="field">
          <label>Phone Number</label>
          <input type="tel" id="phone" placeholder="+49 170 000 0000" autocomplete="tel" />
        </div>
        <p class="error-msg" id="err1">Please fill in all required fields.</p>
        <div class="btn-row">
          <button class="btn btn-primary" onclick="goStep(2)">Continue</button>
        </div>
      </div>

      <!-- Step 2: Profile -->
      <div id="step2" style="display:none;">
        <div class="step-title">Your Professional Profile</div>
        <div class="notice">
          The following information helps us evaluate your application and ensures that new members complement our existing community. All details remain strictly confidential.
        </div>
        <div class="field">
          <label>Job Title / Profession</label>
          <input type="text" id="jobTitle" placeholder="e.g. CEO, Managing Director, Partner" />
        </div>
        <div class="field">
          <label>Company / Organisation <span class="optional">(optional)</span></label>
          <input type="text" id="company" placeholder="e.g. Acme Capital GmbH" />
        </div>
        <div class="field">
          <label>Industry / Sector</label>
          <select id="industry">
            <option value="" disabled selected>Select your industry</option>
            <option>Finance & Investment</option>
            <option>Private Equity / Venture Capital</option>
            <option>Real Estate</option>
            <option>Technology</option>
            <option>Luxury & Lifestyle</option>
            <option>Healthcare & Pharmaceuticals</option>
            <option>Energy & Resources</option>
            <option>Consulting & Advisory</option>
            <option>Family Office</option>
            <option>Law & Notary</option>
            <option>Other</option>
          </select>
        </div>
        <div class="field">
          <label>LinkedIn Profile URL <span class="optional">(optional)</span></label>
          <input type="url" id="linkedin" placeholder="https://linkedin.com/in/yourname" />
        </div>
        <div class="field">
          <label>Other Social Media <span class="optional">(optional)</span></label>
          <input type="text" id="social" placeholder="Instagram, Twitter, etc." />
        </div>
        <p class="error-msg" id="err2">Please fill in all required fields.</p>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="goStep(1)">Back</button>
          <button class="btn btn-primary" onclick="goStep(3)">Continue</button>
        </div>
      </div>

      <!-- Step 3: NDA -->
      <div id="step3" style="display:none;">
        <div class="step-title">Non-Disclosure Agreement</div>
        <p class="step-desc">Please read the following agreement before accepting.</p>
        <div class="nda-box">
          <h3>Confidentiality & Non-Disclosure Agreement</h3>
          <p><strong>— NDA text to be provided by client —</strong></p>
          <p>
            This Non-Disclosure Agreement ("Agreement") is entered into between the Private Yacht Club ("Disclosing Party") and the undersigned individual ("Recipient").
          </p>
          <p>
            1. <strong>Confidential Information.</strong> The Recipient acknowledges that all information, documents, and materials shared by the Private Yacht Club — including but not limited to membership details, pricing, financial structures, ownership arrangements, and strategic plans — constitute proprietary and confidential information ("Confidential Information").
          </p>
          <p>
            2. <strong>Obligations.</strong> The Recipient agrees not to disclose, reproduce, or share any Confidential Information with third parties without the prior written consent of the Private Yacht Club, and to use such information solely for the purpose of evaluating membership.
          </p>
          <p>
            3. <strong>Duration.</strong> This obligation of confidentiality shall remain in effect for a period of five (5) years from the date of acceptance.
          </p>
          <p>
            4. <strong>Governing Law.</strong> This Agreement shall be governed by applicable law.
          </p>
          <p style="font-style: italic; color: #7a8a99; font-size: 12px;">
            Note: This is a placeholder NDA. Final legal text to be provided by the client.
          </p>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="ndaCheck" onchange="updateSubmit()" />
          <label for="ndaCheck">
            I have read and understood the Non-Disclosure Agreement and accept its terms unconditionally.
          </label>
        </div>
        <p class="error-msg" id="err3" style="display:none;">Please accept the NDA to continue.</p>
        <p class="error-msg" id="errSubmit" style="display:none;">Something went wrong. Please try again or contact membershippyc@outlook.de</p>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="goStep(2)">Back</button>
          <button class="btn btn-primary" id="submitBtn" onclick="submitForm()" disabled>Submit Application</button>
        </div>
      </div>

    </div>
  </div>

  <!-- CONFIRMATION -->
  <div class="confirmation" id="confirmation">
    <div class="confirmation-icon">✓</div>
    <h2>Application Received</h2>
    <p>Thank you for your interest in the Private Yacht Club. We have sent a confirmation and our exclusive membership handout to your email address. Our team will be in touch.</p>
  </div>

  <footer>© Private Yacht Club · All rights reserved · membershippyc@outlook.de</footer>

  <script>
    let currentStep = 0;

    function startForm() {
      document.getElementById('hero').style.display = 'none';
      document.getElementById('formSection').style.display = 'block';
      currentStep = 1;
      updateProgress(1);
    }

    function goStep(n) {
      if (n > currentStep && !validateStep(currentStep)) return;
      document.getElementById('step' + currentStep).style.display = 'none';
      currentStep = n;
      document.getElementById('step' + currentStep).style.display = 'block';
      updateProgress(n);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateProgress(n) {
      for (let i = 1; i <= 3; i++) {
        const el = document.getElementById('prog' + i);
        el.className = 'progress-step';
        if (i < n) el.classList.add('done');
        if (i === n) el.classList.add('active');
      }
    }

    function validateStep(n) {
      const err = document.getElementById('err' + n);
      if (n === 1) {
        const ok = v('firstName') && v('lastName') && v('email') && v('phone') && isEmail(g('email'));
        err.style.display = ok ? 'none' : 'block';
        err.textContent = isEmail(g('email')) ? 'Please fill in all required fields.' : 'Please enter a valid email address.';
        return ok;
      }
      if (n === 2) {
        const ok = v('jobTitle') && v('industry');
        err.style.display = ok ? 'none' : 'block';
        return ok;
      }
      return true;
    }

    function updateSubmit() {
      document.getElementById('submitBtn').disabled = !document.getElementById('ndaCheck').checked;
    }

    function v(id) { return document.getElementById(id).value.trim().length > 0; }
    function g(id) { return document.getElementById(id).value.trim(); }
    function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

    async function submitForm() {
      if (!document.getElementById('ndaCheck').checked) {
        document.getElementById('err3').style.display = 'block';
        return;
      }
      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = 'Submitting…';
      document.getElementById('errSubmit').style.display = 'none';

      try {
        const res = await fetch('/api/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: g('firstName'),
            lastName: g('lastName'),
            email: g('email'),
            phone: g('phone'),
            jobTitle: g('jobTitle'),
            company: g('company'),
            industry: g('industry'),
            linkedin: g('linkedin'),
            social: g('social'),
            ndaAccepted: true,
          }),
        });
        if (!res.ok) throw new Error('Server error');
        document.getElementById('formSection').style.display = 'none';
        document.getElementById('confirmation').classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        document.getElementById('errSubmit').style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Submit Application';
      }
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add public/apply.html
git commit -m "feat: add /apply landing page with multi-step NDA form"
```

---

## Task 5: Local End-to-End Test

- [ ] **Step 1: Create a test `.env` file and start the server**

Ensure `.env` exists with your Outlook app password:
```
OUTLOOK_PASS=your-app-password
```

Run the server with env vars loaded:
```bash
node -r dotenv/config server.js
```

If dotenv is not installed:
```bash
npm install dotenv
```

Or export manually:
```bash
OUTLOOK_PASS=your-app-password node server.js
```

Expected output: `Yacht Planner running on http://localhost:3000`

- [ ] **Step 2: Test the landing page flow**

Open `http://localhost:3000/apply` in a browser. Verify:
- Hero section is visible with CTA button
- Clicking CTA shows the 3-step form
- Step 1 validation works (empty fields blocked)
- Step 2 shows the evaluation notice
- Step 3 shows the NDA text, submit button is disabled until checkbox is ticked
- Submitting shows the confirmation screen

- [ ] **Step 3: Test email delivery**

Fill in a real email address you can access. After submitting, verify:
- Confirmation email arrives with NDA acceptance note
- If `private/handout.pdf` exists: PDF is attached
- Admin notification arrives at `membershippyc@outlook.de` with full profile table

- [ ] **Step 4: Check db.json**

Open `db.json` and verify a new entry exists under `leads`:
```json
"leads": [
  {
    "id": "lead_17...",
    "submittedAt": "...",
    "contact": { ... },
    "profile": { ... },
    "ndaAccepted": true
  }
]
```

---

## Task 6: Deploy to Vercel

- [ ] **Step 1: Set OUTLOOK_PASS in Vercel**

Go to the Vercel dashboard → Project Settings → Environment Variables.
Add:
- Key: `OUTLOOK_PASS`
- Value: your Outlook app password
- Environment: Production (and Preview if needed)

- [ ] **Step 2: Push and deploy**

```bash
git push origin claude/elastic-bose-835ea8
```

Then open a PR to merge into `main`, or trigger a deploy directly.

- [ ] **Step 3: Smoke-test on production**

Open `https://<your-vercel-domain>/apply` and submit a test application. Verify emails arrive.

---

## Open Items (post-deploy)

- [ ] Replace placeholder NDA text with final legal text from client
- [ ] Update hero section advertising copy
- [ ] Define personality verification logic after client meeting
- [ ] Consider adding a simple `/admin/leads` view to browse submissions
