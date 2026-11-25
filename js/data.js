// Mock data for Kisan Mitra — market linkages & price discovery platform
// Modeled on the SIH 2026 problem statement 26132 submission ("The 6 Innovators")

export const FARMER_BOTTOM_NAV = [
  { path: '#/', label: 'Home', icon: 'home' },
  { path: '#/market', label: 'Market', icon: 'barChart' },
  { path: '#/lots', label: 'My Lots', icon: 'package' },
  { path: '#/orders', label: 'Orders', icon: 'clipboard' },
  { path: '#/profile', label: 'Profile', icon: 'user' },
];

export const FARMER_MORE_NAV = [
  { path: '#/buyers', label: 'Verified Buyers', icon: 'users' },
  { path: '#/fpo', label: 'FPO Aggregation', icon: 'users' },
  { path: '#/quality-check', label: 'Quality Grading', icon: 'scale' },
  { path: '#/logistics', label: 'Transport & Storage', icon: 'truck' },
  { path: '#/weather', label: 'Weather Forecast', icon: 'cloud-sun' },
  { path: '#/history', label: 'Transaction History', icon: 'clipboard' },
  { path: '#/crop-suggestions', label: 'Next Season Crops', icon: 'sprout' },
  { path: '#/assistant', label: 'AI Assistant', icon: 'message' },
  { path: '#/grievances', label: 'Grievances', icon: 'shield' },
];

export const BUYER_BOTTOM_NAV = [
  { path: '#/', label: 'Home', icon: 'home' },
  { path: '#/browse', label: 'Browse Lots', icon: 'package' },
  { path: '#/offers', label: 'My Offers', icon: 'clipboard' },
  { path: '#/market', label: 'Market', icon: 'barChart' },
  { path: '#/profile', label: 'Profile', icon: 'user' },
];

export const BUYER_MORE_NAV = [
  { path: '#/farmers', label: 'Verified Farmers & FPOs', icon: 'users' },
  { path: '#/logistics', label: 'Transport & Storage', icon: 'truck' },
  { path: '#/weather', label: 'Weather Forecast', icon: 'cloud-sun' },
  { path: '#/history', label: 'Transaction History', icon: 'clipboard' },
  { path: '#/assistant', label: 'AI Assistant', icon: 'message' },
  { path: '#/grievances', label: 'Grievances', icon: 'shield' },
];

export const FPO_OPERATOR_BOTTOM_NAV = [
  { path: '#/', label: 'Home', icon: 'home' },
  { path: '#/fpo-members', label: 'Members', icon: 'users' },
  { path: '#/buyers', label: 'Verified Buyers', icon: 'users' },
  { path: '#/market', label: 'Market', icon: 'barChart' },
  { path: '#/profile', label: 'Profile', icon: 'user' },
];

export const FPO_OPERATOR_MORE_NAV = [
  { path: '#/logistics', label: 'Transport & Storage', icon: 'truck' },
  { path: '#/weather', label: 'Weather Forecast', icon: 'cloud-sun' },
  { path: '#/history', label: 'Transaction History', icon: 'clipboard' },
  { path: '#/assistant', label: 'AI Assistant', icon: 'message' },
  { path: '#/grievances', label: 'Grievances', icon: 'shield' },
];

// Path -> roles allowed to view it. A path with no entry here is shared across every role.
// Replaces the old two-list (FARMER_ONLY_PATHS/BUYER_ONLY_PATHS) scheme, which couldn't
// express a third role without becoming an unreadable tangle of exceptions.
export const ROLE_RESTRICTED_PATHS = {
  '/lots': ['farmer'],
  '/orders': ['farmer'],
  '/fpo': ['farmer'],
  '/quality-check': ['farmer'],
  '/crop-suggestions': ['farmer'],
  '/buyers': ['farmer', 'fpo_operator'],
  '/browse': ['buyer'],
  '/offers': ['buyer'],
  '/farmers': ['buyer'],
  '/fpo-members': ['fpo_operator'],
};

export const DEFAULT_FARMER = {
  role: 'farmer',
  name: 'Ramesh',
  fullName: 'Ramesh Patil',
  location: 'Nashik, Maharashtra',
  weather: 28,
  phone: '+91 98765 43210',
  memberSince: 'Mar 2024',
  fpo: 'Nashik Valley Farmers FPO',
  language: 'English',
};

export const DEFAULT_BUYER = {
  role: 'buyer',
  name: 'Anjali',
  fullName: 'Anjali Shah',
  company: 'AgroFresh Exports Pvt Ltd',
  location: 'Nashik, Maharashtra',
  weather: 28,
  phone: '+91 91234 56789',
  memberSince: 'Jan 2024',
  verified: true,
  reliability: 4.8,
  language: 'English',
};

