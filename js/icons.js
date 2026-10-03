// Minimal stroke-style icon set (lucide-inspired), returns SVG markup string.
// Usage: icon('home', 'w-5 h-5')
const PATHS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 12.06 3.5 3.5 0 0 0 7 18Z"/>',
  'cloud-sun': '<path d="M6 15a4 4 0 1 0 0-8"/><path d="M12 3v2M4.2 4.2l1.4 1.4M2 10h2"/><path d="M9.5 18h8a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.6 12.6 3 3 0 0 0 9.5 18Z"/>',
  'cloud-rain': '<path d="M7 16h9a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 10.06 3.5 3.5 0 0 0 7 16Z"/><path d="M8 19v1M12 19v2M16 19v1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sprout: '<path d="M7 10c0 3 2 5 5 5s5-2 5-5c-3 0-5 1-5 3 0-3-2-4-5-3Z"/><path d="M12 15v7M9 22h6"/>',
  bug: '<path d="M8 7V5a4 4 0 1 1 8 0v2"/><rect x="6" y="8" width="12" height="11" rx="5"/><path d="M6 12H3M21 12h-3M6 17l-2 2M18 17l2 2M6 8l-2-2M18 8l2-2M12 8v11"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h5M14 7h5"/><path d="m5 7-3 6a3 3 0 0 0 6 0Z"/><path d="m19 7-3 6a3 3 0 0 0 6 0Z"/>',
  snowflake: '<path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11"/><path d="M12 2 9 5M12 2l3 3M12 22l-3-3M12 22l3-3M4.5 6.5 3 5M4.5 6.5l1 3M19.5 6.5 21 5M19.5 6.5l-1 3M4.5 17.5 3 19M4.5 17.5l1-3M19.5 17.5 21 19M19.5 17.5l-1-3"/>',
  store: '<path d="M3 9 4 4h16l1 5"/><path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 20v-6h6v6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 9a2.8 2.8 0 1 0 0-5.6"/><path d="M15 14.2a5.5 5.5 0 0 1 5.5 5.8h-3"/>',
  trending: '<path d="m3 16 6-6 4 4 8-9"/><path d="M15 5h6v6"/>',
  landmark: '<path d="M3 21h18M4 21V10M20 21V10M2 10l10-6 10 6M6 10v11M10 10v11M14 10v11M18 10v11"/>',
  message: '<path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-5 4V5a1 1 0 0 1 1-1Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  phone: '<path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1.3 1.3 0 0 1 1.3-.3c1.2.4 2.5.6 3.8.6a1.3 1.3 0 0 1 1.3 1.3V21a1.3 1.3 0 0 1-1.3 1.3C10.6 22.3 1.7 13.4 1.7 2.6A1.3 1.3 0 0 1 3 1.3h4.2a1.3 1.3 0 0 1 1.3 1.3c0 1.3.2 2.6.6 3.8a1.3 1.3 0 0 1-.3 1.3Z"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  star: '<path d="m12 2 3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 18l-6.4 3.7 1.4-7.2-5.3-5 7.2-.9Z"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  droplet: '<path d="M12 2s6.5 7.4 6.5 12A6.5 6.5 0 0 1 5.5 14C5.5 9.4 12 2 12 2Z"/>',
  wind: '<path d="M3 8h11a2.5 2.5 0 1 0-2.2-3.6M3 16h14a2.5 2.5 0 1 1-2.2 3.6M3 12h17a2.5 2.5 0 1 0-2.2-3.6"/>',
  alert: '<path d="M10.6 3.5 2 19h20L13.4 3.5a1.6 1.6 0 0 0-2.8 0Z"/><path d="M12 10v4M12 17.5v.1"/>',
  thermometer: '<path d="M10 14.8V4a2 2 0 1 1 4 0v10.8a4.5 4.5 0 1 1-4 0Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  camera: '<path d="M4 8a2 2 0 0 1 2-2h1.5l1-2h7l1 2H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m4 19 5.5-5.5a2 2 0 0 1 2.8 0L15 16.2M15 16l1.6-1.6a2 2 0 0 1 2.8 0L21 16.5"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  heart: '<path d="M12 21S3.8 15.4 3.8 9.4A4.9 4.9 0 0 1 12 6a4.9 4.9 0 0 1 8.2 3.4C20.2 15.4 12 21 12 21Z"/>',
  msgSquare: '<path d="M4 5h16v11H8l-4 4Z"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  navigation: '<path d="m12 2 8 19-8-4-8 4Z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="m9 13.5-1.5 7L12 18l4.5 2.5-1.5-7"/>',
  zap: '<path d="M12 2 4 14h6l-1 8 9-13h-6Z"/>',
  banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v.01M18 14v.01"/>',
  filter: '<path d="M4 5h16l-6.5 7.5V19l-3 2v-8.5Z"/>',
  send: '<path d="m3 11 18-8-8 18-2-8-8-2Z"/>',
  loader: '<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13a13 13 0 0 1 13-13c1 8-3 14-6 20Z"/><path d="M4 13c4 0 7-2 9-6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.3 6.4M3 12a9 9 0 0 1 15.3-6.4M21 3v6h-6M3 21v-6h6"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  truck: '<rect x="1" y="7" width="13" height="10" rx="1"/><path d="M14 10h4l3 3v4h-7Z"/><circle cx="5.5" cy="18.5" r="1.7"/><circle cx="16.5" cy="18.5" r="1.7"/>',
  package: '<path d="m3.3 7 8.7 5 8.7-5M12 22V12"/><path d="M20 7v10a1 1 0 0 1-.5.87l-7 4a1 1 0 0 1-1 0l-7-4A1 1 0 0 1 4 17V7a1 1 0 0 1 .5-.87l7-4a1 1 0 0 1 1 0l7 4A1 1 0 0 1 20 7Z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="8.5" y="2.3" width="7" height="3.4" rx="1"/><path d="M8.5 11h7M8.5 15h7M8.5 19h4"/>',
  receipt: '<path d="M6 2h12v20l-2.5-1.5L13 22l-1-1.5L10 22l-2.5-1.5L6 22Z"/><path d="M8.5 7h7M8.5 11h7M8.5 15h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  barChart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 12h4"/>',
  badgeCheck: '<path d="m12 2 2.4 1.4 2.8-.3 1.4 2.4 2.4 1.4-.3 2.8L22 12l-1.3 2.4.3 2.8-2.4 1.4-1.4 2.4-2.8-.3L12 22l-2.4-1.4-2.8.3-1.4-2.4-2.4-1.4.3-2.8L2 12l1.3-2.4-.3-2.8 2.4-1.4L6.8 3l2.8.3Z"/><path d="m9 12 2 2 4-4"/>',
  languages: '<path d="M4 5h7M7.5 3v2c0 4.5-1.5 8-5 10M4.5 12a8.5 8.5 0 0 0 5.5 3M14 21l4-9 4 9M15.5 18h5"/>',
  arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8v.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  volume: '<path d="M4 9v6h4l5 5V4L8 9Z"/><path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a9 9 0 0 1 0 13"/>',
  volumeOff: '<path d="M4 9v6h4l5 5V4L8 9Z"/><path d="m16 9 6 6M22 9l-6 6"/>',
  // Crop badges — flat line-art in the same style as the rest of the icon set,
  // used instead of emoji so produce icons render consistently across platforms.
  tomato: '<circle cx="12" cy="13" r="7"/><path d="M12 6c-1.6 0-2.6-1.5-2.1-3.1 1 .3 1.8 1 2.1 2 .3-1 1.1-1.7 2.1-2 .5 1.6-.5 3.1-2.1 3.1Z"/>',
  onion: '<path d="M12 3c3.5 3 6 7.4 6 10.8a6 6 0 0 1-12 0C6 10.4 8.5 6 12 3Z"/><path d="M12 3c.5-.8 1.3-1.2 2.1-1.3M12 3c-.5-.8-1.3-1.2-2.1-1.3"/>',
  wheat: '<path d="M12 22V9"/><path d="M12 9c-1.8-.6-2.9-2.3-2.5-4.1M12 9c1.8-.6 2.9-2.3 2.5-4.1"/><path d="M12 13.3c-1.8-.6-2.9-2.3-2.5-4.1M12 13.3c1.8-.6 2.9-2.3 2.5-4.1"/><path d="M12 17.6c-1.8-.6-2.9-2.3-2.5-4.1M12 17.6c1.8-.6 2.9-2.3 2.5-4.1"/>',
  cotton: '<circle cx="9" cy="8" r="3"/><circle cx="15" cy="8" r="3"/><circle cx="12" cy="5.3" r="3"/><circle cx="12" cy="10.7" r="3"/><path d="M12 14v7"/>',
  soybean: '<path d="M7.5 6c-2 3-2 10.2 0 13.2 2 1.4 7 1.4 9 0 2-3 2-10.2 0-13.2-2-1.4-7-1.4-9 0Z"/><path d="M7 10.6c2 1 8 1 10 0M7 14.8c2 1 8 1 10 0"/>',
  basket: '<path d="M4 10h16l-1.6 8.8A2 2 0 0 1 16.4 20H7.6a2 2 0 0 1-2-1.2L4 10Z"/><path d="m5 10 3.5-6h7L19 10"/><path d="M9 10V6.5M15 10V6.5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
};

