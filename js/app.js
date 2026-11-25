import { icon, iconFilled, navIcon, kisanMitraMark } from './icons.js';
import {
  FARMER_BOTTOM_NAV, FARMER_MORE_NAV, BUYER_BOTTOM_NAV, BUYER_MORE_NAV,
  FPO_OPERATOR_BOTTOM_NAV, FPO_OPERATOR_MORE_NAV, ALERTS,
} from './data.js';
import { ROUTES, renderDynamic, setNavigator } from './pages.js';
import { closeModal, openModal, toast } from './ui.js';
import { store } from './store.js';
import { t, currentLangCode } from './i18n.js';
import { esc } from './util.js';
import { api } from './api.js';
import { canAccess } from './logic.js';
import { initRemote, isRemote, isLive, fetchNotifications, markNotificationsRead } from './remote.js';

const headerEl = document.getElementById('app-header');
const mainEl = document.getElementById('app-main');
const bottomNavEl = document.getElementById('bottom-nav');
const overlayEl = document.getElementById('menu-overlay');

let menuOpen = false;
let moreOpen = false; // desktop "More" dropdown

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
  const moreActive = more.some((n) => isActive(path, n.path));
  headerEl.innerHTML = `
    <div class="max-w-5xl mx-auto flex items-center justify-between gap-3 px-4 md:px-6 py-3">
      <a href="#/" aria-label="Kisan Mitra — home" class="flex items-center gap-2.5 shrink-0">
        <div class="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center shadow-soft">${kisanMitraMark('w-6 h-6')}</div>
        <span class="font-display font-extrabold text-lg tracking-tight">Kisan Mitra</span>
        ${ROLE_BADGE[user?.role] ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary/15 text-secondary">${ROLE_BADGE[user.role]}</span>` : ''}
      </a>

      <nav aria-label="Main" class="hidden lg:flex items-center gap-1">
        ${bottom.map((n) => `
          <a href="${n.path}" ${isActive(path, n.path) ? 'aria-current="page"' : ''} class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition ${isActive(path, n.path) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}">
            ${navIcon(n.icon, 'w-5 h-5')} ${t(n.label)}
          </a>`).join('')}
        <div class="relative">
          <button id="more-toggle" aria-haspopup="true" aria-expanded="${moreOpen}" class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition ${moreActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}">
            ${t('More')} ${icon('chevronDown', `w-4 h-4 transition ${moreOpen ? 'rotate-180' : ''}`)}
          </button>
          ${moreOpen ? `
          <div id="more-panel" class="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-xl p-1.5 z-50">
            ${more.map((n) => `
              <a href="${n.path}" ${isActive(path, n.path) ? 'aria-current="page"' : ''} class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold transition ${isActive(path, n.path) ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}">
                ${navIcon(n.icon, 'w-5 h-5')} ${t(n.label)}
              </a>`).join('')}
          </div>` : ''}
        </div>
      </nav>

      <div class="flex items-center gap-2 shrink-0">
        <span id="live-badge" title="${t('Live updates connected')}" class="${isRemote() && isLive() ? '' : 'hidden'} items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-1 hidden sm:inline-flex"><span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>${t('Live')}</span>
        <button id="bell-toggle" aria-label="Market alerts" class="relative w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-muted transition">
          ${iconFilled('bell', 'w-5 h-5')}
          ${!isRemote() || store.get().remote.unread > 0 ? '<span class="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-destructive"></span>' : ''}
        </button>
        <button id="menu-toggle" aria-label="${menuOpen ? 'Close menu' : 'Open menu'}" aria-expanded="${menuOpen}" class="lg:hidden w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-muted transition">
          ${menuOpen ? icon('x', 'w-5 h-5') : iconFilled('menu', 'w-5 h-5')}
        </button>
      </div>
    </div>`;

  headerEl.querySelector('#more-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    moreOpen = !moreOpen;
    renderHeader(currentPath());
    if (moreOpen) headerEl.querySelector('#more-panel a')?.focus();
  });

  headerEl.querySelector('#menu-toggle').addEventListener('click', () => {
    menuOpen = !menuOpen;
    renderHeader(currentPath());
    renderOverlay(currentPath());
  });

  headerEl.querySelector('#bell-toggle').addEventListener('click', async () => {
    // Real notifications (bids, accepted offers, order and grievance updates) when signed in to a backend.
    let mine = '';
    if (isRemote()) {
      try {
        const { notifications } = await fetchNotifications();
        mine = notifications.length ? `
          <h3 class="font-extrabold text-lg mb-3">${t('🔔 Your notifications')}</h3>
          <div class="space-y-3 mb-5">
            ${notifications.map((n) => `
              <a href="${n.link && n.link.startsWith('#/') ? esc(n.link) : '#/'}" data-close class="block rounded-xl border border-border p-3 ${n.read ? '' : 'bg-primary-light'}">
                <div class="font-bold text-sm">${esc(n.title)}</div>
                ${n.body ? `<div class="text-xs text-muted-foreground mt-0.5">${esc(n.body)}</div>` : ''}
                <div class="text-[10px] text-muted-foreground mt-1">${esc(new Date(n.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</div>
              </a>`).join('')}
          </div>` : `<p class="text-sm text-muted-foreground mb-5">${t('No new notifications.')}</p>`;
        if (notifications.some((n) => !n.read)) markNotificationsRead().then(() => renderHeader(currentPath())).catch(() => {});
      } catch { /* fall back to market alerts only */ }
    }
    openModal(`
      <div class="p-5">
        ${mine}
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
    <div role="dialog" aria-label="Menu" class="absolute top-0 inset-x-0 bg-background border-b border-border shadow-xl max-h-[80vh] overflow-y-auto">
      <div class="max-w-5xl mx-auto px-4 md:px-6 py-4 pt-[64px]">
        <div class="grid grid-cols-2 gap-2.5">
          ${items.map((n) => `
            <a href="${n.path}" ${isActive(path, n.path) ? 'aria-current="page"' : ''} class="flex items-center gap-2 px-4 py-3 rounded-xl border font-bold text-sm transition ${isActive(path, n.path) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-muted'}">
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
    <div class="grid grid-cols-5" role="list">
      ${bottom.map((n) => {
        const active = isActive(path, n.path);
        return `
        <a href="${n.path}" role="listitem" ${active ? 'aria-current="page"' : ''} class="relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold transition">
          ${active ? '<span class="absolute top-0 w-8 h-1 rounded-full bg-primary"></span>' : ''}
          <span class="px-3 py-1 rounded-full transition-all ${active ? 'bg-primary-light shadow-soft scale-105' : ''}">${navIcon(n.icon, 'w-6 h-6')}</span>
          <span class="${active ? 'text-primary' : 'text-muted-foreground'}">${t(n.label)}</span>
        </a>`;
      }).join('')}
    </div>`;
}

function errorPageHtml() {
  return `
    <div class="page-enter px-4 md:px-6 pt-10">
      <div class="card p-6 text-center max-w-md mx-auto">
        <div class="mx-auto w-14 h-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-3">${icon('alert', 'w-7 h-7')}</div>
        <h1 class="font-display text-xl font-extrabold">Something went wrong</h1>
        <p class="text-sm text-muted-foreground mt-1">This page hit an unexpected problem. Your data is safe — try again, or head back home.</p>
        <div class="flex gap-2 mt-5">
          <button id="err-retry" class="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl">Try again</button>
          <a href="#/" class="flex-1 border border-border font-bold py-2.5 rounded-xl text-center">Go home</a>
        </div>
        <button id="err-reset" class="mt-4 text-xs font-semibold text-muted-foreground underline underline-offset-2">Still broken? Reset saved data</button>
      </div>
    </div>`;
}

function wireErrorPage(root) {
  root.querySelector('#err-retry')?.addEventListener('click', () => location.reload());
  root.querySelector('#err-reset')?.addEventListener('click', () => {
    if (window.confirm('This clears your account and all saved data in this browser. Continue?')) {
      store.resetAll();
      location.hash = '#/login';
      location.reload();
    }
  });
}

// Last-resort handlers: surface unexpected runtime errors instead of failing silently.
let lastErrorToast = 0;
function reportRuntimeError(detail) {
  console.error(detail);
  const now = Date.now();
  if (now - lastErrorToast < 4000) return;
  lastErrorToast = now;
  toast('Something went wrong. Please try again.', { tone: 'error' });
}
window.addEventListener('error', (e) => {
  if (String(e.message).includes('ResizeObserver')) return;
  reportRuntimeError(e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => reportRuntimeError(e.reason));

let storageWarned = false;
window.addEventListener('km:storage-failed', () => {
  if (storageWarned) return;
  storageWarned = true;
  toast('Your browser could not save the latest changes (storage is full or blocked). They will be lost when you close this tab.', { tone: 'error' });
});

// Escape closes the mobile menu (modals handle Escape themselves).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (menuOpen || moreOpen)) {
    const returnFocus = moreOpen;
    menuOpen = false;
    moreOpen = false;
    renderHeader(currentPath());
    renderOverlay(currentPath());
    if (returnFocus) headerEl.querySelector('#more-toggle')?.focus();
  }
});

