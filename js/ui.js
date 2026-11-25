import { icon } from './icons.js';
import { esc } from './util.js';

const MAX_TOASTS = 3;

// Message text is escaped: several toasts echo untrusted text (a speech transcript, a
// geocoded place name, a user's own name).
export function toast(message, opts = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  while (root.children.length >= MAX_TOASTS) root.firstElementChild.remove();
  const el = document.createElement('div');
  const tone = opts.tone || 'default';
  const toneClasses = tone === 'error'
    ? 'bg-destructive text-destructive-foreground'
    : tone === 'success'
    ? 'bg-primary text-primary-foreground'
    : 'bg-foreground text-background';
  el.className = `toast pointer-events-auto max-w-sm w-full sm:w-auto ${toneClasses} rounded-xl shadow-lg px-4 py-3 text-sm font-semibold flex items-center gap-2`;
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  el.innerHTML = `${opts.icon ? icon(opts.icon, 'w-4 h-4 shrink-0') : ''}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, opts.duration || 2600);
}

/* ---------------- modal ---------------- */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let lastFocused = null;
let keyHandler = null;

function visibleFocusables(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function openModal(innerHtml, { onMount, wide } = {}) {
  const root = document.getElementById('modal-root');
  closeModal(); // one modal at a time; also cleans up the previous key handler
  lastFocused = document.activeElement;
  root.innerHTML = `
    <div class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div class="absolute inset-0 bg-black/50" data-close></div>
      <div role="dialog" aria-modal="true" tabindex="-1" data-dialog class="relative bg-card w-full ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'} sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto animate-[fade-slide-in_.2s_ease_both] outline-none">
        ${innerHtml}
      </div>
    </div>`;
  const dialog = root.querySelector('[data-dialog]');
  const heading = dialog.querySelector('h3, h2');
  if (heading) { heading.id = 'modal-title'; dialog.setAttribute('aria-labelledby', 'modal-title'); }
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  document.body.style.overflow = 'hidden';

  keyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Tab') return;
    const items = visibleFocusables(dialog);
    if (!items.length) { e.preventDefault(); dialog.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', keyHandler);

  if (onMount) onMount(root);
  // Move focus into the dialog: the first field if there is one, otherwise the dialog itself.
  const firstField = dialog.querySelector('input:not([type="hidden"]), select, textarea');
  (firstField || dialog).focus({ preventScroll: true });
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
  const hadModal = !!root && root.innerHTML.trim() !== '';
  if (root) root.innerHTML = '';
  document.body.style.overflow = '';
  if (hadModal && lastFocused && lastFocused.isConnected && typeof lastFocused.focus === 'function') {
    lastFocused.focus({ preventScroll: true });
  }
  lastFocused = null;
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