export const DEFAULT_FPO_OPERATOR = {
  role: 'fpo_operator',
  name: 'Vikram',
  fullName: 'Vikram Kulkarni',
  designation: 'Operations Manager',
  fpo: 'Nashik Valley Farmers FPO',
  location: 'Nashik, Maharashtra',
  weather: 28,
  phone: '+91 99887 66554',
  memberSince: 'Jan 2022',
  language: 'English',
};

// A pooled lot per member farmer — what the FPO operator manages day to day: who has
// contributed what, and where each pooled lot currently stands.
export const FPO_MEMBER_LOTS = [
  { id: 'FM1', farmer: 'Ramesh Patil', crop: 'Tomato', quantity: 30, unit: 'Quintals', grade: 'Premium Quality', status: 'Pooled', pooledDate: '2 Jun 2026' },
  { id: 'FM2', farmer: 'Suresh Jadhav', crop: 'Tomato', quantity: 40, unit: 'Quintals', grade: 'Premium Quality', status: 'Pooled', pooledDate: '2 Jun 2026' },
  { id: 'FM3', farmer: 'Anil Deshmukh', crop: 'Wheat', quantity: 80, unit: 'Quintals', grade: 'Grade A', status: 'Pooled', pooledDate: '1 Jun 2026' },
  { id: 'FM4', farmer: 'Meera Kale', crop: 'Onion', quantity: 25, unit: 'Quintals', grade: 'Grade A', status: 'Pending Pickup', pooledDate: '3 Jun 2026' },
  { id: 'FM5', farmer: 'Pooja Wagh', crop: 'Soybean', quantity: 50, unit: 'Quintals', grade: 'Grade A', status: 'Sold', pooledDate: '28 May 2026' },
  { id: 'FM6', farmer: 'Kiran Bhosale', crop: 'Cotton', quantity: 15, unit: 'Quintals', grade: 'Grade B', status: 'Pooled', pooledDate: '30 May 2026' },
];

export const ALERTS = [
  { level: 'HIGH', title: 'Tomato prices rising fast', desc: 'Lasalgaon Mandi up 8% in 3 days on festival demand. Good window to sell.', time: '1 hour ago' },
  { level: 'MEDIUM', title: 'New verified buyer nearby', desc: 'AgroFresh Exports is sourcing Premium Grade Tomato within 10 km of Nashik.', time: '4 hours ago' },
  { level: 'LOW', title: 'Onion arrivals increasing', desc: 'Higher arrivals expected at Nashik APMC this week — prices may soften.', time: '1 day ago' },
];

/* ---------------- WEATHER (fallback shown before live location is used) ---------------- */

export const WEATHER_FALLBACK = {
  temp: 28, condition: 'Partly Cloudy', conditionIcon: 'cloud-sun',
  humidity: 65, wind: 12, rainChance: 20, feelsLike: 30,
  daily: [
    { day: 'Today', icon: 'cloud-sun', max: 30, min: 22, rain: 20 },
    { day: 'Tue', icon: 'sun', max: 32, min: 23, rain: 5 },
    { day: 'Wed', icon: 'cloud-rain', max: 27, min: 21, rain: 70 },
    { day: 'Thu', icon: 'cloud-rain', max: 26, min: 20, rain: 80 },
    { day: 'Fri', icon: 'cloud-sun', max: 29, min: 22, rain: 15 },
  ],
  alerts: [
    { level: 'HIGH', title: 'Heavy rainfall expected', desc: '50–80mm of rain likely over the next 48 hours — protect harvested produce and delay fresh cutting where possible.' },
    { level: 'MEDIUM', title: 'High humidity ahead', desc: 'Humidity above 80% expected mid-week — watch for fungal/pest pressure on tomato and onion crops.' },
  ],
  tips: [
    { icon: '💧', title: 'Irrigation', desc: 'Reduce irrigation ahead of expected rain — ensure field drainage is clear.' },
    { icon: '🦟', title: 'Pest Control', desc: 'Rising humidity favours pest activity — inspect crops and apply preventive measures.' },
    { icon: '🌾', title: 'Harvest Timing', desc: 'Consider harvesting ready crops before the rain to avoid quality loss.' },
  ],
};

/* ---------------- CROP VISUAL IDENTITY ---------------- */
// Real produce photos (assets/crops) with a flat line-art fallback (icons.js) and a
// per-crop tint — used everywhere a crop needs a visual marker.
export const CROP_STYLE = {
  Tomato: { icon: 'tomato', photo: './assets/crops/tomato.jpg', bg: 'hsl(4 72% 94%)', fg: 'hsl(4 68% 42%)' },
  Onion: { icon: 'onion', photo: './assets/crops/onion.jpg', bg: 'hsl(300 32% 94%)', fg: 'hsl(300 38% 42%)' },
  Wheat: { icon: 'wheat', photo: './assets/crops/wheat.jpg', bg: 'hsl(42 78% 91%)', fg: 'hsl(32 55% 36%)' },
  Cotton: { icon: 'cotton', photo: './assets/crops/cotton.jpg', bg: 'hsl(210 20% 94%)', fg: 'hsl(210 15% 38%)' },
  Soybean: { icon: 'soybean', photo: './assets/crops/soybean.jpg', bg: 'hsl(100 38% 92%)', fg: 'hsl(100 35% 30%)' },
};
export const DEFAULT_CROP_STYLE = { icon: 'leaf', bg: 'hsl(142 48% 92%)', fg: 'hsl(142 52% 34%)' };
export function cropStyle(cropName) { return CROP_STYLE[cropName] || DEFAULT_CROP_STYLE; }

