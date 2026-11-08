/*
 * Tab Goblin — background service worker.
 *
 * - Remembers when you last left each tab (to know how long it has been ignored).
 * - Puts tabs to sleep with Chrome's own tab discard: the tab stays in the tab
 *   strip with its title and icon, but its memory is freed. Clicking it reloads it.
 * - Never eats: the tab you're on, Keep-list sites, pinned tabs, tabs playing
 *   sound, or tabs with a half-filled form.
 * - Saves and restores sessions, and autosaves every 5 minutes.
 */
importScripts('shared.js');

const EXT_ORIGIN = chrome.runtime.getURL('');
const MAX_SESSIONS = 40;

/* ---------------- small helpers ---------------- */
let queue = Promise.resolve();
const serial = (job) => (queue = queue.then(job).catch((e) => console.warn('[Tab Goblin]', e)));

async function getLocal() {
  const d = await chrome.storage.local.get(['settings', 'keep', 'sessions', 'stats']);
  return {
    settings: { ...TG.DEFAULT_SETTINGS, ...(d.settings || {}) },
    keep: Array.isArray(d.keep) ? d.keep : [],
    sessions: Array.isArray(d.sessions) ? d.sessions : [],
    stats: d.stats && typeof d.stats === 'object' ? d.stats : { total: 0, days: {} },
  };
}

async function getSeen() {
  const d = await chrome.storage.session.get(['seen', 'active']);
  return { seen: d.seen || {}, active: d.active || {} };
}

const isOurPage = (url) => (url || '').startsWith(EXT_ORIGIN);
const faviconFor = (url) => `${EXT_ORIGIN}_favicon/?pageUrl=${encodeURIComponent(url || '')}&size=32`;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/* ---------------- "when did I last look at this tab?" ---------------- */
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => serial(async () => {
  const { seen, active } = await getSeen();
  const now = Date.now();
  const prev = active[windowId];
  if (prev != null && prev !== tabId) seen[prev] = now; // you just left it
  active[windowId] = tabId;
  seen[tabId] = now;
  await chrome.storage.session.set({ seen, active });
}));

chrome.tabs.onRemoved.addListener((tabId) => serial(async () => {
  const { seen, active } = await getSeen();
  delete seen[tabId];
  await chrome.storage.session.set({ seen, active });
  scheduleBadge();
}));

chrome.tabs.onReplaced.addListener((added, removed) => serial(async () => {
  const { seen, active } = await getSeen();
  if (seen[removed]) seen[added] = seen[removed];
  delete seen[removed];
  await chrome.storage.session.set({ seen, active });
}));

/* ---------------- half-filled forms ---------------- */
/** Runs inside the page (every frame). Must be self-contained. */
function probeForm() {
  if (typeof globalThis.__tgIsDirty === 'function') return globalThis.__tgIsDirty();
  // Page was opened before the goblin was installed: compare fields with their original values.
  const skip = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color', 'search']);
  for (const el of document.querySelectorAll('input, textarea, select')) {
    if (el.disabled) continue;
    if (el.tagName === 'SELECT') {
      if (Array.from(el.options).some((o) => o.selected !== o.defaultSelected)) return true;
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.checked !== el.defaultChecked) return true;
    } else if (!skip.has(el.type) && el.value.trim() && el.value !== el.defaultValue) {
      return true;
    }
  }
  return false;
}

/** 'dirty' | 'clean' | 'unknown' (page didn't answer in time) */
async function formState(tabId) {
  try {
    const results = await withTimeout(
      chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: probeForm }),
      1500
    );
    return results.some((r) => r.result === true) ? 'dirty' : 'clean';
  } catch (e) {
    // chrome:// pages, the Web Store and similar can't be checked — they have no forms of yours
    return e.message === 'timeout' ? 'unknown' : 'clean';
  }
}

