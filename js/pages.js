import { icon, kisanMitraMark } from './icons.js';
import * as D from './data.js';
import { store } from './store.js';
import { toast, openModal, closeModal } from './ui.js';
import { t, greet, currentLangCode } from './i18n.js';
import { esc, inr, money, initials, distanceKm, fmtKm, stateFromLocation, toNumber, clamp, isValidIndianMobile, phoneKey } from './util.js';
import { hashPassword, verifyPassword } from './crypto.js';
import {
  getOptions, sellOrHoldAnalysis, gradeQualityFactors, overallGradeFrom,
  offerCancelWindow, storageEconomics, compareHoldPeriods, poolStatus, sharedTripCost,
  validateGrievance, nextGrievanceStatus, GRIEVANCE_TYPES, GRIEVANCE_STATUSES,
} from './logic.js';

/* ---------------- helpers ---------------- */

function badgeTone(level) {
  const l = (level || '').toLowerCase();
  if (l === 'high' || l === 'urgent') return 'bg-destructive/10 text-destructive border-destructive/20';
  if (l === 'medium') return 'bg-accent/20 text-accent-foreground border-accent/30';
  return 'bg-muted text-muted-foreground border-border';
}

function stars(rating) {
  return `<span class="inline-flex items-center gap-1 text-sm font-semibold text-foreground">${icon('star', 'w-3.5 h-3.5 fill-accent text-accent')}${rating}</span>`;
}

// Styled crop badge (replaces emoji): a real produce photo when we have one (data.js's
// CROP_STYLE), falling back to a tinted circle with a flat line-art icon otherwise.
function cropBadge(cropName, box = 'w-12 h-12', iconSize = 'w-6 h-6', userPhoto = null) {
  if (userPhoto) {
    return `<img src="${userPhoto}" alt="${cropName}" class="${box} rounded-xl object-cover shrink-0 ring-1 ring-black/5" />`;
  }
  const s = D.cropStyle(cropName);
  if (s.photo) {
    return `<img src="${s.photo}" alt="${cropName}" class="${box} rounded-xl object-cover shrink-0 ring-1 ring-black/5" />`;
  }
  return `<div class="${box} rounded-xl flex items-center justify-center shrink-0" style="background:${s.bg};color:${s.fg}">${icon(s.icon, iconSize)}</div>`;
}

// Small round version for inline use (chips, pills).
function cropThumb(cropName, size = 'w-4 h-4') {
  const s = D.cropStyle(cropName);
  if (s.photo) return `<img src="${s.photo}" alt="" class="${size} rounded-full object-cover shrink-0" />`;
  return icon(s.icon, size);
}

function sectionHead(title, subtitle) {
  return `<div class="px-4 md:px-6 pt-6 pb-2">
    <h1 class="text-2xl md:text-3xl font-extrabold">${t(title)}</h1>
    ${subtitle ? `<p class="text-muted-foreground mt-1">${t(subtitle)}</p>` : ''}
  </div>`;
}

function card(inner, cls = '') {
  return `<div class="card p-4 ${cls}">${inner}</div>`;
}

function pageWrap(inner) {
  return `<div class="page-enter pb-6">${inner}</div>`;
}

function telHref(phone) { return `tel:${(phone || '').replace(/[^+\d]/g, '')}`; }

function uploadBox(id, title, subtitle) {
  return `
  <div class="card p-6 text-center">
    <div class="mx-auto w-16 h-16 rounded-full bg-primary-light flex items-center justify-center text-primary mb-4">
      ${icon('upload', 'w-7 h-7')}
    </div>
    <h3 class="font-bold text-lg">${title}</h3>
    <p class="text-muted-foreground text-sm mt-1 mb-4">${subtitle}</p>
    <div class="flex items-center justify-center gap-3 flex-wrap">
      <button data-action="take-photo" class="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition">
        ${icon('camera', 'w-4 h-4')} Take Photo
      </button>
      <button data-action="upload-file" class="inline-flex items-center gap-2 border border-border bg-card font-semibold px-5 py-2.5 rounded-xl hover:bg-muted transition">
        ${icon('image', 'w-4 h-4')} Upload
      </button>
    </div>
    <input type="file" accept="image/*" id="${id}" class="hidden" />
  </div>`;
}

function wireUpload(root, inputId) {
  const input = root.querySelector(`#${inputId}`);
  root.querySelector('[data-action="upload-file"]').addEventListener('click', () => { input.removeAttribute('capture'); input.click(); });
  root.querySelector('[data-action="take-photo"]').addEventListener('click', () => { input.setAttribute('capture', 'environment'); input.click(); });
  return input;
}

function readAsDataUrl(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

function sparkline(trend, days) {
  const min = Math.min(...trend), max = Math.max(...trend);
  const range = max - min || 1;
  return `<div class="flex items-end gap-2 h-24">
    ${trend.map((v, i) => {
      const h = 16 + ((v - min) / range) * 64;
      const isLast = i === trend.length - 1;
      const style = isLast
        ? `height:${h}px;background-image:linear-gradient(180deg, hsl(142 60% 42%), hsl(142 62% 30%));box-shadow:0 4px 10px -4px rgba(20,90,40,0.5)`
        : `height:${h}px;background-image:linear-gradient(180deg, hsl(142 45% 82%), hsl(142 40% 72%))`;
      return `<div class="flex-1 flex flex-col items-center gap-1.5">
        <div class="w-full rounded-t-md transition-all" style="${style}"></div>
        <span class="text-[10px] font-semibold ${isLast ? 'text-primary' : 'text-muted-foreground'}">${days[i]}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function trendBadge(dir) {
  if (dir === 'rising' || dir === 'up') return `<span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-primary/10 text-primary">${icon('trending', 'w-3.5 h-3.5')}Rising</span>`;
  if (dir === 'falling' || dir === 'down') return `<span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-destructive/10 text-destructive">${icon('trending', 'w-3.5 h-3.5 rotate-90')}Falling</span>`;
  return `<span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground">Stable</span>`;
}

function findLot(id) {
  const all = [...store.get().lots || [], ...D.LOTS];
  return all.find((l) => l.id === id);
}

function effectiveStatus(lot) { return store.getLotStatus(lot.id, lot.status); }

function currentFarmer() {
  const u = store.get().user;
  return { ...D.DEFAULT_FARMER, ...(u && u.role === 'farmer' ? u : {}) };
}

function currentBuyer() {
  const u = store.get().user;
  return { ...D.DEFAULT_BUYER, ...(u && u.role === 'buyer' ? u : {}) };
}

function currentFpoOperator() {
  const u = store.get().user;
  return { ...D.DEFAULT_FPO_OPERATOR, ...(u && u.role === 'fpo_operator' ? u : {}) };
}

const SPEECH_LOCALE = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

function speakOrToast(input) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Voice input not supported in this browser — try Chrome on Android/desktop.', { tone: 'error', icon: 'mic' }); return; }
  try {
    const rec = new SR();
    rec.lang = SPEECH_LOCALE[currentLangCode()] || 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    toast('Listening… speak now', { icon: 'mic' });
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      input.value = text;
      toast(`Heard: "${text}"`, { tone: 'success', icon: 'mic' });
    };
    rec.onerror = () => toast('Could not hear you clearly. Try again.', { tone: 'error', icon: 'mic' });
    rec.start();
  } catch (e) {
    toast('Voice input unavailable right now.', { tone: 'error', icon: 'mic' });
  }
}

// Text-to-speech for the assistant's replies — turns the chat from "type into a bot" into
// an actual voice assistant that talks back, in the farmer/buyer's selected language.
// Respects the same voiceEnabled preference set on the Profile page.
function speak(text) {
  if (!window.speechSynthesis || store.get().voiceEnabled === false) return;
  try {
    window.speechSynthesis.cancel();
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    if (!clean) return;
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = SPEECH_LOCALE[currentLangCode()] || 'en-IN';
    utter.rate = 0.98;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
  } catch (e) {}
}

// Reads the device's real GPS position, reverse-geocodes it to a place name (OpenStreetMap
// Nominatim) and pulls live temperature for those coordinates (Open-Meteo) — no API key needed.
function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation is not supported on this device/browser.')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(err.code === 1 ? 'Location permission denied. Enable it in your browser settings and try again.' : 'Could not get your location. Try again.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

async function reverseGeocode(lat, lon) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Could not resolve an address for your location.');
  const data = await res.json();
  const a = data.address || {};
  const place = a.village || a.town || a.city || a.suburb || a.county || a.state_district || 'Your Location';
  const state = a.state || a.country || '';
  return state ? `${place}, ${state}` : place;
}

function weatherIconFor(code) {
  if (code === 0) return 'sun';
  if (code <= 2) return 'cloud-sun';
  if (code === 3 || code === 45 || code === 48) return 'cloud';
  if (code >= 51) return 'cloud-rain';
  return 'cloud-sun';
}

function weatherConditionFor(code) {
  if (code === 0) return 'Clear Sky';
  if (code <= 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 67) return 'Rainy';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Partly Cloudy';
}

// Live current conditions + 5-day forecast for the given coordinates (Open-Meteo, no API key).
async function fetchFullWeather(lat, lon) {
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=5`);
  if (!res.ok) throw new Error('Weather data unavailable right now.');
  const data = await res.json();
  const cur = data.current || {};
  const daily = data.daily || {};
  const days = (daily.time || []).map((date, i) => ({
    day: i === 0 ? 'Today' : new Date(date).toLocaleDateString('en-IN', { weekday: 'short' }),
    icon: weatherIconFor(daily.weather_code?.[i]),
    max: Math.round(daily.temperature_2m_max?.[i]),
    min: Math.round(daily.temperature_2m_min?.[i]),
    rain: Math.round(daily.precipitation_probability_max?.[i] ?? 0),
  }));
  return {
    temp: Math.round(cur.temperature_2m ?? 28),
    condition: weatherConditionFor(cur.weather_code),
    conditionIcon: weatherIconFor(cur.weather_code),
    humidity: Math.round(cur.relative_humidity_2m ?? 60),
    wind: Math.round(cur.wind_speed_10m ?? 10),
    rainChance: days[0]?.rain ?? 20,
    feelsLike: Math.round(cur.temperature_2m ?? 28),
    daily: days.length ? days : D.WEATHER_FALLBACK.daily,
  };
}

async function fetchLiveTemp(lat, lon) {
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`);
  if (!res.ok) throw new Error('weather unavailable');
  const data = await res.json();
  return Math.round(data?.current?.temperature_2m ?? 28);
}

async function getLiveLocation() {
  const coords = await getBrowserPosition();
  const [location, weather] = await Promise.all([
    reverseGeocode(coords.latitude, coords.longitude).catch(() => 'Your Location'),
    fetchLiveTemp(coords.latitude, coords.longitude).catch(() => null),
  ]);
  return { location, weather, lat: coords.latitude, lon: coords.longitude };
}

