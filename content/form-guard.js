/*
 * Tab Goblin — form guard (runs in every page and frame).
 *
 * Remembers which fields YOU typed into, and what they held before you started.
 * The goblin asks this before putting a tab to sleep: if any field still holds
 * something you typed and haven't sent, the tab is left alone.
 * It stores nothing and sends nothing; it only answers when the goblin asks.
 */
(() => {
  'use strict';
  if (globalThis.__tgGuard) return;
  globalThis.__tgGuard = true;

  // field -> what it held when you first focused it
  const baseline = new WeakMap();
  const touched = new Set();

  const snapshot = (el) => {
    if (el.isContentEditable) return el.textContent;
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    if (el.tagName === 'SELECT') return Array.from(el.options).map((o) => o.selected).join();
    return el.value;
  };

  const isField = (el) => el && el.nodeType === 1 &&
    (el.matches?.('input, textarea, select') || el.isContentEditable);

  const remember = (e) => {
    if (!e.isTrusted) return; // only real typing and clicking count
    const el = e.composedPath()[0];
    if (!isField(el)) return;
    if (!baseline.has(el)) baseline.set(el, snapshot(el));
  };
  // focusin sets the "before" value; input/change mark the field as touched
  document.addEventListener('focusin', remember, true);
  const touch = (e) => {
    if (!e.isTrusted) return;
    const el = e.composedPath()[0];
    if (!isField(el)) return;
    if (!baseline.has(el)) baseline.set(el, '');
    touched.add(el);
  };
  document.addEventListener('input', touch, true);
  document.addEventListener('change', touch, true);

  // after a real submit, what you typed has been sent — it's no longer at risk
  document.addEventListener('submit', (e) => {
    const form = e.target;
    for (const el of touched) {
      if (form.contains(el)) { baseline.set(el, snapshot(el)); touched.delete(el); }
    }
  }, true);

  const SKIP = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color']);

  /** True if a field you typed into still holds unsent text. */
  globalThis.__tgIsDirty = () => {
    for (const el of touched) {
      if (!el.isConnected) { touched.delete(el); continue; }
      if (el.disabled || SKIP.has(el.type)) continue;
      const now = snapshot(el);
      if (now === baseline.get(el)) continue;
      if (typeof now === 'string' && now.trim() === '') continue; // cleared it yourself
      return true;
    }
    return false;
  };
})();