export function icon(name, cls = 'w-5 h-5', strokeWidth = 2) {
  const p = PATHS[name] || PATHS.circle || '<circle cx="12" cy="12" r="9"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="${cls}">${p}</svg>`;
}

// Bold, solid "filled" glyphs — used for navigation (bottom tab bar, header nav, menu
// overlay) instead of the thin PATHS outline set, so primary navigation reads as a real
// polished app rather than sketch-thin line icons. Still single-colour/currentColor so
// the existing active/inactive tinting keeps working unchanged.
const PATHS_FILLED = {
  home: '<path d="M12 2.7 2.5 10.9h2.1v9.1a1 1 0 0 0 1 1H18.4a1 1 0 0 0 1-1v-9.1h2.1L12 2.7Z"/>',
  barChart: '<rect x="3.5" y="13" width="4" height="8" rx="1.1"/><rect x="10" y="6" width="4" height="15" rx="1.1"/><rect x="16.5" y="10" width="4" height="11" rx="1.1"/>',
  package: '<path d="M12 2 21 7v10l-9 5-9-5V7Z"/><path d="M12 2 21 7l-9 5-9-5Z" opacity="0.4"/>',
  clipboard: '<rect x="4.5" y="4" width="15" height="17.5" rx="2.2"/><rect x="8.2" y="2.3" width="7.6" height="3.6" rx="1.3"/>',
  user: '<circle cx="12" cy="8" r="4.2"/><path d="M4 20.5a8 8 0 0 1 16 0 1 1 0 0 1-1 1.5H5a1 1 0 0 1-1-1.5Z"/>',
  users: '<circle cx="15.5" cy="8.5" r="3.3" opacity="0.6"/><path d="M9.5 19.5a6 6 0 0 1 11.5-2.3 1 1 0 0 1-.9 1.4H10a1 1 0 0 1-1-1.1Z" opacity="0.6"/><circle cx="8.5" cy="8" r="3.8"/><path d="M2 19.8a6.5 6.5 0 0 1 13 0 1 1 0 0 1-1 1.2H3a1 1 0 0 1-1-1.2Z"/>',
  scale: '<rect x="11" y="2" width="2" height="18" rx="1"/><rect x="3" y="6.2" width="18" height="2" rx="1"/><circle cx="4.5" cy="12" r="3" opacity="0.85"/><circle cx="19.5" cy="12" r="3" opacity="0.85"/><rect x="2" y="20.3" width="20" height="1.8" rx="0.9"/>',
  message: '<path d="M4 4h16a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-5.5 4.3V5.5A1.5 1.5 0 0 1 4 4Z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><circle cx="12" cy="20" r="1.8"/>',
  menu: '<rect x="3" y="5.2" width="18" height="2.6" rx="1.3"/><rect x="3" y="10.7" width="18" height="2.6" rx="1.3"/><rect x="3" y="16.2" width="18" height="2.6" rx="1.3"/>',
};

