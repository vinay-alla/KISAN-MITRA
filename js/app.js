import { icon, iconFilled, navIcon, kisanMitraMark } from './icons.js';
import {
  FARMER_BOTTOM_NAV, FARMER_MORE_NAV, BUYER_BOTTOM_NAV, BUYER_MORE_NAV,
  FPO_OPERATOR_BOTTOM_NAV, FPO_OPERATOR_MORE_NAV,
  ROLE_RESTRICTED_PATHS, ALERTS,
} from './data.js';
import { ROUTES, renderDynamic, setNavigator } from './pages.js';
import { closeModal, openModal } from './ui.js';
import { store } from './store.js';
import { t } from './i18n.js';

const headerEl = document.getElementById('app-header');
const mainEl = document.getElementById('app-main');
const bottomNavEl = document.getElementById('bottom-nav');
const overlayEl = document.getElementById('menu-overlay');

let menuOpen = false;

function currentPath() {
  const h = location.hash.replace(/^#/, '') || '/';
  return h;
}

function isActive(path, navPath) {
  const p = navPath.slice(1); // strip '#'
  if (p === '/') return path === '/';
  return path === p || path.startsWith(p + '/');
}

function navFor(role) {
  if (role === 'buyer') return { bottom: BUYER_BOTTOM_NAV, more: BUYER_MORE_NAV };
  if (role === 'fpo_operator') return { bottom: FPO_OPERATOR_BOTTOM_NAV, more: FPO_OPERATOR_MORE_NAV };
  return { bottom: FARMER_BOTTOM_NAV, more: FARMER_MORE_NAV };
}

const ROLE_BADGE = { buyer: 'BUYER', fpo_operator: 'FPO OPERATOR' };

function renderHeader(path) {
  const user = store.get().user;
  const { bottom, more } = navFor(user?.role);
  headerEl.innerHTML = `
    <div class="max-w-5xl mx-auto flex items-center justify-between gap-3 px-4 md:px-6 py-3">
      <a href="#/" class="flex items-center gap-2.5 shrink-0">
        <div class="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center shadow-soft">${kisanMitraMark('w-6 h-6')}</div>
        <span class="font-display font-extrabold text-lg tracking-tight">Kisan Mitra</span>
        ${ROLE_BADGE[user?.role] ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary/15 text-secondary">${ROLE_BADGE[user.role]}</span>` : ''}
      </a>

      <nav class="hidden lg:flex items-center gap-1 overflow-x-auto scrollbar-none">
        ${bottom.concat(more).map((n) => `
          <a href="${n.path}" class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition ${isActive(path, n.path) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}">
            ${navIcon(n.icon, 'w-5 h-5')} ${t(n.label)}
          </a>`).join('')}
      </nav>

      <div class="flex items-center gap-2 shrink-0">
        <button id="bell-toggle" class="relative w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-muted transition">
          ${iconFilled('bell', 'w-5 h-5')}
          <span class="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-destructive"></span>
        </button>
        <button id="menu-toggle" class="lg:hidden w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-muted transition">
          ${menuOpen ? icon('x', 'w-5 h-5') : iconFilled('menu', 'w-5 h-5')}
        </button>
      </div>
    </div>`;

  headerEl.querySelector('#menu-toggle').addEventListener('click', () => {
    menuOpen = !menuOpen;
    renderHeader(currentPath());
    renderOverlay(currentPath());
  });

  headerEl.querySelector('#bell-toggle').addEventListener('click', () => {
    openModal(`
      <div class="p-5">
        <h3 class="font-extrabold text-lg mb-3">${t('🔔 Market Alerts')}</h3>
        <div class="space-y-3">
          ${ALERTS.map((a) => `
            <div class="flex items-start gap-3">
              ${icon('alert', `w-5 h-5 mt-0.5 ${a.level === 'HIGH' ? 'text-destructive' : a.level === 'MEDIUM' ? 'text-accent' : 'text-muted-foreground'}`)}
              <div>
                <div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-sm">${a.title}</span><span class="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-muted text-muted-foreground">${a.level}</span></div>
                <p class="text-sm text-muted-foreground mt-1">${a.desc}</p>
                <p class="text-xs text-muted-foreground mt-1">${a.time}</p>
              </div>
            </div>`).join('')}
        </div>
        <button data-close class="w-full mt-4 border border-border rounded-xl py-2.5 font-semibold">Close</button>
      </div>`);
  });
}

function renderOverlay(path) {
  if (!menuOpen) { overlayEl.classList.add('hidden'); overlayEl.innerHTML = ''; return; }
  const user = store.get().user;
  const { bottom, more } = navFor(user?.role);
  overlayEl.classList.remove('hidden');
  const items = bottom.concat(more);
  overlayEl.innerHTML = `
    <div class="absolute inset-0 bg-black/40" data-close-menu></div>
    <div class="absolute top-0 inset-x-0 bg-background border-b border-border shadow-xl max-h-[80vh] overflow-y-auto">
      <div class="max-w-5xl mx-auto px-4 md:px-6 py-4 pt-[64px]">
        <div class="grid grid-cols-2 gap-2.5">
          ${items.map((n) => `
            <a href="${n.path}" class="flex items-center gap-2 px-4 py-3 rounded-xl border font-bold text-sm transition ${isActive(path, n.path) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-muted'}">
              ${navIcon(n.icon, 'w-6 h-6')} ${t(n.label)}
            </a>`).join('')}
        </div>
      </div>
    </div>`;
  overlayEl.querySelector('[data-close-menu]').addEventListener('click', () => {
    menuOpen = false;
    renderHeader(currentPath());
    renderOverlay(currentPath());
  });
}

function renderBottomNav(path) {
  const user = store.get().user;
  const { bottom } = navFor(user?.role);
  bottomNavEl.innerHTML = `
    <div class="grid grid-cols-5">
      ${bottom.map((n) => {
        const active = isActive(path, n.path);
        return `
        <a href="${n.path}" class="relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold transition">
          ${active ? '<span class="absolute top-0 w-8 h-1 rounded-full bg-primary"></span>' : ''}
          <span class="px-3 py-1 rounded-full transition-all ${active ? 'bg-primary-light shadow-soft scale-105' : ''}">${navIcon(n.icon, 'w-6 h-6')}</span>
          <span class="${active ? 'text-primary' : 'text-muted-foreground'}">${t(n.label)}</span>
        </a>`;
      }).join('')}
    </div>`;
}

function render() {
  const path = currentPath();
  const user = store.get().user;

  // Auth guard: no session -> force login (except the login page itself).
  if (!user && path !== '/login') { location.hash = '#/login'; return; }
  // Already logged in -> skip the login page.
  if (user && path === '/login') { location.hash = '#/'; return; }
  // Role-scoped routes: a path listed in ROLE_RESTRICTED_PATHS is only visible to the roles
  // named there; anything not listed is shared across every logged-in role.
  if (user) {
    const restriction = Object.entries(ROLE_RESTRICTED_PATHS).find(([p]) => path === p || path.startsWith(p + '/'));
    if (restriction && !restriction[1].includes(user.role)) { location.hash = '#/'; return; }
  }

  menuOpen = false;
  let result = ROUTES[path] ? ROUTES[path]() : renderDynamic(path);
  if (!result) result = ROUTES[user ? '/' : '/login']();
  const { html, mount } = result;
  mainEl.innerHTML = html;
  if (mount) mount(mainEl);

  const showChrome = path !== '/login';
  headerEl.classList.toggle('hidden', !showChrome);
  bottomNavEl.classList.toggle('hidden', !showChrome);
  if (showChrome) {
    renderHeader(path);
    renderBottomNav(path);
    renderOverlay(path);
  }
  closeModal();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

window.addEventListener('hashchange', render);

setNavigator((hash) => {
  if (location.hash === hash) { render(); return; }
  location.hash = hash;
});

if (!location.hash) location.hash = '#/';
render();
