/* Tab Goblin — shared helpers (background worker + popup). */
(function (root) {
  'use strict';

  const DEFAULT_SETTINGS = {
    threshold: 15,       // minutes a tab must be ignored before the goblin eats it
    autoFeed: false,     // goblin eats on its own every few minutes
    sparePinned: true,   // never eat pinned tabs
    restoreAsleep: true, // restored sessions open asleep (fast, light)
  };

  const THRESHOLDS = [
    { value: 5, label: '5 minutes' },
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' },
    { value: 180, label: '3 hours' },
    { value: 1440, label: '1 day' },
  ];

  /** The goblin's mood depends on how many tabs are awake (using memory). */
  function mood(awake, asleep) {
    if (awake >= 25) return { key: 'ravenous', label: 'ravenous', line: 'Your fan is SCREAMING. Feed me!', color: '#D1532F' };
    if (asleep >= 5 && asleep >= awake) return { key: 'full', label: 'full', line: `Burp. ${asleep} tabs napping in my belly. Nothing lost.`, color: '#2E9E6B' };
    if (awake >= 15) return { key: 'hungry', label: 'hungry', line: 'So… many… tabs. Is that a snack?', color: '#C98A12' };
    if (awake >= 7) return { key: 'peckish', label: 'peckish', line: 'I could nibble a tab or two.', color: '#5E9E3A' };
    return { key: 'content', label: 'snoozing', line: 'Zzz. Your tabs are tidy.', color: '#3F8F6A' };
  }

  function hostOf(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.hostname.replace(/^www\./, '');
      if (u.protocol === 'file:') return 'file';
      return ''; // browser pages (chrome://, about:) have no site to keep
    } catch (_) { return ''; }
  }

  /** 3 days, 6 h, 12 min, "just now" */
  function ignoredFor(ms) {
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? '1 day' : `${d} days`;
  }

  function when(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
    if (d.toDateString() === yest.toDateString()) return `Yesterday, ${time}`;
    return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
  }

  function dayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  root.TG = { DEFAULT_SETTINGS, THRESHOLDS, mood, hostOf, ignoredFor, when, dayKey, escapeHtml, uid };
})(typeof self !== 'undefined' ? self : globalThis);