/* ---------------- describing tabs ---------------- */
async function describeTabs({ checkForms = true } = {}) {
  const [tabs, { seen }, local] = await Promise.all([chrome.tabs.query({}), getSeen(), getLocal()]);
  const now = Date.now();
  const keep = new Set(local.keep);
  const list = tabs.filter((t) => !isOurPage(t.url || t.pendingUrl));

  const rows = await Promise.all(list.map(async (t) => {
    const url = t.url || t.pendingUrl || '';
    const host = TG.hostOf(url);
    const last = t.active ? now : (seen[t.id] || t.lastAccessed || now);
    const row = {
      id: t.id,
      windowId: t.windowId,
      title: t.title || url || 'New tab',
      url,
      host,
      favicon: faviconFor(url),
      active: !!t.active,
      pinned: !!t.pinned,
      audible: !!t.audible,
      asleep: !!t.discarded,
      kept: !!host && keep.has(host),
      ignoredMs: Math.max(0, now - last),
      form: 'clean',
      blocked: '', // why the goblin won't eat it
    };
    if (row.asleep) row.blocked = 'asleep';
    else if (row.active) row.blocked = 'You are here';
    else if (row.kept) row.blocked = 'On your Keep list';
    else if (row.pinned && local.settings.sparePinned) row.blocked = 'Pinned';
    else if (row.audible) row.blocked = 'Playing sound';
    if (checkForms && !row.asleep && !row.active) {
      row.form = await formState(t.id);
      if (!row.blocked && row.form === 'dirty') row.blocked = 'Half-filled form';
      if (!row.blocked && row.form === 'unknown') row.blocked = 'Page not answering';
    }
    return row;
  }));

  rows.sort((a, b) => Number(a.asleep) - Number(b.asleep) || b.ignoredMs - a.ignoredMs);
  const asleep = rows.filter((r) => r.asleep).length;
  const awake = rows.length - asleep;
  return {
    tabs: rows,
    total: rows.length,
    awake,
    asleep,
    mood: TG.mood(awake, asleep),
    settings: local.settings,
    keep: local.keep,
    stats: local.stats,
  };
}

/* ---------------- eating (sleeping) tabs ---------------- */
async function countEaten(n) {
  if (!n) return;
  const { stats } = await getLocal();
  const k = TG.dayKey();
  stats.total = (stats.total || 0) + n;
  stats.days = stats.days || {};
  stats.days[k] = (stats.days[k] || 0) + n;
  for (const key of Object.keys(stats.days).sort().slice(0, -60)) delete stats.days[key];
  await chrome.storage.local.set({ stats });
}

async function discard(tabId) {
  try {
    const t = await chrome.tabs.discard(tabId);
    return !!t;
  } catch (_) {
    return false;
  }
}

/** Put one tab to sleep, after re-checking it is safe. */
async function sleepOne(tabId) {
  const info = await describeTabs({ checkForms: false });
  const row = info.tabs.find((r) => r.id === tabId);
  if (!row) return { ok: false, reason: 'That tab is gone.' };
  if (row.asleep) return { ok: false, reason: 'Already asleep.' };
  if (row.blocked) return { ok: false, reason: `${row.blocked}. The goblin left it alone.` };
  const form = await formState(tabId);
  if (form !== 'clean') return { ok: false, reason: form === 'dirty' ? 'It has a half-filled form. The goblin left it alone.' : 'The page is not answering. The goblin left it alone.' };
  const ok = await discard(tabId);
  if (ok) await countEaten(1);
  scheduleBadge();
  return ok ? { ok: true } : { ok: false, reason: 'Chrome could not put this tab to sleep.' };
}

/** Eat every tab ignored longer than the threshold. */
async function feed({ auto = false } = {}) {
  const info = await describeTabs();
  const limit = info.settings.threshold * 60000;
  const skipped = {};
  let eaten = 0;
  let tooFresh = 0;
  for (const r of info.tabs) {
    if (r.asleep || r.active) continue;
    if (r.blocked) { skipped[r.blocked] = (skipped[r.blocked] || 0) + 1; continue; }
    if (r.ignoredMs < limit) { tooFresh += 1; continue; }
    if (await discard(r.id)) eaten += 1;
  }
  await countEaten(eaten);
  await chrome.storage.local.set({ lastFeed: { at: Date.now(), eaten, auto } });
  scheduleBadge();
  return { eaten, skipped, tooFresh, threshold: info.settings.threshold };
}

