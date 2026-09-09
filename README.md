<div align="center">

<img src="docs/assets/logo-wordmark.png" width="320" alt="KisanMitra"/>

<img src="docs/assets/sih-2026-badge.png" width="220" alt="Smart India Hackathon 2026"/>

### Strengthening market linkages and price discovery for farmers

*"A platform that helps farmers decide when, where, and to whom to sell their produce — for maximum profit."*

<a href="docs/PROBLEM_STATEMENT.md"><img src="https://img.shields.io/badge/PS-26132-2C5F2D?style=flat-square" alt="Problem Statement 26132"/></a>
<img src="https://img.shields.io/badge/Theme-Agriculture%20%7C%20FoodTech%20%7C%20Rural%20Dev-97BC62?style=flat-square" alt="Theme"/>
<img src="https://img.shields.io/badge/Category-Software-2C5F2D?style=flat-square" alt="Category: Software"/>
<a href="#screens-current-prototype"><img src="https://img.shields.io/badge/Status-Prototype-orange?style=flat-square" alt="Status: Prototype"/></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT"/></a>

<br/>

<a href="frontend"><img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React 18"/></a>
<a href="frontend"><img src="https://img.shields.io/badge/PWA-enabled-5A0FC8?style=flat-square&logo=pwa&logoColor=white" alt="PWA enabled"/></a>
<a href="backend"><img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI"/></a>
<a href="backend"><img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"/></a>
<a href="ml"><img src="https://img.shields.io/badge/XGBoost-ML-orange?style=flat-square" alt="XGBoost"/></a>

**Team: The 6 Innovators** · Government of Maharashtra · Maharashtra State Innovation Society (MSInS)

</div>

<br/>

## Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Screens](#screens-current-prototype)
- [Impact](#impact)
- [Why It Will Work](#why-it-will-work)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [Docs](#docs)

<br/>

## The Problem

> Smallholder farmers and FPOs have fragmented visibility into mandi prices, buyer demand, quality requirements, logistics and storage options. Sold under liquidity pressure right after harvest, they have weak bargaining power. Buyers, in turn, struggle to source consistent volume and quality from scattered small producers, and transactions lack transparency around payment reliability and buyer credentials.

See [`docs/PROBLEM_STATEMENT.md`](docs/PROBLEM_STATEMENT.md) for the full official text of PS 26132.

<br/>

## The Solution

<table>
<tr>
<td width="60%" valign="top">

KisanMitra is a market-intelligence and transaction-enablement layer that sits <b>across mandis, processors, institutional buyers and digital trading channels</b>. It gives a farmer one home screen that answers <i>when, where, and to whom</i> to sell — then carries that decision through to delivery and payment.

<ul>
<li>📈 <b>Market intelligence</b> — aggregated mandi prices, arrivals, localized price-trend views</li>
<li>🤖 <b>AI Sell/Hold advisor</b> — a net-realisation recommendation for a given lot, with the reasoning shown</li>
<li>🤝 <b>Buyer matching</b> — verified buyers with a computed reliability score</li>
<li>🌾 <b>Lot creation &amp; quality grading</b> — structured listings, photo-based grading, spec matching</li>
<li>📦 <b>Offers → logistics → payment</b> — tracked end to end, one pipeline</li>
<li>🗣️ <b>Voice-first, local-language</b> — built for low digital literacy and patchy connectivity</li>
</ul>

Full workflow &amp; architecture: <a href="docs/ARCHITECTURE.md"><code>docs/ARCHITECTURE.md</code></a>

</td>
<td width="40%" align="center">
<img src="docs/assets/app-preview-home.jpg" width="260" alt="KisanMitra Home screen preview"/>
<br/><sub><i>Home — today's sell/hold recommendation</i></sub>
</td>
</tr>
</table>

<br/>

## Screens (current prototype)

<table>
<tr><th>Screen</th><th>What it does</th></tr>
<tr><td>🏠 <b>Home</b></td><td>Namaste greeting, local weather, a voice/text query bar, the farmer's active produce card, and the day's Sell/Hold recommendation with expected net return and the reasoning behind it (buyer reliability, transport distance, demand, grade)</td></tr>
<tr><td>📊 <b>Market Intelligence</b></td><td>Per-crop weekly price trend, an AI price forecast narrative, a sale-window recommendation, and mandi-wise price/arrival comparison (with distance) — with a one-tap "Create Lot"</td></tr>
<tr><td>🌾 <b>My Lots</b></td><td>A farmer's produce lots with status (Recommendation Ready → Offer Accepted → Sold) and lot creation</td></tr>
<tr><td>📦 <b>Orders</b></td><td>Order tracking: Offer Accepted → Logistics Arranged → Delivered → Payment Received, with manual payment confirmation</td></tr>
<tr><td>✅ <b>Verified Buyers</b></td><td>A buyer directory with verified/unverified badges, reliability score, distance, commodities handled, monthly volume capacity, payment terms, and a request-quote action</td></tr>
<tr><td>🤝 <b>FPO Aggregation</b></td><td>FPO membership, weekly pooled volume across members, and the bargaining-power gain (%) vs. selling individually</td></tr>
<tr><td>📷 <b>Quality Grading</b></td><td>Photo upload flow for AI-assisted produce grading against buyer specifications</td></tr>
<tr><td>💬 <b>AI Assistant</b></td><td>A voice-first conversational assistant (English / हिंदी / मराठी) for sell-timing, buyer, and net-return questions</td></tr>
<tr><td>👤 <b>Profile</b></td><td>Account details, usage stats, language & voice preference, FPO membership management</td></tr>
</table>

#### Status

This is a **front-end prototype** — account and lot data are currently stored locally in the browser (*"your data stays on this device"*), and prices, the buyer directory, and AI responses are illustrative/mock data for the demo. The [`backend/`](backend) FastAPI service in this repo — farmers, lots, buyers, offers, market prices, grievances, plus a working sell/hold recommendation endpoint (verified end-to-end, see [Getting Started](#getting-started)) — is the next step to move this from a local demo to a real multi-user platform.

<br/>

## Impact

<div align="center">
<img src="docs/assets/impact-flow.jpg" width="100%" alt="Better information leads to better decisions, right market linkages, efficient transactions, and stronger outcomes"/>
</div>

Every feature traces back to one of the seven outcomes named in PS 26132: **improved price realisation · reduced information asymmetry · lower transaction cost · stronger FPO aggregation · reduced post-harvest loss · more reliable buyer sourcing · transparent transaction records.**

<br/>

## Why It Will Work

<details open>
<summary><b>Strategies for success</b></summary>
<br/>
<div align="center">
<img src="docs/assets/strategies-success.jpg" width="640" alt="Strategies for success: verified data, continuous model improvement, buyer verification and trust scores, digital quality records, local-language voice support, FPO and logistics partnerships"/>
</div>
</details>

<details>
<summary><b>Known challenges & risks (and why we're not hiding from them)</b></summary>
<br/>
<div align="center">
<img src="docs/assets/challenges-risks.jpg" width="640" alt="Challenges and risks: inaccurate or incomplete market data, AI prediction uncertainty, unreliable buyers, quality disputes, low digital literacy, logistics coordination"/>
</div>
<br/>

A judge-ready answer for each of these lives in [`docs/PRESENTATION_PREP.md`](docs/PRESENTATION_PREP.md).
</details>

<br/>

## Tech Stack

<table>
<tr>
<td width="45%" valign="top">

<table>
<tr><th>Layer</th><th>Technology</th></tr>
<tr><td>Frontend</td><td>React.js + PWA</td></tr>
<tr><td>Backend</td><td>Python + FastAPI</td></tr>
<tr><td>Database</td><td>PostgreSQL</td></tr>
<tr><td>ML</td><td>XGBoost / scikit-learn</td></tr>
<tr><td>NLP / Voice</td><td>Speech-to-Text / Text-to-Speech, LLM</td></tr>
<tr><td>Vision</td><td>Computer Vision (quality grading)</td></tr>
<tr><td>Maps</td><td>Maps &amp; Distance API (logistics)</td></tr>
<tr><td>Deployment</td><td>AWS / GCP / Azure</td></tr>
</table>

</td>
<td width="15%"></td>
<td width="40%" align="center">
<img src="docs/assets/tech-stack-icons.jpg" width="220" alt="Technologies used"/>
</td>
</tr>
</table>

<br/>

## Repository Structure

```
kisanmitra/
├── backend/        # FastAPI service — market data, buyer matching, lots, offers, payments
├── frontend/       # React + PWA client (farmer/FPO/buyer facing)
├── ml/             # Price forecasting & sell/hold recommendation models
├── docs/           # Problem statement, architecture, presentation prep, assets
└── README.md
```

<br/>

## Getting Started

<details>
<summary><b>Backend (FastAPI)</b></summary>

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL etc.
uvicorn app.main:app --reload
```

API docs at `http://localhost:8000/docs` once running.
</details>

<details>
<summary><b>Frontend (React + PWA)</b></summary>

```bash
cd frontend
npm install
npm run dev
```
</details>

<details>
<summary><b>ML (price forecasting)</b></summary>

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python src/train_price_model.py --help
```
</details>

<br/>

## Docs

- [`docs/PROBLEM_STATEMENT.md`](docs/PROBLEM_STATEMENT.md) — the official PS 26132 text
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — workflow diagram, components, data-sourcing phases, ML approach
- [`docs/PRESENTATION_PREP.md`](docs/PRESENTATION_PREP.md) — problem deep-dive, predicted judge Q&A, pitch script, day-of checklist

<br/>

<div align="center">

Built by <b>The 6 Innovators</b> for Smart India Hackathon 2026 · Problem Statement 26132

Licensed under <a href="LICENSE">MIT</a>

</div>
