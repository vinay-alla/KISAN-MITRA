# Kisan Mitra

**Strengthening market linkages and price discovery for farmers** — a working prototype for
Smart India Hackathon 2026, Problem Statement **26132**, by **The 6 Innovators**.

Kisan Mitra helps a farmer decide *when, where and to whom* to sell — then carries that
decision through to delivery and payment. It also gives buyers and FPO (Farmer Producer
Organisation) operators their own views of the same marketplace.

> **This is a prototype.** All mandi prices, buyers, offers, orders and verification records are
> illustrative mock data. The "AI" features (price forecast, sell-or-hold, quality grading) are
> rule-based or simulated — there is no trained model behind them.

## Features

**Farmer**
- **Market intelligence** — mandi-wise prices, 7-day trend, price forecast and an explainable
  **Sell / Sell soon / Hold** suggestion with a confidence score (trend momentum + forecast + crop perishability).
- **Net-realisation comparison** — every sell option is shown as base price − transport − commission − storage, so the best *net* option wins, not the best headline price.
- **Lots & reverse bidding** — list a lot (with photo and location), receive live bids from buyers, accept one.
- **24-hour cancel window** on an accepted offer, **5-stage order tracking**, and a printable **payment receipt**.
- **AI visual pre-grading** — upload a produce photo and get a 6-check compliance breakdown (colour, size, shape, visible defects, maturity, disease/pest damage) and an overall grade.
- **Buyer verification** — KYC checklist (business KYC, GSTIN, PAN, FSSAI, bank account, address, capacity) plus payment score, dispute history and fulfilment rate; processor offers get a full-offer check, not just the quoted price.
- **FPO aggregation**, **transport & storage** booking (sorted by live distance from your GPS position), **weather forecast**, **transaction history**, **grievance / dispute flow**.
- **Next-season crop suggestions** based on your location's soil type and the coming season (Kharif / Rabi / Zaid).

**Buyer** — browse verified lots, make offers, track them, view verified farmers & FPOs, and manage a business profile with their own verification status.

**FPO operator** — member and pooled-lot overview, verified buyers, market view.

**Across the app** — English / हिंदी / मराठी, a voice assistant (speech-to-text input and spoken replies), installable PWA with offline app shell, and a prototype disclaimer.

## Run it locally

Requires Python 3. The app uses ES modules, so it must be served over HTTP — opening
`index.html` directly from disk will not work.

```bash
python devserver.py
# then open http://127.0.0.1:8800
```

Use the **Try Demo … Account** buttons on the login page to explore each role.

Options: `python devserver.py 3000` (custom port) or `python devserver.py 8800 0.0.0.0` (reachable from your phone on the same network).

### Optional: live mandi prices

The Market page can pull real mandi prices (eNAM / Agmarknet data republished on
[data.gov.in](https://data.gov.in)). That needs a free API key from data.gov.in:

```bash
# macOS / Linux
export DATA_GOV_IN_API_KEY="your-key"
# Windows PowerShell
$env:DATA_GOV_IN_API_KEY = "your-key"

python devserver.py
```

Without a key the app works normally and shows its built-in sample mandi data. The key is read
from the environment only — never commit it.

## Deploy to GitHub Pages

The repo includes a workflow (`.github/workflows/pages.yml`) that publishes the static app on
every push to `main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions.**

On Pages there is no `devserver.py`, so live mandi prices are unavailable and the Market page
uses its sample data.

## Project structure

```
index.html        app shell (Tailwind via CDN, fonts, service-worker registration)
manifest.json     PWA manifest
sw.js             service worker (cached app shell)
devserver.py      local static server + /api/mandi proxy
css/style.css     global styles
js/app.js         router, header, bottom nav, role-based access
js/pages.js       every page render function
js/data.js        mock datasets, nav config, crop/soil planning data
js/store.js       localStorage-backed state
js/i18n.js        English / Hindi / Marathi dictionary
js/icons.js       SVG icon set + image nav icons + logo
js/ui.js          toast / modal helpers
assets/           photos, icons, logo
```

Vanilla JavaScript with hash-based routing — no framework and no build step.

## Known limitations

- **Authentication is client-side only.** Accounts live in the browser's `localStorage` and passwords are stored unhashed. Don't use a real password; a real backend is needed before any production use.
- All data is mock data stored in the browser; there is no database or server API apart from the optional price proxy.
- Quality grading scores are derived deterministically from the uploaded file's name and size — a stand-in for a real vision model.
- Weather uses [Open-Meteo](https://open-meteo.com) and place names use OpenStreetMap [Nominatim](https://nominatim.org); both need an internet connection and, for location, browser permission.
- The voice assistant relies on the browser's Web Speech API (best in Chrome).

## Credits

- Code: MIT License — see [LICENSE](LICENSE).
- Logo: designed by the project team.
- Navigation icons: [Icons8](https://icons8.com) (Fluency style).
- Photographs from [Pexels](https://www.pexels.com) (free to use): photos
  [16144796](https://www.pexels.com/photo/16144796/),
  [1093837](https://www.pexels.com/photo/1093837/),
  [4022083](https://www.pexels.com/photo/4022083/),
  [10159434](https://www.pexels.com/photo/10159434/),
  [2573532](https://www.pexels.com/photo/2573532/),
  [35069664](https://www.pexels.com/photo/35069664/),
  [7843985](https://www.pexels.com/photo/7843985/),
  [30573590](https://www.pexels.com/photo/30573590/),
  [19746166](https://www.pexels.com/photo/19746166/),
  [4307869](https://www.pexels.com/photo/4307869/),
  [2965707](https://www.pexels.com/photo/2965707/),
  [17358983](https://www.pexels.com/photo/17358983/).
  The remaining images (crop thumbnails, farmer/buyer avatars, orders background) came from free stock sources whose original IDs were not recorded — verify their licenses before any commercial use.