// Live mandi (APMC) prices, sourced from the same daily eNAM/Agmarknet arrival-and-price
// feed that data.gov.in republishes as open government data. data.gov.in's API sends no
// CORS headers, so the browser can't call it directly — devserver.py proxies the request
// server-side at /api/mandi and hands back plain same-origin JSON. Always falls back to the
// existing mock mandi trend on any failure (offline, rate limit, no proxy) so the page never breaks.
async function fetchLiveMandiPrices(commodityName, stateName) {
  const url = `./api/mandi?commodity=${encodeURIComponent(commodityName)}` +
    (stateName ? `&state=${encodeURIComponent(stateName)}` : '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error('eNAM/Agmarknet price feed unavailable');
  const data = await res.json();
  const records = data?.records || [];
  if (!records.length) throw new Error('No live mandi records for this commodity right now');
  return records
    .map((r) => ({
      name: r.market || r.district || 'Mandi',
      price: Number(r.modal_price) || Number(r.max_price) || 0,
      minPrice: Number(r.min_price) || null,
      maxPrice: Number(r.max_price) || null,
      arrivals: r.district ? `${r.district} dist.` : '—',
      distance: '—',
      trend: 'flat',
      arrivalDate: r.arrival_date || null,
    }))
    .filter((m) => m.price > 0);
}

// Wires a "use my location" button: shows a locating state, resolves real GPS + live
// weather, and hands the result to onResolved (or shows a toast if the user declines/fails).
function wireLocateButton(btn, onResolved) {
  const original = btn.innerHTML;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"></span> Locating…`;
    try {
      const result = await getLiveLocation();
      toast(`Location set to ${result.location}`, { tone: 'success', icon: 'pin' });
      onResolved(result);
    } catch (e) {
      toast(e.message || 'Could not access your location.', { tone: 'error', icon: 'pin' });
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
}

/* ---------------- HOME ---------------- */

function renderHome() {
  const farmer = currentFarmer();
  const lot = D.LOTS[0];
  const options = getOptions(lot);
  const best = options.find((o) => o.best) || options[0];
  const status = effectiveStatus(lot);
  const alreadyAccepted = !!store.getAcceptedOption(lot.id);
  const acceptedAt = store.getOfferAcceptedAt(lot.id);
  const msLeft = acceptedAt ? acceptedAt + 24 * 60 * 60 * 1000 - Date.now() : 0;
  const canCancelOffer = alreadyAccepted && msLeft > 0;
  const hoursLeft = Math.floor(msLeft / 3600000);
  const minsLeft = Math.floor((msLeft % 3600000) / 60000);

  const html = `<div class="page-photo-bg"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 flex items-start justify-between">
      <div>
        <h1 class="font-display text-2xl font-extrabold text-white drop-shadow-md">${greet(farmer.name)}</h1>
        <button id="locate-home-btn" class="inline-flex items-center gap-1.5 text-white/90 text-sm font-semibold mt-0.5 drop-shadow">${icon('pin', 'w-4 h-4')}<span id="locate-home-label">${farmer.location}</span> <span class="text-[10px] underline underline-offset-2 opacity-90">(update)</span></button>
      </div>
      <div class="text-right bg-white/85 backdrop-blur rounded-xl px-2.5 py-1.5 shadow-soft shrink-0">
        <div class="text-xl font-extrabold text-primary">${farmer.weather}°C</div>
        <div class="text-[10px] text-muted-foreground font-semibold">Live</div>
      </div>
    </div>

    <div class="relative z-10 px-4 md:px-6 mt-5">
      <button id="voice-search-btn" class="w-full flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3.5 shadow-soft hover:border-primary transition text-left">
        <span class="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center mic-btn shrink-0">${icon('mic', 'w-4 h-4')}</span>
        <span class="text-muted-foreground text-sm font-medium">${t('Tap &amp; Speak — or type your query')}</span>
      </button>
    </div>

    <div class="relative z-10 px-4 md:px-6 mt-6 flex items-center justify-between">
      <h2 class="font-display text-lg font-extrabold text-white drop-shadow-md">${t('🌱 Your Produce')}</h2>
      <button id="edit-lot" class="text-xs font-bold text-white/90 drop-shadow">${t('Edit')}</button>
    </div>
    <div class="px-4 md:px-6 mt-2">
      ${card(`
        <div class="flex items-center gap-3">
          ${cropBadge(lot.crop, 'w-14 h-14', 'w-7 h-7')}
          <div class="min-w-0">
            <div class="font-extrabold text-lg">${lot.crop}</div>
            <div class="text-sm text-muted-foreground">${lot.quantity} ${lot.unit} · ${lot.grade}</div>
            <div class="text-xs text-muted-foreground mt-0.5">Harvest: ${lot.harvestDate} · ${lot.location}</div>
          </div>
        </div>
      `)}
    </div>

    <div class="px-4 md:px-6 mt-5">
      <div class="card-feature p-4">
        <div class="relative">
          <span class="ribbon absolute -top-1 -right-1">☀️ ${t('Best Option')}</span>
          <div class="text-xs font-bold text-primary-dark mb-1 font-display tracking-wide">${t("TODAY'S RECOMMENDATION")}</div>
          <div class="flex items-end justify-between gap-3 flex-wrap pr-20">
            <div>
              <div class="text-xl font-extrabold text-primary font-display">${t(alreadyAccepted ? 'OFFER ACCEPTED' : 'SELL NOW')}</div>
              <div class="text-sm font-semibold mt-0.5">${best.label}</div>
              <div class="text-xs text-muted-foreground mt-0.5">${best.pickup}</div>
            </div>
            <div class="text-right">
              <div class="text-[11px] text-muted-foreground font-semibold">${t('Expected Net Return')}</div>
              <div class="text-2xl font-extrabold text-gradient-primary font-display">${inr(best.net)}<span class="text-sm font-bold text-muted-foreground">/qtl</span></div>
              <div class="text-[10px] text-muted-foreground">${t('(After all costs)')}</div>
            </div>
          </div>
          <div class="border-t border-primary/20 mt-4 pt-3">
            <div class="text-xs font-bold mb-2">${t('Why this option?')}</div>
            <ul class="space-y-1.5 text-sm">
              ${best.reasons.map((r) => `<li class="flex gap-2">${icon('check', 'w-4 h-4 text-primary shrink-0 mt-0.5')}<span>${r}</span></li>`).join('')}
            </ul>
          </div>
          <a href="#/lots/${lot.id}" class="mt-4 w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:opacity-90 transition shadow-soft">${t('Compare Other Options')} ${icon('chevronRight', 'w-4 h-4')}</a>
          ${canCancelOffer ? `
          <button id="cancel-offer-btn" class="mt-2 w-full inline-flex items-center justify-center gap-1.5 border border-destructive/40 text-destructive font-bold py-2.5 rounded-xl hover:bg-destructive/10 transition">${icon('x', 'w-4 h-4')}${t('Cancel Offer')} <span class="font-normal text-xs">(${hoursLeft}h ${minsLeft}m ${t('left to cancel')})</span></button>` : ''}
        </div>
      </div>
    </div>

    <div class="px-4 md:px-6 mt-6 grid grid-cols-3 gap-3">
      ${[['package', D.LOTS.length, 'Active Lots'], ['clipboard', D.ORDERS.length + store.get().orders.length, 'Orders'], ['trending', '+9%', 'Avg. Gain (FPO)']].map(([ic, v, l]) => card(`
        <div class="text-center">
          <div class="flex justify-center text-primary mb-1">${icon(ic, 'w-4 h-4')}</div>
          <div class="text-lg font-extrabold">${v}</div>
          <div class="text-[10px] text-muted-foreground font-semibold">${t(l)}</div>
        </div>`)).join('')}
    </div>

    <div class="px-4 md:px-6 mt-6 flex items-center justify-between">
      <h2 class="font-display text-lg font-extrabold text-white drop-shadow-md">${t('🔔 Market Alerts')}</h2>
      <a href="#/market" class="text-xs font-bold text-white bg-primary/70 backdrop-blur px-2.5 py-1 rounded-full">${t('View Market')}</a>
    </div>
    <div class="px-4 md:px-6 mt-2 space-y-3">
      ${D.ALERTS.slice(0, 3).map((a) => card(`
        <div class="flex items-start gap-3">
          ${icon('alert', `w-5 h-5 mt-0.5 ${a.level === 'HIGH' ? 'text-destructive' : a.level === 'MEDIUM' ? 'text-accent' : 'text-muted-foreground'}`)}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-sm">${a.title}</span><span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeTone(a.level)}">${a.level}</span></div>
            <p class="text-sm text-muted-foreground mt-1">${a.desc}</p>
            <p class="text-xs text-muted-foreground mt-1">${a.time}</p>
          </div>
        </div>`)).join('')}
    </div>
  `);

  function mount(root) {
    wireLocateButton(root.querySelector('#locate-home-btn'), ({ location, weather }) => {
      store.updateUser({ location, ...(weather != null ? { weather } : {}) });
      navigateTo('#/', true);
    });

    const cancelBtn = root.querySelector('#cancel-offer-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      openModal(`
        <div class="p-5">
          <h3 class="font-extrabold text-lg mb-1">${t('Cancel Offer')}</h3>
          <p class="text-sm text-muted-foreground mb-4">Cancel your accepted offer for ${lot.crop}? This is only possible within 24 hours of accepting, before the buyer arranges pickup. The lot will go back to "Recommendation Ready".</p>
          <div class="flex gap-2">
            <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Keep Offer</button>
            <button id="confirm-cancel-offer" class="flex-1 bg-destructive text-destructive-foreground rounded-xl py-2.5 font-semibold">${t('Cancel Offer')}</button>
          </div>
        </div>`, {
        onMount: (m) => m.querySelector('#confirm-cancel-offer').addEventListener('click', () => {
          store.cancelOffer(lot.id, 'Recommendation Ready');
          closeModal();
          toast('Offer cancelled — lot is back on the market.', { tone: 'success', icon: 'x' });
          navigateTo('#/', true);
        }),
      });
    });

    const input = { value: '' };
    root.querySelector('#voice-search-btn').addEventListener('click', () => {
      openModal(`
        <div class="p-5">
          <h3 class="font-extrabold text-lg mb-3">Tap &amp; Speak</h3>
          <div class="flex items-center gap-2">
            <input id="vq-input" placeholder="Ask e.g. 'When should I sell tomato?'" class="flex-1 border border-border rounded-xl px-3 py-2.5 bg-background" />
            <button id="vq-mic" class="w-11 h-11 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center">${icon('mic', 'w-5 h-5')}</button>
          </div>
          <button id="vq-go" class="w-full mt-4 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">Ask KisanMitra AI</button>
        </div>`, {
        onMount: (m) => {
          const inp = m.querySelector('#vq-input');
          m.querySelector('#vq-mic').addEventListener('click', () => speakOrToast(inp));
          m.querySelector('#vq-go').addEventListener('click', () => {
            const q = inp.value.trim();
            closeModal();
            sessionStorage.setItem('km:pending-query', q);
            navigateTo('#/assistant', true);
          });
        },
      });
    });

    root.querySelector('#edit-lot').addEventListener('click', () => {
      openModal(`
        <div class="p-5">
          <h3 class="font-extrabold text-lg mb-3">Edit Produce Lot</h3>
          <label class="text-xs font-bold text-muted-foreground">Quantity (${lot.unit})</label>
          <input id="el-qty" type="number" value="${lot.quantity}" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3" />
          <label class="text-xs font-bold text-muted-foreground">Grade</label>
          <select id="el-grade" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-4">
            <option ${lot.grade === 'Premium Quality' ? 'selected' : ''}>Premium Quality</option>
            <option ${lot.grade === 'Grade A' ? 'selected' : ''}>Grade A</option>
            <option ${lot.grade === 'Grade B' ? 'selected' : ''}>Grade B</option>
          </select>
          <div class="flex gap-2">
            <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Cancel</button>
            <button id="save-lot" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">Save</button>
          </div>
        </div>`, {
        onMount: (m) => m.querySelector('#save-lot').addEventListener('click', () => {
          closeModal();
          toast('Lot updated', { tone: 'success', icon: 'checkCircle' });
        }),
      });
    });
  }

  return { html, mount };
}

/* ---------------- MARKET INTELLIGENCE ---------------- */

function mandiRowHtml(m, i) {
  return `
    <div class="card p-3 flex items-center justify-between ${i === 0 ? 'border-primary/40' : ''}">
      <div>
        <div class="font-bold text-sm flex items-center gap-2">${m.name} ${i === 0 ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">TOP</span>` : ''}</div>
        <div class="text-xs text-muted-foreground">${m.arrivals} · ${m.distance}</div>
      </div>
      <div class="text-right">
        <div class="font-extrabold">${inr(m.price)}</div>
        ${trendBadge(m.trend)}
      </div>
    </div>`;
}

function liveBadgeHtml(state) {
  if (state === 'loading') return `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground"><span class="spinner inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full"></span>Checking eNAM…</span>`;
  if (state === 'live') return `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-primary/10 text-primary"><span class="relative flex w-1.5 h-1.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span class="relative inline-flex rounded-full w-1.5 h-1.5 bg-primary"></span></span>LIVE · eNAM/Agmarknet</span>`;
  return `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground">${icon('clipboard', 'w-3 h-3')}Recent mandi data</span>`;
}

/* ---------------- AI SELL-OR-HOLD ADVISOR ---------------- */
function sellHoldCardHtml(commodity, lot) {
  const a = sellOrHoldAnalysis(commodity, lot);
  const selling = a.verdict !== 'HOLD';
  const tone = selling
    ? { chip: 'bg-primary text-primary-foreground', text: 'text-primary', ring: 'border-primary/40', iconBg: 'bg-primary/10' }
    : { chip: 'bg-accent text-accent-foreground', text: 'text-accent-foreground', ring: 'border-accent/40', iconBg: 'bg-accent/20' };
  return `
    <div class="card p-4 border-2 ${tone.ring}">
      <div class="flex items-center gap-3 mb-1">
        <div class="w-10 h-10 rounded-full ${tone.iconBg} flex items-center justify-center shrink-0">${icon('zap', `w-5 h-5 ${tone.text}`)}</div>
        <div class="min-w-0">
          <div class="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">${t('AI Sell-or-Hold Suggestion')}</div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-extrabold text-xl ${tone.text}">${t(a.verdict)}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${tone.chip}">${a.confidence}% confidence</span>
          </div>
        </div>
      </div>
      ${scoreBar(a.confidence)}
      <ul class="mt-3 space-y-1.5 text-xs text-muted-foreground">
        ${a.reasons.map((r) => `<li class="flex gap-1.5">${icon('check', 'w-3.5 h-3.5 text-primary shrink-0 mt-0.5')}${r}</li>`).join('')}
      </ul>
    </div>`;
}

function renderMarket(initialId) {
  const selected = D.COMMODITIES.find((c) => c.id === initialId) || D.COMMODITIES[0];

  function body(commodity) {
    const todayPrice = commodity.mandis.reduce((max, m) => Math.max(max, m.price), 0);
    return `
      <div class="flex items-center gap-2 mb-4">
        ${cropBadge(commodity.name, 'w-11 h-11', 'w-6 h-6')}
        <div>
          <div class="font-extrabold text-lg">${commodity.name}</div>
          <div class="text-xs text-muted-foreground">Best price today: <b class="text-foreground" id="today-price">${inr(todayPrice)}</b>/${commodity.unit}</div>
        </div>
        <div class="ml-auto">${trendBadge(commodity.forecast)}</div>
      </div>
      ${sparkline(commodity.trend, commodity.days)}
      <div class="bg-primary-light rounded-xl p-3 mt-5">
        <div class="flex items-center gap-1.5 text-xs font-bold text-primary mb-1">${icon('zap', 'w-3.5 h-3.5')}AI Price Forecast</div>
        <p class="text-xs text-foreground/80">${commodity.forecastNote}</p>
      </div>
      <div class="mt-3">${sellHoldCardHtml(commodity)}</div>
      <div class="flex items-center justify-between mt-6 mb-3">
        <h3 class="font-extrabold">Mandi-wise Prices &amp; Arrivals</h3>
        <div class="flex items-center gap-1.5">
          <span id="live-badge">${liveBadgeHtml('fallback')}</span>
          <button id="mandi-refresh" title="Refresh live prices" class="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-muted transition">${icon('trending', 'w-3 h-3')}</button>
        </div>
      </div>
      <div class="space-y-2" id="mandi-list">
        ${[...commodity.mandis].sort((a, b) => b.price - a.price).map(mandiRowHtml).join('')}
      </div>
      <p id="live-note" class="text-[10px] text-muted-foreground mt-2"></p>
      <a href="#/lots" id="create-lot-cta" class="mt-5 w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold py-3 rounded-xl hover:opacity-90 transition">${icon('plus', 'w-4 h-4')}Create Lot for ${commodity.name}</a>
    `;
  }

  const html = `<div class="page-photo-bg" style="background-image:url('./assets/market-hero.jpg')"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2">
      <h1 class="font-display text-2xl md:text-3xl font-extrabold text-white drop-shadow-md">${t('Market Intelligence')}</h1>
      <p class="text-white/90 mt-1 drop-shadow">${t('Real-time prices, AI forecasts &amp; the best time to sell')}</p>
    </div>
    <div class="px-4 md:px-6 flex gap-2 flex-wrap mb-4" id="commodity-chips">
      ${D.COMMODITIES.map((c) => `<button data-c="${c.id}" class="commodity-btn inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border shadow-soft ${c.id === selected.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/95 backdrop-blur border-border text-muted-foreground'}">${cropThumb(c.name)}${c.name}</button>`).join('')}
    </div>
    <div class="px-4 md:px-6">
      <div class="card p-4" id="market-body">${body(selected)}</div>
    </div>
  `);

  function mount(root) {
    const bodyEl = root.querySelector('#market-body');
    let current = selected;

    async function loadLive(commodity) {
      const badge = bodyEl.querySelector('#live-badge');
      const note = bodyEl.querySelector('#live-note');
      const list = bodyEl.querySelector('#mandi-list');
      if (!badge || !list) return;
      badge.innerHTML = liveBadgeHtml('loading');
      try {
        const state = stateFromLocation(currentFarmer().location);
        const liveMandis = await fetchLiveMandiPrices(commodity.name, state);
        if (current !== commodity) return; // user switched crops while this was in flight
        list.innerHTML = [...liveMandis].sort((a, b) => b.price - a.price).map(mandiRowHtml).join('');
        badge.innerHTML = liveBadgeHtml('live');
        note.textContent = `Source: eNAM / Agmarknet, data.gov.in — arrival date ${liveMandis[0]?.arrivalDate || 'today'}.`;
      } catch (e) {
        if (current !== commodity) return;
        badge.innerHTML = liveBadgeHtml('fallback');
        note.textContent = 'Live eNAM feed unavailable right now — showing recent mandi trend.';
      }
    }

    root.querySelectorAll('.commodity-btn').forEach((b) => b.addEventListener('click', () => {
      const c = D.COMMODITIES.find((x) => x.id === b.dataset.c);
      current = c;
      root.querySelectorAll('.commodity-btn').forEach((x) => x.className = `commodity-btn inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border shadow-soft ${x === b ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/95 backdrop-blur border-border text-muted-foreground'}`);
      bodyEl.innerHTML = body(c);
      bodyEl.querySelector('#mandi-refresh').addEventListener('click', () => loadLive(current));
      loadLive(c);
    }));

    bodyEl.querySelector('#mandi-refresh').addEventListener('click', () => loadLive(current));
    loadLive(current);
  }

  return { html, mount };
}

/* ---------------- MY LOTS ---------------- */

function statusTone(status) {
  if (status === 'Sold' || status === 'Payment Received') return 'bg-secondary/15 text-secondary';
  if (status === 'Offer Accepted') return 'bg-primary/10 text-primary';
  return 'bg-accent/20 text-accent-foreground';
}

function renderLots() {
  const html = `<div class="page-photo-bg" style="background-image:url('./assets/lots-hero.jpg')"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2">
      <h1 class="font-display text-2xl md:text-3xl font-extrabold text-white drop-shadow-md">${t('My Lots')}</h1>
      <p class="text-white/90 mt-1 drop-shadow">${t('Manage your produce lots and sale recommendations')}</p>
    </div>
    <div class="px-4 md:px-6 mt-4 mb-4">
      <button id="new-lot" class="w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-bold py-3 rounded-xl hover:opacity-90 transition shadow-soft">${icon('plus', 'w-4 h-4')}${t('Create New Lot')}</button>
    </div>
    <div class="px-4 md:px-6 space-y-3" id="lots-list"></div>
  `);

  function lotHtml(lot) {
    const status = effectiveStatus(lot);
    return `
      <a href="#/lots/${lot.id}" class="card p-4 flex items-center gap-3 hover:border-primary transition">
        ${cropBadge(lot.crop, 'w-12 h-12', 'w-6 h-6', lot.userPhoto)}
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="font-bold">${lot.crop}</span>
            <span class="text-[10px] font-bold px-2 py-1 rounded-full ${statusTone(status)}">${status}</span>
          </div>
          <div class="text-xs text-muted-foreground">${lot.quantity} ${lot.unit} · ${lot.grade}</div>
          <div class="text-xs text-muted-foreground">${lot.id} · Harvest ${lot.harvestDate}</div>
        </div>
        ${icon('chevronRight', 'w-4 h-4 text-muted-foreground shrink-0')}
      </a>`;
  }

  function mount(root) {
    const list = root.querySelector('#lots-list');
    function render() {
      const all = [...store.get().lots || [], ...D.LOTS];
      list.innerHTML = all.map(lotHtml).join('');
    }
    render();

    root.querySelector('#new-lot').addEventListener('click', () => {
      openModal(`
        <div class="p-5">
          <h3 class="font-extrabold text-lg mb-3">${t('Create New Lot')}</h3>
          <label class="text-xs font-bold text-muted-foreground">Crop</label>
          <select id="nl-crop" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3">
            ${D.COMMODITIES.map((c) => `<option value="${c.name}">${c.name}</option>`).join('')}
          </select>
          <label class="text-xs font-bold text-muted-foreground">Quantity (Quintals)</label>
          <input id="nl-qty" type="number" value="10" min="1" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3" />
          <label class="text-xs font-bold text-muted-foreground">Grade</label>
          <select id="nl-grade" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3">
            <option>Premium Quality</option><option>Grade A</option><option>Grade B</option>
          </select>
          <label class="text-xs font-bold text-muted-foreground">Harvest Date</label>
          <input id="nl-date" type="date" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3" />
          <label class="text-xs font-bold text-muted-foreground">Location</label>
          <input id="nl-location" value="${currentFarmer().location}" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3" />
          <label class="text-xs font-bold text-muted-foreground">Photo (optional)</label>
          <div class="mt-1 mb-4">
            <button type="button" id="nl-photo-btn" class="w-full flex items-center justify-center gap-1.5 border border-dashed border-border rounded-xl py-3 text-sm font-bold text-muted-foreground hover:border-primary hover:text-primary transition">${icon('camera', 'w-4 h-4')}Add a photo of the produce</button>
            <input type="file" accept="image/*" id="nl-photo-input" class="hidden" />
            <img id="nl-photo-preview" class="hidden w-full max-h-32 object-cover rounded-xl mt-2" />
          </div>
          <div class="flex gap-2">
            <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Cancel</button>
            <button id="create-lot-submit" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">Create Lot</button>
          </div>
        </div>`, {
        onMount: (m) => {
          let photoUrl = null;
          const photoBtn = m.querySelector('#nl-photo-btn');
          const photoInput = m.querySelector('#nl-photo-input');
          const photoPreview = m.querySelector('#nl-photo-preview');
          photoBtn.addEventListener('click', () => photoInput.click());
          photoInput.addEventListener('change', async () => {
            const file = photoInput.files[0];
            if (!file) return;
            photoUrl = await readAsDataUrl(file);
            photoPreview.src = photoUrl;
            photoPreview.classList.remove('hidden');
            photoBtn.innerHTML = `${icon('checkCircle', 'w-4 h-4')}Photo added`;
          });

          m.querySelector('#create-lot-submit').addEventListener('click', () => {
            const crop = m.querySelector('#nl-crop').value;
            const qty = Number(m.querySelector('#nl-qty').value) || 1;
            const grade = m.querySelector('#nl-grade').value;
            const date = m.querySelector('#nl-date').value;
            const location = m.querySelector('#nl-location').value.trim() || currentFarmer().location;
            const id = 'LOT-' + Math.floor(1000 + Math.random() * 9000);
            const newLot = {
              id, crop, quantity: qty, unit: 'Quintals', grade, location,
              harvestDate: date ? new Date(date).toDateString().slice(4) : 'Not set',
              status: 'Recommendation Ready',
              ...(photoUrl ? { userPhoto: photoUrl } : {}),
            };
            store.set({ lots: [newLot, ...(store.get().lots || [])] });
            closeModal();
            toast('Lot created! Analyzing best market options…', { tone: 'success', icon: 'package' });
            render();
          });
        },
      });
    });
  }

  return { html, mount };
}

/* ---------------- LOT DETAIL / COMPARE OPTIONS ---------------- */

function renderLotDetail(id) {
  const lot = findLot(id);
  if (!lot) return { html: pageWrap(`<div class="px-4 md:px-6 py-10 text-center text-muted-foreground">Lot not found. <a href="#/lots" class="text-primary font-bold">Back to My Lots</a></div>`) };

  const status = effectiveStatus(lot);
  const options = getOptions(lot);
  const acceptedId = store.getAcceptedOption(lot.id);
  const commodity = D.COMMODITIES.find((c) => c.name.toLowerCase() === lot.crop.toLowerCase());
  const showSellHold = commodity && !['Sold', 'Payment Received'].includes(status);

  // Reverse bidding: mock "seed" bids give the auction a realistic multi-buyer feel from the
  // first view, and live bids are real offers a buyer placed against this exact lot (matched
  // via farmerLotId) — both share the same accept/rank flow so it reads as one live auction.
  const liveBids = store.get().offers.filter((o) => o.farmerLotId === lot.id && o.status !== 'Declined');
  const bids = [
    ...(D.SEED_BIDS[lot.id] || []).map((s) => ({ ...s, quantity: lot.quantity, unit: lot.unit, live: false })),
    ...liveBids.map((o) => ({ id: o.id, buyerId: o.buyerId, buyer: o.buyer || o.farmer, price: o.price, quantity: o.quantity, unit: o.unit, time: o.date, live: true })),
  ].sort((a, b) => b.price - a.price);

  function bidCard(bid, idx) {
    const accepted = acceptedId === bid.id;
    const buyer = bid.buyerId ? D.BUYERS.find((b) => b.id === bid.buyerId) : null;
    return `
      <div class="card p-4 ${idx === 0 ? 'border-primary/50' : ''} ${accepted ? 'ring-2 ring-primary' : ''}">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold">${bid.buyer}</span>
              ${idx === 0 ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">${t('Best Bid')}</span>` : ''}
              ${bid.live ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky/15 text-sky">${t('Live')}</span>` : ''}
            </div>
            <div class="text-xs text-muted-foreground mt-1">${bid.quantity} ${bid.unit} · ${bid.time}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[10px] text-muted-foreground font-semibold">Bid Price</div>
            <div class="text-xl font-extrabold text-primary">${inr(bid.price)}<span class="text-xs font-semibold text-muted-foreground">/qtl</span></div>
          </div>
        </div>
        ${buyer ? `<button data-verify-offer="${buyer.id}" class="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">${icon('shield', 'w-3.5 h-3.5')}View buyer verification</button>` : ''}
        ${accepted
          ? `<div class="mt-3 w-full text-center bg-primary/10 text-primary font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5">${icon('checkCircle', 'w-4 h-4')}Offer Accepted</div>`
          : acceptedId
          ? ''
          : `<button data-accept-bid="${bid.id}" class="mt-3 w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:opacity-90 transition">${t('Accept This Bid')}</button>`}
      </div>`;
  }

  function optionCard(o) {
    const accepted = acceptedId === o.id;
    const buyer = o.buyerId ? D.BUYERS.find((b) => b.id === o.buyerId) : null;
    const isProcessor = buyer && buyer.type === 'Processor';
    return `
      <div class="card p-4 ${o.best ? 'border-primary/50' : ''} ${accepted ? 'ring-2 ring-primary' : ''}">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold">${o.label}</span>
              ${o.best ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">BEST</span>` : ''}
              ${o.verified ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">${icon('badgeCheck', 'w-3 h-3')}Verified</span>` : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Unverified</span>`}
            </div>
            <div class="text-xs text-muted-foreground mt-1">${o.buyer} · ${o.distance} · ${o.pickup}</div>
            <div class="mt-1">${stars(o.reliability)}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[10px] text-muted-foreground font-semibold">Net Return</div>
            <div class="text-xl font-extrabold text-primary">${inr(o.net)}</div>
          </div>
        </div>
        <div class="grid grid-cols-4 gap-1.5 mt-3 text-center text-xs">
          <div class="bg-muted rounded-lg p-1.5"><div class="text-[9px] text-muted-foreground">Base</div><div class="font-bold">${inr(o.basePrice)}</div></div>
          <div class="bg-muted rounded-lg p-1.5"><div class="text-[9px] text-muted-foreground">Transport</div><div class="font-bold text-destructive">-${inr(o.transport)}</div></div>
          <div class="bg-muted rounded-lg p-1.5"><div class="text-[9px] text-muted-foreground">Commission</div><div class="font-bold text-destructive">-${inr(o.commission)}</div></div>
          <div class="bg-primary-light rounded-lg p-1.5"><div class="text-[9px] text-primary">Net/qtl</div><div class="font-bold text-primary">${inr(o.net)}</div></div>
        </div>
        <ul class="mt-3 space-y-1 text-xs text-muted-foreground">
          ${o.reasons.map((r) => `<li class="flex gap-1.5">${icon('check', 'w-3.5 h-3.5 text-primary shrink-0 mt-0.5')}${r}</li>`).join('')}
        </ul>
        ${isProcessor ? `
        <div class="mt-3 rounded-xl border border-sky/30 bg-sky-light/60 p-3">
          <div class="flex items-center gap-1.5 text-xs font-bold text-sky">${icon('shield', 'w-3.5 h-3.5 shrink-0')}Processor offer — don't judge on price alone</div>
          <p class="text-[11px] text-muted-foreground mt-1">This offer's GSTIN, PAN, FSSAI licence, bank account &amp; processing capacity were checked before it was shown to you.</p>
          <button data-verify-offer="${buyer.id}" class="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary">${icon('chevronRight', 'w-3.5 h-3.5')}View full offer verification</button>
        </div>` : buyer ? `
        <button data-verify-offer="${buyer.id}" class="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">${icon('shield', 'w-3.5 h-3.5')}View buyer verification</button>` : ''}
        ${accepted
          ? `<div class="mt-3 w-full text-center bg-primary/10 text-primary font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5">${icon('checkCircle', 'w-4 h-4')}Offer Accepted</div>`
          : acceptedId
          ? ''
          : `<button data-accept="${o.id}" class="mt-3 w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:opacity-90 transition">${t('Accept Offer')}</button>`}
      </div>`;
  }

  const heroImage = D.LOT_HERO_IMAGES[lot.crop];
  const hasHero = !!heroImage;
  const html = (hasHero ? `<div class="page-photo-bg" style="background-image:url('${heroImage}')"></div>` : '') + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2 flex items-center gap-2">
      <a href="#/lots" class="w-8 h-8 rounded-full ${hasHero ? 'bg-white/90 backdrop-blur' : 'border border-border'} flex items-center justify-center shrink-0">${icon('arrowLeft', 'w-4 h-4')}</a>
      <div>
        <h1 class="text-xl font-extrabold ${hasHero ? 'text-white drop-shadow-md' : ''}">${lot.crop} · ${lot.id}</h1>
        <p class="text-sm ${hasHero ? 'text-white/90 drop-shadow' : 'text-muted-foreground'}">${lot.quantity} ${lot.unit} · ${lot.grade} · Harvest ${lot.harvestDate}</p>
      </div>
      <span class="ml-auto text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${hasHero ? 'bg-white/90 backdrop-blur text-foreground' : statusTone(status)}">${status}</span>
    </div>
    ${showSellHold ? `<div class="px-4 md:px-6 mt-3">${sellHoldCardHtml(commodity, lot)}</div>` : ''}
    ${bids.length ? `
    <div class="px-4 md:px-6 mt-3">
      <h3 class="font-extrabold mb-1 ${hasHero ? 'text-white drop-shadow-md' : ''}">${t('Live Bids from Buyers')}</h3>
      <p class="text-xs mb-3 ${hasHero ? 'text-white/90 drop-shadow' : 'text-muted-foreground'}">${t('This lot is listed on Browse Lots — buyers can bid directly. Accept the best bid, or compare AI-recommended options below.')}</p>
      <div class="space-y-3" id="bids-list">
        ${bids.map(bidCard).join('')}
      </div>
    </div>` : ''}
    <div class="px-4 md:px-6 mt-6">
      <h3 class="font-extrabold mb-3 ${hasHero ? 'text-white drop-shadow-md' : ''}">Compare Options — Where to Sell?</h3>
      <div class="space-y-3" id="options-list">
        ${options.length ? options.map(optionCard).join('') : `<p class="text-center text-muted-foreground py-8">No live options for this crop yet.</p>`}
      </div>
    </div>
  `);

  function mount(root) {
    root.querySelectorAll('[data-verify-offer]').forEach((btn) => btn.addEventListener('click', () => openBuyerVerification(D.BUYERS.find((b) => b.id === btn.dataset.verifyOffer))));
    root.querySelectorAll('[data-accept-bid]').forEach((btn) => btn.addEventListener('click', () => {
      const bid = bids.find((b) => b.id === btn.dataset.acceptBid);
      openModal(`
        <div class="p-5">
          <h3 class="font-extrabold text-lg mb-1">${t('Accept This Bid')}</h3>
          <p class="text-sm text-muted-foreground mb-4">Accept ${bid.buyer}'s bid for ${lot.crop} at <b class="text-foreground">${inr(bid.price)}/qtl</b>? Other bids on this lot will be declined.</p>
          <div class="flex gap-2">
            <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Cancel</button>
            <button id="confirm-accept-bid" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">Confirm</button>
          </div>
        </div>`, {
        onMount: (m) => m.querySelector('#confirm-accept-bid').addEventListener('click', () => {
          store.acceptOption(lot.id, bid.id);
          store.setLotStatus(lot.id, 'Offer Accepted');
          liveBids.forEach((o) => { if (o.id !== bid.id) store.updateOfferStatus(o.id, 'Declined'); });
          if (bid.live) store.updateOfferStatus(bid.id, 'Accepted');
          store.addOrder({
            id: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
            lotId: lot.id, crop: lot.crop, quantity: lot.quantity, unit: lot.unit,
            buyer: bid.buyer, rate: bid.price, amount: bid.price * lot.quantity,
            stage: 0, date: new Date().toDateString().slice(4),
          });
          closeModal();
          toast(`Bid accepted! ${bid.buyer} will arrange pickup.`, { tone: 'success', icon: 'checkCircle' });
          navigateTo('#/orders', true);
        }),
      });
    }));
    root.querySelectorAll('[data-accept]').forEach((btn) => btn.addEventListener('click', () => {
      const opt = options.find((o) => o.id === btn.dataset.accept);
      openModal(`
        <div class="p-5">
          <h3 class="font-extrabold text-lg mb-1">Confirm Offer</h3>
          <p class="text-sm text-muted-foreground mb-4">Accept ${opt.buyer}'s offer for ${lot.crop} at <b class="text-foreground">${inr(opt.net)}/qtl</b> net (after transport &amp; commission)?</p>
          <div class="flex gap-2">
            <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Cancel</button>
            <button id="confirm-accept" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">Confirm</button>
          </div>
        </div>`, {
        onMount: (m) => m.querySelector('#confirm-accept').addEventListener('click', () => {
          store.acceptOption(lot.id, opt.id);
          store.setLotStatus(lot.id, 'Offer Accepted');
          store.addOrder({
            id: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
            lotId: lot.id, crop: lot.crop, quantity: lot.quantity, unit: lot.unit,
            buyer: opt.buyer, rate: opt.net, amount: opt.net * lot.quantity,
            stage: 0, date: new Date().toDateString().slice(4),
          });
          closeModal();
          toast(`Offer accepted! ${opt.buyer} will arrange pickup.`, { tone: 'success', icon: 'checkCircle' });
          navigateTo('#/orders', true);
        }),
      });
    }));
  }

  return { html, mount };
}

/* ---------------- PAYMENT RECEIPT ---------------- */

function receiptModalHtml(o, farmer) {
  return `
    <div class="p-5">
      <div class="flex items-center gap-2 mb-1">
        <div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">${icon('receipt', 'w-5 h-5')}</div>
        <div class="min-w-0">
          <h3 class="font-extrabold text-lg">${t('Payment Receipt')}</h3>
          <p class="text-xs text-muted-foreground">Kisan Mitra · Receipt #${o.id}-RCPT</p>
        </div>
        <span class="ml-auto text-[10px] font-bold px-2 py-1 rounded-full bg-primary/10 text-primary shrink-0">PAID</span>
      </div>
      <div class="border-t border-border my-3"></div>
      <div class="space-y-1.5 text-sm">
        <div class="flex justify-between"><span class="text-muted-foreground">Order ID</span><span class="font-semibold">${o.id}</span></div>
        <div class="flex justify-between"><span class="text-muted-foreground">Lot</span><span class="font-semibold">${o.lotId}</span></div>
        <div class="flex justify-between"><span class="text-muted-foreground">Crop</span><span class="font-semibold">${o.crop} · ${o.quantity} ${o.unit}</span></div>
        <div class="flex justify-between"><span class="text-muted-foreground">Buyer</span><span class="font-semibold">${o.buyer}</span></div>
        <div class="flex justify-between"><span class="text-muted-foreground">Farmer</span><span class="font-semibold">${farmer.fullName}</span></div>
        <div class="flex justify-between"><span class="text-muted-foreground">Rate</span><span class="font-semibold">${inr(o.rate)}/qtl</span></div>
        <div class="flex justify-between"><span class="text-muted-foreground">Order Date</span><span class="font-semibold">${o.date}</span></div>
      </div>
      <div class="border-t border-dashed border-border my-3"></div>
      <div class="flex justify-between items-baseline">
        <span class="font-bold">Total Paid</span>
        <span class="text-2xl font-extrabold text-primary">${inr(o.amount)}</span>
      </div>
      <p class="text-[10px] text-muted-foreground mt-3">Generated ${new Date().toLocaleString('en-IN')} · Digitally generated receipt from Kisan Mitra.</p>
      <div class="flex gap-2 mt-4">
        <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Close</button>
        <button id="print-receipt" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold flex items-center justify-center gap-1.5">${icon('receipt', 'w-4 h-4')}Print / Save PDF</button>
      </div>
    </div>`;
}

// Opens a standalone printable document in a new tab (not the modal itself) so the
// browser's native "Print → Save as PDF" gives a clean receipt-only page.
function openPrintableReceipt(o, farmer) {
  const win = window.open('', '_blank');
  if (!win) { toast('Please allow pop-ups to print the receipt.', { tone: 'error', icon: 'alert' }); return; }
  win.document.write(`<!doctype html><html><head><title>Receipt ${o.id}</title>
    <meta charset="UTF-8" />
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:40px auto;color:#222;padding:0 20px}
      h1{font-size:20px;margin-bottom:4px}
      .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:14px}
      .total{font-size:22px;font-weight:800;color:#166b2b;margin-top:16px;display:flex;justify-content:space-between;align-items:baseline}
      .paid{display:inline-block;background:#dcfce7;color:#166b2b;font-weight:700;padding:2px 10px;border-radius:999px;font-size:12px;margin-left:8px}
      .footer{font-size:11px;color:#888;margin-top:28px}
    </style></head><body>
    <h1>Kisan Mitra — Payment Receipt</h1>
    <p>Receipt #${o.id}-RCPT<span class="paid">PAID</span></p>
    <div class="row"><span>Order ID</span><b>${o.id}</b></div>
    <div class="row"><span>Lot</span><b>${o.lotId}</b></div>
    <div class="row"><span>Crop</span><b>${o.crop} · ${o.quantity} ${o.unit}</b></div>
    <div class="row"><span>Buyer</span><b>${o.buyer}</b></div>
    <div class="row"><span>Farmer</span><b>${farmer.fullName}</b></div>
    <div class="row"><span>Rate</span><b>${inr(o.rate)}/qtl</b></div>
    <div class="row"><span>Order Date</span><b>${o.date}</b></div>
    <div class="total"><span>Total Paid</span><span>${inr(o.amount)}</span></div>
    <p class="footer">Generated ${new Date().toLocaleString('en-IN')} · Digitally generated receipt from Kisan Mitra.</p>
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

/* ---------------- ORDERS ---------------- */

function renderOrders() {
  const html = `<div class="page-photo-bg" style="background-image:url('./assets/orders-hero.jpg')"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2">
      <h1 class="font-display text-2xl md:text-3xl font-extrabold text-white drop-shadow-md">${t('Orders')}</h1>
      <p class="text-white/90 mt-1 drop-shadow">${t('Track offers from acceptance to payment')}</p>
    </div>
    <div class="px-4 md:px-6 space-y-4" id="orders-list"></div>
  `);

  function orderHtml(o) {
    const stage = o.stage;
    return `
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-bold">${o.crop} · ${o.quantity} ${o.unit}</div>
            <div class="text-xs text-muted-foreground">${o.id} · ${o.lotId} · ${o.date}</div>
          </div>
          <div class="text-right">
            <div class="font-extrabold text-primary">${inr(o.amount)}</div>
            <div class="text-[10px] text-muted-foreground">${inr(o.rate)}/qtl · ${o.buyer}</div>
          </div>
        </div>
        <div class="flex items-center mt-4 mb-1">
          ${D.ORDER_STAGES.map((s, i) => `
            <div class="flex-1 flex flex-col items-center relative">
              ${i > 0 ? `<div class="absolute right-1/2 top-3 w-full h-0.5 ${i <= stage ? 'bg-primary' : 'bg-border'}" style="left:-50%"></div>` : ''}
              <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold z-10 ${i <= stage ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">${i < stage ? icon('check', 'w-3.5 h-3.5') : i + 1}</div>
              <span class="text-[9px] font-semibold text-center mt-1 ${i <= stage ? 'text-foreground' : 'text-muted-foreground'}">${s}</span>
            </div>`).join('')}
        </div>
        ${stage === 0 ? `<a href="#/logistics" class="mt-3 flex items-center gap-1.5 text-xs font-bold text-primary">${icon('truck', 'w-3.5 h-3.5')}Arrange transport or storage</a>` : ''}
        ${stage === D.ORDER_STAGES.length - 1 ? `<button data-receipt="${o.id}" class="mt-3 w-full flex items-center justify-center gap-1.5 bg-primary/10 text-primary text-sm font-bold py-2.5 rounded-lg hover:bg-primary/15 transition">${icon('receipt', 'w-4 h-4')}${t('View Payment Receipt')}</button>` : ''}
        <div class="flex gap-2 mt-4">
          ${stage < D.ORDER_STAGES.length - 1 ? `<button data-advance="${o.id}" data-stage="${stage + 1}" class="flex-1 bg-primary text-primary-foreground text-sm font-bold py-2 rounded-lg hover:opacity-90 transition">Mark "${D.ORDER_STAGES[stage + 1]}"</button>` : `<span class="flex-1 text-center bg-primary/10 text-primary text-sm font-bold py-2 rounded-lg">Completed ✓</span>`}
          <button data-record="${o.id}" class="border border-border text-sm font-bold px-3 py-2 rounded-lg hover:bg-muted transition">${icon('clipboard', 'w-4 h-4')}</button>
          <button data-dispute="${o.id}" aria-label="${t('Raise a Grievance')}" title="${t('Raise a Grievance')}" class="border border-destructive/40 text-destructive text-sm font-bold px-3 py-2 rounded-lg hover:bg-destructive/10 transition">${icon('alert', 'w-4 h-4')}</button>
        </div>
      </div>`;
  }

  function mount(root) {
    const list = root.querySelector('#orders-list');
    function allOrders() {
      const map = new Map();
      [...store.get().orders, ...D.ORDERS].forEach((o) => { if (!map.has(o.id)) map.set(o.id, o); });
      return [...map.values()];
    }
    function render() {
      const orders = allOrders();
      list.innerHTML = orders.length ? orders.map(orderHtml).join('') : `<p class="text-center text-muted-foreground py-10">No orders yet. Accept an offer from a lot to see it here.</p>`;
      list.querySelectorAll('[data-advance]').forEach((btn) => btn.addEventListener('click', () => {
        store.updateOrderStage(btn.dataset.advance, Number(btn.dataset.stage));
        toast(`Order updated: ${D.ORDER_STAGES[Number(btn.dataset.stage)]}`, { tone: 'success', icon: 'truck' });
        render();
      }));
      list.querySelectorAll('[data-receipt]').forEach((btn) => btn.addEventListener('click', () => {
        const o = orders.find((x) => x.id === btn.dataset.receipt);
        openModal(receiptModalHtml(o, currentFarmer()), {
          onMount: (m) => m.querySelector('#print-receipt').addEventListener('click', () => openPrintableReceipt(o, currentFarmer())),
        });
      }));
      list.querySelectorAll('[data-record]').forEach((btn) => btn.addEventListener('click', () => {
        const o = orders.find((x) => x.id === btn.dataset.record);
        const text = `Order ${o.id}\nLot: ${o.lotId}\nCrop: ${o.crop} (${o.quantity} ${o.unit})\nBuyer: ${o.buyer}\nRate: ${inr(o.rate)}/qtl\nAmount: ${inr(o.amount)}\nDate: ${o.date}`;
        openModal(`
          <div class="p-5">
            <h3 class="font-extrabold text-lg mb-3">Digital Transaction Record</h3>
            <pre class="text-xs bg-muted rounded-xl p-3 whitespace-pre-wrap font-sans">${text}</pre>
            <div class="flex gap-2 mt-4">
              <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Close</button>
              <button id="copy-record" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">Copy</button>
            </div>
          </div>`, {
          onMount: (m) => m.querySelector('#copy-record').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(text); toast('Record copied', { tone: 'success', icon: 'copy' }); } catch { toast('Could not copy', { tone: 'error' }); }
          }),
        });
      }));
      list.querySelectorAll('[data-dispute]').forEach((btn) => btn.addEventListener('click', () => openGrievanceModal({ orderId: btn.dataset.dispute })));
    }
    render();
  }

  return { html, mount };
}

/* ---------------- BUYER VERIFICATION (KYC / trust checklist) ---------------- */
// Full due-diligence checklist behind the "Verified" badge — not just a price quote.
// Farmers can inspect exactly what was checked (GSTIN, PAN, FSSAI, bank, capacity,
// track record) before accepting an offer, especially from processors.

function verifyStatusChip(status) {
  const map = {
    verified: { cls: 'bg-primary/10 text-primary', icon: 'checkCircle', label: 'Verified' },
    pending: { cls: 'bg-accent/20 text-accent-foreground', icon: 'clock', label: 'Pending' },
    not_verified: { cls: 'bg-destructive/10 text-destructive', icon: 'x', label: 'Not Verified' },
    not_applicable: { cls: 'bg-muted text-muted-foreground', icon: 'check', label: 'N/A' },
  };
  const s = map[status] || map.not_verified;
  return `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${s.cls} shrink-0">${icon(s.icon, 'w-3 h-3')}${s.label}</span>`;
}

function verifyRow(label, status, detail) {
  return `
    <div class="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
      <div class="min-w-0">
        <div class="text-sm font-semibold">${label}</div>
        ${detail ? `<div class="text-xs text-muted-foreground mt-0.5">${detail}</div>` : ''}
      </div>
      ${verifyStatusChip(status)}
    </div>`;
}

function scoreBar(value, max = 100) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const tone = pct >= 85 ? 'hsl(142 55% 40%)' : pct >= 60 ? 'hsl(38 92% 54%)' : 'hsl(3 68% 48%)';
  return `<div class="progress-track h-2 mt-1"><div class="progress-fill h-2" style="width:${pct}%;background-image:none;background-color:${tone}"></div></div>`;
}

function buyerVerificationHtml(b) {
  const k = b.kyc || {};
  return `
    <div class="p-5">
      <div class="flex items-center gap-2 flex-wrap mb-1">
        <h3 class="font-extrabold text-lg">${b.name}</h3>
        ${b.verified ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">${icon('badgeCheck', 'w-3 h-3')}Verified Buyer</span>` : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Unverified Buyer</span>`}
      </div>
      <p class="text-xs text-muted-foreground mb-3">${b.type} · ${t('Verify the full offer, not just the quoted price')}</p>

      <h4 class="text-xs font-extrabold text-muted-foreground uppercase tracking-wide mb-1">Business &amp; KYC</h4>
      <div class="card p-3 mb-3">
        ${verifyRow('Business KYC', k.businessKyc)}
        ${verifyRow('GSTIN Verification', k.gstin, k.gstinNumber)}
        ${verifyRow('PAN Verification', k.pan, k.panNumber)}
        ${verifyRow('FSSAI Licence', k.fssai, k.fssai === 'not_applicable' ? 'Not a food-handling business' : k.fssaiNumber)}
        ${verifyRow('Bank Account Ownership', k.bankAccount, k.bankAccount === 'verified' ? 'Account name matched to business KYC' : 'Could not confirm account holder matches business KYC')}
        ${verifyRow('Registered Business Address', k.address, k.addressText)}
        ${verifyRow('Buyer Capacity Verification', k.capacity, k.capacityNote)}
      </div>

      <h4 class="text-xs font-extrabold text-muted-foreground uppercase tracking-wide mb-1">Track Record</h4>
      <div class="card p-3 mb-4 space-y-3">
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">Historical Transaction Record</span>
          <span class="font-bold">${k.transactions ?? 0} orders · ${k.transactionVolume || '—'}</span>
        </div>
        <div>
          <div class="flex items-center justify-between text-sm"><span class="text-muted-foreground">Payment-Performance Score</span><span class="font-bold">${k.paymentScore ?? '—'}/100</span></div>
          ${scoreBar(k.paymentScore || 0)}
        </div>
        <div>
          <div class="flex items-center justify-between text-sm"><span class="text-muted-foreground">Order-Fulfilment Rate</span><span class="font-bold">${k.fulfilmentRate ?? '—'}%</span></div>
          ${scoreBar(k.fulfilmentRate || 0)}
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-foreground">Dispute History</span>
          <span class="font-bold ${k.disputes ? 'text-accent-foreground' : 'text-primary'}">${k.disputes ? `${k.disputes} raised · ${k.disputesResolved ?? 0} resolved` : 'None on record'}</span>
        </div>
      </div>
      <button data-close class="w-full border border-border rounded-xl py-2.5 font-semibold">Close</button>
    </div>`;
}

function openBuyerVerification(buyer) {
  if (!buyer) { toast('Verification details unavailable for this buyer.', { tone: 'error' }); return; }
  openModal(buyerVerificationHtml(buyer));
}

/* ---------------- VERIFIED BUYERS ---------------- */

function renderBuyers() {
  const crops = ['All', ...new Set(D.COMMODITIES.map((c) => c.name))];
  const html = `<div class="page-photo-bg" style="background-image:url('./assets/buyers-hero.jpg')"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2">
      <h1 class="font-display text-2xl md:text-3xl font-extrabold text-white drop-shadow-md">${t('Verified Buyers')}</h1>
      <p class="text-white/90 mt-1 drop-shadow">${t('Reliable buyers matched to your crops, with trust scores')}</p>
    </div>
    <div class="px-4 md:px-6 flex gap-2 flex-wrap mb-4">
      ${crops.map((c, i) => `<button data-crop="${c}" class="crop-btn text-xs font-bold px-3 py-1.5 rounded-full border shadow-soft ${i === 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/95 backdrop-blur border-border text-muted-foreground'}">${c}</button>`).join('')}
    </div>
    <div class="px-4 md:px-6 space-y-3" id="buyers-list"></div>
  `);

  function buyerHtml(b) {
    return `
      <div class="card p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold">${b.name}</span>
              ${b.verified ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">${icon('badgeCheck', 'w-3 h-3')}Verified</span>` : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Unverified</span>`}
            </div>
            <div class="text-xs text-muted-foreground mt-0.5">${b.type} · ${b.distance}</div>
            <div class="mt-1">${stars(b.reliability)} <span class="text-xs text-muted-foreground">reliability</span></div>
          </div>
          <span class="text-[10px] font-bold px-2 py-1 rounded-full bg-accent/20 text-accent-foreground shrink-0">${b.tag}</span>
        </div>
        <div class="flex gap-1.5 flex-wrap mt-2">${b.crops.map((c) => `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">${c}</span>`).join('')}</div>
        <div class="flex items-center justify-between text-xs text-muted-foreground mt-2">
          <span>Volume: <b class="text-foreground">${b.volume}</b></span>
          <span>Payment: <b class="text-foreground">${b.payment}</b></span>
        </div>
        ${b.type === 'Processor' ? `
        <div class="flex items-center gap-1.5 text-[11px] font-semibold text-sky mt-2">
          ${icon('shield', 'w-3.5 h-3.5 shrink-0')}Processor — full offer verified, not just quoted price
        </div>` : ''}
        <div class="flex gap-2 mt-3">
          <button data-verify="${b.id}" class="flex-1 border border-border text-sm font-bold py-2 rounded-lg hover:bg-muted transition">${t('View Verification')}</button>
          <button data-quote="${b.name}" class="flex-1 bg-primary text-primary-foreground text-sm font-bold py-2 rounded-lg hover:opacity-90 transition">${t('Request Quote')}</button>
        </div>
      </div>`;
  }

  function mount(root) {
    let crop = 'All';
    const list = root.querySelector('#buyers-list');
    function render() {
      const items = D.BUYERS.filter((b) => crop === 'All' || b.crops.includes(crop));
      list.innerHTML = items.map(buyerHtml).join('') || `<p class="text-center text-muted-foreground py-8">No buyers for this crop yet.</p>`;
      list.querySelectorAll('[data-quote]').forEach((btn) => btn.addEventListener('click', () => toast(`Quote request sent to ${btn.dataset.quote}`, { tone: 'success', icon: 'checkCircle' })));
      list.querySelectorAll('[data-verify]').forEach((btn) => btn.addEventListener('click', () => openBuyerVerification(D.BUYERS.find((b) => b.id === btn.dataset.verify))));
    }
    root.querySelectorAll('.crop-btn').forEach((b) => b.addEventListener('click', () => {
      crop = b.dataset.crop;
      root.querySelectorAll('.crop-btn').forEach((x) => x.className = `crop-btn text-xs font-bold px-3 py-1.5 rounded-full border shadow-soft ${x === b ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/95 backdrop-blur border-border text-muted-foreground'}`);
      render();
    }));
    render();
  }

  return { html, mount };
}

/* ---------------- FPO AGGREGATION ---------------- */

/* ---------------- DYNAMIC FPO POOLING ---------------- */
// Open rounds where members pool quintals toward a buyer's bulk threshold. Crossing a
// volume tier raises the price for everyone in the pool — that is the bargaining-power effect.

// Quintals of `crop` the farmer still has on offer (their own lots, minus anything already sold).
function poolableQty(crop) {
  const lots = [...(store.get().lots || []), ...D.LOTS];
  const seen = new Set();
  let total = 0;
  for (const l of lots) {
    if (!l || seen.has(l.id) || l.crop !== crop || l.status === 'Sold') continue;
    seen.add(l.id);
    total += Math.max(0, Number(l.quantity) || 0);
  }
  return total;
}

function poolCardHtml(pool, joinedFpo) {
  const mine = Math.max(0, Number(store.get().poolContributions[pool.id]) || 0);
  const st = poolStatus(pool, mine);
  const available = poolableQty(pool.crop);
  const tierMarks = pool.tiers.map((tr) => `<span class="absolute top-0 h-full w-0.5 bg-card/90" style="left:${clamp((tr.minQty / pool.targetQty) * 100, 0, 100)}%"></span>`).join('');
  const nextLine = st.filled
    ? `<span class="text-primary font-bold">${t('Pool is full — best price unlocked.')}</span>`
    : st.next
      ? `${t('Add')} <b>${st.toNext} qtl</b> ${t('more to unlock')} <b class="text-primary">+${money(st.next.uplift)}/qtl</b> ${t('for everyone')}.`
      : '';
  let action;
  if (!joinedFpo) {
    action = `<p class="text-xs text-muted-foreground mt-3">${t('Join the FPO above to contribute to pools.')}</p>`;
  } else if (available <= 0 && !mine) {
    action = `<a href="#/lots" class="mt-3 flex items-center justify-center gap-1.5 border border-border text-sm font-bold py-2 rounded-lg hover:bg-muted transition">${icon('package', 'w-4 h-4')}${t('List a')} ${esc(pool.crop)} ${t('lot to join')}</a>`;
  } else {
    action = `
      <div class="mt-3 flex gap-2 items-end">
        <div class="flex-1"><label for="pool-qty-${esc(pool.id)}" class="text-[11px] font-bold text-muted-foreground">${t('Your quantity (quintals)')} · ${t('max')} ${available || mine}</label>
          <input id="pool-qty-${esc(pool.id)}" data-pool-qty type="number" inputmode="decimal" min="1" max="${available || mine}" step="1" value="${mine || Math.min(available, 20) || ''}" class="w-full border border-border rounded-xl px-3 py-2 bg-background mt-1"></div>
        <button data-pool-save="${esc(pool.id)}" class="bg-primary text-primary-foreground text-sm font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition">${mine ? t('Update') : t('Join pool')}</button>
        ${mine ? `<button data-pool-leave="${esc(pool.id)}" class="border border-border text-sm font-bold px-3 py-2.5 rounded-xl hover:bg-muted transition">${t('Leave')}</button>` : ''}
      </div>
      <p class="text-xs text-destructive font-semibold mt-1 min-h-[1rem]" data-pool-error role="alert"></p>`;
  }
  return `
    <div class="card p-4" data-pool="${esc(pool.id)}">
      <div class="flex items-start gap-3">
        ${cropBadge(pool.crop, 'w-12 h-12', 'w-6 h-6')}
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2"><div class="font-bold">${esc(pool.crop)} · ${esc(pool.grade)}</div><span class="text-[10px] font-bold text-muted-foreground shrink-0">${t('Closes')} ${esc(pool.closes)}</span></div>
          <div class="text-xs text-muted-foreground truncate">${esc(pool.buyer)}</div>
        </div>
      </div>
      <div class="flex items-end justify-between mt-3">
        <div><div class="text-[10px] font-semibold text-muted-foreground">${t('Pool price')}</div>
          <div class="text-xl font-extrabold text-primary">${money(st.pricePerQtl)}<span class="text-xs font-bold text-muted-foreground">/qtl</span></div></div>
        <div class="text-right"><div class="text-[10px] font-semibold text-muted-foreground">${t('Base')} ${money(pool.basePrice)}</div>
          <div class="text-xs font-bold ${st.uplift ? 'text-primary' : 'text-muted-foreground'}">${st.uplift ? `+${money(st.uplift)} ${t('tier bonus')}` : t('No bonus yet')}</div></div>
      </div>
      <div class="relative mt-3 h-3 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="${pool.targetQty}" aria-valuenow="${Math.min(st.total, pool.targetQty)}" aria-label="${t('Pool filled')}">
        <div class="h-full bg-primary rounded-full" style="width:${st.progressPct}%"></div>${tierMarks}
      </div>
      <div class="flex justify-between text-[10px] text-muted-foreground mt-1"><span>${st.total} / ${pool.targetQty} qtl</span><span>${pool.tiers.map((tr) => `${tr.minQty} qtl: +${money(tr.uplift)}`).join(' · ')}</span></div>
      <p class="text-xs mt-2">${nextLine}</p>
      ${mine ? `<div class="mt-2 rounded-xl bg-primary/10 text-primary p-2.5 text-xs font-semibold">${t('You have pooled')} ${mine} qtl${st.myExtraEarnings > 0 ? ` · ${t('worth')} <b>${inr(st.myExtraEarnings)}</b> ${t('extra vs the base price')}` : ''}${st.upliftUnlockedByMe > 0 ? ` · ${t('your quantity unlocked the')} +${money(st.upliftUnlockedByMe)}/qtl ${t('tier for the whole pool')}` : ''}.</div>` : ''}
      ${action}
    </div>`;
}

function poolsSectionHtml(joinedFpo) {
  return `
    <h3 class="font-extrabold mb-1 text-white drop-shadow-md">${t('Open pooling rounds')}</h3>
    <p class="text-xs text-white/90 drop-shadow mb-3">${t('The more quintals pooled, the higher the price the buyer pays — for every member.')}</p>
    <div class="space-y-3" id="pools-list">${D.POOLS.map((pl) => poolCardHtml(pl, joinedFpo)).join('')}</div>`;
}

function wirePools(root, joinedFpo) {
  const listEl = root.querySelector('#pools-list');
  if (!listEl) return;
  const rerender = () => { listEl.innerHTML = D.POOLS.map((pl) => poolCardHtml(pl, joinedFpo)).join(''); wirePools(root, joinedFpo); };
  listEl.querySelectorAll('[data-pool]').forEach((cardEl) => {
    const pool = D.POOLS.find((x) => x.id === cardEl.dataset.pool);
    const errEl = cardEl.querySelector('[data-pool-error]');
    cardEl.querySelector('[data-pool-save]')?.addEventListener('click', () => {
      const qty = toNumber(cardEl.querySelector('[data-pool-qty]').value, 0);
      const mine = Math.max(0, Number(store.get().poolContributions[pool.id]) || 0);
      const max = poolableQty(pool.crop) || mine;
      if (!(qty > 0)) { errEl.textContent = t('Enter a quantity above zero.'); return; }
      if (qty > max) { errEl.textContent = `${t('You only have')} ${max} qtl ${t('of')} ${pool.crop} ${t('listed.')}`; return; }
      store.setPoolContribution(pool.id, qty);
      toast(`${qty} qtl pooled for ${pool.crop}`, { tone: 'success', icon: 'users' });
      rerender();
    });
    cardEl.querySelector('[data-pool-leave]')?.addEventListener('click', () => {
      store.clearPoolContribution(pool.id);
      toast(`Left the ${pool.crop} pool`, { icon: 'users' });
      rerender();
    });
  });
}

function renderFPO() {
  const F = D.FPO_INFO;
  const joined = store.get().fpoJoined;
  const html = `<div class="page-photo-bg" style="background-image:url('./assets/fpo-agg-hero.jpg')"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2">
      <h1 class="font-display text-2xl md:text-3xl font-extrabold text-white drop-shadow-md">${t('FPO Aggregation')}</h1>
      <p class="text-white/90 mt-1 drop-shadow">${t('Pool your lot with nearby farmers for stronger bargaining power')}</p>
    </div>
    <div class="px-4 md:px-6">
      ${card(`
        <div class="flex items-center gap-3 mb-3">
          <div class="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">${icon('users', 'w-6 h-6')}</div>
          <div>
            <div class="font-extrabold">${F.name}</div>
            <div class="text-xs text-muted-foreground">${F.members} members</div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="bg-muted rounded-xl p-3 text-center"><div class="text-[10px] text-muted-foreground font-semibold">Pooled This Week</div><div class="font-bold text-sm mt-1">${F.pooled}</div></div>
          <div class="bg-primary-light rounded-xl p-3 text-center"><div class="text-[10px] text-primary font-semibold">Bargain Gain</div><div class="font-bold text-sm mt-1 text-primary">${F.bargainGain}</div></div>
        </div>
        <button id="fpo-toggle" class="w-full font-bold py-2.5 rounded-xl transition ${joined ? 'bg-primary/10 text-primary' : 'bg-primary text-primary-foreground'}">${joined ? '✓ You are a member' : 'Join this FPO'}</button>
      `)}
    </div>
    <div class="px-4 md:px-6 mt-6" id="pools-section">${poolsSectionHtml(joined)}</div>
    <div class="px-4 md:px-6 mt-6">
      <h3 class="font-extrabold mb-3 text-white drop-shadow-md">${t('Why aggregate with an FPO?')}</h3>
      <div class="space-y-2">
        ${F.benefits.map((b) => card(`<div class="flex gap-2 text-sm">${icon('check', 'w-4 h-4 text-primary shrink-0 mt-0.5')}${b}</div>`, 'p-3')).join('')}
      </div>
    </div>
  `);

  function mount(root) {
    root.querySelector('#fpo-toggle').addEventListener('click', () => {
      const next = !store.get().fpoJoined;
      store.set({ fpoJoined: next });
      toast(next ? `Joined ${F.name}` : 'Left the FPO', { tone: 'success', icon: 'users' });
      navigateTo('#/fpo', true);
    });
    wirePools(root.querySelector('#pools-section'), store.get().fpoJoined);
  }

  return { html, mount };
}