async function wake(tabId) {
  const t = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(t.windowId, { focused: true });
  return { ok: true };
}

/* ---------------- sessions ---------------- */
async function snapshot() {
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const windows = wins
    .map((w) => ({
      tabs: (w.tabs || [])
        .map((t) => ({ url: t.url || t.pendingUrl || '', title: t.title || '', pinned: !!t.pinned }))
        .filter((t) => t.url && !isOurPage(t.url) && t.url !== 'about:blank'),
    }))
    .filter((w) => w.tabs.length);
  return { windows, count: windows.reduce((n, w) => n + w.tabs.length, 0) };
}

async function saveSession(name, kind = 'manual') {
  const snap = await snapshot();
  if (!snap.count) return { ok: false, reason: 'There are no tabs to save.' };
  const session = { id: kind === 'manual' ? TG.uid() : kind, name, kind, savedAt: Date.now(), ...snap };
  const { sessions } = await getLocal();
  const rest = sessions.filter((s) => s.id !== session.id);
  const manual = [session, ...rest].filter((s) => s.kind === 'manual').slice(0, MAX_SESSIONS);
  const special = [session, ...rest].filter((s) => s.kind !== 'manual');
  await chrome.storage.local.set({ sessions: [...special, ...manual] });
  return { ok: true, session };
}

function sleepWhenLoaded(tabId) {
  return new Promise((resolve) => {
    let done = false;
    const finish = async () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpd);
      clearTimeout(timer);
      try {
        const t = await chrome.tabs.get(tabId);
        if (!t.active && !t.discarded) await discard(tabId);
      } catch (_) { /* closed meanwhile */ }
      resolve();
    };
    const onUpd = (id, change) => { if (id === tabId && change.status === 'complete') finish(); };
    chrome.tabs.onUpdated.addListener(onUpd);
    const timer = setTimeout(finish, 20000);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete' && t.url) finish(); }).catch(() => finish());
  });
}

async function restoreSession(id) {
  const { sessions, settings } = await getLocal();
  const s = sessions.find((x) => x.id === id);
  if (!s) return { ok: false, reason: 'That session is gone.' };
  let opened = 0;
  const toSleep = [];
  for (const w of s.windows) {
    if (!w.tabs.length) continue;
    let win;
    try {
      win = await chrome.windows.create({ url: w.tabs.map((t) => t.url), focused: true });
    } catch (_) {
      // one bad URL stops a batch — open them one by one instead
      win = await chrome.windows.create({ focused: true });
      const blank = win.tabs?.[0]?.id;
      for (const t of w.tabs) {
        try { await chrome.tabs.create({ windowId: win.id, url: t.url, active: false }); } catch (_) { /* skip */ }
      }
      if (blank != null) await chrome.tabs.remove(blank).catch(() => {});
      win = await chrome.windows.get(win.id, { populate: true });
    }
    const tabs = win.tabs || (await chrome.tabs.query({ windowId: win.id }));
    for (let i = 0; i < tabs.length; i++) {
      opened += 1;
      const saved = w.tabs.find((t) => t.url === tabs[i].pendingUrl || t.url === tabs[i].url) || w.tabs[i];
      if (saved?.pinned) await chrome.tabs.update(tabs[i].id, { pinned: true }).catch(() => {});
      if (settings.restoreAsleep && i > 0) toSleep.push(tabs[i].id);
    }
  }
  // put the background tabs to sleep as soon as each has its address
  Promise.all(toSleep.map(sleepWhenLoaded)).then(scheduleBadge);
  scheduleBadge();
  return { ok: true, opened };
}