// Full-page hero photo for a lot's detail page, keyed by crop — only crops with a real
// sourced photo get the photo-bg treatment; others fall back to the plain page style.
export const LOT_HERO_IMAGES = {
  Tomato: './assets/lots-hero.jpg',
  Onion: './assets/onion-hero.jpg',
  Wheat: './assets/wheat-hero.jpg',
};

/* ---------------- NEXT-SEASON CROP PLANNING (soil + location) ---------------- */
// Mock soil-type lookup by state — a real deployment would call a soil-health-card API
// (e.g. Soil Health Card scheme data) keyed by district; this mirrors that shape so it's
// a drop-in swap later.
export const SOIL_BY_STATE = {
  Maharashtra: { type: 'Black (Regur) Soil', note: 'Rich in clay and moisture-retentive — well suited to cotton, soybean and pulses, with strong Rabi wheat potential.' },
  Punjab: { type: 'Alluvial Soil', note: 'Deep, fertile river-plain soil — excellent for wheat, rice and sugarcane.' },
  Telangana: { type: 'Red & Black Soil', note: 'Mixed red loamy and black soil — suited to cotton, maize, pulses and groundnut.' },
  Karnataka: { type: 'Red Sandy Loam', note: 'Well-drained, moderately fertile — good for onion, groundnut, pulses and cotton.' },
  'Uttar Pradesh': { type: 'Alluvial Soil', note: 'Deep, fertile Gangetic-plain soil — strong for wheat, sugarcane and rice.' },
  Gujarat: { type: 'Black (Regur) Soil', note: 'High moisture retention — well suited to cotton, groundnut and cumin.' },
};
export const DEFAULT_SOIL = { type: 'Loamy Soil', note: 'Balanced, moderately fertile soil suited to a wide range of crops.' };

export function soilForLocation(location) {
  const state = (location || '').split(',').map((s) => s.trim()).pop();
  return SOIL_BY_STATE[state] || DEFAULT_SOIL;
}

// India's three cropping seasons and what grows well in each, tagged by which soils suit
// them best. `season -> nextSeason` lets the planner always point at what to sow next.
export const CROP_SEASONS = {
  Kharif: { months: 'June – October', next: 'Rabi' },
  Rabi: { months: 'October – March', next: 'Zaid' },
  Zaid: { months: 'March – June', next: 'Kharif' },
};

export const CROP_PLAN = {
  Kharif: [
    { name: 'Cotton', soils: ['Black (Regur) Soil', 'Red & Black Soil', 'Alluvial Soil'], note: 'Sown with monsoon onset; thrives in moisture-retentive black soil, viable on well-irrigated alluvial plains too.' },
    { name: 'Soybean', soils: ['Black (Regur) Soil', 'Red & Black Soil', 'Loamy Soil'], note: 'Short-duration oilseed, a strong rotation crop after cotton or wheat.' },
  ],
  Rabi: [
    { name: 'Wheat', soils: ['Alluvial Soil', 'Black (Regur) Soil', 'Loamy Soil'], note: 'Winter staple — needs cool weather and 3-4 irrigation cycles.' },
    { name: 'Onion', soils: ['Red Sandy Loam', 'Black (Regur) Soil', 'Loamy Soil'], note: 'Classic Rabi cash crop; well-drained soil prevents bulb rot.' },
  ],
  Zaid: [
    { name: 'Soybean', soils: ['Loamy Soil', 'Alluvial Soil'], note: 'Short summer window where irrigation is assured.' },
    { name: 'Tomato', soils: ['Red Sandy Loam', 'Loamy Soil', 'Alluvial Soil', 'Black (Regur) Soil'], note: 'Summer tomato fetches a premium as supply from other regions drops.' },
  ],
};

// Which of the three seasons `date` currently falls in.
export function currentCropSeason(date = new Date()) {
  const m = date.getMonth() + 1; // 1-12
  if (m >= 6 && m <= 9) return 'Kharif';
  if (m >= 10 || m === 1) return 'Rabi';
  return 'Zaid';
}

/* ---------------- LOTS ---------------- */
// A "lot" is produce a farmer has listed for sale.