// Click anywhere outside the dropdown closes it.
document.addEventListener('click', (e) => {
  if (moreOpen && !e.target.closest('#more-panel')) {
    moreOpen = false;
    renderHeader(currentPath());
  }
});

function render() {
  const path = currentPath();
  const user = store.get().user;

  // Auth guard: no session -> force login (except the login page itself).
  if (!user && path !== '/login') { location.hash = '#/login'; return; }
  // Already logged in -> skip the login page.
  if (user && path === '/login') { location.hash = '#/'; return; }
  // Role-scoped routes (see ROLE_RESTRICTED_PATHS); unlisted paths are shared by every role.
  if (user && !canAccess(user.role, path)) { location.hash = '#/'; return; }

  menuOpen = false;
  moreOpen = false;
  document.documentElement.lang = currentLangCode();

  // Error boundary: a bug in one page must never leave the user on a blank screen.
  let result;
  try {
    result = ROUTES[path] ? ROUTES[path]() : renderDynamic(path);
    if (!result) result = ROUTES[user ? '/' : '/login']();
  } catch (err) {
    console.error(`Page failed to render: ${path}`, err);
    result = { html: errorPageHtml(), mount: wireErrorPage };
  }
  mainEl.innerHTML = result.html;
  if (result.mount) {
    try { result.mount(mainEl); } catch (err) {
      console.error(`Page failed to initialise: ${path}`, err);
      toast('Part of this page could not load. Please refresh.', { tone: 'error' });
    }
  }
  const heading = mainEl.querySelector('h1');
  document.title = heading ? `${heading.textContent.trim()} · Kisan Mitra` : 'Kisan Mitra';

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

// The skip link must not touch location.hash — that is the router's state.
document.querySelector('.skip-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  mainEl.focus({ preventScroll: false });
});