async function deleteSession(id) {
  const { sessions } = await getLocal();
  await chrome.storage.local.set({ sessions: sessions.filter((s) => s.id !== id) });
  return { ok: true };
}

async function renameSession(id, name) {
  const { sessions } = await getLocal();
  await chrome.storage.local.set({ sessions: sessions.map((s) => (s.id === id ? { ...s, name: name.slice(0, 80) } : s)) });
  return { ok: true };
}

async function setKeep(host, on) {
  if (!host) return { ok: false };
  const { keep } = await getLocal();
  const next = on ? Array.from(new Set([...keep, host])).sort() : keep.filter((h) => h !== host);
  await chrome.storage.local.set({ keep: next });
  return { ok: true, keep: next };
}

/* ---------------- toolbar badge ---------------- */
let badgeTimer = null;
function scheduleBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(refreshBadge, 300);
}
async function refreshBadge() {
  const tabs = (await chrome.tabs.query({})).filter((t) => !isOurPage(t.url || t.pendingUrl));
  const asleep = tabs.filter((t) => t.discarded).length;
  const m = TG.mood(tabs.length - asleep, asleep);
  await chrome.action.setBadgeText({ text: String(tabs.length) });
  await chrome.action.setBadgeBackgroundColor({ color: m.color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  await chrome.action.setTitle({ title: `Tab Goblin · ${tabs.length} tabs, ${asleep} asleep · goblin is ${m.label}` });
}
chrome.tabs.onCreated.addListener(scheduleBadge);
chrome.tabs.onUpdated.addListener((_id, change) => { if ('discarded' in change || change.status === 'complete') scheduleBadge(); });
chrome.tabs.onAttached.addListener(scheduleBadge);

/* ---------------- messages from the popup ---------------- */
const HANDLERS = {
  list: () => describeTabs(),
  sleep: (m) => sleepOne(m.tabId),
  feed: () => feed(),
  wake: (m) => wake(m.tabId),
  keep: (m) => setKeep(m.host, m.on),
  save: (m) => saveSession(m.name || `Session · ${TG.when(Date.now())}`),
  restore: (m) => restoreSession(m.id),
  deleteSession: (m) => deleteSession(m.id),
  renameSession: (m) => renameSession(m.id, m.name || ''),
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const fn = msg && HANDLERS[msg.type];
  if (!fn) return false;
  Promise.resolve(fn(msg))
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, reason: e.message || String(e) }));
  return true;
});

/* ---------------- alarms: autosave + auto-feed ---------------- */
function setupAlarms() {
  chrome.alarms.create('autosave', { periodInMinutes: 5 });
  chrome.alarms.create('autofeed', { periodInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === 'autosave') {
    await saveSession('Autosave', 'autosave');
  } else if (a.name === 'autofeed') {
    const { settings } = await getLocal();
    if (settings.autoFeed) await feed({ auto: true });
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const local = await getLocal();
  await chrome.storage.local.set({ settings: local.settings, keep: local.keep, sessions: local.sessions, stats: local.stats });
  setupAlarms();
  // tabs already open count as "seen now", so nothing gets eaten by mistake right after install
  const tabs = await chrome.tabs.query({});
  const seen = {};
  const now = Date.now();
  for (const t of tabs) seen[t.id] = t.lastAccessed || now;
  await chrome.storage.session.set({ seen, active: {} });
  refreshBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  // keep what was open when Chrome last closed, before the next autosave replaces it
  const { sessions } = await getLocal();
  const auto = sessions.find((s) => s.id === 'autosave');
  if (auto) {
    const lastrun = { ...auto, id: 'lastrun', kind: 'lastrun', name: 'When Chrome last closed' };
    await chrome.storage.local.set({ sessions: [lastrun, ...sessions.filter((s) => s.id !== 'lastrun' && s.id !== 'autosave')] });
  }
  setupAlarms();
  refreshBadge();
});