export const LOTS = [
  {
    id: 'LOT-1042',
    crop: 'Tomato',
    quantity: 30,
    unit: 'Quintals',
    grade: 'Premium Quality',
    harvestDate: '24 May 2026',
    location: 'Nashik',
    status: 'Recommendation Ready',
    photo: true,
  },
  {
    id: 'LOT-1038',
    crop: 'Onion',
    quantity: 45,
    unit: 'Quintals',
    grade: 'Grade A',
    harvestDate: '18 May 2026',
    location: 'Nashik',
    status: 'Offer Accepted',
  },
  {
    id: 'LOT-1021',
    crop: 'Wheat',
    quantity: 60,
    unit: 'Quintals',
    grade: 'Grade B',
    harvestDate: '2 May 2026',
    location: 'Nashik',
    status: 'Sold',
  },
];

/* ---------------- MARKETPLACE (buyer-facing view of lots on offer) ---------------- */

export const AVAILABLE_LOTS = [
  // farmerLotId links this marketplace listing back to the farmer's own LOTS entry, so a
  // bid placed here shows up live on that exact lot's "Compare Options" page — this is what
  // makes reverse bidding a real closed loop instead of two disconnected mock datasets.
  { id: 'LOT-2242', farmerLotId: 'LOT-1042', farmer: 'Ramesh Patil', fpo: 'Nashik Valley Farmers FPO', crop: 'Tomato', quantity: 30, unit: 'Quintals', grade: 'Premium Quality', location: 'Nashik', distance: '8 km', askingPrice: 1650, harvestDate: '24 May 2026', verified: true },
  { id: 'LOT-2201', farmer: 'Suresh Jadhav', fpo: 'Nashik Valley Farmers FPO', crop: 'Tomato', quantity: 40, unit: 'Quintals', grade: 'Premium Quality', location: 'Nashik', distance: '6 km', askingPrice: 1620, harvestDate: '22 May 2026', verified: true },
  { id: 'LOT-2214', farmer: 'Meera Kale', fpo: null, crop: 'Onion', quantity: 25, unit: 'Quintals', grade: 'Grade A', location: 'Pimpalgaon', distance: '20 km', askingPrice: 1650, harvestDate: '19 May 2026', verified: true },
  { id: 'LOT-2230', farmer: 'Anil Deshmukh', fpo: 'Nashik Valley Farmers FPO', crop: 'Wheat', quantity: 80, unit: 'Quintals', grade: 'Grade A', location: 'Niphad', distance: '22 km', askingPrice: 2240, harvestDate: '10 May 2026', verified: true },
  { id: 'LOT-2255', farmer: 'Kiran Bhosale', fpo: null, crop: 'Cotton', quantity: 15, unit: 'Quintals', grade: 'Grade B', location: 'Malegaon', distance: '45 km', askingPrice: 6350, harvestDate: '5 May 2026', verified: false },
  { id: 'LOT-2266', farmer: 'Pooja Wagh', fpo: null, crop: 'Soybean', quantity: 50, unit: 'Quintals', grade: 'Grade A', location: 'Sinnar', distance: '30 km', askingPrice: 4480, harvestDate: '8 May 2026', verified: true },
  { id: 'LOT-2270', farmerLotId: 'LOT-1038', farmer: 'Ramesh Patil', fpo: 'Nashik Valley Farmers FPO', crop: 'Onion', quantity: 45, unit: 'Quintals', grade: 'Grade A', location: 'Nashik', distance: '8 km', askingPrice: 1680, harvestDate: '18 May 2026', verified: true },
];

// A couple of mock competing bids already sitting on the farmer's own lots when they log in
// — so "Live Bids from Buyers" reads as a real multi-buyer auction from the first view, not
// an empty list waiting for the one demo buyer account to place something.
export const SEED_BIDS = {
  'LOT-1042': [
    { id: 'seed-1042-1', buyerId: 'B1', buyer: 'AgroFresh Exports Pvt Ltd', price: 1630, time: '2 hours ago' },
    { id: 'seed-1042-2', buyerId: 'B4', buyer: 'Sharma Trading Co.', price: 1510, time: '5 hours ago' },
  ],
  'LOT-1038': [
    { id: 'seed-1038-1', buyerId: 'B2', buyer: 'Nashik Valley Farmers FPO', price: 1660, time: '1 hour ago' },
  ],
};

export const FARMER_SUPPLIERS = [
  { name: 'Nashik Valley Farmers FPO', type: 'FPO', members: 186, crops: ['Tomato', 'Wheat'], reliability: 4.9, verified: true, volume: '1,240 qtl/week' },
  { name: 'Suresh Jadhav', type: 'Individual Farmer', members: null, crops: ['Tomato'], reliability: 4.6, verified: true, volume: '40 qtl this season' },
  { name: 'Meera Kale', type: 'Individual Farmer', members: null, crops: ['Onion'], reliability: 4.3, verified: true, volume: '25 qtl this season' },
  { name: 'Kiran Bhosale', type: 'Individual Farmer', members: null, crops: ['Cotton'], reliability: 3.1, verified: false, volume: '15 qtl this season' },
];

/* ---------------- MARKET INTELLIGENCE ---------------- */

