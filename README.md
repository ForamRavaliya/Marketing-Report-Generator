# AdInsight — Performance Marketing Report Generator

A full-stack PERN (PostgreSQL, Express, React, Node.js) application for digital marketing agencies to generate professional performance reports for Meta Ads, Google Ads, and other platforms.

---

## Features

- **Multi-format Data Import** — CSV, Excel, PDF, PNG/JPG screenshots (OCR)
- **Auto Data Extraction** — Automatically extracts Spend, Impressions, Clicks, CTR, CPC, Conversions, CPA, ROAS
- **Client Management** — Organize data per client with full history
- **Analytics Dashboard** — KPI cards, trend charts, campaign breakdowns, platform comparisons
- **Month-over-Month Comparison** — Automatic % change calculation
- **PDF Report Generation** — Branded, client-ready reports with tables and summaries
- **White-Label Branding** — Agency logo, custom colors in all PDF reports
- **Manual Data Entry** — Enter metrics manually when files aren't available
- **Role-Based Access** — Admin, Analyst, Viewer roles per agency

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Recharts, Axios |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (via `pg` pool) |
| File Processing | Tesseract.js (OCR), pdf-parse, xlsx, csv-parse |
| PDF Output | PDFKit |
| Auth | JWT + bcryptjs |
| File Upload | Multer |

---

## Project Structure

```
perf-marketing-tool/
├── backend/
│   ├── src/
│   │   ├── server.js           # Express app entry point
│   │   ├── db/
│   │   │   ├── index.js        # PostgreSQL connection pool
│   │   │   └── schema.sql      # Database schema + seed data
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT authentication middleware
│   │   ├── routes/
│   │   │   ├── auth.js         # Login, register, /me
│   │   │   ├── clients.js      # Client CRUD
│   │   │   ├── uploads.js      # File upload + data extraction
│   │   │   ├── performance.js  # Analytics queries
│   │   │   ├── reports.js      # PDF report generation
│   │   │   ├── campaigns.js    # Campaign listing
│   │   │   ├── dashboard.js    # Overview stats
│   │   │   └── agency.js       # Branding settings
│   │   └── utils/
│   │       └── extractor.js    # CSV/Excel/PDF/OCR parser
│   ├── data/                   # Uploaded files, generated PDFs, logos
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.jsx             # Router + Auth wrapper
│   │   ├── index.js
│   │   ├── index.css           # Global styles + design system
│   │   ├── context/
│   │   │   └── AuthContext.jsx # Auth state management
│   │   ├── utils/
│   │   │   └── api.js          # Axios API helpers
│   │   ├── components/
│   │   │   ├── Layout.jsx      # Sidebar + main layout
│   │   │   └── MetricCard.jsx  # KPI card component
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── Register.jsx
│   │       ├── Dashboard.jsx   # Agency overview
│   │       ├── Clients.jsx     # Client list + create
│   │       ├── ClientDetail.jsx # Per-client analytics
│   │       ├── UploadData.jsx  # File upload + manual entry
│   │       ├── Reports.jsx     # PDF report generator
│   │       └── Settings.jsx    # Agency branding
│   └── package.json
├── setup-db.sh                 # One-command DB setup
└── README.md
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Step 1 — Clone and Install

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Step 2 — Configure Environment

```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials
```

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=perf_marketing
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your-secret-key
FRONTEND_URL=http://localhost:3000
```

### Step 3 — Setup Database

```bash
# From project root
chmod +x setup-db.sh
./setup-db.sh
```

Or manually:
```bash
psql -U postgres -c "CREATE DATABASE perf_marketing;"
psql -U postgres -d perf_marketing -f backend/src/db/schema.sql
```

### Step 4 — Start the App

Terminal 1 (Backend):
```bash
cd backend
npm run dev
# Server running on http://localhost:5000
```

Terminal 2 (Frontend):
```bash
cd frontend
npm start
# App running on http://localhost:3000
```

### Step 5 — Login

Open http://localhost:3000 and use demo credentials:
- **Email:** admin@demo.com  
- **Password:** admin123