export function iconFilled(name, cls = 'w-5 h-5') {
  const p = PATHS_FILLED[name] || PATHS[name] || '<circle cx="12" cy="12" r="9"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="${cls}">${p}</svg>`;
}

// Real, full-colour icon graphics (Icons8 Fluency set) for primary navigation — the bottom
// tab bar, desktop header nav, and hamburger menu — so those read as polished/realistic
// rather than flat single-colour glyphs. Since these are raster images they don't tint with
// currentColor; active vs. inactive is instead shown via the pill/background behind them.
const NAV_IMAGES = {
  home: 'home.png',
  barChart: 'market.png',
  package: 'lots.png',
  clipboard: 'orders.png',
  user: 'profile.png',
  users: 'people.png',
  scale: 'scale.png',
  message: 'chat.png',
  truck: 'truck.png',
  'cloud-sun': 'weather.png',
};

export function navIcon(name, cls = 'w-5 h-5') {
  const file = NAV_IMAGES[name];
  if (!file) return iconFilled(name, cls);
  return `<img src="./assets/nav-icons/${file}" alt="" class="${cls} object-contain" />`;
}

// The Kisan Mitra brand mark: an India-map silhouette with a leaf overlaid on it, shipped
// as a transparent PNG (background-removed) so it drops cleanly onto any badge colour.
export function kisanMitraMark(cls = 'w-6 h-6') {
  return `<img src="./assets/logo-192.png" alt="Kisan Mitra" class="${cls} object-contain" />`;
}