/* ---------------- LOGISTICS: TRANSPORT & STORAGE ---------------- */

/* ---------------- STORAGE CALCULATOR + SHARED TRIPS (Logistics tabs) ---------------- */

// Calculator inputs survive re-renders (booking a facility, sorting by distance) and tab switches.
const storageCalc = { cropId: 'tomato', qty: 50, days: 14, facilityId: 'best' };

function resolveStorageFacility(commodity) {
  if (storageCalc.facilityId === 'farm') return null;
  if (storageCalc.facilityId !== 'best') return D.STORAGE_FACILITIES.find((f) => f.id === storageCalc.facilityId) || null;
  // "Best match": the suitable facility that leaves the most money in hand after the chosen hold.
  const qty = storageCalc.qty;
  const suitable = D.STORAGE_FACILITIES.filter((f) => f.suitableFor.includes(commodity.name));
  if (!suitable.length) return null;
  return suitable.reduce((best, f) => (
    storageEconomics({ commodity, quantity: qty, days: storageCalc.days, facility: f }).gainPerQtl
      > storageEconomics({ commodity, quantity: qty, days: storageCalc.days, facility: best }).gainPerQtl ? f : best
  ), suitable[0]);
}

function storageResultHtml() {
  const commodity = D.COMMODITIES.find((c) => c.id === storageCalc.cropId) || D.COMMODITIES[0];
  const facility = resolveStorageFacility(commodity);
  const qty = storageCalc.qty;
  if (!(qty > 0)) return `<p class="text-sm text-muted-foreground text-center py-4">${t('Enter how many quintals you want to store.')}</p>`;
  const r = storageEconomics({ commodity, quantity: qty, days: storageCalc.days, facility });
  const cmp = compareHoldPeriods({ commodity, quantity: qty, facility });
  const where = facility ? facility.name : t('at the farm (no storage)');

  let tone = 'bg-accent/20 text-accent-foreground';
  let verdict;
  if (r.unsuitable) {
    verdict = `${esc(facility.name)} ${t('is not suited to storing')} ${esc(commodity.name)}. ${t('Pick a different facility.')}`;
  } else if (r.better === 'store') {
    tone = 'bg-primary/10 text-primary';
    verdict = `${t('Holding')} ${r.days} ${t('days')} ${t('could earn about')} <b>${money(r.gainPerQtl)}/qtl</b> ${t('more')} — <b>${inr(r.totalGain)}</b> ${t('on')} ${qty} qtl.`;
  } else {
    verdict = `${t('Sell now.')} ${t('Holding')} ${r.days} ${t('days')} ${t('is expected to lose')} <b>${money(Math.abs(r.gainPerQtl))}/qtl</b> (${inr(Math.abs(r.totalGain))} ${t('on')} ${qty} qtl).`;
  }
  const row = (label, value, cls = '') => `<div class="flex justify-between text-sm py-1.5 border-b border-border last:border-0"><span class="text-muted-foreground">${label}</span><span class="font-bold ${cls}">${value}</span></div>`;
  return `
    <div class="rounded-xl p-3 text-sm font-semibold ${tone}" role="status">${verdict}</div>
    <div class="mt-3">
      ${row(t('Sell today (best mandi)'), `${money(r.sellNow)}/qtl`)}
      ${row(`${t('Expected price in')} ${r.days} ${t('days')}`, `${money(r.projectedPrice)}/qtl`)}
      ${row(t('Spoilage loss'), `− ${money(r.spoilageLoss)} (${r.spoilPct.toFixed(1)}%)`, 'text-destructive')}
      ${row(`${t('Storage cost')} · ${esc(where)}`, `− ${money(r.storageCost)}`, 'text-destructive')}
      ${row(t('Net if held'), `${money(r.netHold)}/qtl`, r.gainPerQtl >= 0 ? 'text-primary' : 'text-destructive')}
    </div>
    <div class="mt-3 overflow-x-auto"><table class="w-full text-xs">
      <thead><tr class="text-muted-foreground text-left"><th class="py-1 font-semibold">${t('Hold for')}</th><th class="py-1 font-semibold">${t('Per quintal')}</th><th class="py-1 font-semibold text-right">${t('Total')}</th></tr></thead>
      <tbody>${cmp.rows.map((x) => `<tr class="${cmp.best && cmp.best.days === x.days ? 'bg-primary/10 font-bold' : ''}"><td class="py-1 px-1">${x.days} ${t('days')}</td><td class="py-1">${x.gainPerQtl >= 0 ? '+' : '−'}${money(Math.abs(x.gainPerQtl))}</td><td class="py-1 px-1 text-right">${x.totalGain >= 0 ? '+' : '−'}${inr(Math.abs(x.totalGain))}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="text-[11px] text-muted-foreground mt-3">${t('Estimate only: assumes the recent price trend continues at 40% strength and uses typical spoilage rates. Mandi prices can reverse — check Market Intelligence before you decide.')}</p>`;
}

function storageCalculatorHtml() {
  return card(`
    <div class="flex items-center gap-2 mb-3"><span class="text-primary">${icon('scale', 'w-5 h-5')}</span><h3 class="font-extrabold">${t('Is storing worth it?')}</h3></div>
    <div class="grid grid-cols-2 gap-3">
      <div><label for="sc-crop" class="text-xs font-bold text-muted-foreground">${t('Crop')}</label>
        <select id="sc-crop" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1">${D.COMMODITIES.map((c) => `<option value="${esc(c.id)}" ${c.id === storageCalc.cropId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div><label for="sc-qty" class="text-xs font-bold text-muted-foreground">${t('Quantity (quintals)')}</label>
        <input id="sc-qty" type="number" inputmode="decimal" min="1" max="100000" step="1" value="${esc(storageCalc.qty)}" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1"></div>
    </div>
    <div class="mt-3"><label for="sc-fac" class="text-xs font-bold text-muted-foreground">${t('Storage')}</label>
      <select id="sc-fac" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1">
        <option value="best" ${storageCalc.facilityId === 'best' ? 'selected' : ''}>${t('Best match for this crop')}</option>
        ${D.STORAGE_FACILITIES.map((f) => `<option value="${esc(f.id)}" ${f.id === storageCalc.facilityId ? 'selected' : ''}>${esc(f.name)} — ${money(f.ratePerDay)}/qtl/day</option>`).join('')}
        <option value="farm" ${storageCalc.facilityId === 'farm' ? 'selected' : ''}>${t('Keep it at the farm (no storage cost)')}</option>
      </select></div>
    <div class="mt-3"><label for="sc-days" class="text-xs font-bold text-muted-foreground">${t('Hold for')}: <span id="sc-days-val">${storageCalc.days}</span> ${t('days')}</label>
      <input id="sc-days" type="range" min="1" max="60" step="1" value="${storageCalc.days}" class="w-full mt-1 accent-[var(--primary)]"></div>
    <div id="sc-result" class="mt-4">${storageResultHtml()}</div>
  `, 'mb-1');
}

function wireStorageCalculator(root) {
  const result = root.querySelector('#sc-result');
  if (!result) return;
  const refresh = () => { result.innerHTML = storageResultHtml(); };
  root.querySelector('#sc-crop').addEventListener('change', (e) => { storageCalc.cropId = e.target.value; refresh(); });
  root.querySelector('#sc-fac').addEventListener('change', (e) => { storageCalc.facilityId = e.target.value; refresh(); });
  root.querySelector('#sc-qty').addEventListener('input', (e) => { storageCalc.qty = clamp(toNumber(e.target.value, 0), 0, 100000); refresh(); });
  root.querySelector('#sc-days').addEventListener('input', (e) => {
    storageCalc.days = clamp(toNumber(e.target.value, 14), 1, 60);
    root.querySelector('#sc-days-val').textContent = storageCalc.days;
    refresh();
  });
}

// --- shared trips ---

function tripProvider(trip) { return D.TRANSPORT_PROVIDERS.find((p) => p.id === trip.providerId); }

function tripQuoteHtml(trip, qty) {
  if (!(qty > 0)) return `<p class="text-xs text-muted-foreground">${t('Enter how many quintals you want to send.')}</p>`;
  const q = sharedTripCost(trip, qty);
  if (!q.fits) return `<p class="text-xs font-semibold text-destructive" role="alert">${q.seatsLeft > 0 ? `${t('Only')} ${q.seatsLeft} ${t('quintals of space left on this trip.')}` : t('This trip is full.')}</p>`;
  return `
    <div class="grid grid-cols-3 gap-2 text-center">
      <div class="bg-muted rounded-xl p-2"><div class="text-[10px] font-semibold text-muted-foreground">${t('Per quintal')}</div><div class="font-extrabold text-sm">${money(q.perQtl)}</div></div>
      <div class="bg-muted rounded-xl p-2"><div class="text-[10px] font-semibold text-muted-foreground">${t('Your share')}</div><div class="font-extrabold text-sm">${inr(q.myCost)}</div></div>
      <div class="bg-primary/10 rounded-xl p-2"><div class="text-[10px] font-semibold text-primary">${t('You save')}</div><div class="font-extrabold text-sm text-primary">${inr(q.saving)}</div></div>
    </div>
    <p class="text-[11px] text-muted-foreground mt-2">${t('Alone you would pay')} ${inr(q.soloCost)} ${t('for a')} ${esc(trip.soloVehicle)}. ${t('At full load this trip costs')} ${money(q.totalCost / trip.capacityQtl)}/qtl.</p>`;
}

function sharedTripCardHtml(trip, booking) {
  const provider = tripProvider(trip);
  const mine = booking ? Math.max(0, Number(booking.qty) || 0) : 0;
  const filled = clamp(((trip.bookedQtl + mine) / trip.capacityQtl) * 100, 0, 100);
  const left = Math.max(0, trip.capacityQtl - trip.bookedQtl - mine);
  return `
    <div class="card p-4" data-trip="${esc(trip.id)}">
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="font-bold">${esc(trip.route)}</div>
          <div class="text-xs text-muted-foreground mt-0.5">${esc(trip.when)} · ${esc(trip.vehicle)}${provider ? ` · ${esc(provider.name)}` : ''}</div>
        </div>
        <div class="text-right shrink-0"><div class="text-xs font-bold ${left ? 'text-primary' : 'text-destructive'}">${left ? `${left} ${t('qtl left')}` : t('Full')}</div></div>
      </div>
      <div class="mt-3 h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(filled)}" aria-label="${t('Truck filled')}"><div class="h-full bg-primary rounded-full" style="width:${filled}%"></div></div>
      <div class="text-[10px] text-muted-foreground mt-1">${trip.bookedQtl + mine} / ${trip.capacityQtl} qtl ${t('booked')}</div>
      ${booking ? `
        <div class="mt-3 rounded-xl bg-primary/10 text-primary p-3 text-sm font-semibold flex items-center gap-2">${icon('checkCircle', 'w-4 h-4 shrink-0')}<span>${t('Your seat')}: ${mine} qtl · ${inr(booking.myCost)}</span></div>
        <button data-cancel-trip="${esc(trip.id)}" class="mt-2 w-full border border-border text-sm font-bold py-2 rounded-lg hover:bg-muted transition">${t('Cancel my booking')}</button>`
      : `
        <div class="mt-3"><label for="st-qty-${esc(trip.id)}" class="text-xs font-bold text-muted-foreground">${t('Quantity (quintals)')}</label>
          <input id="st-qty-${esc(trip.id)}" data-trip-qty type="number" inputmode="decimal" min="1" max="${trip.capacityQtl}" step="1" value="${Math.min(10, trip.capacityQtl - trip.bookedQtl) || ''}" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1"></div>
        <div class="mt-3" data-trip-quote></div>
        <button data-book-trip="${esc(trip.id)}" class="mt-3 w-full bg-primary text-primary-foreground text-sm font-bold py-2 rounded-lg hover:opacity-90 transition disabled:opacity-40">${t('Book a seat')}</button>`}
    </div>`;
}

function sharedTripsHtml() {
  const bookings = store.get().sharedTripBookings;
  return `
    ${card(`<div class="flex gap-2 text-sm">${icon('info', 'w-4 h-4 text-primary shrink-0 mt-0.5')}<span>${t('Share one truck with other farmers heading to the same mandi. The trip cost is split across every quintal on board, so your cost per quintal falls as the truck fills.')}</span></div>`, 'p-3')}
    ${D.SHARED_TRIPS.map((trip) => sharedTripCardHtml(trip, bookings[trip.id])).join('')}`;
}

function wireSharedTrips(root, rerender) {
  root.querySelectorAll('[data-trip]').forEach((cardEl) => {
    const trip = D.SHARED_TRIPS.find((x) => x.id === cardEl.dataset.trip);
    const input = cardEl.querySelector('[data-trip-qty]');
    const quote = cardEl.querySelector('[data-trip-quote]');
    const bookBtn = cardEl.querySelector('[data-book-trip]');
    if (input && quote && bookBtn) {
      const refresh = () => {
        const qty = toNumber(input.value, 0);
        quote.innerHTML = tripQuoteHtml(trip, qty);
        bookBtn.disabled = !sharedTripCost(trip, qty).fits;
      };
      input.addEventListener('input', refresh);
      refresh();
      bookBtn.addEventListener('click', () => {
        const qty = toNumber(input.value, 0);
        const q = sharedTripCost(trip, qty);
        if (!q.fits) return;
        store.setSharedTripBooking(trip.id, { qty, perQtl: q.perQtl, myCost: q.myCost, at: Date.now() });
        toast(`Seat booked: ${qty} qtl on ${trip.route}`, { tone: 'success', icon: 'truck' });
        rerender();
      });
    }
    cardEl.querySelector('[data-cancel-trip]')?.addEventListener('click', () => {
      store.clearSharedTripBooking(trip.id);
      toast(`Booking cancelled for ${trip.route}`, { icon: 'truck' });
      rerender();
    });
  });
}

function renderLogistics() {
  const html = `<div class="page-photo-bg" style="background-image:url('./assets/logistics-hero.jpg')"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2">
      <h1 class="font-display text-2xl md:text-3xl font-extrabold text-white drop-shadow-md">${t('Transport & Storage')}</h1>
      <p class="text-white/90 mt-1 drop-shadow">${t('Arrange pickup and storage to protect your produce and cut post-harvest loss')}</p>
    </div>
    <div class="px-4 md:px-6 mb-4">
      ${card(`
        <div class="flex gap-2 text-sm">${icon('info', 'w-4 h-4 text-primary shrink-0 mt-0.5')}<span>Booking transport or storage as soon as you accept an offer keeps produce moving fast — reducing spoilage and the price hit from post-harvest loss.</span></div>
      `, 'p-3')}
    </div>
    <div class="px-4 md:px-6 mb-4">
      <button id="logistics-locate" class="w-full flex items-center justify-center gap-1.5 text-sm font-bold text-primary bg-white/95 backdrop-blur border border-primary/30 rounded-xl py-2.5 hover:bg-primary-light transition shadow-soft">${icon('pin', 'w-4 h-4')}${t('Use my current location to sort by distance')}</button>
      <p id="logistics-locate-status" class="hidden text-xs text-white/90 drop-shadow text-center mt-1.5"></p>
    </div>
    <div class="px-4 md:px-6 flex gap-2 mb-4" id="logistics-tabs">
      <button data-tab="transport" class="log-tab flex-1 text-sm font-bold py-2.5 rounded-xl border bg-white/95 backdrop-blur shadow-soft">${icon('truck', 'w-4 h-4 inline mr-1')}${t('Transport')}</button>
      <button data-tab="shared" class="log-tab flex-1 text-sm font-bold py-2.5 rounded-xl border bg-white/95 backdrop-blur shadow-soft">${icon('users', 'w-4 h-4 inline mr-1')}${t('Shared Trips')}</button>
      <button data-tab="storage" class="log-tab flex-1 text-sm font-bold py-2.5 rounded-xl border bg-white/95 backdrop-blur shadow-soft">${icon('snowflake', 'w-4 h-4 inline mr-1')}${t('Storage')}</button>
    </div>
    <div class="px-4 md:px-6 space-y-3" id="logistics-list"></div>
  `);

  function transportCard(p, booked, liveDist) {
    return `
      <div class="card p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold">${p.name}</span>
              ${p.verified ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">${icon('badgeCheck', 'w-3 h-3')}Verified</span>` : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Unverified</span>`}
            </div>
            <div class="text-xs text-muted-foreground mt-0.5">${p.vehicle} · ${liveDist || p.distance} away${liveDist ? ' <span class="text-primary font-semibold">· live</span>' : ''}</div>
            <div class="mt-1">${stars(p.rating)}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-extrabold text-primary">${money(p.ratePerKm)}<span class="text-xs font-bold text-muted-foreground">/km</span></div>
            <div class="text-[10px] text-muted-foreground">${p.eta}</div>
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <a href="${telHref(p.phone)}" class="border border-border text-sm font-bold px-3 py-2 rounded-lg hover:bg-muted transition flex items-center gap-1.5">${icon('phone', 'w-4 h-4')}Call</a>
          ${booked
            ? `<span class="flex-1 text-center bg-primary/10 text-primary text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-1.5">${icon('checkCircle', 'w-4 h-4')}Booked</span>`
            : `<button data-book-transport="${p.id}" class="flex-1 bg-primary text-primary-foreground text-sm font-bold py-2 rounded-lg hover:opacity-90 transition">Book Transport</button>`}
        </div>
      </div>`;
  }

  function storageCard(s, booked, liveDist) {
    return `
      <div class="card p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold">${s.name}</span>
              ${s.verified ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">${icon('badgeCheck', 'w-3 h-3')}Verified</span>` : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Unverified</span>`}
            </div>
            <div class="text-xs text-muted-foreground mt-0.5">${s.type} · ${s.tempRange} · ${liveDist || s.distance} away${liveDist ? ' <span class="text-primary font-semibold">· live</span>' : ''}</div>
            <div class="mt-1">${stars(s.rating)}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-extrabold text-primary">${money(s.ratePerDay)}<span class="text-xs font-bold text-muted-foreground">/qtl/day</span></div>
            <div class="text-[10px] text-muted-foreground">${s.capacity}</div>
          </div>
        </div>
        <div class="flex gap-1.5 flex-wrap mt-2">${s.suitableFor.map((c) => `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">${c}</span>`).join('')}</div>
        ${booked
          ? `<div class="mt-3 w-full text-center bg-primary/10 text-primary text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-1.5">${icon('checkCircle', 'w-4 h-4')}Reserved</div>`
          : `<button data-book-storage="${s.id}" class="mt-3 w-full bg-primary text-primary-foreground text-sm font-bold py-2 rounded-lg hover:opacity-90 transition">Reserve Storage</button>`}
      </div>`;
  }

  function mount(root) {
    let tab = 'transport';
    let userCoords = null;
    const list = root.querySelector('#logistics-list');
    const isBooked = (type, name) => store.get().bookings.some((b) => b.type === type && b.name === name);

    function styleTabs() {
      root.querySelectorAll('.log-tab').forEach((b) => {
        const active = b.dataset.tab === tab;
        b.className = `log-tab flex-1 text-sm font-bold py-2.5 rounded-xl border shadow-soft ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/95 backdrop-blur border-border text-muted-foreground'}`;
      });
    }

    function render() {
      let transportItems = D.TRANSPORT_PROVIDERS;
      let storageItems = D.STORAGE_FACILITIES;
      if (userCoords) {
        transportItems = [...transportItems].sort((a, b) => distanceKm(userCoords.lat, userCoords.lon, a.lat, a.lon) - distanceKm(userCoords.lat, userCoords.lon, b.lat, b.lon));
        storageItems = [...storageItems].sort((a, b) => distanceKm(userCoords.lat, userCoords.lon, a.lat, a.lon) - distanceKm(userCoords.lat, userCoords.lon, b.lat, b.lon));
      }
      if (tab === 'shared') {
        list.innerHTML = sharedTripsHtml();
        wireSharedTrips(list, render);
        return;
      }
      list.innerHTML = tab === 'transport'
        ? transportItems.map((p) => transportCard(p, isBooked('transport', p.name), userCoords ? fmtKm(distanceKm(userCoords.lat, userCoords.lon, p.lat, p.lon)) : null)).join('')
        : storageCalculatorHtml() + storageItems.map((s) => storageCard(s, isBooked('storage', s.name), userCoords ? fmtKm(distanceKm(userCoords.lat, userCoords.lon, s.lat, s.lon)) : null)).join('');
      if (tab === 'storage') wireStorageCalculator(list);

      list.querySelectorAll('[data-book-transport]').forEach((btn) => btn.addEventListener('click', () => {
        const p = D.TRANSPORT_PROVIDERS.find((x) => x.id === btn.dataset.bookTransport);
        openModal(`
          <div class="p-5">
            <h3 class="font-extrabold text-lg mb-1">Confirm Transport Booking</h3>
            <p class="text-sm text-muted-foreground mb-4">Book ${p.name} (${p.vehicle}) at ${money(p.ratePerKm)}/km — ${p.eta.toLowerCase()}?</p>
            <div class="flex gap-2">
              <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Cancel</button>
              <button id="confirm-book" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">Confirm</button>
            </div>
          </div>`, {
          onMount: (m) => m.querySelector('#confirm-book').addEventListener('click', () => {
            store.addBooking({ type: 'transport', name: p.name, date: new Date().toDateString().slice(4) });
            closeModal();
            toast(`Transport booked with ${p.name}`, { tone: 'success', icon: 'truck' });
            render();
          }),
        });
      }));

      list.querySelectorAll('[data-book-storage]').forEach((btn) => btn.addEventListener('click', () => {
        const s = D.STORAGE_FACILITIES.find((x) => x.id === btn.dataset.bookStorage);
        openModal(`
          <div class="p-5">
            <h3 class="font-extrabold text-lg mb-1">Confirm Storage Reservation</h3>
            <p class="text-sm text-muted-foreground mb-4">Reserve space at ${s.name} (${s.type}, ${s.tempRange}) for ${money(s.ratePerDay)}/quintal/day?</p>
            <div class="flex gap-2">
              <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Cancel</button>
              <button id="confirm-book" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">Confirm</button>
            </div>
          </div>`, {
          onMount: (m) => m.querySelector('#confirm-book').addEventListener('click', () => {
            store.addBooking({ type: 'storage', name: s.name, date: new Date().toDateString().slice(4) });
            closeModal();
            toast(`Storage reserved at ${s.name}`, { tone: 'success', icon: 'snowflake' });
            render();
          }),
        });
      }));
    }

    root.querySelectorAll('.log-tab').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; styleTabs(); render(); }));

    const statusEl = root.querySelector('#logistics-locate-status');
    wireLocateButton(root.querySelector('#logistics-locate'), ({ location, lat, lon }) => {
      userCoords = { lat, lon };
      statusEl.textContent = `Sorted by distance from ${location}`;
      statusEl.classList.remove('hidden');
      render();
    });

    styleTabs();
    render();
  }

  return { html, mount };
}

