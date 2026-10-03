import { icon } from './icons.js';

export function toast(message, opts = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  const tone = opts.tone || 'default';
  const toneClasses = tone === 'error'
    ? 'bg-destructive text-destructive-foreground'
    : tone === 'success'
    ? 'bg-primary text-primary-foreground'
    : 'bg-foreground text-background';
  el.className = `toast pointer-events-auto max-w-sm w-full sm:w-auto ${toneClasses} rounded-xl shadow-lg px-4 py-3 text-sm font-semibold flex items-center gap-2`;
  el.innerHTML = `${opts.icon ? icon(opts.icon, 'w-4 h-4 shrink-0') : ''}<span>${message}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, opts.duration || 2600);
}

export function openModal(innerHtml, { onMount, wide } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div class="absolute inset-0 bg-black/50" data-close></div>
      <div class="relative bg-card w-full ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'} sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto animate-[fade-slide-in_.2s_ease_both]">
        ${innerHtml}
      </div>
    </div>`;
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  if (onMount) onMount(root);
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