window.addEventListener('hashchange', render);

setNavigator((hash) => {
  if (location.hash === hash) { render(); return; }
  location.hash = hash;
});

window.addEventListener('km:live', (e) => {
  const badge = document.getElementById('live-badge');
  if (badge) badge.classList.toggle('hidden', !e.detail);
});
window.addEventListener('km:unread', () => { if (currentPath() !== '/login') renderHeader(currentPath()); });

// Pilot feedback: one modal for every page (the button lives on the profile screens).
document.addEventListener('click', (e) => {
  if (!e.target.closest('#feedback-btn')) return;
  if (!isRemote()) { toast('Feedback is sent to the server, so it needs a connection to the Kisan Mitra backend.', { icon: 'info' }); return; }
  let rating = 0;
  openModal(`
    <form class="p-5" id="fb-form" novalidate>
      <h3 class="font-extrabold text-lg mb-1">${t('Send feedback')}</h3>
      <p class="text-xs text-muted-foreground mb-3">${t('Tell us what worked, what broke or what confused you. We read every message.')}</p>
      <div class="flex gap-1 mb-3" role="radiogroup" aria-label="${t('Rating')}">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="false" data-rate="${n}" aria-label="${n}" class="fb-star w-10 h-10 rounded-xl border border-border font-extrabold text-lg text-muted-foreground transition">${n}</button>`).join('')}
      </div>
      <label for="fb-cat" class="text-xs font-bold text-muted-foreground">${t('Type')}</label>
      <select id="fb-cat" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1 mb-3">
        <option value="Bug">${t('Something is broken')}</option><option value="Confusing">${t('Something is confusing')}</option>
        <option value="Idea">${t('I have an idea')}</option><option value="Praise">${t('Something works well')}</option>
      </select>
      <label for="fb-msg" class="text-xs font-bold text-muted-foreground">${t('Your message')}</label>
      <textarea id="fb-msg" rows="4" maxlength="2000" class="w-full border border-border rounded-xl px-3 py-2.5 bg-background mt-1"></textarea>
      <p id="fb-err" class="text-xs text-destructive font-semibold min-h-[1rem] mt-1 mb-2" role="alert"></p>
      <div class="flex gap-2">
        <button type="button" data-close class="flex-1 border border-border rounded-xl py-2.5 font-semibold">${t('Cancel')}</button>
        <button type="submit" class="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold">${t('Send')}</button>
      </div>
    </form>`, {
    onMount: (m) => {
      m.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => {
        rating = Number(b.dataset.rate);
        m.querySelectorAll('[data-rate]').forEach((x) => {
          const on = Number(x.dataset.rate) <= rating;
          x.setAttribute('aria-checked', String(Number(x.dataset.rate) === rating));
          x.className = `fb-star w-10 h-10 rounded-xl border font-extrabold text-lg transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`;
        });
      }));
      m.querySelector('#fb-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const err = m.querySelector('#fb-err');
        const message = m.querySelector('#fb-msg').value.trim();
        if (!rating) { err.textContent = t('Please pick a rating from 1 to 5.'); return; }
        if (message.length < 5) { err.textContent = t('Please write at least a few words.'); return; }
        try {
          await api.post('api/feedback', { rating, category: m.querySelector('#fb-cat').value, message, page: location.hash.slice(0, 80) });
          closeModal();
          toast('Thank you — your feedback was sent.', { tone: 'success', icon: 'checkCircle' });
        } catch (e) { err.textContent = e.message; }
      });
    },
  });
});

// Someone else's action (a new bid, an accepted offer, a filled pool) changed our data: refresh the
// page, unless the user is mid-way through typing or has a dialog open.
window.addEventListener('km:synced', () => {
  const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (typing || document.querySelector('#modal-root [role="dialog"], [role="dialog"][aria-modal="true"]')) return;
  if (currentPath() === '/login') return;
  render();
});

if (!location.hash) location.hash = '#/';
// Find out whether a backend is available (and sync if we're signed in to it) before the first paint.
initRemote().catch((e) => console.error('remote init failed', e)).finally(render);