/* ---------------- WEATHER FORECAST ---------------- */

function renderWeather() {
  const html = pageWrap(`
    ${sectionHead('Weather Forecast', 'Live temperature, rainfall and farming-specific weather alerts')}
    <div class="px-4 md:px-6 mb-4">
      <button id="weather-locate" class="w-full flex items-center justify-center gap-1.5 text-sm font-bold text-primary border border-primary/30 rounded-xl py-2.5 hover:bg-primary-light transition">${icon('pin', 'w-4 h-4')}${t('Use my current location')}</button>
    </div>
    <div class="px-4 md:px-6" id="weather-body"></div>
  `);

  function body(w) {
    return `
      ${card(`
        <div class="flex items-center justify-between">
          <div>
            <div class="text-4xl font-extrabold text-gradient-primary font-display">${w.temp}°C</div>
            <div class="text-sm font-semibold text-muted-foreground mt-1">${w.condition}</div>
            <div class="text-xs text-muted-foreground mt-0.5">Feels like ${w.feelsLike}°C</div>
          </div>
          <div class="text-primary">${icon(w.conditionIcon, 'w-16 h-16')}</div>
        </div>
        <div class="grid grid-cols-3 gap-2 mt-4">
          <div class="bg-muted rounded-xl p-2.5 text-center"><div class="text-[10px] text-muted-foreground font-semibold">Humidity</div><div class="font-bold text-sm mt-0.5">${w.humidity}%</div></div>
          <div class="bg-muted rounded-xl p-2.5 text-center"><div class="text-[10px] text-muted-foreground font-semibold">Wind</div><div class="font-bold text-sm mt-0.5">${w.wind} km/h</div></div>
          <div class="bg-sky-light rounded-xl p-2.5 text-center"><div class="text-[10px] text-sky font-semibold">Rain Chance</div><div class="font-bold text-sm mt-0.5 text-sky">${w.rainChance}%</div></div>
        </div>
      `)}

      <h3 class="font-extrabold mt-6 mb-3">5-Day Forecast</h3>
      <div class="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
        ${w.daily.map((d) => `
          <div class="card p-3 text-center shrink-0 w-[92px]">
            <div class="text-xs font-bold">${d.day}</div>
            <div class="text-primary flex justify-center my-1.5">${icon(d.icon, 'w-6 h-6')}</div>
            <div class="text-sm font-extrabold">${d.max}°</div>
            <div class="text-xs text-muted-foreground">${d.min}°</div>
            <div class="text-[10px] text-sky font-semibold mt-1">${icon('droplet', 'w-3 h-3 inline')} ${d.rain}%</div>
          </div>`).join('')}
      </div>

      <h3 class="font-extrabold mt-6 mb-3">Weather Alerts</h3>
      <div class="space-y-2">
        ${(w.alerts || D.WEATHER_FALLBACK.alerts).map((a) => card(`
          <div class="flex items-start gap-2.5">
            ${icon('alert', `w-4 h-4 mt-0.5 shrink-0 ${a.level === 'HIGH' ? 'text-destructive' : 'text-accent'}`)}
            <div>
              <div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-sm">${a.title}</span><span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeTone(a.level)}">${a.level}</span></div>
              <p class="text-xs text-muted-foreground mt-1">${a.desc}</p>
            </div>
          </div>`, 'p-3')).join('')}
      </div>

      <h3 class="font-extrabold mt-6 mb-3">🌾 Farming Tips</h3>
      <div class="space-y-2">
        ${D.WEATHER_FALLBACK.tips.map((tp) => card(`
          <div class="flex items-start gap-3">
            <span class="text-xl shrink-0">${tp.icon}</span>
            <div><div class="font-bold text-sm">${tp.title}</div><p class="text-xs text-muted-foreground mt-0.5">${tp.desc}</p></div>
          </div>`, 'p-3')).join('')}
      </div>
    `;
  }

  function mount(root) {
    const bodyEl = root.querySelector('#weather-body');
    bodyEl.innerHTML = body(D.WEATHER_FALLBACK);
    wireLocateButton(root.querySelector('#weather-locate'), async ({ lat, lon, location }) => {
      try {
        const w = await fetchFullWeather(lat, lon);
        bodyEl.innerHTML = body({ ...w, alerts: D.WEATHER_FALLBACK.alerts });
      } catch (e) {
        toast('Could not load live weather — showing default forecast.', { tone: 'error', icon: 'cloud' });
      }
    });
  }

  return { html, mount };
}

