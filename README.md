# Best Diversified Company Award 2025/26 (`astro-award`)

Modern, full-stack, production-grade web application built with **Astro 5**, **TypeScript (Strict Mode)**, **Tailwind CSS**, **pdf-lib**, and **Nodemailer**.

This project represents the complete architectural migration and modernization of the legacy PHP award application into an enterprise-grade TypeScript ecosystem.

---

## Architecture & Key Features

1. **Clean Layered Architecture:**
   - `src/lib/validation.ts`: Server-side Zod validation schema matching all statutory criteria.
   - `src/lib/calculations.ts`: Zero-trust financial recalculation engine (ROI, payback period, diversification % of revenue, CSPRNG reference generation).
   - `src/lib/security.ts`: HMAC-SHA256 download authorization tokens, XSS HTML tag/attribute sanitizers, in-memory IP rate limiter.
   - `src/lib/pdf.ts`: High-end corporate A4 PDF dossier generator using `pdf-lib` (executive layout, 2×2 metric cards, data tables, digital biometric signature embedding, dynamic multi-page footers).
   - `src/lib/mailer.ts`: Universal SMTP dispatcher using `nodemailer` supporting SSL (465), STARTTLS (587), Gmail, cPanel, Zimbra, Office 365, and Zoho Mail.

2. **Reactive Frontend UI:**
   - 6-step guided application wizard (`src/pages/apply.astro`).
   - Real-time financial calculations (row-level percentages, combined totals, ROI %, and estimated payback years).
   - Dynamic repeaters for diversified products and revenue activities with add/remove controls.
   - Biometric digital signature canvas (`src/components/signature/SignaturePad.astro`) with mouse, touch, and stylus support.
   - `localStorage` automatic draft autosave and restoration.
   - Ultra-modern corporate dark/navy aesthetics with subtle glassmorphism and amber/gold accents.

3. **Secure API Endpoints:**
   - `POST /api/submit`: Handles multipart and JSON submissions, validates inputs via Zod, recalculates metrics server-side, compiles PDF dossier, dispatches multi-recipient emails, and outputs signed download links.
   - `GET /api/download`: Verifies HMAC-SHA256 token and 1-hour expiration timestamp before streaming the generated PDF dossier.

---

## Quickstart

### Prerequisites
- Node.js 18+ (tested on Node v20/v26)
- npm 9+

### Setup & Run
```bash
cd astro-award
npm install

# Copy environment variables
cp .env.example .env

# Run development server
npm run dev

# Or build for production
npm run build
npm run preview
```

### Running Tests
To run the automated end-to-end integration and security test suite:
```bash
node test_e2e.mjs
```

---

## Environment Variables (`.env`)

| Variable | Description | Example |
| :--- | :--- | :--- |
| `APP_ENV` | Application environment | `production` / `development` |
| `APP_URL` | Base public URL | `http://localhost:4321` |
| `ADMIN_EMAIL` | Admin alert recipients (comma-separated) | `admin@company.com` |
| `MAIL_FROM_ADDRESS` | From email address | `notifications@company.com` |
| `SMTP_HOST` | Outgoing SMTP host | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` (TLS) or `465` (SSL) |
| `SMTP_USER` | SMTP username | `user@company.com` |
| `SMTP_PASS` | SMTP password / App password | `mepn aeqo nzqe mjrt` |
| `DOWNLOAD_SECRET` | 64-character secret for HMAC tokens | `hex-string` |
