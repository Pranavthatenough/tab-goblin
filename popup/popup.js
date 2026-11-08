/* Tab Goblin — popup (also opens as a full page from the extension's options). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = TG.escapeHtml;
  let data = null;
  let sessions = [];
  let view = 'tabs';

  const send = (msg) => chrome.runtime.sendMessage(msg);

  const ICON = {
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    shieldOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  };

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ---------------- hero ---------------- */
  function edible() {
    const limit = data.settings.threshold * 60000;
    return data.tabs.filter((t) => !t.asleep && !t.blocked && t.ignoredMs >= limit).length;
  }

  function renderHero() {
    const m = data.mood;
    $('goblin').innerHTML = goblinSvg(m.key);
    $('total').textContent = data.total;
    $('sub').innerHTML = `<b>${data.asleep}</b> asleep · goblin is <b>${esc(m.label)}</b>`;
    $('line').textContent = m.line;
    const n = edible();
    const btn = $('feedBtn');
    btn.textContent = n ? `Feed the goblin · ${n} tab${n > 1 ? 's' : ''}` : 'Feed the goblin';
    btn.title = n
      ? `Puts ${n} tab${n > 1 ? 's' : ''} ignored for ${thresholdLabel()} or more to sleep`
      : `No tab has been ignored for ${thresholdLabel()} yet`;
    $('nTabs').textContent = data.total ? `· ${data.total}` : '';
  }

  const thresholdLabel = () => (TG.THRESHOLDS.find((t) => t.value === data.settings.threshold)?.label || `${data.settings.threshold} minutes`);

  /* ---------------- tab list ---------------- */
  function chipFor(t) {
    if (t.asleep) return '<span class="chip zz">Zzz</span>';
    switch (t.blocked) {
      case 'You are here': return '<span class="chip here">Here</span>';
      case 'On your Keep list': return '<span class="chip keep">Keep</span>';
      case 'Pinned': return '<span class="chip pin">Pinned</span>';
      case 'Playing sound': return '<span class="chip sound">Sound</span>';
      case 'Half-filled form': return '<span class="chip form" title="You typed something here that isn\'t sent yet">Form</span>';
      case 'Page not answering': return '<span class="chip busy">Busy</span>';
      default: return '';
    }
  }

  function rowHtml(t) {
    const limit = data.settings.threshold * 60000;
    const old = !t.asleep && !t.active && t.ignoredMs >= limit;
    const age = t.active ? 'open now' : `${TG.ignoredFor(t.ignoredMs)}${t.ignoredMs >= 60000 ? ' ignored' : ''}`;
    const canSleep = !t.asleep && !t.blocked;
    return `<li class="row ${t.asleep ? 'asleep' : ''}" data-id="${t.id}">
      <button class="go" data-act="go" data-id="${t.id}" title="${t.asleep ? 'Wake this tab and go to it' : 'Go to this tab'}">
        <img class="fav" src="${esc(t.favicon)}" alt="">
        <span class="txt">
          <span class="ttl">${esc(t.title)}</span>
          <span class="meta">${esc(t.host || 'browser page')} · <span class="${old ? 'old' : ''}">${esc(age)}</span></span>
        </span>
      </button>
      ${chipFor(t)}
      <span class="rbtns">
        <button class="ib ${t.kept ? 'on' : ''}" data-act="keep" data-host="${esc(t.host)}" data-on="${t.kept ? '0' : '1'}" ${t.host ? '' : 'disabled'}
          title="${t.kept ? `Remove ${esc(t.host)} from the Keep list` : `Keep ${esc(t.host)}: the goblin will never touch it`}" aria-label="${t.kept ? 'Remove from Keep list' : 'Add to Keep list'}">${t.kept ? ICON.shieldOn : ICON.shield}</button>
        <button class="ib sleep" data-act="sleep" data-id="${t.id}" ${canSleep ? '' : 'disabled'}
          title="${canSleep ? 'Put to sleep now' : t.asleep ? 'Already asleep' : esc(t.blocked)}" aria-label="Put to sleep">${ICON.moon}</button>
      </span>
    </li>`;
  }

  function renderTabs() {
    const q = $('search').value.trim().toLowerCase();
    const list = data.tabs.filter((t) => !q || t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q));
    if (!list.length) {
      $('tabList').innerHTML = `<li class="empty">${q ? 'No tab matches that.' : 'No tabs. The goblin is bored.'}</li>`;
      return;
    }
    const awake = list.filter((t) => !t.asleep);
    const asleep = list.filter((t) => t.asleep);
    $('tabList').innerHTML =
      (awake.length ? `<li class="group-h">Awake · longest ignored first</li>${awake.map(rowHtml).join('')}` : '') +
      (asleep.length ? `<li class="group-h">Asleep · click to wake</li>${asleep.map(rowHtml).join('')}` : '');
    // a broken favicon shouldn't show a broken image
    $('tabList').querySelectorAll('img.fav').forEach((img) => {
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
    });
  }

  $('tabList').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'go') {
      await send({ type: 'wake', tabId: Number(b.dataset.id) });
      if (!document.body.classList.contains('full')) window.close();
    } else if (act === 'sleep') {
      const res = await send({ type: 'sleep', tabId: Number(b.dataset.id) });
      toast(res.ok ? 'Nom. Tab is asleep. Click it any time to wake it.' : res.reason);
      refresh();
    } else if (act === 'keep') {
      const on = b.dataset.on === '1';
      await send({ type: 'keep', host: b.dataset.host, on });
      toast(on ? `${b.dataset.host} is on your Keep list. The goblin won't touch it.` : `${b.dataset.host} removed from your Keep list.`);
      refresh();
    }
  });
  $('search').addEventListener('input', () => data && renderTabs());

  /* ---------------- feed + save ---------------- */
  $('feedBtn').addEventListener('click', async () => {
    const btn = $('feedBtn');
    btn.disabled = true;
    const res = await send({ type: 'feed' });
    btn.disabled = false;
    const skipped = Object.entries(res.skipped || {});
    const formSkip = res.skipped?.['Half-filled form'] || 0;
    if (res.eaten) {
      toast(`Burp! Ate ${res.eaten} tab${res.eaten > 1 ? 's' : ''}.${formSkip ? ` Left ${formSkip} with a half-filled form alone.` : ''} Click any to wake it.`);
    } else if (res.tooFresh) {
      toast(`Nothing to eat: no tab has been ignored for ${thresholdLabel()} yet. Change this under Keep & settings.`);
    } else {
      toast(skipped.length ? 'Every other tab is protected. Nothing to eat.' : 'Nothing to eat. Everything is already asleep.');
    }
    refresh();
  });

  async function saveSession(name) {
    const res = await send({ type: 'save', name: name || undefined });
    if (res.ok) {
      toast(`Saved “${res.session.name}” · ${res.session.count} tabs.`);
      await loadSessions();
    } else toast(res.reason);
  }
  $('saveBtn').addEventListener('click', () => saveSession());
  $('saveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSession($('sessionName').value.trim());
    $('sessionName').value = '';
  });

  /* ---------------- sessions ---------------- */
  async function loadSessions() {
    const d = await chrome.storage.local.get('sessions');
    sessions = Array.isArray(d.sessions) ? d.sessions : [];
    renderSessions();
  }

  function renderSessions() {
    const manual = sessions.filter((s) => s.kind === 'manual');
    $('nSessions').textContent = manual.length ? `· ${manual.length}` : '';
    const order = { lastrun: 0, manual: 1, autosave: 2 };
    const list = [...sessions].sort((a, b) => (order[a.kind] - order[b.kind]) || b.savedAt - a.savedAt);
    $('sessionList').innerHTML = list.length
      ? list.map((s) => {
        const wins = s.windows.length;
        const tag = s.kind === 'autosave' ? '<span class="tag">Auto</span>' : s.kind === 'lastrun' ? '<span class="tag">Last run</span>' : '';
        return `<li class="sess">
          <div class="txt"><b>${esc(s.name)}${tag}</b>
            <span class="meta">${esc(TG.when(s.savedAt))} · ${s.count} tab${s.count === 1 ? '' : 's'}${wins > 1 ? ` · ${wins} windows` : ''}</span></div>
          <button class="btn primary" data-sact="restore" data-id="${esc(s.id)}">Restore</button>
          ${s.kind === 'manual' ? `<button class="ib" data-sact="rename" data-id="${esc(s.id)}" title="Rename" aria-label="Rename session">✎</button>` : ''}
          <button class="ib" data-sact="delete" data-id="${esc(s.id)}" title="Delete" aria-label="Delete session">✕</button>
        </li>`;
      }).join('')
      : '<li class="empty">No saved sessions yet. Save your tabs before a big clean-up, then bring them all back in one click.</li>';
  }

  $('sessionList').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-sact]');
    if (!b) return;
    const s = sessions.find((x) => x.id === b.dataset.id);
    if (!s) return;
    if (b.dataset.sact === 'restore') {
      b.disabled = true;
      const res = await send({ type: 'restore', id: s.id });
      toast(res.ok ? `Restored ${res.opened} tabs.` : res.reason);
      b.disabled = false;
    } else if (b.dataset.sact === 'delete') {
      if (!confirm(`Delete the session “${s.name}”? Your open tabs are not affected.`)) return;
      await send({ type: 'deleteSession', id: s.id });
      await loadSessions();
    } else if (b.dataset.sact === 'rename') {
      const name = prompt('New name for this session:', s.name);
      if (name && name.trim()) {
        await send({ type: 'renameSession', id: s.id, name: name.trim() });
        await loadSessions();
      }
    }
  });

  /* ---------------- settings ---------------- */
  function renderSettings() {
    const s = data.settings;
    $('threshold').innerHTML = TG.THRESHOLDS.map((t) => `<option value="${t.value}" ${t.value === s.threshold ? 'selected' : ''}>${t.label}</option>`).join('');
    document.querySelectorAll('input[data-key]').forEach((i) => { i.checked = !!s[i.dataset.key]; });
    $('keepChips').innerHTML = data.keep.length
      ? data.keep.map((h) => `<span class="kchip">${esc(h)}<button data-unkeep="${esc(h)}" aria-label="Remove ${esc(h)}" title="Remove">×</button></span>`).join('')
      : '<span class="hint" style="margin:0">Nothing yet. Tap the shield next to any tab to keep its site.</span>';
    const today = data.stats?.days?.[TG.dayKey()] || 0;
    $('stats').textContent = `The goblin has eaten ${today} tab${today === 1 ? '' : 's'} today and ${data.stats?.total || 0} in total. Nothing was ever closed.`;
  }

  async function setSetting(key, value) {
    const d = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...TG.DEFAULT_SETTINGS, ...(d.settings || {}), [key]: value } });
  }
  $('threshold').addEventListener('change', (e) => setSetting('threshold', Number(e.target.value)));
  document.querySelectorAll('input[data-key]').forEach((i) => i.addEventListener('change', () => setSetting(i.dataset.key, i.checked)));
  $('keepChips').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-unkeep]');
    if (!b) return;
    await send({ type: 'keep', host: b.dataset.unkeep, on: false });
    refresh();
  });
  $('keepForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = $('keepInput').value.trim();
    if (!raw) return;
    const host = TG.hostOf(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!host) { toast('That doesn\'t look like a website.'); return; }
    await send({ type: 'keep', host, on: true });
    $('keepInput').value = '';
    refresh();
  });

  /* ---------------- views ---------------- */
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
  }));

  /* ---------------- data ---------------- */
  let busy = false;
  let again = false;
  async function refresh() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      data = await send({ type: 'list' });
      renderHero();
      renderTabs();
      renderSettings();
    } finally {
      busy = false;
      if (again) { again = false; refresh(); }
    }
  }

  let evTimer;
  const soon = () => { clearTimeout(evTimer); evTimer = setTimeout(refresh, 350); };
  chrome.tabs.onCreated.addListener(soon);
  chrome.tabs.onRemoved.addListener(soon);
  chrome.tabs.onActivated.addListener(soon);
  chrome.tabs.onUpdated.addListener((_id, ch) => { if ('discarded' in ch || ch.title || ch.status === 'complete' || 'audible' in ch || 'pinned' in ch) soon(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.sessions) loadSessions();
    if (changes.settings || changes.keep || changes.stats) soon();
  });

  // opened as a page (from Options) rather than the toolbar popup
  chrome.tabs.getCurrent((tab) => { if (tab && !location.search.includes('popup')) document.body.classList.add('full'); });

  refresh();
  loadSessions();
  setInterval(refresh, 60000);
})();