/* ---------------- NEXT-SEASON CROP SUGGESTIONS (soil + location) ---------------- */

function renderCropSuggestions() {
  const farmer = currentFarmer();
  const currentSeason = D.currentCropSeason();
  const nextSeason = D.CROP_SEASONS[currentSeason].next;
  const soil = D.soilForLocation(farmer.location);
  const suggestions = D.CROP_PLAN[nextSeason] || [];

  function suggestionCard(s) {
    const bestMatch = s.soils.includes(soil.type);
    const commodity = D.COMMODITIES.find((c) => c.name === s.name);
    return `
      <div class="card p-4 ${bestMatch ? 'border-primary/50' : ''}">
        <div class="flex items-center gap-3">
          ${cropBadge(s.name, 'w-12 h-12', 'w-6 h-6')}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold">${s.name}</span>
              ${bestMatch
                ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">${icon('badgeCheck', 'w-3 h-3')}${t('Best Match for Your Soil')}</span>`
                : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">${t('Also Suitable')}</span>`}
            </div>
            <p class="text-xs text-muted-foreground mt-1">${s.note}</p>
          </div>
        </div>
        ${commodity ? `
        <div class="flex items-center justify-between mt-3 bg-primary-light rounded-xl p-2.5">
          <div class="text-xs">
            <div class="text-muted-foreground">${t('Current market price')}</div>
            <div class="font-extrabold text-primary">${inr(commodity.mandis[0].price)}/${commodity.unit}</div>
          </div>
          ${trendBadge(commodity.forecast)}
        </div>
        <a href="#/market/${commodity.id}" class="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary">${icon('chevronRight', 'w-3.5 h-3.5')}${t('View market details')}</a>` : ''}
      </div>`;
  }

  const html = pageWrap(`
    ${sectionHead('Suggested Crops for Next Season', 'Based on your soil type, location and the coming season, with live market context')}
    <div class="px-4 md:px-6">
      ${card(`
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="flex items-start gap-2">
            ${icon('pin', 'w-4 h-4 text-primary mt-0.5')}
            <div>
              <div class="font-bold text-sm" id="csug-location">${farmer.location}</div>
              <div class="text-xs text-primary font-semibold" id="csug-soil">${soil.type}</div>
            </div>
          </div>
          <button id="csug-locate" class="text-xs font-bold text-primary shrink-0">${t('Update Location')}</button>
        </div>
        <p class="text-xs text-muted-foreground mt-2" id="csug-soil-note">${soil.note}</p>
      `)}
    </div>
    <div class="px-4 md:px-6 mt-4">
      <div class="bg-primary-light rounded-xl p-3 flex items-center gap-2">
        ${icon('calendar', 'w-4 h-4 text-primary shrink-0')}
        <div class="text-sm"><b class="text-primary">${t('Next Season')}: ${nextSeason}</b> <span class="text-muted-foreground">(${D.CROP_SEASONS[nextSeason].months})</span></div>
      </div>
    </div>
    <div class="px-4 md:px-6 mt-4 space-y-3" id="csug-list">
      ${suggestions.length ? suggestions.map(suggestionCard).join('') : `<p class="text-center text-muted-foreground py-8">No suggestions available for this season yet.</p>`}
    </div>
  `);

  function mount(root) {
    wireLocateButton(root.querySelector('#csug-locate'), ({ location }) => {
      store.updateUser({ location });
      navigateTo('#/crop-suggestions', true);
    });
  }

  return { html, mount };
}

/* ---------------- DIGITAL TRANSACTION HISTORY ---------------- */

function renderHistory() {
  const isBuyer = store.get().user?.role === 'buyer';
  const html = pageWrap(`
    ${sectionHead('Transaction History', 'Every lot, offer, order and payment in one digital record')}
    <div class="px-4 md:px-6 space-y-3" id="history-list"></div>
  `);

  function row(iconName, tone, title, subtitle, right, rightSub) {
    return card(`
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tone}">${icon(iconName, 'w-4.5 h-4.5')}</div>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm truncate">${title}</div>
          <div class="text-xs text-muted-foreground truncate">${subtitle}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-extrabold text-sm">${right}</div>
          <div class="text-[10px] text-muted-foreground">${rightSub}</div>
        </div>
      </div>`, 'p-3');
  }

  function mount(root) {
    const list = root.querySelector('#history-list');
    const entries = [];

    if (isBuyer) {
      store.get().offers.forEach((o) => entries.push({ sort: 3, html: row('package', 'bg-primary/10 text-primary', `Offer: ${o.crop}`, `${o.lotId} · ${o.status}`, inr(o.amount), o.date) }));
      [...store.get().orders, ...D.ORDERS].forEach((o) => entries.push({ sort: 2, html: row('truck', 'bg-accent/20 text-accent-foreground', `${o.crop} · ${o.quantity} ${o.unit}`, `${o.id} · ${D.ORDER_STAGES[o.stage]}`, inr(o.amount), o.date) }));
    } else {
      [...(store.get().lots || []), ...D.LOTS].forEach((l) => entries.push({ sort: 1, html: row('package', 'bg-primary/10 text-primary', `${l.crop} Lot Created`, `${l.id} · ${l.quantity} ${l.unit} · ${l.grade}`, '', l.harvestDate) }));
      [...store.get().orders, ...D.ORDERS].forEach((o) => {
        const paid = o.stage >= D.ORDER_STAGES.length - 1;
        entries.push({ sort: 3, html: row(paid ? 'checkCircle' : 'truck', paid ? 'bg-primary/10 text-primary' : 'bg-accent/20 text-accent-foreground', `${o.crop} · ${o.quantity} ${o.unit}`, `${o.id} · ${o.buyer}`, inr(o.amount), D.ORDER_STAGES[o.stage]) });
      });
    }

    list.innerHTML = entries.length
      ? entries.map((e) => e.html).join('')
      : `<p class="text-center text-muted-foreground py-10">No history yet.</p>`;
  }

  return { html, mount };
}

/* ---------------- QUALITY GRADING ---------------- */

function qualityFactorRowHtml(f) {
  const pass = f.status === 'pass';
  return `
    <div class="flex items-start justify-between gap-3 py-2.5 border-b border-border last:border-0">
      <div class="flex items-start gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-full ${pass ? 'bg-primary/10 text-primary' : 'bg-accent/20 text-accent-foreground'} flex items-center justify-center shrink-0">${icon(f.icon, 'w-4 h-4')}</div>
        <div class="min-w-0">
          <div class="text-sm font-semibold">${t(f.label)}</div>
          <div class="text-xs text-muted-foreground mt-0.5">${pass ? f.passNote : f.warnNote}</div>
        </div>
      </div>
      <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${pass ? 'bg-primary/10 text-primary' : 'bg-accent/20 text-accent-foreground'}">${icon(pass ? 'check' : 'alert', 'w-3 h-3')}${f.score}%</span>
    </div>`;
}

function renderQualityCheck() {
  const html = pageWrap(`
    ${sectionHead('Quality Grading', 'AI visual pre-grading across 6 compliance checks — colour, size, shape, defects, maturity &amp; disease/pest damage')}
    <div class="px-4 md:px-6" id="qc-upload-area">
      ${uploadBox('qc-file', 'Upload Produce Image', 'Click to upload or take a photo — supports JPG, PNG up to 10MB')}
    </div>
    <div class="px-4 md:px-6 mt-4" id="qc-result-area"></div>
    <div class="px-4 md:px-6 mt-6">
      ${card(`
        <h3 class="font-bold mb-2">${icon('camera', 'w-4 h-4 inline mr-1')} Tips for Better Grading</h3>
        <ul class="space-y-1.5 text-sm text-muted-foreground">
          ${D.PEST_TIPS.map((t) => `<li class="flex gap-2"><span class="text-primary">•</span>${t}</li>`).join('')}
        </ul>
      `)}
    </div>
  `);

  function mount(root) {
    const uploadArea = root.querySelector('#qc-upload-area');
    const resultArea = root.querySelector('#qc-result-area');
    const input = wireUpload(uploadArea, 'qc-file');
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const dataUrl = await readAsDataUrl(file);
      resultArea.innerHTML = `
        <div class="card p-4">
          <img src="${dataUrl}" class="w-full max-h-64 object-cover rounded-xl mb-4" />
          <div class="flex items-center gap-2 text-primary font-semibold text-sm">
            <span class="spinner inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></span>
            Grading produce quality...
          </div>
        </div>`;
      setTimeout(() => {
        const factors = gradeQualityFactors(file);
        const grade = overallGradeFrom(factors);
        const passCount = factors.filter((f) => f.status === 'pass').length;
        resultArea.innerHTML = `
          <div class="card p-4">
            <img src="${dataUrl}" class="w-full max-h-64 object-cover rounded-xl mb-4" />
            <div class="flex items-center gap-4 mb-1">
              <div class="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xs font-extrabold text-center px-1">${grade}</div>
              <div>
                <div class="font-extrabold text-lg">${grade}</div>
                <div class="text-sm text-muted-foreground">${passCount}/${factors.length} ${t('checks passed')}</div>
              </div>
            </div>
            <div class="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mt-4 mb-1">${t('AI Compliance Breakdown')}</div>
            <div>
              ${factors.map(qualityFactorRowHtml).join('')}
            </div>
            <p class="text-xs text-muted-foreground mt-4 mb-3">${t('This grade qualifies your lot for premium buyers. Attach this result when creating a new lot to speed up buyer matching.')}</p>
            <a href="#/lots" class="w-full inline-flex items-center justify-center border border-primary text-primary font-bold py-2.5 rounded-xl hover:bg-primary-light transition">Create Lot with This Grade</a>
          </div>`;
        toast('Grading complete', { tone: 'success', icon: 'checkCircle' });
      }, 1400);
    });
  }

  return { html, mount };
}

/* ---------------- PROFILE ---------------- */

function prototypeDisclaimerHtml() {
  return `
    <div class="relative z-10 px-4 md:px-6 mt-5">
      <div class="rounded-xl border border-dashed border-border bg-card/95 backdrop-blur p-3 flex items-start gap-2 shadow-soft">
        ${icon('alert', 'w-4 h-4 text-muted-foreground shrink-0 mt-0.5')}
        <p class="text-[11px] text-muted-foreground leading-relaxed">${t('Prototype for SIH 2026 (Problem 26132)')} — ${t('Mandi prices, buyers, offers, orders and verification records shown in this app are illustrative mock data for demonstration, not live transactions.')}</p>
      </div>
    </div>`;
}

function renderProfile() {
  const role = store.get().user?.role;
  if (role === 'buyer') return renderBuyerProfile();
  if (role === 'fpo_operator') return renderFpoOperatorProfile();
  return renderFarmerProfile();
}

// Generic "Edit Profile" modal shared by all three roles — takes {key,label,value} field
// descriptors, saves straight onto store.user via updateUser, and refreshes the page.
function openEditProfileModal(fields) {
  openModal(`
    <div class="p-5">
      <h3 class="font-extrabold text-lg mb-3">${t('Edit Profile')}</h3>
      ${fields.map((f) => `
        <label class="text-xs font-bold text-muted-foreground">${f.label}</label>
        <input id="ep-${f.key}" value="${(f.value || '').replace(/"/g, '&quot;')}" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3" />
      `).join('')}
      <div class="flex gap-2">
        <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Cancel</button>
        <button id="save-profile" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">${t('Save')}</button>
      </div>
    </div>`, {
    onMount: (m) => m.querySelector('#save-profile').addEventListener('click', () => {
      const patch = {};
      fields.forEach((f) => { patch[f.key] = m.querySelector(`#ep-${f.key}`).value.trim() || f.value; });
      store.updateUser(patch);
      closeModal();
      toast('Profile updated', { tone: 'success', icon: 'checkCircle' });
      navigateTo('#/profile', true);
    }),
  });
}

function renderFarmerProfile() {
  const F = currentFarmer();
  const st = store.get();
  const html = `<div class="page-photo-bg" style="background-image:url('./assets/farmer-profile-hero.jpg')"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2">
      <h1 class="font-display text-2xl md:text-3xl font-extrabold text-white drop-shadow-md">${t('Profile')}</h1>
      <p class="text-white/90 mt-1 drop-shadow">${t('Your account, language &amp; voice preferences')}</p>
    </div>
    <div class="px-4 md:px-6">
      ${card(`
        <div class="flex items-center gap-3">
          <div class="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-extrabold shrink-0">${initials(F.fullName)}</div>
          <div class="flex-1 min-w-0">
            <div class="font-extrabold text-lg">${F.fullName}</div>
            <div class="text-xs text-muted-foreground">${F.phone}</div>
            <div class="text-xs text-muted-foreground">${F.location} · Member since ${F.memberSince}</div>
          </div>
          <button id="edit-profile-btn" class="text-xs font-bold text-primary shrink-0 inline-flex items-center gap-1">${icon('edit', 'w-3.5 h-3.5')}${t('Edit Profile')}</button>
        </div>
      `)}
    </div>

    <div class="px-4 md:px-6 mt-5 grid grid-cols-3 gap-3">
      ${[[D.LOTS.length + (st.lots || []).length, 'Lots Listed'], [D.ORDERS.filter((o) => o.stage === 3).length, 'Completed Sales'], ['+9%', 'Avg. FPO Gain']].map(([v, l]) => card(`<div class="text-center"><div class="text-lg font-extrabold text-primary">${v}</div><div class="text-[10px] text-muted-foreground font-semibold mt-0.5">${t(l)}</div></div>`)).join('')}
    </div>

    <div class="px-4 md:px-6 mt-6">
      <h3 class="font-extrabold mb-3 flex items-center gap-2 text-white drop-shadow-md">${icon('languages', 'w-4 h-4')}${t('Language')}</h3>
      ${card(`
        <div class="grid grid-cols-3 gap-2" id="lang-options">
          ${['English', 'हिंदी', 'मराठी'].map((l) => `<button data-lang="${l}" class="lang-btn text-sm font-bold py-2.5 rounded-xl border ${st.language === l ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}">${l}</button>`).join('')}
        </div>
      `)}
    </div>

    <div class="px-4 md:px-6 mt-5">
      ${card(`
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 font-bold text-sm">${icon('mic', 'w-4 h-4 text-primary')}${t('Tap &amp; Speak (Voice Queries)')}</div>
          <button id="voice-toggle" class="w-12 h-7 rounded-full ${st.voiceEnabled === false ? 'bg-muted' : 'bg-primary'} relative transition">
            <span class="absolute top-0.5 ${st.voiceEnabled === false ? 'left-0.5' : 'left-5'} w-6 h-6 bg-white rounded-full shadow transition-all"></span>
          </button>
        </div>
      `)}
    </div>

    <div class="px-4 md:px-6 mt-5">
      ${card(`
        <div class="flex items-center gap-3 mb-3">
          ${icon('users', 'w-5 h-5 text-primary')}
          <div>
            <div class="font-bold text-sm">${F.fpo}</div>
            <div class="text-xs text-muted-foreground">${t(st.fpoJoined !== false ? 'Active member' : 'Not a member')}</div>
          </div>
          <a href="#/fpo" class="ml-auto text-xs font-bold text-primary">${t('Manage')}</a>
        </div>
      `)}
    </div>

    <div class="px-4 md:px-6 mt-6">
      <button id="logout-btn" class="w-full inline-flex items-center justify-center gap-2 border border-destructive/40 text-destructive font-bold py-3 rounded-xl hover:bg-destructive/10 transition">${icon('logout', 'w-4 h-4')}${t('Log Out')}</button>
    </div>
    ${prototypeDisclaimerHtml()}
  `);

  function mount(root) {
    root.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => {
      store.setLanguage(b.dataset.lang);
      toast(`Language set to ${b.dataset.lang}`, { tone: 'success', icon: 'languages' });
      navigateTo('#/profile', true);
    }));
    root.querySelector('#voice-toggle').addEventListener('click', () => {
      store.set({ voiceEnabled: st.voiceEnabled === false ? true : false });
      navigateTo('#/profile', true);
    });
    root.querySelector('#edit-profile-btn').addEventListener('click', () => openEditProfileModal([
      { key: 'fullName', label: 'Full Name', value: F.fullName },
      { key: 'phone', label: 'Phone Number', value: F.phone },
      { key: 'location', label: 'Village / District', value: F.location },
    ]));
    root.querySelector('#logout-btn').addEventListener('click', () => {
      store.logout();
      toast('Logged out', { icon: 'logout' });
      navigateTo('#/login', true);
    });
  }

  return { html, mount };
}

/* ---------------- BUYER: HOME ---------------- */

function renderBuyerHome() {
  const buyer = currentBuyer();
  const myOffers = store.get().offers;
  const topLots = D.AVAILABLE_LOTS.slice(0, 3);
  const html = `<div class="page-photo-bg"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 flex items-start justify-between">
      <div>
        <h1 class="font-display text-2xl font-extrabold text-white drop-shadow-md">${greet(buyer.name)}</h1>
        <button id="locate-home-btn" class="inline-flex items-center gap-1.5 text-white/90 text-sm font-semibold mt-0.5 drop-shadow">${icon('pin', 'w-4 h-4')}<span id="locate-home-label">${buyer.location}</span> <span class="text-[10px] underline underline-offset-2 opacity-90">(update)</span></button>
        <div class="text-xs text-white/80 font-semibold mt-0.5 drop-shadow">${buyer.company}</div>
      </div>
      <div class="text-right bg-white/85 backdrop-blur rounded-xl px-2.5 py-1.5 shadow-soft shrink-0">
        <div class="text-xl font-extrabold text-primary">${buyer.weather}°C</div>
        <div class="text-[10px] text-muted-foreground font-semibold">Live</div>
      </div>
    </div>

    <div class="relative z-10 px-4 md:px-6 mt-5">
      <a href="#/browse" class="w-full flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3.5 shadow-soft hover:border-primary transition">
        <span class="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">${icon('package', 'w-4 h-4')}</span>
        <span class="text-muted-foreground text-sm font-medium flex-1">${t('Browse Lots')}</span>
        ${icon('chevronRight', 'w-4 h-4 text-muted-foreground')}
      </a>
    </div>

    <div class="px-4 md:px-6 mt-6 grid grid-cols-3 gap-3">
      ${[['package', D.AVAILABLE_LOTS.length, 'Lots Available'], ['clipboard', myOffers.length, 'Offers Sent'], ['star', buyer.reliability, 'Your Rating']].map(([ic, v, l]) => card(`
        <div class="text-center">
          <div class="flex justify-center text-primary mb-1">${icon(ic, 'w-4 h-4')}</div>
          <div class="text-lg font-extrabold">${v}</div>
          <div class="text-[10px] text-muted-foreground font-semibold">${t(l)}</div>
        </div>`)).join('')}
    </div>

    <div class="px-4 md:px-6 mt-6 flex items-center justify-between">
      <h2 class="font-display text-lg font-extrabold text-white drop-shadow-md">${t('Recommended Lots')}</h2>
      <a href="#/browse" class="text-xs font-bold text-white bg-primary/70 backdrop-blur px-2.5 py-1 rounded-full">${t('Browse All')}</a>
    </div>
    <div class="px-4 md:px-6 mt-2 space-y-3">
      ${topLots.map((l) => `
        <div class="card p-4 flex items-center gap-3">
          ${cropBadge(l.crop)}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold">${l.crop}</span>
              ${l.verified ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">${icon('badgeCheck', 'w-3 h-3')}${t('Verified')}</span>` : ''}
            </div>
            <div class="text-xs text-muted-foreground">${l.farmer}${l.fpo ? ` · ${l.fpo}` : ''}</div>
            <div class="text-xs text-muted-foreground">${l.quantity} ${l.unit} · ${l.grade} · ${l.distance}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-extrabold text-primary">${inr(l.askingPrice)}</div>
            <div class="text-[10px] text-muted-foreground">/${'quintal'}</div>
          </div>
        </div>`).join('')}
    </div>

    <div class="px-4 md:px-6 mt-6">
      <h2 class="font-display text-lg font-extrabold text-white drop-shadow-md mb-2">${t('🔔 Market Alerts')}</h2>
      <div class="space-y-3">
        ${D.ALERTS.slice(0, 2).map((a) => card(`
          <div class="flex items-start gap-3">
            ${icon('alert', `w-5 h-5 mt-0.5 ${a.level === 'HIGH' ? 'text-destructive' : a.level === 'MEDIUM' ? 'text-accent' : 'text-muted-foreground'}`)}
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm">${a.title}</div>
              <p class="text-sm text-muted-foreground mt-1">${a.desc}</p>
            </div>
          </div>`)).join('')}
      </div>
    </div>
  `);

  function mount(root) {
    wireLocateButton(root.querySelector('#locate-home-btn'), ({ location, weather }) => {
      store.updateUser({ location, ...(weather != null ? { weather } : {}) });
      navigateTo('#/', true);
    });
  }

  return { html, mount };
}

/* ---------------- BUYER: BROWSE LOTS ---------------- */