export const COMMODITIES = [
  {
    id: 'tomato', name: 'Tomato', unit: 'quintal',
    trend: [1400, 1420, 1460, 1500, 1580, 1610, 1650],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
    forecast: 'rising',
    forecastNote: 'AI model predicts prices rising 4-6% over the next 3 days on festival demand and lower arrivals.',
    bestWindow: 'Best window to sell: within 2 days, before arrivals increase and prices likely soften.',
    mandis: [
      { name: 'Nashik APMC', price: 1580, arrivals: '420 qtl', distance: '12 km', trend: 'up' },
      { name: 'Lasalgaon Mandi', price: 1700, arrivals: '610 qtl', distance: '35 km', trend: 'up' },
      { name: 'Pune Market Yard', price: 1540, arrivals: '350 qtl', distance: '180 km', trend: 'flat' },
    ],
  },
  {
    id: 'onion', name: 'Onion', unit: 'quintal',
    trend: [1850, 1820, 1790, 1760, 1740, 1700, 1680],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
    forecast: 'falling',
    forecastNote: 'Arrivals up 18% week-on-week at Nashik APMC — prices trending down, expected to fall further.',
    bestWindow: 'Consider selling now or moving to cold storage — prices may fall another 5-8% this week.',
    mandis: [
      { name: 'Nashik APMC', price: 1680, arrivals: '890 qtl', distance: '12 km', trend: 'down' },
      { name: 'Lasalgaon Mandi', price: 1720, arrivals: '1,100 qtl', distance: '35 km', trend: 'down' },
      { name: 'Pimpalgaon Market', price: 1650, arrivals: '540 qtl', distance: '28 km', trend: 'flat' },
    ],
  },
  {
    id: 'wheat', name: 'Wheat', unit: 'quintal',
    trend: [2210, 2225, 2230, 2245, 2250, 2248, 2255],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
    forecast: 'stable',
    forecastNote: 'Prices holding steady with government MSP support; minor upside possible near month-end.',
    bestWindow: 'No urgency — prices are stable. Safe to hold up to 2 weeks if storage is available.',
    mandis: [
      { name: 'Nashik APMC', price: 2255, arrivals: '260 qtl', distance: '12 km', trend: 'flat' },
      { name: 'Niphad Mandi', price: 2270, arrivals: '310 qtl', distance: '22 km', trend: 'up' },
      { name: 'Pune Market Yard', price: 2240, arrivals: '190 qtl', distance: '180 km', trend: 'flat' },
    ],
  },
  {
    id: 'cotton', name: 'Cotton', unit: 'quintal',
    trend: [6100, 6180, 6250, 6320, 6400, 6460, 6500],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
    forecast: 'rising',
    forecastNote: 'Export demand pushing prices up steadily; textile mills increasing procurement.',
    bestWindow: 'Prices trending up — holding another 5-7 days may improve realisation further.',
    mandis: [
      { name: 'Malegaon Mandi', price: 6500, arrivals: '180 qtl', distance: '45 km', trend: 'up' },
      { name: 'Nashik APMC', price: 6420, arrivals: '95 qtl', distance: '12 km', trend: 'up' },
    ],
  },
  {
    id: 'soybean', name: 'Soybean', unit: 'quintal',
    trend: [4550, 4520, 4500, 4480, 4460, 4470, 4450],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
    forecast: 'falling',
    forecastNote: 'Higher national output this season is pressuring prices lower across mandis.',
    bestWindow: 'Selling soon is advisable unless storage cost is low — further softening likely.',
    mandis: [
      { name: 'Nashik APMC', price: 4450, arrivals: '510 qtl', distance: '12 km', trend: 'down' },
      { name: 'Amravati Mandi', price: 4520, arrivals: '740 qtl', distance: '260 km', trend: 'down' },
    ],
  },
];

/* ---------------- VERIFIED BUYERS ---------------- */