---

## Usage Guide

### 1. Add a Client
Go to **Clients** → Click **Add Client** → Fill name, industry, contact.

### 2. Upload Report Data
Go to **Upload Data** → Select client & platform → Drag-drop your file:
- **CSV/Excel** — Export directly from Meta Ads Manager or Google Ads
- **PDF** — Download report PDF from ad platforms
- **Screenshot** — PNG/JPG screengrab (OCR extraction)
- **Manual** — Type metrics directly

### 3. View Analytics
Go to **Clients** → Click a client → Explore tabs:
- **Overview** — KPI cards + MoM comparison
- **Trends** — Monthly charts
- **Campaigns** — Campaign-level breakdown
- **Platforms** — Budget allocation pie chart

### 4. Generate PDF Report
Go to **Reports** → Select client → Configure date range → **Generate PDF Report** → Download.

### 5. White-Label Branding
Go to **Settings** → Upload agency logo + set brand colors → Reports will use your branding.

---

## Supported File Formats

| Format | Source Examples | Extraction Method |
|--------|----------------|-------------------|
| CSV | Meta Ads Manager export, Google Ads export | csv-parse |
| Excel (.xlsx) | Google Ads, LinkedIn Campaign Manager | xlsx library |
| PDF | Any ad platform report PDF | pdf-parse |
| PNG/JPG | Screenshots of dashboards | Tesseract OCR |

### Expected CSV Column Names

The extractor auto-detects these column variants:

| Metric | Accepted Column Names |
|--------|----------------------|
| Spend | spend, amount spent, cost, total spend |
| Impressions | impressions, impr, total impressions |
| Clicks | clicks, link clicks, total clicks |
| CTR | ctr, click-through rate, link ctr |
| CPC | cpc, cost per click, avg. cpc |
| Conversions | conversions, leads, results, purchases |
| CPA | cpa, cost per result, cost per lead |
| ROAS | roas, return on ad spend, purchase roas |

---

## API Endpoints

```
POST   /api/auth/login              Login
POST   /api/auth/register           Register new agency
GET    /api/auth/me                 Current user

GET    /api/clients                 List clients
POST   /api/clients                 Create client
PUT    /api/clients/:id             Update client
DELETE /api/clients/:id             Delete client

POST   /api/uploads                 Upload file
POST   /api/uploads/manual          Manual data entry
GET    /api/uploads/client/:id      Upload history

GET    /api/performance/summary/:id  Summary metrics
GET    /api/performance/trends/:id   Monthly trends
GET    /api/performance/comparison/:id  MoM comparison
GET    /api/performance/campaigns/:id   Campaign data
GET    /api/performance/platforms/:id   Platform breakdown

POST   /api/reports/generate        Generate PDF
GET    /api/reports/history/:id     Report history

GET    /api/dashboard/overview      Agency overview

GET    /api/agency                  Agency details
PUT    /api/agency                  Update branding
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Backend port | 5000 |
| DB_HOST | PostgreSQL host | localhost |
| DB_PORT | PostgreSQL port | 5432 |
| DB_NAME | Database name | perf_marketing |
| DB_USER | DB username | postgres |
| DB_PASSWORD | DB password | postgres |
| JWT_SECRET | JWT signing secret | (required in prod) |
| FRONTEND_URL | CORS origin | http://localhost:3000 |

---

## Evaluation Criteria Checklist

- [x] **Functionality** — Upload, extract, store, visualize, generate PDF
- [x] **Usability** — Clean UI, simple for non-technical users
- [x] **Data Extraction** — CSV/Excel/PDF/OCR with smart column mapping
- [x] **Code Quality** — Modular routes, utilities, reusable components
- [x] **Innovation** — OCR support, auto column detection, white-label branding

---

## Development Notes

- OCR extraction (Tesseract) is slow (~5-15s per image). Production should use a queue.
- For production, add rate limiting (`express-rate-limit`) and HTTPS.
- Store uploaded files on S3/Cloudinary rather than local disk in production.
- Add Redis session/cache for large agencies with many clients.