function renderBrowseLots() {
  const crops = ['All', ...new Set(D.AVAILABLE_LOTS.map((l) => l.crop))];
  const filterFarmer = sessionStorage.getItem('km:browse-farmer');
  sessionStorage.removeItem('km:browse-farmer');

  const html = pageWrap(`
    ${sectionHead('Browse Lots', 'Produce lots available from verified farmers &amp; FPOs')}
    <div class="px-4 md:px-6 flex gap-2 flex-wrap mb-4">
      ${crops.map((c, i) => `<button data-crop="${c}" class="crop-btn text-xs font-bold px-3 py-1.5 rounded-full border ${i === 0 ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}">${c}</button>`).join('')}
    </div>
    ${filterFarmer ? `<div class="px-4 md:px-6 mb-3"><span class="text-xs font-bold px-3 py-1.5 rounded-full bg-primary-light text-primary">Filtered by: ${filterFarmer} <button id="clear-farmer-filter" class="ml-1 font-bold">&times;</button></span></div>` : ''}
    <div class="px-4 md:px-6 space-y-3" id="lots-browse-list"></div>
  `);

  function lotHtml(l) {
    return `
      <div class="card p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-3">
            ${cropBadge(l.crop)}
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold">${l.crop}</span>
                ${l.verified ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">${icon('badgeCheck', 'w-3 h-3')}Verified</span>` : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Unverified</span>`}
              </div>
              <div class="text-xs text-muted-foreground">${l.farmer}${l.fpo ? ` · ${l.fpo}` : ''}</div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-extrabold text-primary">${inr(l.askingPrice)}</div>
            <div class="text-[10px] text-muted-foreground">per quintal</div>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
          <div class="bg-muted rounded-lg p-2"><div class="text-[9px] text-muted-foreground">Quantity</div><div class="font-bold">${l.quantity} ${l.unit}</div></div>
          <div class="bg-muted rounded-lg p-2"><div class="text-[9px] text-muted-foreground">Grade</div><div class="font-bold">${l.grade}</div></div>
          <div class="bg-muted rounded-lg p-2"><div class="text-[9px] text-muted-foreground">Distance</div><div class="font-bold">${l.distance}</div></div>
        </div>
        <div class="text-xs text-muted-foreground mt-2">${l.location} · Harvest ${l.harvestDate}</div>
        ${l.farmerLotId ? `<div class="text-[10px] font-semibold text-sky mt-1.5">${icon('trending', 'w-3 h-3 inline mr-0.5')}${t('Open for bidding — other buyers may be competing')}</div>` : ''}
        <button data-offer="${l.id}" class="w-full mt-3 bg-primary text-primary-foreground text-sm font-bold py-2.5 rounded-xl hover:opacity-90 transition">${l.farmerLotId ? t('Place Bid') : t('Make Offer')}</button>
      </div>`;
  }

  function mount(root) {
    let crop = 'All';
    let farmerFilter = filterFarmer;
    const list = root.querySelector('#lots-browse-list');
    function render() {
      const items = D.AVAILABLE_LOTS.filter((l) => (crop === 'All' || l.crop === crop) && (!farmerFilter || l.farmer === farmerFilter || l.fpo === farmerFilter));
      list.innerHTML = items.map(lotHtml).join('') || `<p class="text-center text-muted-foreground py-8">No lots match your filters.</p>`;
      list.querySelectorAll('[data-offer]').forEach((btn) => btn.addEventListener('click', () => {
        const lot = D.AVAILABLE_LOTS.find((x) => x.id === btn.dataset.offer);
        const bidding = !!lot.farmerLotId;
        openModal(`
          <div class="p-5">
            <h3 class="font-extrabold text-lg mb-1">${bidding ? 'Place a Bid' : 'Make an Offer'}</h3>
            <p class="text-sm text-muted-foreground mb-4">${lot.crop} · ${lot.quantity} ${lot.unit} from ${lot.farmer}${bidding ? ' — visible to the farmer alongside other buyers’ bids' : ''}</p>
            <label class="text-xs font-bold text-muted-foreground">${bidding ? 'Your Bid Price (per quintal)' : 'Your Offer Price (per quintal)'}</label>
            <input id="offer-price" type="number" value="${lot.askingPrice}" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3" />
            <label class="text-xs font-bold text-muted-foreground">Quantity Required (${lot.unit})</label>
            <input id="offer-qty" type="number" value="${lot.quantity}" max="${lot.quantity}" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-4" />
            <div class="flex gap-2">
              <button data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">Cancel</button>
              <button id="send-offer" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">${bidding ? 'Submit Bid' : 'Send Offer'}</button>
            </div>
          </div>`, {
          onMount: (m) => m.querySelector('#send-offer').addEventListener('click', () => {
            const price = Number(m.querySelector('#offer-price').value) || lot.askingPrice;
            const qty = Number(m.querySelector('#offer-qty').value) || lot.quantity;
            store.addOffer({
              id: 'OFR-' + Math.floor(1000 + Math.random() * 9000),
              lotId: lot.id, farmerLotId: lot.farmerLotId || null, crop: lot.crop, farmer: lot.farmer, quantity: qty, unit: lot.unit,
              price, amount: price * qty, status: 'Pending', date: new Date().toDateString().slice(4),
              buyer: currentBuyer().company, buyerId: D.BUYERS.find((b) => b.name === currentBuyer().company)?.id || null,
            });
            closeModal();
            toast(bidding ? `Bid submitted on ${lot.farmer}'s lot` : `Offer sent to ${lot.farmer}`, { tone: 'success', icon: 'checkCircle' });
            navigateTo('#/offers', true);
          }),
        });
      }));
    }
    root.querySelectorAll('.crop-btn').forEach((b) => b.addEventListener('click', () => {
      crop = b.dataset.crop;
      root.querySelectorAll('.crop-btn').forEach((x) => x.className = `crop-btn text-xs font-bold px-3 py-1.5 rounded-full border ${x === b ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`);
      render();
    }));
    const clearBtn = root.querySelector('#clear-farmer-filter');
    if (clearBtn) clearBtn.addEventListener('click', () => { farmerFilter = null; navigateTo('#/browse', true); });
    render();
  }

  return { html, mount };
}

/* ---------------- BUYER: MY OFFERS ---------------- */

function offerStatusTone(status) {
  if (status === 'Accepted') return 'bg-primary/10 text-primary';
  if (status === 'Declined') return 'bg-destructive/10 text-destructive';
  return 'bg-accent/20 text-accent-foreground';
}

function renderMyOffers() {
  const html = pageWrap(`
    ${sectionHead('My Offers', 'Track offers you have sent to farmers &amp; FPOs')}
    <div class="px-4 md:px-6 space-y-3" id="offers-list"></div>
  `);

  function offerHtml(o) {
    return `
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-bold">${o.crop} · ${o.quantity} ${o.unit}</div>
            <div class="text-xs text-muted-foreground">${o.id} · ${o.farmer} · ${o.date}</div>
          </div>
          <span class="text-[10px] font-bold px-2 py-1 rounded-full ${offerStatusTone(o.status)}">${o.status}</span>
        </div>
        <div class="flex items-center justify-between text-sm mt-2">
          <span class="text-muted-foreground">Offer: <b class="text-foreground">${inr(o.price)}/qtl</b></span>
          <span class="font-extrabold text-primary">${inr(o.amount)}</span>
        </div>
        ${o.status === 'Pending' ? `<button data-check="${o.id}" class="w-full mt-3 border border-primary text-primary text-sm font-bold py-2 rounded-lg hover:bg-primary-light transition">Check Farmer Response</button>` : ''}
      </div>`;
  }

  function mount(root) {
    const list = root.querySelector('#offers-list');
    function render() {
      const offers = store.get().offers;
      list.innerHTML = offers.length ? offers.map(offerHtml).join('') : `<p class="text-center text-muted-foreground py-10">No offers sent yet. Browse Lots to make your first offer.</p>`;
      list.querySelectorAll('[data-check]').forEach((btn) => btn.addEventListener('click', () => {
        const accepted = Math.random() > 0.3;
        store.updateOfferStatus(btn.dataset.check, accepted ? 'Accepted' : 'Declined');
        toast(accepted ? 'Offer accepted by farmer!' : 'Farmer declined this offer.', { tone: accepted ? 'success' : 'error', icon: accepted ? 'checkCircle' : 'alert' });
        render();
      }));
    }
    render();
  }

  return { html, mount };
}

/* ---------------- BUYER: VERIFIED FARMERS & FPOS ---------------- */

function renderFarmerSuppliers() {
  const html = pageWrap(`
    ${sectionHead('Verified Farmers & FPOs', 'Reliable sources matched to what you source')}
    <div class="px-4 md:px-6 space-y-3" id="suppliers-list">
      ${D.FARMER_SUPPLIERS.map((s) => `
        <div class="card p-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold">${s.name}</span>
                ${s.verified ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">${icon('badgeCheck', 'w-3 h-3')}Verified</span>` : `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Unverified</span>`}
              </div>
              <div class="text-xs text-muted-foreground mt-0.5">${s.type}${s.members ? ` · ${s.members} members` : ''}</div>
              <div class="mt-1">${stars(s.reliability)} <span class="text-xs text-muted-foreground">reliability</span></div>
            </div>
          </div>
          <div class="flex gap-1.5 flex-wrap mt-2">${s.crops.map((c) => `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">${c}</span>`).join('')}</div>
          <div class="text-xs text-muted-foreground mt-2">Volume: <b class="text-foreground">${s.volume}</b></div>
          <button data-view="${s.name}" class="w-full mt-3 border border-primary text-primary text-sm font-bold py-2 rounded-lg hover:bg-primary-light transition">View Their Lots</button>
        </div>`).join('')}
    </div>
  `);

  function mount(root) {
    root.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => {
      sessionStorage.setItem('km:browse-farmer', btn.dataset.view);
      navigateTo('#/browse', true);
    }));
  }

  return { html, mount };
}

/* ---------------- FPO OPERATOR: HOME ---------------- */

function fpoLotStatusTone(status) {
  if (status === 'Sold') return 'bg-secondary/15 text-secondary';
  if (status === 'Pending Pickup') return 'bg-accent/20 text-accent-foreground';
  return 'bg-primary/10 text-primary';
}

function renderFpoOperatorHome() {
  const op = currentFpoOperator();
  const F = D.FPO_INFO;
  const memberLots = D.FPO_MEMBER_LOTS;
  const pooledVolume = memberLots.filter((m) => m.status !== 'Sold').reduce((s, m) => s + m.quantity, 0);
  const html = `<div class="page-photo-bg"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 flex items-start justify-between">
      <div>
        <h1 class="font-display text-2xl font-extrabold text-white drop-shadow-md">${greet(op.name)}</h1>
        <div class="text-xs text-white/90 font-semibold mt-0.5 drop-shadow">${op.designation} · ${F.name}</div>
        <div class="inline-flex items-center gap-1.5 text-white/90 text-sm font-semibold mt-1 drop-shadow">${icon('pin', 'w-4 h-4')}${op.location}</div>
      </div>
      <div class="text-right bg-white/85 backdrop-blur rounded-xl px-2.5 py-1.5 shadow-soft shrink-0">
        <div class="text-xl font-extrabold text-primary">${op.weather}°C</div>
        <div class="text-[10px] text-muted-foreground font-semibold">Live</div>
      </div>
    </div>

    <div class="px-4 md:px-6 mt-6 grid grid-cols-3 gap-3">
      ${[['users', F.members, 'Members'], ['package', pooledVolume, 'Qtl Pooled Now'], ['trending', F.bargainGain.split(' ')[0], 'Avg. FPO Gain']].map(([ic, v, l]) => card(`
        <div class="text-center">
          <div class="flex justify-center text-primary mb-1">${icon(ic, 'w-4 h-4')}</div>
          <div class="text-lg font-extrabold">${v}</div>
          <div class="text-[10px] text-muted-foreground font-semibold">${t(l)}</div>
        </div>`)).join('')}
    </div>

    <div class="px-4 md:px-6 mt-6">
      <a href="#/buyers" class="w-full flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3.5 shadow-soft hover:border-primary transition">
        <span class="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">${icon('users', 'w-4 h-4')}</span>
        <span class="text-muted-foreground text-sm font-medium flex-1">${t('Find buyers for pooled lots')}</span>
        ${icon('chevronRight', 'w-4 h-4 text-muted-foreground')}
      </a>
    </div>

    <div class="px-4 md:px-6 mt-6 flex items-center justify-between">
      <h2 class="font-display text-lg font-extrabold text-white drop-shadow-md">${t('Recently Pooled Lots')}</h2>
      <a href="#/fpo-members" class="text-xs font-bold text-white bg-primary/70 backdrop-blur px-2.5 py-1 rounded-full">${t('View All')}</a>
    </div>
    <div class="px-4 md:px-6 mt-2 space-y-3">
      ${memberLots.slice(0, 4).map((m) => `
        <div class="card p-4 flex items-center gap-3">
          ${cropBadge(m.crop)}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold">${m.farmer}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${fpoLotStatusTone(m.status)}">${m.status}</span>
            </div>
            <div class="text-xs text-muted-foreground">${m.crop} · ${m.quantity} ${m.unit} · ${m.grade}</div>
          </div>
        </div>`).join('')}
    </div>

    <div class="px-4 md:px-6 mt-6">
      <h2 class="font-display text-lg font-extrabold text-white drop-shadow-md mb-2">${t('🔔 Market Alerts')}</h2>
      <div class="space-y-3">
        ${D.ALERTS.slice(0, 2).map((a) => card(`
          <div class="flex items-start gap-3">
            ${icon('alert', `w-5 h-5 mt-0.5 ${a.level === 'HIGH' ? 'text-destructive' : a.level === 'MEDIUM' ? 'text-accent' : 'text-muted-foreground'}`)}
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm">${a.title}</div>
              <p class="text-sm text-muted-foreground mt-1">${a.desc}</p>
            </div>
          </div>`)).join('')}
      </div>
    </div>
  `);

  return { html };
}

/* ---------------- FPO OPERATOR: MEMBERS & POOLED LOTS ---------------- */

function renderFpoMembers() {
  const F = D.FPO_INFO;
  const crops = ['All', ...new Set(D.FPO_MEMBER_LOTS.map((m) => m.crop))];
  const totalVolume = D.FPO_MEMBER_LOTS.reduce((s, m) => s + m.quantity, 0);
  const html = `<div class="page-photo-bg" style="background-image:url('./assets/members-hero.jpg')"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2">
      <h1 class="font-display text-2xl md:text-3xl font-extrabold text-white drop-shadow-md">${t('Members & Pooled Lots')}</h1>
      <p class="text-white/90 mt-1 drop-shadow">${t('Every member farmer and what they have contributed to this FPO')}</p>
    </div>
    <div class="px-4 md:px-6 grid grid-cols-3 gap-3 mb-4 mt-3">
      ${[[F.members, 'Members'], [totalVolume, 'Total Qtl'], [new Set(D.FPO_MEMBER_LOTS.map((m) => m.farmer)).size, 'Active Contributors']].map(([v, l]) => card(`<div class="text-center"><div class="text-lg font-extrabold text-primary">${v}</div><div class="text-[10px] text-muted-foreground font-semibold mt-0.5">${t(l)}</div></div>`)).join('')}
    </div>
    <div class="px-4 md:px-6 flex gap-2 flex-wrap mb-4">
      ${crops.map((c, i) => `<button data-crop="${c}" class="crop-btn text-xs font-bold px-3 py-1.5 rounded-full border shadow-soft ${i === 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/95 backdrop-blur border-border text-muted-foreground'}">${c}</button>`).join('')}
    </div>
    <div class="px-4 md:px-6 space-y-3" id="members-list"></div>
  `);

  function memberHtml(m) {
    return `
      <div class="card p-4 flex items-center gap-3">
        ${cropBadge(m.crop)}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold">${m.farmer}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${fpoLotStatusTone(m.status)}">${m.status}</span>
          </div>
          <div class="text-xs text-muted-foreground">${m.crop} · ${m.quantity} ${m.unit} · ${m.grade}</div>
          <div class="text-xs text-muted-foreground">${m.id} · Pooled ${m.pooledDate}</div>
        </div>
      </div>`;
  }

  function mount(root) {
    let crop = 'All';
    const list = root.querySelector('#members-list');
    function render() {
      const items = D.FPO_MEMBER_LOTS.filter((m) => crop === 'All' || m.crop === crop);
      list.innerHTML = items.map(memberHtml).join('') || `<p class="text-center text-muted-foreground py-8">No pooled lots for this crop yet.</p>`;
    }
    root.querySelectorAll('.crop-btn').forEach((b) => b.addEventListener('click', () => {
      crop = b.dataset.crop;
      root.querySelectorAll('.crop-btn').forEach((x) => x.className = `crop-btn text-xs font-bold px-3 py-1.5 rounded-full border shadow-soft ${x === b ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/95 backdrop-blur border-border text-muted-foreground'}`);
      render();
    }));
    render();
  }

  return { html, mount };
}

/* ---------------- FPO OPERATOR: PROFILE ---------------- */

function renderFpoOperatorProfile() {
  const op = currentFpoOperator();
  const F = D.FPO_INFO;
  const st = store.get();
  const html = `<div class="page-photo-bg" style="background-image:url('./assets/members-hero.jpg')"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2">
      <h1 class="font-display text-2xl md:text-3xl font-extrabold text-white drop-shadow-md">${t('Profile')}</h1>
      <p class="text-white/90 mt-1 drop-shadow">${t('Your FPO account, language &amp; voice preferences')}</p>
    </div>
    <div class="px-4 md:px-6">
      ${card(`
        <div class="flex items-center gap-3">
          <div class="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-extrabold shrink-0">${initials(op.fullName)}</div>
          <div class="flex-1 min-w-0">
            <div class="font-extrabold text-lg">${op.fullName}</div>
            <div class="text-xs text-muted-foreground font-semibold">${op.designation} · ${F.name}</div>
            <div class="text-xs text-muted-foreground">${op.phone} · ${op.location}</div>
          </div>
          <button id="edit-profile-btn" class="text-xs font-bold text-primary shrink-0 inline-flex items-center gap-1">${icon('edit', 'w-3.5 h-3.5')}${t('Edit Profile')}</button>
        </div>
      `)}
    </div>

    <div class="px-4 md:px-6 mt-5 grid grid-cols-3 gap-3">
      ${[[F.members, 'Members'], [D.FPO_MEMBER_LOTS.reduce((s, m) => s + m.quantity, 0), 'Qtl Pooled'], [F.bargainGain.split(' ')[0], 'Avg. Gain']].map(([v, l]) => card(`<div class="text-center"><div class="text-lg font-extrabold text-primary">${v}</div><div class="text-[10px] text-muted-foreground font-semibold mt-0.5">${t(l)}</div></div>`)).join('')}
    </div>

    <div class="px-4 md:px-6 mt-6">
      <h3 class="font-extrabold mb-3 flex items-center gap-2 text-white drop-shadow-md">${icon('languages', 'w-4 h-4')}${t('Language')}</h3>
      ${card(`
        <div class="grid grid-cols-3 gap-2">
          ${['English', 'हिंदी', 'मराठी'].map((l) => `<button data-lang="${l}" class="lang-btn text-sm font-bold py-2.5 rounded-xl border ${st.language === l ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}">${l}</button>`).join('')}
        </div>
      `)}
    </div>

    <div class="px-4 md:px-6 mt-5">
      ${card(`
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 font-bold text-sm">${icon('mic', 'w-4 h-4 text-primary')}${t('Tap &amp; Speak (Voice Queries)')}</div>
          <button id="voice-toggle" class="w-12 h-7 rounded-full ${st.voiceEnabled === false ? 'bg-muted' : 'bg-primary'} relative transition">
            <span class="absolute top-0.5 ${st.voiceEnabled === false ? 'left-0.5' : 'left-5'} w-6 h-6 bg-white rounded-full shadow transition-all"></span>
          </button>
        </div>
      `)}
    </div>

    <div class="px-4 md:px-6 mt-6">
      <button id="logout-btn" class="w-full inline-flex items-center justify-center gap-2 border border-destructive/40 text-destructive font-bold py-3 rounded-xl hover:bg-destructive/10 transition">${icon('logout', 'w-4 h-4')}${t('Log Out')}</button>
    </div>
    ${prototypeDisclaimerHtml()}
  `);

  function mount(root) {
    root.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => {
      store.setLanguage(b.dataset.lang);
      toast(`Language set to ${b.dataset.lang}`, { tone: 'success', icon: 'languages' });
      navigateTo('#/profile', true);
    }));
    root.querySelector('#voice-toggle').addEventListener('click', () => {
      store.set({ voiceEnabled: st.voiceEnabled === false ? true : false });
      navigateTo('#/profile', true);
    });
    root.querySelector('#edit-profile-btn').addEventListener('click', () => openEditProfileModal([
      { key: 'fullName', label: 'Full Name', value: op.fullName },
      { key: 'designation', label: 'Designation', value: op.designation },
      { key: 'phone', label: 'Phone Number', value: op.phone },
      { key: 'location', label: 'Location', value: op.location },
    ]));
    root.querySelector('#logout-btn').addEventListener('click', () => {
      store.logout();
      toast('Logged out', { icon: 'logout' });
      navigateTo('#/login', true);
    });
  }

  return { html, mount };
}

/* ---------------- BUYER: PROFILE ---------------- */

function renderBuyerProfile() {
  const B = currentBuyer();
  const st = store.get();
  const offers = st.offers;
  const accepted = offers.filter((o) => o.status === 'Accepted');
  const volumeSourced = accepted.reduce((sum, o) => sum + (Number(o.quantity) || 0), 0);
  // The demo buyer account maps 1:1 onto a BUYERS entry (same company name) — when it
  // matches, we can show the buyer their own real business type, sourcing crops and the
  // same KYC/verification checklist farmers see when they look this buyer up. A freshly
  // signed-up buyer with no match instead gets a "complete verification" prompt.
  const matched = D.BUYERS.find((b) => b.name === B.company);
  const sourcingCrops = matched ? matched.crops : [...new Set(offers.map((o) => o.crop))];

  const html = `<div class="page-photo-bg" style="background-image:url('./assets/buyer-profile-hero.jpg')"></div>` + pageWrap(`
    <div class="relative z-10 px-4 md:px-6 pt-6 pb-2">
      <h1 class="font-display text-2xl md:text-3xl font-extrabold text-white drop-shadow-md">${t('Profile')}</h1>
      <p class="text-white/90 mt-1 drop-shadow">${t('Your business account, language &amp; voice preferences')}</p>
    </div>
    <div class="px-4 md:px-6">
      ${card(`
        <div class="flex items-center gap-3">
          <div class="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-extrabold shrink-0">${initials(B.fullName)}</div>
          <div class="min-w-0 flex-1">
            <div class="font-extrabold text-lg">${B.fullName}</div>
            <div class="text-xs text-muted-foreground font-semibold">${B.company}${matched ? ` · ${matched.type}` : ''}</div>
            <div class="text-xs text-muted-foreground">${B.phone} · ${B.location}</div>
          </div>
          <div class="flex flex-col items-end gap-1.5 shrink-0">
            ${B.verified ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-primary/10 text-primary">${icon('badgeCheck', 'w-3 h-3')}${t('Verified')}</span>` : ''}
            <button id="edit-profile-btn" class="text-xs font-bold text-primary inline-flex items-center gap-1">${icon('edit', 'w-3.5 h-3.5')}${t('Edit Profile')}</button>
          </div>
        </div>
        ${sourcingCrops.length ? `<div class="flex gap-1.5 flex-wrap mt-3">${sourcingCrops.map((c) => `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">${t('Sources')} ${c}</span>`).join('')}</div>` : ''}
      `)}
    </div>

    <div class="px-4 md:px-6 mt-5 grid grid-cols-3 gap-3">
      ${[[offers.length, 'Offers Sent'], [accepted.length, 'Lots Won'], [volumeSourced || (matched ? matched.volume : 0), volumeSourced ? 'Qtl Sourced' : 'Volume/Month']].map(([v, l]) => card(`<div class="text-center"><div class="text-lg font-extrabold text-primary">${v}</div><div class="text-[10px] text-muted-foreground font-semibold mt-0.5">${t(l)}</div></div>`)).join('')}
    </div>

    <div class="px-4 md:px-6 mt-6">
      <h3 class="font-extrabold mb-3 flex items-center gap-2 text-white drop-shadow-md">${icon('shield', 'w-4 h-4')}${t('Business Verification')}</h3>
      ${card(matched ? `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">${icon('badgeCheck', 'w-5 h-5')}</div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-sm">${t('GSTIN, PAN &amp; business KYC verified')}</div>
            <div class="text-xs text-muted-foreground mt-0.5">${t('Payment score')} ${matched.kyc?.paymentScore ?? '—'}/100 · ${matched.kyc?.transactions ?? 0} ${t('past orders')}</div>
          </div>
          <button id="view-my-verification" class="text-xs font-bold text-primary shrink-0">${t('View')}</button>
        </div>` : `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0 text-accent-foreground">${icon('alert', 'w-5 h-5')}</div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-sm">${t('Business verification pending')}</div>
            <div class="text-xs text-muted-foreground mt-0.5">${t('Verified buyers get priority on farmer offers')}</div>
          </div>
          <button id="start-verification" class="text-xs font-bold text-primary shrink-0">${t('Start')}</button>
        </div>`)}
    </div>

    <div class="px-4 md:px-6 mt-6">
      <h3 class="font-extrabold mb-3 flex items-center gap-2 text-white drop-shadow-md">${icon('languages', 'w-4 h-4')}${t('Language')}</h3>
      ${card(`
        <div class="grid grid-cols-3 gap-2">
          ${['English', 'हिंदी', 'मराठी'].map((l) => `<button data-lang="${l}" class="lang-btn text-sm font-bold py-2.5 rounded-xl border ${st.language === l ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}">${l}</button>`).join('')}
        </div>
      `)}
    </div>

    <div class="px-4 md:px-6 mt-5">
      ${card(`
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 font-bold text-sm">${icon('mic', 'w-4 h-4 text-primary')}${t('Tap &amp; Speak (Voice Queries)')}</div>
          <button id="voice-toggle" class="w-12 h-7 rounded-full ${st.voiceEnabled === false ? 'bg-muted' : 'bg-primary'} relative transition">
            <span class="absolute top-0.5 ${st.voiceEnabled === false ? 'left-0.5' : 'left-5'} w-6 h-6 bg-white rounded-full shadow transition-all"></span>
          </button>
        </div>
      `)}
    </div>

    <div class="px-4 md:px-6 mt-6">
      <button id="logout-btn" class="w-full inline-flex items-center justify-center gap-2 border border-destructive/40 text-destructive font-bold py-3 rounded-xl hover:bg-destructive/10 transition">${icon('logout', 'w-4 h-4')}${t('Log Out')}</button>
    </div>
    ${prototypeDisclaimerHtml()}
  `);

  function mount(root) {
    root.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => {
      store.setLanguage(b.dataset.lang);
      toast(`Language set to ${b.dataset.lang}`, { tone: 'success', icon: 'languages' });
      navigateTo('#/profile', true);
    }));
    const voiceBtn = root.querySelector('#voice-toggle');
    if (voiceBtn) voiceBtn.addEventListener('click', () => {
      store.set({ voiceEnabled: st.voiceEnabled === false ? true : false });
      navigateTo('#/profile', true);
    });
    const verifyBtn = root.querySelector('#view-my-verification');
    if (verifyBtn) verifyBtn.addEventListener('click', () => openBuyerVerification(matched));
    const startBtn = root.querySelector('#start-verification');
    if (startBtn) startBtn.addEventListener('click', () => toast('Verification request submitted — our team will reach out within 2 business days.', { tone: 'success', icon: 'shield' }));
    root.querySelector('#edit-profile-btn').addEventListener('click', () => openEditProfileModal([
      { key: 'fullName', label: 'Full Name', value: B.fullName },
      { key: 'company', label: 'Company', value: B.company },
      { key: 'phone', label: 'Phone Number', value: B.phone },
      { key: 'location', label: 'Location', value: B.location },
    ]));
    root.querySelector('#logout-btn').addEventListener('click', () => {
      store.logout();
      toast('Logged out', { icon: 'logout' });
      navigateTo('#/login', true);
    });
  }

  return { html, mount };
}