export const BUYERS = [
  {
    id: 'B1', name: 'AgroFresh Exports Pvt Ltd', type: 'Exporter', crops: ['Tomato', 'Onion'], preferredGrades: ['Premium Quality'], reliability: 4.8, verified: true, volume: '1,200 qtl/month', distance: '8 km', payment: 'Within 24 hrs', tag: 'Top Rated',
    kyc: {
      businessKyc: 'verified', gstin: 'verified', gstinNumber: '27AAFCA5566K1Z8', pan: 'verified', panNumber: 'AAFCA5566K',
      fssai: 'verified', fssaiNumber: '10023045001234', bankAccount: 'verified', address: 'verified', addressText: 'MIDC Industrial Area, Nashik, Maharashtra',
      capacity: 'verified', capacityNote: 'Export handling capacity of 1,500 qtl/month confirmed against warehouse licence',
      transactions: 214, transactionVolume: '24,600 qtl since 2020', paymentScore: 97, disputes: 1, disputesResolved: 1, fulfilmentRate: 98,
    },
  },
  {
    id: 'B2', name: 'Nashik Valley Farmers FPO', type: 'FPO Aggregator', crops: ['Tomato', 'Onion', 'Wheat'], preferredGrades: ['Premium Quality', 'Grade A', 'Grade B'], reliability: 4.9, verified: true, volume: '3,400 qtl/month', distance: '5 km', payment: 'Within 48 hrs', tag: 'FPO Partner',
    kyc: {
      businessKyc: 'verified', gstin: 'verified', gstinNumber: '27AAJCS1122P1Z4', pan: 'verified', panNumber: 'AAJCS1122P',
      fssai: 'verified', fssaiNumber: '10023098887766', bankAccount: 'verified', address: 'verified', addressText: 'FPO Bhavan, Ozar Road, Nashik, Maharashtra',
      capacity: 'verified', capacityNote: 'Aggregation capacity of 4,000 qtl/month matches warehouse records',
      transactions: 312, transactionVolume: '41,200 qtl since 2019', paymentScore: 98, disputes: 0, disputesResolved: 0, fulfilmentRate: 99,
    },
  },
  {
    id: 'B3', name: 'Deccan Agro Processors', type: 'Processor', crops: ['Wheat', 'Soybean'], preferredGrades: ['Grade A', 'Grade B'], reliability: 4.5, verified: true, volume: '2,100 qtl/month', distance: '22 km', payment: 'Within 3 days', tag: 'Bulk Buyer',
    kyc: {
      businessKyc: 'verified', gstin: 'verified', gstinNumber: '27AADCD7788L1Z2', pan: 'verified', panNumber: 'AADCD7788L',
      fssai: 'verified', fssaiNumber: '10023076543210', bankAccount: 'verified', address: 'verified', addressText: 'Plot 14, MIDC Sinnar, Nashik, Maharashtra',
      capacity: 'verified', capacityNote: 'Milling capacity of 2,500 qtl/month matches factory licence on record',
      transactions: 96, transactionVolume: '11,800 qtl since 2021', paymentScore: 89, disputes: 2, disputesResolved: 2, fulfilmentRate: 93,
    },
  },
  {
    id: 'B4', name: 'Sharma Trading Co.', type: 'Local Trader', crops: ['Tomato', 'Cotton'], preferredGrades: ['Premium Quality', 'Grade A', 'Grade B'], reliability: 3.2, verified: false, volume: '180 qtl/month', distance: '3 km', payment: 'Cash on delivery', tag: 'Unverified',
    kyc: {
      businessKyc: 'pending', gstin: 'not_verified', gstinNumber: null, pan: 'pending', panNumber: null,
      fssai: 'not_applicable', fssaiNumber: null, bankAccount: 'not_verified', address: 'not_verified', addressText: 'Address on file could not be confirmed',
      capacity: 'not_verified', capacityNote: 'No capacity or storage records on file to verify claimed volume',
      transactions: 8, transactionVolume: '180 qtl since 2024', paymentScore: 54, disputes: 3, disputesResolved: 1, fulfilmentRate: 71,
    },
  },
  {
    id: 'B5', name: 'Maharashtra Cotton Mills', type: 'Processor', crops: ['Cotton'], preferredGrades: ['Grade A', 'Grade B'], reliability: 4.6, verified: true, volume: '900 qtl/month', distance: '45 km', payment: 'Within 5 days', tag: 'Bulk Buyer',
    kyc: {
      businessKyc: 'verified', gstin: 'verified', gstinNumber: '27AACCM3344N1Z6', pan: 'verified', panNumber: 'AACCM3344N',
      fssai: 'not_applicable', fssaiNumber: null, bankAccount: 'verified', address: 'verified', addressText: 'Mill Road, Malegaon, Nashik, Maharashtra',
      capacity: 'verified', capacityNote: 'Ginning & processing capacity of 1,800 qtl/month confirmed against factory licence',
      transactions: 58, transactionVolume: '9,400 qtl since 2022', paymentScore: 91, disputes: 1, disputesResolved: 1, fulfilmentRate: 95,
    },
  },
];

/* ---------------- NET REALISATION OPTIONS (for a given lot) ---------------- */
// Precomputed to match the pitch-deck mock: FPO Combined Lot nets ₹1,520/qtl after costs.

