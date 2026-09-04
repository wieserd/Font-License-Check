# Font License Intelligence

Determine whether a font can legally be used for commercial projects, with a primary focus on paperback book publishing, and analyze EULAs with verifiable evidence.

---

## The Problem

Self-published authors, book designers, and web developers often struggle to understand if a font EULA (End User License Agreement) permits commercial use in printed paperbacks, covers, ebooks, or websites. Standard AI tools often make general assumptions, which can lead to legal risks. 

**Font License Intelligence** solves this by providing a local, evidence-first assessment. It parses metadata directly from font files, queries a structured registry, and maps assessments to verbatim EULA clauses.

---

## Key Features

1. **Font Metadata Extraction**: Client-side parsing using `opentype.js` to read binary tables (`name` table, copyright, trademark, vendor ID, designer, vendor URL, license description, version) from uploaded `.otf`, `.ttf`, `.woff`, or `.woff2` files.
2. **Deterministic Rules Engine**: Evaluates project uses (Paperback, Ebook, Web, Merchandise, etc.) against extracted license terms with strict "Not specified ≠ Allowed" compliance.
3. **Paperback & KDP Compliance Checklist**: A granular checklist detailing cover art rules, print-run caps, interior typesetting, PDF embedding vs. redistribution rights, geographic limits, and specific guidance for self-publishing portals (Amazon KDP, IngramSpark).
4. **Verifiable Evidence Drawer with 4-Tier Source Hierarchy**: Slide-out drawer displaying exact EULA clauses, section references, source links, and clear evidentiary tier classifications (Tier 1: Direct File Embedding, Tier 2: Exact Foundry Registry, Tier 3: Known Standard Model, Tier 4: Weak Heuristic).
5. **PDF Compliance Certificate Export**: One-click printable export format generating formal, timestamped compliance documentation suitable for print brokers or legal recordkeeping.
6. **AI EULA Extraction**: Calls Google Gemini models to scan and structure pasted plain text EULA files, with a robust keyword regex fallback.
7. **Compliance Dashboard & Watcher**: A catalog where users save analyzed fonts, toggle monitored tracking, and receive alerts if monitored licenses change.

---

## Repository Structure

```text
├── index.html          # Main single-page application layout
├── vite.config.js      # Vite configuration and proxy setup
├── package.json        # Node dependencies and build scripts
├── LICENSE.md          # MIT license detailing liability disclaimers
├── src/
│   ├── main.js         # SPA logic, opentype.js extraction, and UI interactions
│   └── styles.css      # Premium dark-theme visual design system
└── server/
    ├── server.js       # Express server API endpoints
    ├── db.js           # Database manager for database.json
    ├── database.json   # Seeded registry (fonts, licenses, clauses, history)
    ├── licenseEngine.js# Compliance logic evaluating EULA facts
    └── geminiService.js# Gemini SDK connector & keyword parser fallback
```

---

## Quick Start

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) (v18+) and npm installed on your system.

### 2. Install Dependencies
Clone the repository and run:
```bash
npm install
```

### 3. Run the Application
Start the backend Express server:
```bash
npm run server
```
By default, the API starts on `http://localhost:3001`.

In a separate terminal, start the Vite development server:
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### 4. Run Automated Tests
Run the comprehensive verification suite:
```bash
npm test
```

---

## Gemini API Configuration

To enable AI-powered analysis of pasted EULA documents:
1. Create a `.env` file in the root directory based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
2. Retrieve an API Key from [Google AI Studio](https://aistudio.google.com/).
3. Add your key to the `.env` file:
   ```env
   GEMINI_API_KEY=AIzaSy...
   ```
*Note: You can also configure or toggle your API key directly in the web app under the **API Config** navigation tab. If no key is set, the system uses a fallback keyword-matching parser.*

---

## Legal Positioning & Disclaimer

This application is designed for **license compliance assistance and research purposes only**. It does not constitute legal advice. The software parses and compares terms in identified documents for reference, but the developer holds no liability for final legal clearances. Always consult with a qualified legal professional for critical licensing validations.