/* ---------------- LOGIN ---------------- */

function renderLogin() {
  const html = `
    <div class="page-photo-bg"></div>
    <div class="min-h-screen flex flex-col page-enter relative">
      <div class="relative z-10 flex flex-col items-center px-4 pt-10 pb-6 shrink-0">
        <div class="w-16 h-16 rounded-2xl bg-white/95 backdrop-blur flex items-center justify-center shadow-soft mb-2">${kisanMitraMark('w-12 h-12')}</div>
        <h1 class="font-display text-3xl font-extrabold text-white drop-shadow-md">Kisan Mitra</h1>
        <p class="text-white/90 text-xs font-semibold text-center mt-1 max-w-[280px] drop-shadow">${t('Market intelligence &amp; buyer matching for better price realisation')}</p>
      </div>

      <div class="flex-1 flex items-start justify-center px-4 relative z-10 pb-10">
        <div class="w-full max-w-sm">
          <div class="grid grid-cols-3 gap-2 mb-4">
            <button data-role="farmer" class="role-card flex flex-col items-center gap-1.5 py-3 px-1" data-active="true">
              <img src="./assets/people/farmer.jpg" alt="Farmer" class="role-avatar" />
              <span class="font-display font-bold text-xs text-center">${t('Farmer')}</span>
              <span class="text-[9px] text-center">${t('Sell my produce')}</span>
            </button>
            <button data-role="buyer" class="role-card flex flex-col items-center gap-1.5 py-3 px-1" data-active="false">
              <img src="./assets/people/buyer.jpg" alt="Buyer" class="role-avatar" />
              <span class="font-display font-bold text-xs text-center">${t('Buyer')}</span>
              <span class="text-[9px] text-center">${t('Source produce')}</span>
            </button>
            <button data-role="fpo_operator" class="role-card flex flex-col items-center gap-1.5 py-3 px-1" data-active="false">
              <img src="./assets/people/fpo-operator.jpg" alt="FPO Operator" class="role-avatar" />
              <span class="font-display font-bold text-xs text-center">${t('FPO Operator')}</span>
              <span class="text-[9px] text-center">${t('Pool &amp; sell lots')}</span>
            </button>
          </div>

          <div class="card p-5 shadow-soft bg-white/95 backdrop-blur">
            <div class="grid grid-cols-2 bg-muted rounded-xl p-1 mb-4">
              <button type="button" data-mode="signup" class="mode-btn rounded-lg py-2 text-sm font-bold transition">${t('Create Account')}</button>
              <button type="button" data-mode="login" class="mode-btn rounded-lg py-2 text-sm font-bold transition">${t('Log In')}</button>
            </div>
            <div id="login-fields" class="space-y-3"></div>
            <p id="form-error" class="hidden text-xs font-bold text-destructive bg-destructive/10 rounded-lg px-3 py-2 mt-3"></p>
            <button id="login-submit" class="w-full mt-4 bg-primary text-primary-foreground font-display font-bold py-3 rounded-xl hover:opacity-90 transition shadow-soft"></button>
            <div class="flex items-center gap-2 my-4">
              <div class="h-px flex-1 bg-border"></div><span class="text-[10px] text-muted-foreground font-bold">OR</span><div class="h-px flex-1 bg-border"></div>
            </div>
            <button id="demo-login" class="w-full border-2 border-primary/30 text-primary font-bold py-2.5 rounded-xl hover:bg-primary-light transition text-sm"></button>
          </div>
          <p class="text-center text-xs text-white/90 font-semibold drop-shadow mt-4">${t('Prototype sign-in — account data stays in this browser only. Please don’t use a real password.')}</p>
          <p class="text-center text-[10px] text-white/75 font-semibold drop-shadow mt-2">${t('Prototype for SIH 2026 (Problem 26132) — prices, buyers, offers &amp; verification shown are illustrative mock data, not live transactions.')}</p>
        </div>
      </div>
    </div>`;

  function mount(root) {
    let role = 'farmer';
    let mode = 'signup';
    const fieldsEl = root.querySelector('#login-fields');
    const roleBtns = root.querySelectorAll('.role-card');
    const modeBtns = root.querySelectorAll('.mode-btn');
    const demoBtn = root.querySelector('#demo-login');
    const submitBtn = root.querySelector('#login-submit');
    const errorEl = root.querySelector('#form-error');

    const passwordField = (id, label) => `
      <div>
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold text-muted-foreground">${t(label)}</label>
          <button type="button" data-toggle-pw="${id}" class="text-[11px] font-bold text-primary">${icon('eye', 'w-3.5 h-3.5')}</button>
        </div>
        <input id="${id}" type="password" placeholder="••••••••" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1" />
      </div>`;

    function fieldsHtml() {
      const locationField = `
        <div>
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-muted-foreground">${t(role === 'farmer' ? 'Village / District' : 'Location')}</label>
            <button type="button" id="locate-btn" class="text-[11px] font-bold text-primary inline-flex items-center gap-1">${icon('pin', 'w-3 h-3')}${t('Use my current location')}</button>
          </div>
          <input id="lf-location" placeholder="e.g. Nashik, Maharashtra" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1" />
        </div>`;

      if (mode === 'login') {
        return `
          <div><label class="text-xs font-bold text-muted-foreground">${t('Phone Number')}</label><input id="lf-phone" placeholder="+91 98765 43210" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1" /></div>
          ${passwordField('lf-password', 'Password')}`;
      }

      const namePlaceholder = role === 'farmer' ? 'e.g. Ramesh Patil' : role === 'fpo_operator' ? 'e.g. Vikram Kulkarni' : 'e.g. Anjali Shah';
      const phonePlaceholder = role === 'farmer' ? '+91 98765 43210' : role === 'fpo_operator' ? '+91 99887 66554' : '+91 91234 56789';
      const companyField = role === 'buyer'
        ? `<div><label class="text-xs font-bold text-muted-foreground">${t('Company / Firm')}</label><input id="lf-company" placeholder="e.g. AgroFresh Exports Pvt Ltd" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1" /></div>`
        : role === 'fpo_operator'
        ? `<div><label class="text-xs font-bold text-muted-foreground">${t('FPO Name')}</label><input id="lf-fpo" placeholder="e.g. Nashik Valley Farmers FPO" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1" /></div>`
        : '';
      return `
        <div><label class="text-xs font-bold text-muted-foreground">${t('Full Name')}</label><input id="lf-name" placeholder="${namePlaceholder}" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1" /></div>
        <div><label class="text-xs font-bold text-muted-foreground">${t('Phone Number')}</label><input id="lf-phone" placeholder="${phonePlaceholder}" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1" /></div>
        ${companyField}
        ${locationField}
        ${passwordField('lf-password', 'Password')}
        ${passwordField('lf-password2', 'Confirm Password')}`;
    }

    let liveWeather = null;

    function wireExtras() {
      const locateBtn = fieldsEl.querySelector('#locate-btn');
      const locationInput = fieldsEl.querySelector('#lf-location');
      if (locateBtn) {
        wireLocateButton(locateBtn, ({ location, weather }) => {
          locationInput.value = location;
          if (weather != null) liveWeather = weather;
        });
      }
      fieldsEl.querySelectorAll('[data-toggle-pw]').forEach((btn) => btn.addEventListener('click', () => {
        const input = fieldsEl.querySelector(`#${btn.dataset.togglePw}`);
        input.type = input.type === 'password' ? 'text' : 'password';
      }));
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    }
    function clearError() { errorEl.classList.add('hidden'); errorEl.textContent = ''; }

    function styleButtons() {
      roleBtns.forEach((b) => { b.dataset.active = String(b.dataset.role === role); });
      modeBtns.forEach((b) => { b.className = `mode-btn rounded-lg py-2 text-sm font-bold transition ${b.dataset.mode === mode ? 'bg-card shadow text-primary' : 'text-muted-foreground'}`; });
      submitBtn.textContent = mode === 'signup' ? t('Create my account') : t('Log In');
      demoBtn.textContent = role === 'farmer' ? 'Try Demo Farmer Account (Ramesh Patil)'
        : role === 'fpo_operator' ? 'Try Demo FPO Operator Account (Vikram Kulkarni)'
        : 'Try Demo Buyer Account (AgroFresh Exports)';
    }

    const ROLE_LABEL = { farmer: 'Farmer', buyer: 'Buyer', fpo_operator: 'FPO Operator' };
    let busy = false;

    // Hashing takes a moment (deliberately), so lock the form while it runs.
    function setBusy(on) {
      busy = on;
      submitBtn.disabled = on;
      demoBtn.disabled = on;
      if (on) submitBtn.textContent = t('Please wait…'); else styleButtons();
    }

    function doLogin(user) {
      // Credentials must never end up in the session object.
      const { password, passwordHash, ...session } = user;
      store.login(session);
      toast(`Welcome, ${session.name}!`, { tone: 'success', icon: 'checkCircle' });
      navigateTo('#/', true);
    }

    async function ensureAccount(defaults, password) {
      let account = store.findAccount(defaults.phone);
      if (!account) {
        account = { ...defaults, passwordHash: await hashPassword(password) };
        store.createAccount(account);
      }
      return account;
    }

    roleBtns.forEach((b) => b.addEventListener('click', () => {
      role = b.dataset.role; liveWeather = null;
      fieldsEl.innerHTML = fieldsHtml(); styleButtons(); wireExtras(); clearError();
    }));

    modeBtns.forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode; liveWeather = null;
      fieldsEl.innerHTML = fieldsHtml(); styleButtons(); wireExtras(); clearError();
    }));

    submitBtn.addEventListener('click', async () => {
      if (busy) return;
      clearError();
      const phone = fieldsEl.querySelector('#lf-phone').value.trim();
      const password = fieldsEl.querySelector('#lf-password').value;

      try {
        if (mode === 'login') {
          if (!phone || !password) { showError('Enter your phone number and password.'); return; }
          const account = store.findAccount(phone);
          if (!account) { showError('No account found with this phone number. Create one first.'); return; }
          if (account.role && account.role !== role) {
            showError(`This number is registered as a ${ROLE_LABEL[account.role] || account.role}. Choose "${ROLE_LABEL[account.role] || account.role}" above to log in.`);
            return;
          }
          setBusy(true);
          const ok = await verifyPassword(password, account.passwordHash ?? account.password);
          if (!ok) { setBusy(false); showError('Incorrect password. Try again.'); return; }
          // Accounts made before hashing existed stored the password as typed — upgrade on first login.
          if (!account.passwordHash) store.updateAccount(account.phone, { passwordHash: await hashPassword(password), password: undefined });
          setBusy(false);
          doLogin(account);
          return;
        }

        const fullName = fieldsEl.querySelector('#lf-name').value.trim().replace(/\s+/g, ' ');
        const password2 = fieldsEl.querySelector('#lf-password2').value;
        if (!fullName || !phone || !password || !password2) { showError('Please fill in every field.'); return; }
        if (fullName.length < 2 || fullName.length > 60) { showError('Enter your full name (2–60 characters).'); return; }
        if (!isValidIndianMobile(phone)) { showError('Enter a valid 10-digit mobile number (starting 6–9).'); return; }
        if (password.length < 6) { showError('Password must be at least 6 characters.'); return; }
        if (password.length > 128) { showError('Password must be 128 characters or fewer.'); return; }
        if (password !== password2) { showError('Passwords do not match.'); return; }
        if (store.findAccount(phone)) { showError('An account with this phone number already exists. Log in instead.'); return; }

        const base = role === 'farmer' ? D.DEFAULT_FARMER : role === 'fpo_operator' ? D.DEFAULT_FPO_OPERATOR : D.DEFAULT_BUYER;
        const clip = (v, max) => String(v || '').trim().slice(0, max);
        const location = clip(fieldsEl.querySelector('#lf-location').value, 80) || base.location;
        const extra = role === 'buyer' ? { company: clip(fieldsEl.querySelector('#lf-company')?.value, 80) || base.company }
          : role === 'fpo_operator' ? { fpo: clip(fieldsEl.querySelector('#lf-fpo')?.value, 80) || base.fpo }
          : {};
        const weatherPatch = liveWeather != null ? { weather: liveWeather } : {};
        setBusy(true);
        const passwordHash = await hashPassword(password);
        const account = { ...base, ...extra, fullName, name: fullName.split(' ')[0], phone, location, passwordHash, ...weatherPatch };
        store.createAccount(account);
        setBusy(false);
        doLogin(account);
      } catch (err) {
        console.error('Sign-in failed', err);
        setBusy(false);
        showError('Something went wrong while signing in. Please try again.');
      }
    });

    demoBtn.addEventListener('click', async () => {
      if (busy) return;
      try {
        setBusy(true);
        const base = role === 'farmer' ? D.DEFAULT_FARMER : role === 'fpo_operator' ? D.DEFAULT_FPO_OPERATOR : D.DEFAULT_BUYER;
        const account = await ensureAccount(base, 'demo123');
        setBusy(false);
        doLogin(account);
      } catch (err) {
        console.error('Demo sign-in failed', err);
        setBusy(false);
        showError('Could not start the demo account. Please try again.');
      }
    });

    fieldsEl.innerHTML = fieldsHtml();
    styleButtons();
    wireExtras();
  }

  return { html, mount };
}

/* ---------------- AI ASSISTANT ---------------- */

// Returns the string matching the app's current language (falls back to English), so the
// assistant's replies — not just its UI chrome — are genuinely spoken/read in Hindi/Marathi.
function pick(en, hi, mr) {
  const code = currentLangCode();
  return code === 'hi' ? hi : code === 'mr' ? mr : en;
}

// Keyword lists include English, Hindi and Marathi terms so a query typed or *spoken* in any
// of the app's languages is recognised — matching purely on the English substring would miss
// every Hindi/Marathi question entirely.
function has(t, ...words) { return words.some((w) => t.includes(w)); }

function botReplyBuyer(text) {
  const t = text.toLowerCase();
  if (has(t, 'tomato', 'टमाटर', 'टोमॅटो', 'farmer', 'किसान', 'शेतकरी', 'supply', 'आपूर्ति', 'पुरवठा', 'available', 'उपलब्ध'))
    return pick(
      `Ramesh Patil and Suresh Jadhav both have Premium Quality Tomato lots available near Nashik (30–40 Quintals, verified). Nashik Valley Farmers FPO can also aggregate larger volumes. Open Browse Lots to make an offer.`,
      `रमेश पाटिल और सुरेश जाधव दोनों के पास नाशिक के पास प्रीमियम क्वालिटी टमाटर के लॉट उपलब्ध हैं (30–40 क्विंटल, सत्यापित)। नाशिक वैली फार्मर्स एफपीओ बड़ी मात्रा भी जुटा सकता है। ऑफ़र देने के लिए "लॉट ब्राउज़ करें" खोलें।`,
      `रमेश पाटील आणि सुरेश जाधव या दोघांकडे नाशिकजवळ प्रीमियम दर्जाचे टोमॅटो लॉट उपलब्ध आहेत (30–40 क्विंटल, सत्यापित). नाशिक व्हॅली फार्मर्स एफपीओ मोठ्या प्रमाणात एकत्रीकरण करू शकते. ऑफर देण्यासाठी "लॉट ब्राउझ करा" उघडा.`,
    );
  if (has(t, 'price', 'mandi', 'market', 'कीमत', 'भाव', 'मंडी', 'बाज़ार', 'किंमत', 'बाजार'))
    return pick(
      "Tomato is trending up (+4-6% expected over 3 days) at Nashik APMC and Lasalgaon Mandi. Onion is trending down on higher arrivals — a good time to source at lower cost. Open Market Intelligence for the full breakdown.",
      `नाशिक एपीएमसी और लासलगांव मंडी में टमाटर की कीमत बढ़ रही है (3 दिनों में +4-6% अनुमानित)। प्याज की कीमत ज़्यादा आवक के कारण घट रही है — कम कीमत पर खरीदने का अच्छा समय है। पूरी जानकारी के लिए "बाज़ार जानकारी" खोलें।`,
      `नाशिक एपीएमसी आणि लासलगाव मंडईत टोमॅटोच्या किमती वाढत आहेत (3 दिवसांत +4-6% अपेक्षित). कांद्याची किंमत जास्त आवकमुळे घटत आहे — कमी किमतीत खरेदीसाठी चांगली वेळ आहे. संपूर्ण माहितीसाठी "बाजार माहिती" उघडा.`,
    );
  if (has(t, 'offer', 'status', 'ऑफ़र', 'स्थिति', 'ऑफर', 'स्थिती'))
    return pick(
      "Open My Offers to see the status of every offer you've sent — Pending, Accepted or Declined, with the farmer and amount for each.",
      `आपके भेजे गए हर ऑफ़र की स्थिति देखने के लिए "मेरे ऑफ़र" खोलें — लंबित, स्वीकृत या अस्वीकृत, हर एक के साथ किसान और राशि।`,
      `तुम्ही पाठवलेल्या प्रत्येक ऑफरची स्थिती पाहण्यासाठी "माझे ऑफर" उघडा — प्रलंबित, स्वीकृत किंवा नाकारलेले, प्रत्येकासह शेतकरी आणि रक्कम.`,
    );
  if (has(t, 'fpo', 'bulk', 'volume', 'एफपीओ', 'थोक', 'मात्रा', 'मोठ्या प्रमाणात'))
    return pick(
      "Nashik Valley Farmers FPO pools 1,240+ quintals weekly across Tomato, Onion and Wheat — the most reliable option for consistent bulk volume. Open Verified Farmers & FPOs to view their lots.",
      `नाशिक वैली फार्मर्स एफपीओ हर हफ़्ते टमाटर, प्याज और गेहूँ में 1,240+ क्विंटल जुटाता है — लगातार थोक मात्रा के लिए सबसे भरोसेमंद विकल्प। उनके लॉट देखने के लिए "सत्यापित किसान और एफपीओ" खोलें।`,
      `नाशिक व्हॅली फार्मर्स एफपीओ दर आठवड्याला टोमॅटो, कांदा आणि गहू मिळून 1,240+ क्विंटल एकत्र करते — सातत्यपूर्ण मोठ्या प्रमाणासाठी सर्वात विश्वासार्ह पर्याय. त्यांचे लॉट पाहण्यासाठी "सत्यापित शेतकरी आणि एफपीओ" उघडा.`,
    );
  if (has(t, 'quality', 'grade', 'गुणवत्ता', 'ग्रेड'))
    return pick(
      "Each lot lists its AI-assessed grade (Premium / Grade A / Grade B) so you can match your specification before making an offer.",
      `हर लॉट का एआई-मूल्यांकित ग्रेड (प्रीमियम / ग्रेड ए / ग्रेड बी) दिखाया जाता है, ताकि आप ऑफ़र करने से पहले अपनी ज़रूरत से मिला सकें।`,
      `प्रत्येक लॉटचा एआय-मूल्यांकित ग्रेड (प्रीमियम / ग्रेड ए / ग्रेड बी) दाखवला जातो, जेणेकरून ऑफर करण्यापूर्वी तुम्ही तुमच्या गरजेशी जुळवू शकता.`,
    );
  if (has(t, 'hi', 'hello', 'namaste', 'नमस्ते', 'नमस्कार'))
    return pick(
      "Namaste! Ask me which farmers have your crop available, today's mandi prices, or your offer status — I'll help you source reliably.",
      `नमस्ते! मुझसे पूछें किस किसान के पास आपकी फ़सल उपलब्ध है, आज के मंडी भाव, या आपके ऑफ़र की स्थिति — मैं आपको भरोसे से खरीदने में मदद करूँगा।`,
      `नमस्कार! मला विचारा कोणत्या शेतकऱ्याकडे तुमचे पीक उपलब्ध आहे, आजचे बाजार भाव, किंवा तुमच्या ऑफरची स्थिती — मी तुम्हाला विश्वासाने खरेदी करण्यास मदत करेन.`,
    );
  return pick(
    "I can help you find verified farmers/FPOs, check mandi prices, and track your offers. Try asking a specific question, or tap one of the suggestions below.",
    `मैं आपको सत्यापित किसान/एफपीओ खोजने, मंडी भाव देखने और आपके ऑफ़र ट्रैक करने में मदद कर सकता हूँ। कोई खास सवाल पूछें, या नीचे दिए सुझावों में से किसी पर टैप करें।`,
    `मी तुम्हाला सत्यापित शेतकरी/एफपीओ शोधण्यास, बाजार भाव पाहण्यास आणि तुमचे ऑफर ट्रॅक करण्यास मदत करू शकतो. एखादा विशिष्ट प्रश्न विचारा, किंवा खालील सूचनांपैकी एकावर टॅप करा.`,
  );
}