export const LOT_OPTIONS = {
  'LOT-1042': [
    {
      id: 'opt1', label: 'FPO Combined Lot', buyer: 'AgroFresh Exports Pvt Ltd', buyerId: 'B1',
      basePrice: 1650, transport: 80, commission: 50, storage: 0,
      distance: '8 km', pickup: 'Pickup in 1 day', verified: true, reliability: 4.8,
      reasons: ['Better net realisation than other options', 'Buyer is verified & reliable', 'Short distance – low transport cost', 'High demand for your grade'],
      best: true,
    },
    {
      id: 'opt2', label: 'Nashik APMC Mandi', buyer: 'Open Mandi Auction', buyerId: null,
      basePrice: 1580, transport: 40, commission: 90, storage: 0,
      distance: '12 km', pickup: 'Pickup in 2 days', verified: true, reliability: 4.0,
      reasons: ['Standard mandi commission reduces net return', 'Slightly farther than FPO pickup point'],
      best: false,
    },
    {
      id: 'opt3', label: 'Sharma Trading Co. (Local Trader)', buyer: 'Sharma Trading Co.', buyerId: 'B4',
      basePrice: 1500, transport: 20, commission: 0, storage: 0,
      distance: '3 km', pickup: 'Pickup same day', verified: false, reliability: 3.2,
      reasons: ['Lowest base price offered', 'Buyer reliability not verified — payment risk'],
      best: false,
    },
    {
      id: 'opt4', label: 'Lasalgaon Mandi', buyer: 'Open Mandi Auction', buyerId: null,
      basePrice: 1700, transport: 150, commission: 80, storage: 0,
      distance: '35 km', pickup: 'Pickup in 2 days', verified: true, reliability: 4.0,
      reasons: ['Highest base price but long-distance transport cost erodes the gain'],
      best: false,
    },
  ],
};

function computeNet(o) {
  return o.basePrice - o.transport - o.commission - o.storage;
}
LOT_OPTIONS['LOT-1042'].forEach((o) => { o.net = computeNet(o); });

/* ---------------- ORDERS / TRANSACTIONS ---------------- */

export const ORDERS = [
  {
    id: 'ORD-8891',
    lotId: 'LOT-1038',
    crop: 'Onion', quantity: 45, unit: 'Quintals',
    buyer: 'Nashik Valley Farmers FPO',
    rate: 1640, amount: 73800,
    stage: 3, // index into ORDER_STAGES (0-based, current stage)
    date: '2 Jun 2026',
  },
  {
    id: 'ORD-8845',
    lotId: 'LOT-1021',
    crop: 'Wheat', quantity: 60, unit: 'Quintals',
    buyer: 'Deccan Agro Processors',
    rate: 2210, amount: 132600,
    stage: 4,
    date: '18 May 2026',
  },
];

// Accepted -> Pickup -> Transit -> Delivered -> Payment, matching "Order & Delivery Tracking".
export const ORDER_STAGES = ['Offer Accepted', 'Picked Up', 'In Transit', 'Delivered', 'Payment Received'];

/* ---------------- LOGISTICS: TRANSPORT & STORAGE ---------------- */
// Aggregated transport and storage options — closes the "transport and storage options"
// gap from the problem statement and supports the "reduced post-harvest loss" outcome.

// lat/lon let the UI compute *real* distance from the farmer's live GPS position instead of
// showing the same fixed "distance" string to everyone regardless of where they actually are.
export const TRANSPORT_PROVIDERS = [
  { id: 'T1', name: 'Patil Logistics', vehicle: 'Mini Truck (3 tonne)', ratePerKm: 22, distance: '8 km', lat: 20.0475, lon: 73.8398, eta: 'Pickup in 3 hrs', rating: 4.7, verified: true, phone: '+91 98220 11223' },
  { id: 'T2', name: 'Nashik Valley FPO Fleet', vehicle: 'Truck (7 tonne)', ratePerKm: 18, distance: '5 km', lat: 20.0425, lon: 73.7898, eta: 'Pickup in 2 hrs', rating: 4.9, verified: true, phone: '+91 98230 44556' },
  { id: 'T3', name: 'Shinde Transport Co.', vehicle: 'Tempo (1.5 tonne)', ratePerKm: 26, distance: '12 km', lat: 19.9275, lon: 73.8698, eta: 'Pickup tomorrow', rating: 4.2, verified: true, phone: '+91 97640 77889' },
  { id: 'T4', name: 'Local Tractor-Trolley', vehicle: 'Tractor Trolley (2 tonne)', ratePerKm: 15, distance: '3 km', lat: 19.9975, lon: 73.7608, eta: 'Pickup in 1 hr', rating: 3.8, verified: false, phone: '+91 90210 99887' },
];

export const STORAGE_FACILITIES = [
  { id: 'S1', name: 'Krishi Cold Storage', type: 'Cold Storage', tempRange: '2°C – 8°C', ratePerDay: 4, capacity: '150 MT available', distance: '6 km', lat: 19.9435, lon: 73.7898, rating: 4.6, verified: true, suitableFor: ['Tomato', 'Onion'] },
  { id: 'S2', name: 'Nashik Valley FPO Warehouse', type: 'Dry Warehouse', tempRange: 'Ambient', ratePerDay: 1.5, capacity: '500 MT available', distance: '5 km', lat: 19.9655, lon: 73.7578, rating: 4.8, verified: true, suitableFor: ['Wheat', 'Cotton', 'Soybean'] },
  { id: 'S3', name: 'AgroFresh Cold Chain Hub', type: 'Cold Storage', tempRange: '0°C – 4°C', ratePerDay: 5.5, capacity: '80 MT available', distance: '10 km', lat: 19.9975, lon: 73.8858, rating: 4.5, verified: true, suitableFor: ['Tomato', 'Onion', 'Soybean'] },
  { id: 'S4', name: 'Village Community Godown', type: 'Dry Warehouse', tempRange: 'Ambient', ratePerDay: 1, capacity: '220 MT available', distance: '2 km', lat: 20.0155, lon: 73.7898, rating: 4.0, verified: false, suitableFor: ['Wheat', 'Cotton'] },
];

/* ---------------- SHARED TRANSPORT ---------------- */
// One vehicle, several farmers: the trip's cost is split across every quintal on board, so
// the per-quintal price falls as the truck fills. `distanceKm` is billable km (both legs).
export const SHARED_TRIPS = [
  { id: 'ST1', route: 'Nashik → Lasalgaon Mandi', when: 'Tomorrow · 6:00 AM', providerId: 'T2', vehicle: 'Truck (7 tonne)', capacityQtl: 70, bookedQtl: 38, distanceKm: 70, ratePerKm: 18, soloVehicle: 'Mini Truck (3 tonne)', soloRatePerKm: 22, soloCapacityQtl: 30 },
  { id: 'ST2', route: 'Nashik → Niphad Mandi', when: 'Thursday · 5:00 AM', providerId: 'T1', vehicle: 'Mini Truck (3 tonne)', capacityQtl: 30, bookedQtl: 12, distanceKm: 44, ratePerKm: 22, soloVehicle: 'Tractor Trolley (2 tonne)', soloRatePerKm: 15, soloCapacityQtl: 20 },
  { id: 'ST3', route: 'Nashik → Malegaon Mandi', when: 'Friday · 4:30 AM', providerId: 'T2', vehicle: 'Truck (7 tonne)', capacityQtl: 70, bookedQtl: 20, distanceKm: 90, ratePerKm: 18, soloVehicle: 'Tempo (1.5 tonne)', soloRatePerKm: 26, soloCapacityQtl: 15 },
];

/* ---------------- FPO POOLS ---------------- */
// Open pooling rounds. `pooledQty` is what *other* members have committed; the farmer's own
// contribution is stored separately. Crossing a tier raises the price for the whole pool.
export const POOLS = [
  { id: 'P1', crop: 'Tomato', grade: 'Premium Quality', buyerId: 'B1', buyer: 'AgroFresh Exports Pvt Ltd', basePrice: 1650, targetQty: 150, pooledQty: 70, closes: 'in 3 days', tiers: [{ minQty: 100, uplift: 40 }, { minQty: 150, uplift: 90 }] },
  { id: 'P2', crop: 'Onion', grade: 'Grade A', buyerId: 'B2', buyer: 'Nashik Valley Farmers FPO', basePrice: 1690, targetQty: 200, pooledQty: 95, closes: 'in 4 days', tiers: [{ minQty: 150, uplift: 35 }, { minQty: 200, uplift: 80 }] },
  { id: 'P3', crop: 'Wheat', grade: 'Grade A', buyerId: 'B3', buyer: 'Deccan Agro Processors', basePrice: 2240, targetQty: 300, pooledQty: 180, closes: 'in 5 days', tiers: [{ minQty: 200, uplift: 30 }, { minQty: 300, uplift: 70 }] },
  { id: 'P4', crop: 'Soybean', grade: 'Grade A', buyerId: 'B3', buyer: 'Deccan Agro Processors', basePrice: 4480, targetQty: 250, pooledQty: 120, closes: 'in 6 days', tiers: [{ minQty: 150, uplift: 40 }, { minQty: 250, uplift: 90 }] },
];

/* ---------------- FPO ---------------- */

export const FPO_INFO = {
  name: 'Nashik Valley Farmers FPO',
  members: 186,
  pooled: '1,240 quintals pooled this week',
  bargainGain: '+9% avg. price vs. individual sale',
  benefits: [
    'Combine your lot with nearby farmers for stronger bargaining power',
    'Access bulk buyers who need consistent volume & quality',
    'Shared logistics reduces per-farmer transport cost',
    'FPO-verified quality records speed up buyer trust',
  ],
};

/* ---------------- ASSISTANT ---------------- */

export const ASSISTANT_SUGGESTIONS = [
  'When should I sell my tomato lot?',
  'Who are the verified buyers near me?',
  'What is my expected net return?',
  'Should I join the FPO combined lot?',
];

export const BUYER_ASSISTANT_SUGGESTIONS = [
  'Which verified farmers have tomato available?',
  'What are today\'s mandi prices?',
  'How do I check my offer status?',
  'Which FPOs can supply bulk volume?',
];

/* ---------------- QUALITY GRADING (reused inside lot creation) ---------------- */

export const PEST_TIPS = [
  'Take clear, well-lit photos of the produce sample',
  'Include a representative scoop, not just the best-looking pieces',
  'Avoid blurry or dark images for accurate grading',
  'Grading result determines which buyers/specs your lot matches',
];