function botReply(text) {
  if (store.get().user?.role === 'buyer') return botReplyBuyer(text);
  const t = text.toLowerCase();
  if (has(t, 'tomato', 'टमाटर', 'टोमॅटो') || (has(t, 'when', 'कब', 'कधी') && has(t, 'sell', 'बेच', 'विक')))
    return pick(
      `Your Tomato lot (${D.LOTS[0].quantity} Quintals) is ready to sell now — the FPO Combined Lot option gives the best net return at ₹1,520/qtl after transport & commission. Prices are rising, so selling within 2 days is recommended. Check My Lots → ${D.LOTS[0].id} to accept the offer.`,
      `आपका टमाटर लॉट (${D.LOTS[0].quantity} क्विंटल) अभी बेचने के लिए तैयार है — एफपीओ संयुक्त लॉट विकल्प परिवहन और कमीशन के बाद ₹1,520/क्विंटल का सबसे अच्छा शुद्ध रिटर्न देता है। कीमतें बढ़ रही हैं, इसलिए 2 दिनों के भीतर बेचना बेहतर होगा। ऑफ़र स्वीकार करने के लिए "मेरे लॉट" → ${D.LOTS[0].id} देखें।`,
      `तुमचा टोमॅटो लॉट (${D.LOTS[0].quantity} क्विंटल) आता विकण्यासाठी तयार आहे — एफपीओ संयुक्त लॉट पर्याय वाहतूक आणि कमिशननंतर ₹1,520/क्विंटल हा सर्वोत्तम निव्वळ परतावा देतो. किमती वाढत आहेत, त्यामुळे 2 दिवसांत विकणे योग्य ठरेल. ऑफर स्वीकारण्यासाठी "माझे लॉट" → ${D.LOTS[0].id} पहा.`,
    );
  if (has(t, 'buyer', 'verified', 'whom', 'खरीदार', 'सत्यापित', 'किसे', 'खरेदीदार', 'कोणाला'))
    return pick(
      "AgroFresh Exports Pvt Ltd (4.8★, verified, 8 km away) and Nashik Valley Farmers FPO (4.9★) are your top-matched verified buyers. Open Verified Buyers to request a quote.",
      `एग्रोफ्रेश एक्सपोर्ट्स प्रा. लि. (4.8★, सत्यापित, 8 किमी दूर) और नाशिक वैली फार्मर्स एफपीओ (4.9★) आपके लिए सबसे उपयुक्त सत्यापित खरीदार हैं। कोटेशन माँगने के लिए "सत्यापित खरीदार" खोलें।`,
      `अ‍ॅग्रोफ्रेश एक्सपोर्ट्स प्रा. लि. (4.8★, सत्यापित, 8 किमी दूर) आणि नाशिक व्हॅली फार्मर्स एफपीओ (4.9★) हे तुमच्यासाठी सर्वोत्तम जुळणारे सत्यापित खरेदीदार आहेत. कोटेशन मागवण्यासाठी "सत्यापित खरेदीदार" उघडा.`,
    );
  if (has(t, 'net', 'return', 'profit', 'शुद्ध', 'रिटर्न', 'मुनाफ़ा', 'लाभ', 'निव्वळ', 'परतावा', 'नफा'))
    return pick(
      "Net return = base price − transport cost − commission − storage cost. For your Tomato lot, the best option nets ₹1,520/qtl versus ₹1,450/qtl at the local mandi — a ₹70/qtl improvement from smarter buyer matching.",
      `शुद्ध रिटर्न = आधार कीमत − परिवहन लागत − कमीशन − भंडारण लागत। आपके टमाटर लॉट के लिए, सबसे अच्छा विकल्प स्थानीय मंडी के ₹1,450/क्विंटल की तुलना में ₹1,520/क्विंटल देता है — बेहतर खरीदार मिलान से ₹70/क्विंटल का सुधार।`,
      `निव्वळ परतावा = मूळ किंमत − वाहतूक खर्च − कमिशन − साठवणूक खर्च. तुमच्या टोमॅटो लॉटसाठी, सर्वोत्तम पर्याय स्थानिक मंडईतील ₹1,450/क्विंटलच्या तुलनेत ₹1,520/क्विंटल देतो — चांगल्या खरेदीदार जुळणीमुळे ₹70/क्विंटलची सुधारणा.`,
    );
  if (has(t, 'fpo', 'aggregat', 'pool', 'एफपीओ', 'समूह', 'एकत्र'))
    return pick(
      "Joining the FPO Combined Lot typically improves your price by about 9% versus selling individually, since pooled volume gives stronger bargaining power with bulk buyers. Open FPO Aggregation to join.",
      `एफपीओ संयुक्त लॉट में शामिल होने से आमतौर पर अकेले बेचने की तुलना में कीमत में लगभग 9% सुधार होता है, क्योंकि इकट्ठी मात्रा से थोक खरीदारों के साथ बेहतर सौदेबाज़ी होती है। शामिल होने के लिए "एफपीओ एकत्रीकरण" खोलें।`,
      `एफपीओ संयुक्त लॉटमध्ये सामील झाल्यास सहसा एकट्याने विकण्याच्या तुलनेत किंमतीत सुमारे 9% सुधारणा होते, कारण एकत्रित प्रमाणामुळे मोठ्या खरेदीदारांशी अधिक चांगली सौदेबाजी होते. सामील होण्यासाठी "एफपीओ एकत्रीकरण" उघडा.`,
    );
  if (has(t, 'price', 'market', 'trend', 'कीमत', 'बाज़ार', 'भाव', 'किंमत', 'बाजार'))
    return pick(
      "Tomato is trending up (+4-6% expected over 3 days), Onion is trending down on higher arrivals, and Wheat is stable. Open Market Intelligence for the full mandi-wise breakdown.",
      `टमाटर की कीमत बढ़ रही है (3 दिनों में +4-6% अनुमानित), प्याज की कीमत ज़्यादा आवक से घट रही है, और गेहूँ स्थिर है। पूरी मंडी-वार जानकारी के लिए "बाज़ार जानकारी" खोलें।`,
      `टोमॅटोची किंमत वाढत आहे (3 दिवसांत +4-6% अपेक्षित), कांद्याची किंमत जास्त आवकमुळे घटत आहे, आणि गहू स्थिर आहे. संपूर्ण मंडईनिहाय माहितीसाठी "बाजार माहिती" उघडा.`,
    );
  if (has(t, 'quality', 'grade', 'grading', 'गुणवत्ता', 'ग्रेड'))
    return pick(
      "Upload a photo in Quality Grading to get an instant AI grade (Premium / Grade A / Grade B). Higher grades match you with premium exporters and better net prices.",
      `तुरंत एआई ग्रेड (प्रीमियम / ग्रेड ए / ग्रेड बी) पाने के लिए "गुणवत्ता ग्रेडिंग" में फ़ोटो अपलोड करें। ऊँचा ग्रेड आपको प्रीमियम निर्यातकों और बेहतर शुद्ध कीमतों से जोड़ता है।`,
      `त्वरित एआय ग्रेड (प्रीमियम / ग्रेड ए / ग्रेड बी) मिळवण्यासाठी "गुणवत्ता ग्रेडिंग" मध्ये फोटो अपलोड करा. उच्च ग्रेड तुम्हाला प्रीमियम निर्यातदार आणि चांगल्या निव्वळ किमतींशी जोडतो.`,
    );
  if (has(t, 'logistics', 'transport', 'pickup', 'परिवहन', 'लॉजिस्टिक्स', 'वाहतूक'))
    return pick(
      "Once you accept an offer, logistics coordination and pickup scheduling happen automatically — track status under Orders. You can also book transport or reserve storage anytime from Transport & Storage.",
      `ऑफ़र स्वीकार करते ही, लॉजिस्टिक्स समन्वय और पिकअप शेड्यूलिंग अपने आप हो जाती है — स्थिति "ऑर्डर" में देखें। आप कभी भी "परिवहन और भंडारण" से ट्रांसपोर्ट बुक या भंडारण आरक्षित कर सकते हैं।`,
      `ऑफर स्वीकारताच, लॉजिस्टिक्स समन्वय आणि पिकअप वेळापत्रक आपोआप होते — स्थिती "ऑर्डर" मध्ये पहा. तुम्ही कधीही "वाहतूक आणि साठवण" मधून वाहतूक बुक किंवा साठवण आरक्षित करू शकता.`,
    );
  if (has(t, 'hi', 'hello', 'namaste', 'नमस्ते', 'नमस्कार'))
    return pick(
      "Namaste! Ask me when to sell, which buyers are verified, or what your expected net return is — I'll help you get the best price for your produce.",
      `नमस्ते! मुझसे पूछें कब बेचें, कौन से खरीदार सत्यापित हैं, या आपका अपेक्षित शुद्ध रिटर्न क्या है — मैं आपकी उपज के लिए सबसे अच्छी कीमत दिलाने में मदद करूँगा।`,
      `नमस्कार! मला विचारा कधी विकायचे, कोणते खरेदीदार सत्यापित आहेत, किंवा तुमचा अपेक्षित निव्वळ परतावा किती आहे — मी तुमच्या उत्पादनासाठी सर्वोत्तम किंमत मिळवण्यास मदत करेन.`,
    );
  return pick(
    "I can help with price discovery, buyer matching, net-return calculations, FPO aggregation and quality grading. Try asking a specific question, or tap one of the suggestions below.",
    `मैं कीमत जानकारी, खरीदार मिलान, शुद्ध रिटर्न गणना, एफपीओ एकत्रीकरण और गुणवत्ता ग्रेडिंग में मदद कर सकता हूँ। कोई खास सवाल पूछें, या नीचे दिए सुझावों में से किसी पर टैप करें।`,
    `मी किंमत माहिती, खरेदीदार जुळणी, निव्वळ परतावा गणना, एफपीओ एकत्रीकरण आणि गुणवत्ता ग्रेडिंगमध्ये मदत करू शकतो. एखादा विशिष्ट प्रश्न विचारा, किंवा खालील सूचनांपैकी एकावर टॅप करा.`,
  );
}

function renderAssistant() {
  const isBuyer = store.get().user?.role === 'buyer';
  const suggestions = isBuyer ? D.BUYER_ASSISTANT_SUGGESTIONS : D.ASSISTANT_SUGGESTIONS;
  const html = pageWrap(`
    <div class="px-4 md:px-6 pt-4 pb-2 flex items-center gap-3">
      <div class="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center">${icon('leaf', 'w-6 h-6')}</div>
      <div class="flex-1 min-w-0">
        <h1 class="font-extrabold text-lg">Kisan Mitra AI</h1>
        <div class="text-xs text-primary font-semibold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>${t('Online · Voice-first, local languages')}</div>
      </div>
      <button id="voice-mute-toggle" class="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-muted transition shrink-0" title="Toggle spoken replies"></button>
    </div>
    <div id="chat-log" class="px-4 md:px-6 py-3 space-y-3 min-h-[40vh]"></div>
    <div class="px-4 md:px-6" id="suggestions-wrap">
      <p class="text-xs font-bold text-muted-foreground mb-2">${t('Suggested questions:')}</p>
      <div class="flex flex-col gap-2 mb-3" id="suggestions">
        ${suggestions.map((q) => `<button data-suggest="${q}" class="text-left text-sm border border-border rounded-xl px-3 py-2.5 hover:bg-muted transition">${t(q)}</button>`).join('')}
      </div>
    </div>
    <div class="sticky bottom-16 md:bottom-0 bg-background px-4 md:px-6 py-3 border-t border-border mt-2">
      <form id="chat-form" class="flex items-center gap-2">
        <input id="chat-input" autocomplete="off" placeholder="${t('Ask when, where, or whom to sell to...')}" class="flex-1 border border-border rounded-full px-4 py-3 bg-card" />
        <button type="button" id="mic-btn" class="w-11 h-11 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center">${icon('mic', 'w-5 h-5')}</button>
        <button type="submit" class="w-11 h-11 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center">${icon('send', 'w-4 h-4')}</button>
      </form>
    </div>
  `);

  function bubble(msg) {
    const isBot = msg.role === 'bot';
    return `<div class="chat-bubble-in flex ${isBot ? 'justify-start' : 'justify-end'}">
      <div class="max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${isBot ? 'bg-primary-light text-foreground rounded-tl-sm' : 'bg-primary text-primary-foreground rounded-tr-sm'}">${msg.text}</div>
    </div>`;
  }

  function mount(root) {
    const log = root.querySelector('#chat-log');
    const form = root.querySelector('#chat-form');
    const input = root.querySelector('#chat-input');
    const suggestionsWrap = root.querySelector('#suggestions-wrap');
    const muteBtn = root.querySelector('#voice-mute-toggle');

    const history = store.get().chat;
    const initialText = isBuyer
      ? pick(
          "🙏 Namaste! I'm Kisan Mitra AI. Ask me which verified farmers or FPOs have your crop available, today's mandi prices, or your offer status.",
          `🙏 नमस्ते! मैं किसान मित्र एआई हूँ। मुझसे पूछें किस सत्यापित किसान या एफपीओ के पास आपकी फ़सल उपलब्ध है, आज के मंडी भाव, या आपके ऑफ़र की स्थिति।`,
          `🙏 नमस्कार! मी किसान मित्र एआय आहे. मला विचारा कोणत्या सत्यापित शेतकऱ्याकडे किंवा एफपीओकडे तुमचे पीक उपलब्ध आहे, आजचे बाजार भाव, किंवा तुमच्या ऑफरची स्थिती.`,
        )
      : pick(
          "🙏 Namaste! I'm Kisan Mitra AI. Ask me when, where, or whom to sell your produce to — I'll factor in prices, transport, commission and buyer reliability to find your best net return.",
          `🙏 नमस्ते! मैं किसान मित्र एआई हूँ। मुझसे पूछें कब, कहाँ, या किसे अपनी उपज बेचें — मैं कीमत, परिवहन, कमीशन और खरीदार की विश्वसनीयता को ध्यान में रखकर आपका सबसे अच्छा शुद्ध रिटर्न निकालूँगा।`,
          `🙏 नमस्कार! मी किसान मित्र एआय आहे. मला विचारा कधी, कुठे, किंवा कोणाला तुमचे उत्पादन विकायचे — मी किंमत, वाहतूक, कमिशन आणि खरेदीदाराची विश्वासार्हता लक्षात घेऊन तुमचा सर्वोत्तम निव्वळ परतावा शोधेन.`,
        );
    const initial = { role: 'bot', text: initialText };
    log.innerHTML = [initial, ...history].map(bubble).join('');
    if (history.length) suggestionsWrap.classList.add('hidden');
    log.scrollTop = log.scrollHeight;

    function styleMuteBtn() {
      const muted = store.get().voiceEnabled === false;
      muteBtn.innerHTML = icon(muted ? 'volumeOff' : 'volume', 'w-5 h-5');
      muteBtn.className = `w-10 h-10 rounded-full border flex items-center justify-center transition shrink-0 ${muted ? 'border-border text-muted-foreground' : 'border-primary/40 text-primary bg-primary-light'}`;
    }
    muteBtn.addEventListener('click', () => {
      const next = store.get().voiceEnabled === false;
      store.set({ voiceEnabled: next });
      if (!next) window.speechSynthesis?.cancel();
      styleMuteBtn();
      toast(next ? 'Spoken replies on' : 'Spoken replies off', { icon: next ? 'volume' : 'volumeOff' });
    });
    styleMuteBtn();

    if (!history.length) speak(initialText);

    function send(text) {
      if (!text.trim()) return;
      const userMsg = { role: 'user', text };
      store.addChat(userMsg);
      log.insertAdjacentHTML('beforeend', bubble(userMsg));
      suggestionsWrap.classList.add('hidden');
      input.value = '';
      log.scrollTop = log.scrollHeight;
      const typingId = 'typing-' + Date.now();
      log.insertAdjacentHTML('beforeend', `<div id="${typingId}" class="chat-bubble-in flex justify-start"><div class="bg-primary-light rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex gap-1"><span class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"></span><span class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style="animation-delay:.15s"></span><span class="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style="animation-delay:.3s"></span></div></div>`);
      log.scrollTop = log.scrollHeight;
      setTimeout(() => {
        document.getElementById(typingId)?.remove();
        const replyText = botReply(text);
        const botMsg = { role: 'bot', text: replyText };
        store.addChat(botMsg);
        log.insertAdjacentHTML('beforeend', bubble(botMsg));
        log.scrollTop = log.scrollHeight;
        speak(replyText);
      }, 900);
    }

    const pending = sessionStorage.getItem('km:pending-query');
    if (pending) { sessionStorage.removeItem('km:pending-query'); if (pending.trim()) send(pending); }

    form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
    root.querySelectorAll('[data-suggest]').forEach((btn) => btn.addEventListener('click', () => send(btn.dataset.suggest)));

    // Hands-free voice loop: tap mic, speak your question, it's sent automatically and the
    // spoken reply comes back — not just "speech fills a text box you still have to submit".
    root.querySelector('#mic-btn').addEventListener('click', () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { toast('Voice input not supported in this browser', { tone: 'error', icon: 'mic' }); return; }
      try {
        window.speechSynthesis?.cancel();
        const rec = new SR();
        rec.lang = SPEECH_LOCALE[currentLangCode()] || 'en-IN';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        toast('Listening… speak now', { icon: 'mic' });
        rec.onresult = (e) => send(e.results[0][0].transcript);
        rec.onerror = () => toast('Could not hear you clearly. Try again.', { tone: 'error', icon: 'mic' });
        rec.start();
      } catch (e) {
        toast('Voice input unavailable right now.', { tone: 'error', icon: 'mic' });
      }
    });
  }

  return { html, mount };
}

/* ---------------- GRIEVANCE CENTRE ---------------- */
// Persisted per account. There is no real support desk in this prototype, so the
// "Under Review" / "Resolved" steps are advanced by a clearly-labelled demo button.

const GRIEVANCE_ICON = { 'Quality dispute': 'scale', 'Payment delay': 'banknote', 'Logistics issue': 'truck', 'Buyer unreachable': 'phone', Other: 'message' };

function grievanceOwner() { return phoneKey(store.get().user?.phone); }
function myGrievances() {
  const me = grievanceOwner();
  return store.get().grievances.filter((g) => g.ownerPhone === me);
}
function grievanceWhen(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function grievanceReferences() {
  const map = new Map();
  [...store.get().orders, ...D.ORDERS].forEach((o) => { if (!map.has(o.id)) map.set(o.id, `${o.id} · ${o.crop} · ${o.buyer || ''}`.replace(/ · $/, '')); });
  return [...map];
}

// Shared by the Grievances page and the Orders page's per-order "report a problem" button.
function openGrievanceModal({ orderId = '', onSaved } = {}) {
  const refs = grievanceReferences();
  openModal(`
    <form class="p-5" id="gr-form" novalidate>
      <h3 class="font-extrabold text-lg mb-3">${t('Raise a Grievance')}</h3>
      <label for="gr-type" class="text-xs font-bold text-muted-foreground">${t('Issue Type')}</label>
      <select id="gr-type" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3">
        ${GRIEVANCE_TYPES.map((x) => `<option value="${esc(x)}">${esc(t(x))}</option>`).join('')}
      </select>
      <label for="gr-ref" class="text-xs font-bold text-muted-foreground">${t('Related order (optional)')}</label>
      <select id="gr-ref" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3">
        <option value="">${t('Not about a specific order')}</option>
        ${refs.map(([id, label]) => `<option value="${esc(id)}" ${id === orderId ? 'selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
      <label for="gr-desc" class="text-xs font-bold text-muted-foreground">${t('Describe the issue')}</label>
      <textarea id="gr-desc" rows="4" maxlength="1000" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1" placeholder="${t('What went wrong? When did it happen?')}"></textarea>
      <div class="flex justify-between text-[11px] text-muted-foreground mt-1 mb-3">
        <span id="gr-error" class="text-destructive font-semibold" role="alert"></span>
        <span id="gr-count">0 / 1000</span>
      </div>
      <div class="flex gap-2">
        <button type="button" data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">${t('Cancel')}</button>
        <button type="submit" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">${t('Submit')}</button>
      </div>
    </form>`, {
    onMount: (m) => {
      const desc = m.querySelector('#gr-desc');
      desc.addEventListener('input', () => { m.querySelector('#gr-count').textContent = `${desc.value.length} / 1000`; });
      m.querySelector('#gr-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const type = m.querySelector('#gr-type').value;
        const description = desc.value.trim();
        const problem = validateGrievance({ type, description });
        if (problem) { m.querySelector('#gr-error').textContent = problem; desc.focus(); return; }
        const now = new Date().toISOString();
        const g = {
          id: `GR-${Date.now().toString(36).toUpperCase().slice(-6)}`,
          ownerPhone: grievanceOwner(),
          type,
          description,
          ref: m.querySelector('#gr-ref').value,
          status: 'Submitted',
          createdAt: now,
          history: [{ status: 'Submitted', at: now }],
        };
        store.addGrievance(g);
        closeModal();
        toast(`Grievance ${g.id} submitted. Track it under Grievances.`, { tone: 'success', icon: 'shield' });
        if (onSaved) onSaved(g);
      });
    },
  });
}

function renderGrievances() {
  const html = pageWrap(`
    ${sectionHead('Grievances', 'Raise an issue with an order, payment or buyer and track it to resolution')}
    <div class="px-4 md:px-6">
      <button id="gr-new" class="w-full md:w-auto inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold px-5 py-3 rounded-xl hover:opacity-90 transition">${icon('plus', 'w-4 h-4')}${t('Raise a Grievance')}</button>
    </div>
    <div class="px-4 md:px-6 mt-4 grid grid-cols-3 gap-3" id="gr-stats"></div>
    <div class="px-4 md:px-6 mt-4 space-y-3" id="gr-list"></div>
    <p class="px-4 md:px-6 mt-4 text-[11px] text-muted-foreground">${t('Prototype: there is no live support desk. Use “Simulate support response” to see how a grievance moves through Under Review to Resolved.')}</p>
  `);

  function stepper(g) {
    const at = GRIEVANCE_STATUSES.indexOf(g.status);
    return `<ol class="flex items-start mt-3" aria-label="${t('Status')}">${GRIEVANCE_STATUSES.map((s, i) => {
      const done = i <= at;
      const entry = (g.history || []).find((h) => h.status === s);
      return `<li class="flex-1 flex flex-col items-center relative">
        ${i > 0 ? `<div class="absolute right-1/2 top-3 w-full h-0.5 ${done ? 'bg-primary' : 'bg-border'}"></div>` : ''}
        <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold z-10 ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}">${i < at ? icon('check', 'w-3.5 h-3.5') : i + 1}</div>
        <span class="text-[10px] font-semibold text-center mt-1 ${done ? 'text-foreground' : 'text-muted-foreground'}">${t(s)}</span>
        <span class="text-[9px] text-muted-foreground">${entry ? esc(grievanceWhen(entry.at)) : ''}</span>
      </li>`;
    }).join('')}</ol>`;
  }

  function cardHtml(g) {
    const resolved = g.status === 'Resolved';
    return card(`
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${resolved ? 'bg-primary/10 text-primary' : 'bg-accent/20 text-accent-foreground'}">${icon(GRIEVANCE_ICON[g.type] || 'alert', 'w-4.5 h-4.5')}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <div class="font-bold text-sm">${esc(t(g.type))}</div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${resolved ? 'bg-primary/10 text-primary' : 'bg-accent/20 text-accent-foreground'}">${esc(t(g.status))}</span>
          </div>
          <div class="text-[11px] text-muted-foreground">${esc(g.id)}${g.ref ? ` · ${esc(g.ref)}` : ''} · ${esc(grievanceWhen(g.createdAt))}</div>
          <p class="text-sm mt-2 whitespace-pre-wrap break-words">${esc(g.description)}</p>
        </div>
      </div>
      ${stepper(g)}
      ${resolved ? '' : `<button data-advance="${esc(g.id)}" class="mt-3 w-full border border-dashed border-border text-xs font-bold text-muted-foreground py-2 rounded-lg hover:bg-muted transition">${t('Simulate support response')} → ${esc(t(nextGrievanceStatus(g.status)))}</button>`}
    `);
  }

  function mount(root) {
    const list = root.querySelector('#gr-list');
    const stats = root.querySelector('#gr-stats');
    function render() {
      const items = myGrievances();
      const open = items.filter((g) => g.status !== 'Resolved').length;
      const stat = (n, label) => `<div class="card p-3 text-center"><div class="text-xl font-extrabold">${n}</div><div class="text-[10px] font-semibold text-muted-foreground">${t(label)}</div></div>`;
      stats.innerHTML = stat(items.length, 'Raised') + stat(open, 'Open') + stat(items.length - open, 'Resolved');
      list.innerHTML = items.length ? items.map(cardHtml).join('') : card(`
        <div class="text-center py-6">
          <div class="mx-auto w-14 h-14 rounded-full bg-primary-light flex items-center justify-center text-primary mb-3">${icon('shield', 'w-6 h-6')}</div>
          <div class="font-bold">${t('No grievances raised')}</div>
          <p class="text-sm text-muted-foreground mt-1">${t('If a payment is late or a buyer is unreachable, raise it here and track it.')}</p>
        </div>`);
      list.querySelectorAll('[data-advance]').forEach((btn) => btn.addEventListener('click', () => {
        const g = items.find((x) => x.id === btn.dataset.advance);
        const next = g && nextGrievanceStatus(g.status);
        if (!next) return;
        store.updateGrievance(g.id, { status: next, history: [...(g.history || []), { status: next, at: new Date().toISOString() }] });
        toast(`${g.id}: ${next}`, { tone: 'success', icon: 'shield' });
        render();
      }));
    }
    root.querySelector('#gr-new').addEventListener('click', () => openGrievanceModal({ onSaved: render }));
    render();
  }

  return { html, mount };
}

/* ---------------- ROUTES ---------------- */

export const ROUTES = {
  '/login': renderLogin,
  '/': () => {
    const role = store.get().user?.role;
    if (role === 'buyer') return renderBuyerHome();
    if (role === 'fpo_operator') return renderFpoOperatorHome();
    return renderHome();
  },
  '/market': () => renderMarket(),
  '/lots': renderLots,
  '/orders': renderOrders,
  '/profile': renderProfile,
  '/buyers': renderBuyers,
  '/fpo': renderFPO,
  '/quality-check': renderQualityCheck,
  '/assistant': renderAssistant,
  '/browse': renderBrowseLots,
  '/offers': renderMyOffers,
  '/farmers': renderFarmerSuppliers,
  '/logistics': renderLogistics,
  '/weather': renderWeather,
  '/history': renderHistory,
  '/crop-suggestions': renderCropSuggestions,
  '/fpo-members': renderFpoMembers,
  '/grievances': renderGrievances,
};

export function renderDynamic(path) {
  if (path.startsWith('/lots/')) return renderLotDetail(path.slice('/lots/'.length));
  if (path.startsWith('/market/')) return renderMarket(path.slice('/market/'.length));
  return null;
}

// Late-bound to avoid circular import; set by app.js
export let navigateTo = (hash) => { location.hash = hash; };
export function setNavigator(fn) { navigateTo = fn; }
