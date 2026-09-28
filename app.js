'use strict';
/* =====================================================================
   Zeiterfassung – Stundenreporting im Stil von Clockify
   Reine Client-App (PWA). Daten liegen lokal im Browser (localStorage).
   ===================================================================== */

const STORE_KEY = 'zeiterfassung.v1';
const COLORS = ['#03a9f4', '#4caf50', '#ff9800', '#e91e63', '#9c27b0', '#3f51b5',
  '#009688', '#795548', '#607d8b', '#f44336', '#8bc34a', '#00bcd4'];
const NO_COLOR = '#b0bec5';
const HOUR = 3600000, DAY = 86400000;

/* ---------- Zustand ---------- */
function defaultState() {
  return {
    settings: { userName: '', currency: 'EUR', defaultRate: 0, weekStart: 1, durationFormat: 'hms', trackMode: 'timer' },
    clients: [], projects: [], tags: [], entries: [], running: null
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw), def = defaultState();
      return Object.assign(def, d, { settings: Object.assign(def.settings, d.settings || {}) });
    }
  } catch (e) { console.warn('Laden fehlgeschlagen', e); }
  return defaultState();
}
let S = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { toast('Speichern fehlgeschlagen: ' + e.message); }
  window.Cloud?.changed();
}
const cloudOn = () => !!window.Cloud?.enabled;

const UI = {
  route: 'tracker',
  draft: emptyDraft(),
  manual: { date: '', start: '', end: '' }, // Datum wird beim Start gesetzt
  weeksShown: 3,
  projQ: '', showArchived: false,
  modalDraft: null,
  report: { scope: 'me', userId: '', range: 'week', offset: 0, from: '', to: '', groupBy: 'project', projectId: '', clientId: '', tagId: '', billable: '', q: '' }
};
function emptyDraft() { return { description: '', projectId: null, tagIds: [], billable: false }; }

/* ---------- Hilfsfunktionen ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const byName = (a, b) => a.name.localeCompare(b.name, 'de');
const dur = e => e.end - e.start;
const sum = list => list.reduce((a, e) => a + dur(e), 0);

function fmtClock(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`;
}
function fmtDec(ms) { return (ms / HOUR).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDur(ms) { return S.settings.durationFormat === 'decimal' ? fmtDec(ms) + ' h' : fmtClock(ms); }
function fmtTime(ts) { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtD(ts) { return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function dateStr(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayStr() { return dateStr(Date.now()); }
function parseDT(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = (time || '0:0').split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).getTime();
}
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - (d.getDay() - S.settings.weekStart + 7) % 7);
  return d.getTime();
}
function dayLabel(ts) {
  const today = startOfDay(Date.now()), s = startOfDay(ts);
  if (s === today) return 'Heute';
  if (s === addDays(today, -1)) return 'Gestern';
  return new Date(ts).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtMoney(v) {
  try { return v.toLocaleString('de-DE', { style: 'currency', currency: S.settings.currency || 'EUR' }); }
  catch { return v.toFixed(2) + ' ' + S.settings.currency; }
}
function hashColor(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

const proj = id => S.projects.find(p => p.id === id);
const client = id => S.clients.find(c => c.id === id);
const tag = id => S.tags.find(t => t.id === id);
function rateOf(e) {
  const p = proj(e.projectId);
  return p && p.rate != null ? Number(p.rate) : Number(S.settings.defaultRate) || 0;
}
function amountOf(e) { return e.billable ? dur(e) / HOUR * rateOf(e) : 0; }

/* ---------- Icons ---------- */
const P = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M3 21h18M6 17v-6M11 17V6M16 17v-4M21 17V9"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  cog: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  more: '<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M4 20h16"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  printer: '<path d="M7 9V3h10v6M7 17H4V9h16v8h-3M7 14h10v7H7z"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
  archive: '<path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;

/* ---------- Navigation ---------- */
const NAV = [
  ['tracker', 'clock', 'Zeiterfassung'],
  ['reports', 'chart', 'Berichte'],
  ['projects', 'folder', 'Projekte'],
  ['clients', 'users', 'Kunden'],
  ['tags', 'tag', 'Tags'],
  ['settings', 'cog', 'Einstellungen']
];
function renderNav() {
  $('#sidebar').innerHTML = NAV.map(([r, i, t], n) =>
    (n === 2 || n === 5 ? '<div class="nav-sep"></div>' : '') +
    `<a class="nav-link" href="#/${r}" data-route="${r}" title="${t}">${ic(i)}<span>${t}</span></a>`).join('');
  $('#bottombar').innerHTML = NAV.slice(0, 3).map(([r, i, t]) =>
    `<a href="#/${r}" data-route="${r}">${ic(i)}<span>${r === 'tracker' ? 'Timer' : t}</span></a>`).join('') +
    `<button data-action="toggle-nav">${ic('menu')}<span>Mehr</span></button>`;
}

const VIEWS = { tracker: viewTracker, reports: viewReports, projects: viewProjects, clients: () => viewList('clients'), tags: () => viewList('tags'), settings: viewSettings };
const AFTER = { tracker: afterTracker, projects: afterProjects };

function render() {
  const r = location.hash.replace(/^#\/?/, '') || 'tracker';
  UI.route = VIEWS[r] ? r : 'tracker';
  $$('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === UI.route));
  $('#view').innerHTML = VIEWS[UI.route]();
  AFTER[UI.route]?.();
  const name = S.settings.userName || '';
  $('#user-name').textContent = name || 'Profil';
  $('#user-avatar').textContent = name ? name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') : '?';
  tick();
}

/* =====================================================================
   Zeiterfassung (Timer)
   ===================================================================== */
function projLabel(id, emptyText = 'Projekt') {
  const p = proj(id);
  if (!p) return `<span class="proj-none">${ic('plus')}${emptyText}</span>`;
  const c = client(p.clientId);
  return `<span class="proj" style="--pc:${p.color}"><span class="dot"></span><span class="name">${esc(p.name)}${c ? `<span class="proj-client"> · ${esc(c.name)}</span>` : ''}</span></span>`;
}
function tagsLabel(ids) {
  const names = ids.map(tag).filter(Boolean).map(t => t.name);
  return names.length ? esc(names.join(', ')) : '<span class="muted">Keine Tags</span>';
}

function timerBarHTML() {
  const r = S.running, d = r || UI.draft;
  const manual = S.settings.trackMode === 'manual' && !r;
  const suggestions = [...new Set(S.entries.slice().sort((a, b) => b.start - a.start).map(e => e.description).filter(Boolean))].slice(0, 60);
  const m = UI.manual;
  return `<div class="timerbar ${r ? 'running' : ''}">
    <input class="tb-desc" id="tb-desc" list="desc-list" placeholder="Woran arbeitest du?" value="${esc(d.description)}" autocomplete="off" enterkeyhint="go">
    <datalist id="desc-list">${suggestions.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="tb-controls">
      <button class="proj-btn" data-action="pick-project" data-target="timer">${projLabel(d.projectId)}</button>
      <span class="tb-sep"></span>
      <button class="icon-btn ${d.tagIds.length ? 'active' : ''}" data-action="pick-tags" data-target="timer" title="Tags">${ic('tag')}${d.tagIds.length ? `<span class="badge">${d.tagIds.length}</span>` : ''}</button>
      <button class="icon-btn ${d.billable ? 'active' : ''}" data-action="toggle-billable" data-target="timer" title="Abrechenbar">€</button>
      <span class="tb-sep"></span>
      ${manual ? `<div class="manual">
          <input type="time" id="m-start" value="${m.start}" aria-label="Beginn"><span>–</span>
          <input type="time" id="m-end" value="${m.end}" aria-label="Ende">
          <input type="date" id="m-date" value="${m.date}" aria-label="Datum">
          <span class="m-dur" id="m-dur">0:00:00</span>
        </div>
        <button class="btn primary tb-main" data-action="add-manual">HINZUFÜGEN</button>`
      : `<span class="tb-time" id="timer-display">${r ? fmtClock(Date.now() - r.start) : '0:00:00'}</span>
        ${r ? `<button class="btn danger tb-main" data-action="stop">STOPP</button>` : `<button class="btn primary tb-main" data-action="start">START</button>`}`}
      ${r ? `<button class="icon-btn" data-action="discard" title="Timer verwerfen">${ic('trash')}</button>`
      : `<div class="mode-toggle">
          <button class="${!manual ? 'active' : ''}" data-action="set-mode" data-mode="timer" title="Timer-Modus">${ic('clock')}</button>
          <button class="${manual ? 'active' : ''}" data-action="set-mode" data-mode="manual" title="Manuelle Eingabe">${ic('list')}</button>
        </div>`}
    </div>
  </div>`;
}

function entryRowHTML(e) {
  const tags = e.tagIds.map(tag).filter(Boolean);
  const overnight = startOfDay(e.end) !== startOfDay(e.start) && e.end - startOfDay(e.end) > 0;
  return `<div class="entry">
    <div class="e-left">
      <button class="e-desc" data-action="edit-entry" data-id="${e.id}">${e.description ? esc(e.description) : '<span class="muted">(ohne Beschreibung)</span>'}</button>
      <button class="proj-btn" data-action="pick-project" data-target="${e.id}">${projLabel(e.projectId)}</button>
      ${tags.length ? `<div class="e-tags">${tags.map(t => `<span class="chip">${esc(t.name)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="e-right">
      <button class="e-range" data-action="edit-entry" data-id="${e.id}">${fmtTime(e.start)} – ${fmtTime(e.end)}${overnight ? '<sup>+1</sup>' : ''}</button>
      <button class="icon-btn ${tags.length ? 'active' : ''}" data-action="pick-tags" data-target="${e.id}" title="Tags">${ic('tag')}</button>
      <button class="icon-btn ${e.billable ? 'active' : ''}" data-action="toggle-billable" data-target="${e.id}" title="Abrechenbar">€</button>
      <span class="e-dur">${fmtDur(dur(e))}</span>
      <button class="icon-btn" data-action="continue" data-id="${e.id}" title="Fortsetzen">${ic('play')}</button>
      <button class="icon-btn" data-action="entry-menu" data-id="${e.id}" title="Weitere Aktionen">${ic('more')}</button>
    </div>
  </div>`;
}

function entriesHTML() {
  if (!S.entries.length) {
    return `<div class="card empty">${ic('clock').replace('class="ic"', 'class="ic big"')}
      <h3>Los geht's mit der Zeiterfassung</h3>
      <p>Beschreibung eingeben, Projekt wählen und auf START tippen.</p>
      ${cloudOn() ? '' : '<button class="btn ghost" data-action="load-demo">Demodaten laden</button>'}</div>`;
  }
  const thisWeek = startOfWeek(Date.now());
  const cutoff = addDays(thisWeek, -7 * (UI.weeksShown - 1));
  const list = S.entries.filter(e => e.start >= cutoff).sort((a, b) => b.start - a.start);
  const weeks = new Map();
  for (const e of list) {
    const wk = startOfWeek(e.start), dk = startOfDay(e.start);
    if (!weeks.has(wk)) weeks.set(wk, new Map());
    const days = weeks.get(wk);
    if (!days.has(dk)) days.set(dk, []);
    days.get(dk).push(e);
  }
  let html = '';
  for (const [wk, days] of weeks) {
    const label = wk === thisWeek ? 'Diese Woche' : wk === addDays(thisWeek, -7) ? 'Letzte Woche' : `${fmtD(wk)} – ${fmtD(addDays(wk, 6))}`;
    html += `<div class="week-head"><span>${label}</span><span>Woche gesamt: <b>${fmtDur(sum([...days.values()].flat()))}</b></span></div>`;
    for (const [dk, es] of days) {
      html += `<section class="card day"><header class="day-head"><span>${dayLabel(dk)}</span><span>Gesamt: <b>${fmtDur(sum(es))}</b></span></header>${es.map(entryRowHTML).join('')}</section>`;
    }
  }
  if (!list.length) html += `<div class="card empty"><p>Keine Einträge in den letzten ${UI.weeksShown} Wochen.</p></div>`;
  if (S.entries.some(e => e.start < cutoff)) html += `<button class="btn ghost load-more" data-action="load-more">Ältere Einträge laden</button>`;
  return html;
}

function viewTracker() { return `<div class="page">${timerBarHTML()}${entriesHTML()}</div>`; }

function afterTracker() {
  const inp = $('#tb-desc');
  inp.addEventListener('input', () => {
    (S.running || UI.draft).description = inp.value;
    if (S.running) save();
  });
  inp.addEventListener('change', () => {
    // Wie Clockify: bekannte Beschreibung übernimmt Projekt/Tags des letzten passenden Eintrags
    const d = S.running || UI.draft;
    if (d.projectId || !inp.value) return;
    const prev = S.entries.filter(e => e.description === inp.value).sort((a, b) => b.start - a.start)[0];
    if (prev) { Object.assign(d, { projectId: prev.projectId, tagIds: [...prev.tagIds], billable: prev.billable }); save(); render(); }
  });
  inp.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    if (S.running) inp.blur();
    else if (S.settings.trackMode === 'manual') addManual();
    else startTimer(UI.draft);
  });
  if (S.settings.trackMode === 'manual' && !S.running) {
    const upd = () => {
      UI.manual = { start: $('#m-start').value, end: $('#m-end').value, date: $('#m-date').value };
      const [s, e] = manualTimes();
      $('#m-dur').textContent = s != null ? fmtClock(e - s) : '0:00:00';
    };
    $$('#m-start, #m-end, #m-date').forEach(i => i.addEventListener('input', upd));
    upd();
  }
}

function manualTimes() { return rangeFrom(UI.manual.date, UI.manual.start, UI.manual.end); }
function rangeFrom(date, st, en) {
  if (!date || !st || !en) return [null, null];
  const s = parseDT(date, st);
  let e = parseDT(date, en);
  if (e < s) e = addDays(e, 1); // über Mitternacht
  return [s, e];
}

function startTimer(fields) {
  if (S.running) stopTimer(true);
  S.running = { id: uid(), description: (fields.description || '').trim(), projectId: fields.projectId || null, tagIds: [...(fields.tagIds || [])], billable: !!fields.billable, start: Math.floor(Date.now() / 1000) * 1000 };
  UI.draft = emptyDraft();
  save(); render();
}
function stopTimer(silent) {
  const r = S.running;
  if (!r) return;
  // gleiche ID wie der laufende Timer, damit der Eintrag in SharePoint nur aktualisiert wird
  const e = { id: r.id || uid(), description: r.description.trim(), projectId: r.projectId, tagIds: r.tagIds, billable: r.billable, start: r.start, end: Math.floor(Date.now() / 1000) * 1000 };
  S.entries.push(e);
  S.running = null;
  save();
  if (!silent) { render(); toast(`Eintrag gespeichert (${fmtClock(dur(e))})`); }
}
function addManual() {
  const [s, e] = manualTimes();
  if (s == null) return toast('Bitte Beginn, Ende und Datum angeben');
  const d = UI.draft;
  S.entries.push({ id: uid(), description: d.description.trim(), projectId: d.projectId, tagIds: [...d.tagIds], billable: d.billable, start: s, end: e });
  UI.draft = emptyDraft();
  UI.manual = { date: UI.manual.date, start: UI.manual.end, end: '' };
  save(); render(); toast('Eintrag hinzugefügt');
}
function deleteEntry(id) {
  const i = S.entries.findIndex(e => e.id === id);
  if (i < 0) return;
  const [removed] = S.entries.splice(i, 1);
  save(); render();
  toast('Eintrag gelöscht', 'Rückgängig', () => { S.entries.push(removed); save(); render(); });
}

/* ---------- Ziele für Picker (Timer, Eintrag, Modal) ---------- */
function targetObj(t) {
  if (t === 'timer') return S.running || UI.draft;
  if (t === 'modal') return UI.modalDraft;
  return S.entries.find(e => e.id === t);
}
function applyTarget(t, fn) {
  const o = targetObj(t);
  if (!o) return;
  fn(o);
  if (t === 'modal') { renderEntryModal(); return; }
  if (t !== 'timer' || S.running) save();
  render();
}

/* =====================================================================
   Popover & Modal
   ===================================================================== */
function openPopover(anchor, html, mount, cls = '') {
  closePopover();
  const root = $('#popover-root');
  const sheet = innerWidth < 640;
  root.innerHTML = `<div class="pop-backdrop ${sheet ? 'dim' : ''}"></div><div class="popover ${cls} ${sheet ? 'sheet' : ''}">${html}</div>`;
  const pop = $('.popover', root);
  $('.pop-backdrop', root).addEventListener('click', closePopover);
  if (!sheet) {
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let top = r.bottom + 6;
    if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pw - 8)) + 'px';
    pop.style.top = top + 'px';
  }
  mount && mount(pop);
}
function closePopover() { $('#popover-root').innerHTML = ''; }

function openModal(html, mount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const bd = $('.modal-backdrop', root);
  bd.addEventListener('mousedown', e => { if (e.target === bd) closeModal(); });
  mount && mount($('.modal', root));
}
function closeModal() { $('#modal-root').innerHTML = ''; UI.modalDraft = null; }

function openProjectPicker(anchor, target) {
  const cur = targetObj(target)?.projectId || null;
  openPopover(anchor, `<input class="pp-search" placeholder="Projekt oder Kunde suchen…" autocomplete="off"><div class="pp-list"></div>`, pop => {
    const inp = $('.pp-search', pop), listEl = $('.pp-list', pop);
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      const match = p => !p.archived && (!q || p.name.toLowerCase().includes(q) || (client(p.clientId)?.name || '').toLowerCase().includes(q));
      const groups = [[null, 'Ohne Kunde'], ...[...S.clients].sort(byName).map(c => [c.id, c.name])];
      let html = q ? '' : `<button class="pp-item ${!cur ? 'sel' : ''}" data-pick=""><span class="dot" style="background:${NO_COLOR}"></span>Kein Projekt</button>`;
      for (const [cid, cname] of groups) {
        const ps = S.projects.filter(p => (p.clientId || null) === cid && match(p)).sort(byName);
        if (!ps.length) continue;
        html += `<div class="pp-group">${esc(cname)}</div>` + ps.map(p =>
          `<button class="pp-item ${p.id === cur ? 'sel' : ''}" data-pick="${p.id}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</button>`).join('');
      }
      if (q && !S.projects.some(p => p.name.toLowerCase() === q)) {
        html += `<button class="pp-item pp-create" data-create>${ic('plus')} Projekt „${esc(inp.value.trim())}“ erstellen</button>`;
      } else if (!S.projects.length) {
        html += `<div class="pp-empty">Noch keine Projekte – Namen eintippen zum Anlegen</div>`;
      }
      listEl.innerHTML = html;
    };
    const choose = id => {
      closePopover();
      applyTarget(target, o => { o.projectId = id; const p = proj(id); if (p) o.billable = !!p.billable; });
    };
    listEl.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-create')) {
        const p = { id: uid(), name: inp.value.trim(), clientId: null, color: COLORS[S.projects.length % COLORS.length], rate: null, billable: true, archived: false };
        S.projects.push(p); save(); choose(p.id);
      } else choose(b.dataset.pick || null);
    });
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') closePopover();
      if (ev.key === 'Enter') { ev.preventDefault(); $('[data-pick]:not([data-pick=""]), [data-create]', listEl)?.click(); }
    });
    draw();
    if (innerWidth >= 640) inp.focus();
  });
}

function openTagPicker(anchor, target) {
  openPopover(anchor, `<input class="pp-search" placeholder="Tag suchen oder erstellen…" autocomplete="off"><div class="pp-list"></div>`, pop => {
    const inp = $('.pp-search', pop), listEl = $('.pp-list', pop);
    const draw = () => {
      const o = targetObj(target);
      if (!o) return closePopover();
      const q = inp.value.trim().toLowerCase();
      const list = S.tags.filter(t => t.name.toLowerCase().includes(q)).sort(byName);
      listEl.innerHTML = list.map(t => `<label class="pp-check"><input type="checkbox" data-tag="${t.id}" ${o.tagIds.includes(t.id) ? 'checked' : ''}>${esc(t.name)}</label>`).join('')
        + (q && !S.tags.some(t => t.name.toLowerCase() === q) ? `<button class="pp-item pp-create" data-create>${ic('plus')} Tag „${esc(inp.value.trim())}“ erstellen</button>` : '')
        + (!S.tags.length && !q ? '<div class="pp-empty">Noch keine Tags – Namen eintippen zum Anlegen</div>' : '');
    };
    listEl.addEventListener('change', ev => {
      const id = ev.target.dataset.tag;
      if (!id) return;
      applyTarget(target, o => { o.tagIds = ev.target.checked ? [...o.tagIds, id] : o.tagIds.filter(x => x !== id); });
    });
    const create = () => {
      const name = inp.value.trim();
      if (!name) return;
      const t = { id: uid(), name };
      S.tags.push(t); save();
      applyTarget(target, o => { o.tagIds = [...o.tagIds, t.id]; });
      inp.value = ''; draw();
    };
    listEl.addEventListener('click', ev => { if (ev.target.closest('[data-create]')) create(); });
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') closePopover();
      if (ev.key === 'Enter') { ev.preventDefault(); create(); }
    });
    draw();
    if (innerWidth >= 640) inp.focus();
  });
}

function openEntryMenu(anchor, id) {
  openPopover(anchor, `
    <button class="pp-item" data-m="edit">${ic('edit')} Bearbeiten</button>
    <button class="pp-item" data-m="dup">${ic('copy')} Duplizieren</button>
    <button class="pp-item danger" data-m="del">${ic('trash')} Löschen</button>`, pop => {
    pop.addEventListener('click', ev => {
      const m = ev.target.closest('[data-m]')?.dataset.m;
      if (!m) return;
      closePopover();
      const e = S.entries.find(x => x.id === id);
      if (!e) return;
      if (m === 'edit') openEntryModal(id);
      if (m === 'dup') { S.entries.push({ ...e, id: uid(), tagIds: [...e.tagIds] }); save(); render(); toast('Eintrag dupliziert'); }
      if (m === 'del') deleteEntry(id);
    });
  }, 'menu');
}

function openUserMenu(anchor) {
  const acc = window.Cloud?.account?.();
  const name = S.settings.userName || acc?.name || 'Kein Name eingetragen';
  const cloud = cloudOn();
  openPopover(anchor, `
    <div class="um-head"><span class="avatar big">${esc($('#user-avatar').textContent)}</span>
      <div class="um-who"><b>${esc(name)}</b><span class="muted">${esc(acc?.username || (cloud ? 'Nicht angemeldet' : 'Nur auf diesem Gerät'))}</span></div></div>
    <button class="pp-item" data-m="profile">${ic('cog')} Profil & Einstellungen</button>
    ${cloud && acc ? `<button class="pp-item" data-m="sync">${ic('upload')} Jetzt synchronisieren</button>
      <button class="pp-item danger" data-m="logout">${ic('x')} Abmelden</button>` : ''}
    ${cloud && !acc ? `<button class="pp-item" data-m="login">${ic('users')} Anmelden</button>` : ''}`, pop => {
    pop.addEventListener('click', ev => {
      const m = ev.target.closest('[data-m]')?.dataset.m;
      if (!m) return;
      closePopover();
      if (m === 'profile') location.hash = '#/settings';
      if (m === 'sync') Cloud.sync();
      if (m === 'logout') Cloud.logout();
      if (m === 'login') Cloud.login();
    });
  }, 'menu user-menu');
}

function openEntryModal(id) {
  const e = S.entries.find(x => x.id === id);
  if (!e) return;
  UI.modalDraft = { ...e, tagIds: [...e.tagIds], date: dateStr(e.start), startT: fmtTime(e.start), endT: fmtTime(e.end) };
  renderEntryModal();
}
function renderEntryModal() {
  const d = UI.modalDraft;
  openModal(`<h2>Zeiteintrag bearbeiten</h2>
    <label class="field"><span>Beschreibung</span><input id="md-desc" value="${esc(d.description)}" autocomplete="off"></label>
    <div class="field"><span>Projekt</span><button class="select-btn" data-action="pick-project" data-target="modal">${projLabel(d.projectId, 'Projekt wählen')}</button></div>
    <div class="field"><span>Tags</span><button class="select-btn" data-action="pick-tags" data-target="modal">${tagsLabel(d.tagIds)}</button></div>
    <label class="check"><input type="checkbox" id="md-bill" ${d.billable ? 'checked' : ''}> Abrechenbar</label>
    <div class="row3">
      <label class="field"><span>Datum</span><input type="date" id="md-date" value="${d.date}"></label>
      <label class="field"><span>Beginn</span><input type="time" id="md-start" value="${d.startT}"></label>
      <label class="field"><span>Ende</span><input type="time" id="md-end" value="${d.endT}"></label>
    </div>
    <div class="md-dur">Dauer: <b id="md-dur"></b></div>
    <div class="modal-actions">
      <button class="btn danger-ghost" data-action="delete-entry" data-id="${d.id}">Löschen</button><span class="grow"></span>
      <button class="btn ghost" data-action="close-modal">Abbrechen</button>
      <button class="btn primary" data-action="save-entry">Speichern</button>
    </div>`, m => {
    const sync = () => {
      d.description = $('#md-desc', m).value;
      d.billable = $('#md-bill', m).checked;
      d.date = $('#md-date', m).value; d.startT = $('#md-start', m).value; d.endT = $('#md-end', m).value;
      const [s, e] = rangeFrom(d.date, d.startT, d.endT);
      $('#md-dur', m).textContent = s != null ? fmtClock(e - s) : '–';
    };
    m.addEventListener('input', sync);
    m.addEventListener('change', sync);
    $('#md-desc', m).addEventListener('keydown', ev => { if (ev.key === 'Enter') saveEntryModal(); });
    sync();
  });
}
function saveEntryModal() {
  const d = UI.modalDraft, e = S.entries.find(x => x.id === d?.id);
  if (!e) return closeModal();
  const [s, en] = rangeFrom(d.date, d.startT, d.endT);
  if (s == null) return toast('Bitte Datum, Beginn und Ende angeben');
  Object.assign(e, { description: d.description.trim(), projectId: d.projectId, tagIds: d.tagIds, billable: d.billable, start: s, end: en });
  save(); closeModal(); render(); toast('Gespeichert');
}

function promptModal(title, value, cb) {
  openModal(`<h2>${esc(title)}</h2><form id="pm">
    <label class="field"><span>Name</span><input name="v" value="${esc(value)}" required autocomplete="off"></label>
    <div class="modal-actions"><span class="grow"></span>
      <button type="button" class="btn ghost" data-action="close-modal">Abbrechen</button>
      <button class="btn primary">Speichern</button></div></form>`, m => {
    const f = $('#pm', m), i = f.elements.v;
    i.focus(); i.select();
    f.addEventListener('submit', e => { e.preventDefault(); const v = i.value.trim(); if (!v) return; closeModal(); cb(v); });
  });
}

/* =====================================================================
   Berichte
   ===================================================================== */
function reportRange() {
  const R = UI.report, now = Date.now();
  let from, to, label;
  switch (R.range) {
    case 'day':
      from = addDays(startOfDay(now), R.offset); to = addDays(from, 1);
      label = R.offset === 0 ? 'Heute' : new Date(from).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
      break;
    case 'month': {
      const d = new Date(now);
      from = new Date(d.getFullYear(), d.getMonth() + R.offset, 1).getTime();
      to = new Date(d.getFullYear(), d.getMonth() + R.offset + 1, 1).getTime();
      label = new Date(from).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      break;
    }
    case 'year': {
      const y = new Date(now).getFullYear() + R.offset;
      from = new Date(y, 0, 1).getTime(); to = new Date(y + 1, 0, 1).getTime(); label = String(y);
      break;
    }
    case 'custom':
      if (!R.from || !R.to) { R.from = dateStr(startOfWeek(now)); R.to = dateStr(addDays(startOfWeek(now), 6)); }
      from = parseDT(R.from); to = addDays(parseDT(R.to), 1);
      if (to <= from) to = addDays(from, 1);
      label = `${fmtD(from)} – ${fmtD(addDays(to, -1))}`;
      break;
    default:
      from = addDays(startOfWeek(now), 7 * R.offset); to = addDays(from, 7);
      label = R.offset === 0 ? 'Diese Woche' : R.offset === -1 ? 'Letzte Woche' : `${fmtD(from)} – ${fmtD(addDays(to, -1))}`;
  }
  return { from, to, label };
}

function reportSource(from, to) {
  if (UI.report.scope === 'team' && window.Cloud?.signedIn()) return Cloud.teamEntries(from, to);
  return { status: 'ok', list: S.entries };
}
function reportEntries(from, to, src = reportSource(from, to)) {
  const R = UI.report, q = R.q.trim().toLowerCase();
  return src.list.filter(e =>
    e.start >= from && e.start < to &&
    (!R.userId || R.scope !== 'team' || e.userId === R.userId) &&
    (!R.projectId || (R.projectId === 'none' ? !proj(e.projectId) : e.projectId === R.projectId)) &&
    (!R.clientId || (R.clientId === 'none' ? !proj(e.projectId)?.clientId : proj(e.projectId)?.clientId === R.clientId)) &&
    (!R.tagId || e.tagIds.includes(R.tagId)) &&
    (R.billable === '' || String(e.billable) === R.billable) &&
    (!q || e.description.toLowerCase().includes(q))
  ).sort((a, b) => a.start - b.start);
}

function groupKeys(e, by) {
  const p = proj(e.projectId);
  switch (by) {
    case 'client': { const c = client(p?.clientId); return [[c?.id || '-', c?.name || 'Ohne Kunde', c ? hashColor(c.id) : NO_COLOR]]; }
    case 'tag': {
      const ts = e.tagIds.map(tag).filter(Boolean);
      return ts.length ? ts.map(t => [t.id, t.name, hashColor(t.id)]) : [['-', 'Ohne Tag', NO_COLOR]];
    }
    case 'description': return [[e.description || '-', e.description || '(ohne Beschreibung)', e.description ? hashColor(e.description) : NO_COLOR]];
    case 'day': { const k = startOfDay(e.start); return [[k, dayLabel(k), COLORS[0]]]; }
    case 'user': return [[e.userId || 'me', e.userName || S.settings.userName || 'Ich', hashColor(e.userId || 'me')]];
    default: return [[p?.id || '-', p ? p.name + (client(p.clientId) ? ' · ' + client(p.clientId).name : '') : 'Ohne Projekt', p?.color || NO_COLOR]];
  }
}
function groupEntries(list, by) {
  const m = new Map();
  for (const e of list) for (const [k, name, color] of groupKeys(e, by)) {
    if (!m.has(k)) m.set(k, { key: k, name, color, ms: 0, amount: 0, count: 0 });
    const g = m.get(k); g.ms += dur(e); g.amount += amountOf(e); g.count++;
  }
  const arr = [...m.values()];
  return by === 'day' ? arr.sort((a, b) => a.key - b.key) : arr.sort((a, b) => b.ms - a.ms);
}

function buckets(from, to) {
  const days = Math.round((to - from) / DAY), res = [];
  if (days <= 62) {
    for (let t = from; t < to; t = addDays(t, 1)) {
      const d = new Date(t);
      res.push({ from: t, to: addDays(t, 1), label: days <= 7 ? d.toLocaleDateString('de-DE', { weekday: 'short' }) + ' ' + d.getDate() + '.' : d.getDate() + '.' + (d.getMonth() + 1) + '.' });
    }
  } else {
    let d = new Date(from); d = new Date(d.getFullYear(), d.getMonth(), 1);
    while (d.getTime() < to) {
      const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      res.push({ from: Math.max(d.getTime(), from), to: Math.min(n.getTime(), to), label: d.toLocaleDateString('de-DE', { month: 'short' }) });
      d = n;
    }
  }
  return res;
}

function barChartSVG(list, from, to) {
  const bks = buckets(from, to);
  const W = 800, H = 250, pl = 44, pr = 8, pt = 12, pb = 30, cw = W - pl - pr, ch = H - pt - pb;
  const data = bks.map(b => {
    const segs = new Map();
    for (const e of list) if (e.start >= b.from && e.start < b.to) {
      const p = proj(e.projectId), k = p?.id || '-';
      if (!segs.has(k)) segs.set(k, { ms: 0, color: p?.color || NO_COLOR, name: p?.name || 'Ohne Projekt' });
      segs.get(k).ms += dur(e);
    }
    return { ...b, segs: [...segs.values()], total: [...segs.values()].reduce((a, s) => a + s.ms, 0) };
  });
  const maxH = Math.max(...data.map(d => d.total / HOUR), 0);
  const step = [0.5, 1, 2, 4, 5, 10, 20, 25, 50, 100, 200, 250, 500].find(s => maxH / s <= 5) || 1000;
  const top = Math.max(step, Math.ceil(maxH / step) * step);
  const y = h => pt + ch - (h / top) * ch;
  let svg = '';
  for (let v = 0; v <= top + 1e-9; v += step) {
    svg += `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-t" x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${String(v).replace('.', ',')} h</text>`;
  }
  const bw = cw / data.length, barW = Math.min(bw * 0.62, 46);
  const every = Math.ceil(data.length / 16);
  data.forEach((d, i) => {
    const x = pl + i * bw + (bw - barW) / 2;
    let acc = 0;
    for (const s of d.segs) {
      const h0 = acc / HOUR, h1 = (acc + s.ms) / HOUR;
      svg += `<rect x="${x.toFixed(1)}" y="${y(h1).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, y(h0) - y(h1)).toFixed(1)}" fill="${s.color}"><title>${esc(s.name)}: ${fmtClock(s.ms)}</title></rect>`;
      acc += s.ms;
    }
    if (d.total && data.length <= 16) svg += `<text class="axis-t" x="${(x + barW / 2).toFixed(1)}" y="${(y(d.total / HOUR) - 5).toFixed(1)}" text-anchor="middle">${fmtDec(d.total)}</text>`;
    if (i % every === 0) svg += `<text class="axis-t" x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle">${d.label}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Stunden pro Zeitabschnitt">${svg}</svg>`;
}

function donutSVG(groups) {
  const total = groups.reduce((a, g) => a + g.ms, 0), r = 70, C = 2 * Math.PI * r;
  let acc = 0, arcs = '';
  if (total) for (const g of groups) {
    const len = g.ms / total * C;
    arcs += `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${g.color}" stroke-width="26" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 100 100)"><title>${esc(g.name)}</title></circle>`;
    acc += len;
  } else arcs = `<circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--border)" stroke-width="26"/>`;
  return `<svg viewBox="0 0 200 200">${arcs}<text class="donut-t" x="100" y="102" text-anchor="middle">${fmtClock(total)}</text><text class="donut-s" x="100" y="120" text-anchor="middle">GESAMT</text></svg>`;
}

function viewReports() {
  const R = UI.report, { from, to, label } = reportRange();
  const teamOk = !!window.Cloud?.signedIn();
  if (!teamOk) R.scope = 'me';
  const isTeam = R.scope === 'team';
  if (!isTeam && R.groupBy === 'user') R.groupBy = 'project';
  const src = reportSource(from, to), list = reportEntries(from, to, src);
  const users = isTeam ? [...new Map(src.list.map(e => [e.userId, e.userName])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'de')) : [];
  const note = src.status === 'loading' ? '<div class="card rep-note">Lade Daten aller Mitarbeiter aus SharePoint …</div>'
    : src.status === 'error' ? `<div class="card rep-note err">Teamdaten konnten nicht geladen werden: ${esc(src.error)}</div>` : '';
  const total = sum(list), billMs = sum(list.filter(e => e.billable)), amount = list.reduce((a, e) => a + amountOf(e), 0);
  const groups = groupEntries(list, R.groupBy), gsum = groups.reduce((a, g) => a + g.ms, 0) || 1;
  const opt = (v, t, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`;
  const sel = (name, first, items) => `<select name="${name}" data-change="rep">${opt('', first, R[name])}${items.map(([v, t]) => opt(v, t, R[name])).join('')}</select>`;
  const rows = list.slice().reverse();
  return `<div class="page">
    <div class="page-head"><h1>Berichte</h1>
      <button class="btn ghost small no-print" data-action="rep-csv">${ic('download')} CSV</button>
      <button class="btn ghost small no-print" data-action="rep-print">${ic('printer')} PDF / Drucken</button>
    </div>
    <div class="print-only"><b>Stundenbericht ${esc(label)}</b>${S.settings.userName ? ' – ' + esc(S.settings.userName) : ''}</div>
    <div class="card rep-bar no-print">
      <div class="rep-row">
        ${teamOk ? `<select name="scope" data-change="rep">${opt('me', 'Meine Zeiten', R.scope)}${opt('team', 'Alle Mitarbeiter', R.scope)}</select>` : ''}
        ${isTeam ? `<select name="userId" data-change="rep">${opt('', 'Alle Personen', R.userId)}${users.map(([id, n]) => opt(id, n, R.userId)).join('')}</select>
          <button class="icon-btn" data-action="team-refresh" title="Teamdaten neu laden">⟳</button>` : ''}
        <select name="range" data-change="rep">${[['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat'], ['year', 'Jahr'], ['custom', 'Zeitraum']].map(([v, t]) => opt(v, t, R.range)).join('')}</select>
        ${R.range === 'custom'
          ? `<input type="date" name="from" data-change="rep" value="${R.from}"><span>–</span><input type="date" name="to" data-change="rep" value="${R.to}">`
          : `<div class="range-nav"><button class="icon-btn" data-action="rep-shift" data-d="-1" aria-label="Zurück">${ic('chevL')}</button><span class="range-label">${esc(label)}</span><button class="icon-btn" data-action="rep-shift" data-d="1" aria-label="Weiter">${ic('chevR')}</button></div>`}
      </div>
      <div class="rep-row">
        ${sel('projectId', 'Alle Projekte', [['none', 'Ohne Projekt'], ...[...S.projects].sort(byName).map(p => [p.id, p.name])])}
        ${sel('clientId', 'Alle Kunden', [['none', 'Ohne Kunde'], ...[...S.clients].sort(byName).map(c => [c.id, c.name])])}
        ${sel('tagId', 'Alle Tags', [...S.tags].sort(byName).map(t => [t.id, t.name]))}
        ${sel('billable', 'Abrechenbar & nicht', [['true', 'Nur abrechenbar'], ['false', 'Nur nicht abrechenbar']])}
        <input type="search" name="q" data-change="rep" value="${esc(R.q)}" placeholder="Beschreibung suchen…">
      </div>
    </div>
    ${note}
    <div class="stats">
      <div class="card stat"><div class="k">Gesamt</div><div class="v">${fmtDur(total)}</div></div>
      <div class="card stat"><div class="k">Abrechenbar</div><div class="v">${fmtDur(billMs)}</div></div>
      <div class="card stat"><div class="k">Betrag</div><div class="v">${fmtMoney(amount)}</div></div>
    </div>
    <div class="card chart"><div class="card-body">${barChartSVG(list, from, to)}</div></div>
    <div class="card section-gap">
      <div class="card-head">Aufschlüsselung nach
        <select name="groupBy" data-change="rep" class="no-print" style="height:32px;border:1px solid var(--border);border-radius:4px;background:var(--surface);padding:0 6px">
          ${[...(isTeam ? [['user', 'Mitarbeiter']] : []), ['project', 'Projekt'], ['client', 'Kunde'], ['tag', 'Tag'], ['description', 'Beschreibung'], ['day', 'Tag (Datum)']].map(([v, t]) => opt(v, t, R.groupBy)).join('')}
        </select>
      </div>
      <div class="card-body breakdown">
        ${donutSVG(groups)}
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Name</th><th class="num">Dauer</th><th class="num hide-mobile">Betrag</th><th class="hide-mobile" style="width:28%">Anteil</th></tr></thead>
          <tbody>${groups.map(g => `<tr>
            <td><span class="name-cell"><span class="dot" style="background:${g.color}"></span>${esc(g.name)}</span></td>
            <td class="num">${fmtDur(g.ms)}</td><td class="num hide-mobile">${fmtMoney(g.amount)}</td>
            <td class="hide-mobile"><div class="pct" title="${Math.round(g.ms / gsum * 100)} %"><i style="width:${(g.ms / gsum * 100).toFixed(1)}%;background:${g.color}"></i></div></td></tr>`).join('')
            || '<tr><td colspan="4" class="muted">Keine Einträge im gewählten Zeitraum</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head">Einzelnachweis <span class="muted" style="font-weight:400">(${list.length} Einträge)</span></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Datum</th>${isTeam ? '<th>Mitarbeiter</th>' : ''}<th>Beschreibung</th><th>Projekt</th><th class="hide-mobile">Zeit</th><th class="num">Dauer</th><th class="num hide-mobile">Betrag</th></tr></thead>
        <tbody>${rows.slice(0, 1000).map(e => `<tr>
          <td class="num" style="text-align:left">${fmtD(e.start)}</td>
          ${isTeam ? `<td>${esc(e.userName)}</td>` : ''}
          <td><button ${isTeam ? '' : `data-action="edit-entry" data-id="${e.id}"`} style="text-align:left">${e.description ? esc(e.description) : '<span class="muted">(ohne)</span>'}</button>
            ${e.tagIds.map(tag).filter(Boolean).map(t => `<span class="chip">${esc(t.name)}</span>`).join(' ')}</td>
          <td>${proj(e.projectId) ? projLabel(e.projectId) : '<span class="muted">–</span>'}</td>
          <td class="num hide-mobile" style="text-align:left">${fmtTime(e.start)} – ${fmtTime(e.end)}</td>
          <td class="num">${fmtDur(dur(e))}</td>
          <td class="num hide-mobile">${e.billable ? fmtMoney(amountOf(e)) : '<span class="muted">–</span>'}</td></tr>`).join('')
          || '<tr><td colspan="6" class="muted">Keine Einträge</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}

function exportCSV() {
  const { from, to, label } = reportRange(), list = reportEntries(from, to);
  const num = v => v.toFixed(2).replace('.', ',');
  const rows = [['Datum', 'Beginn', 'Ende', 'Dauer (h:mm:ss)', 'Dauer (Stunden)', 'Beschreibung', 'Projekt', 'Kunde', 'Tags', 'Abrechenbar', 'Stundensatz', 'Betrag', 'Mitarbeiter']];
  for (const e of list) {
    const p = proj(e.projectId), c = client(p?.clientId);
    rows.push([fmtD(e.start), fmtTime(e.start), fmtTime(e.end), fmtClock(dur(e)), num(dur(e) / HOUR), e.description,
      p?.name || '', c?.name || '', e.tagIds.map(tag).filter(Boolean).map(t => t.name).join(', '),
      e.billable ? 'Ja' : 'Nein', num(rateOf(e)), num(amountOf(e)), e.userName || S.settings.userName]);
  }
  const csv = rows.map(r => r.map(v => { v = String(v ?? ''); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';')).join('\r\n');
  downloadFile('﻿' + csv, `Stundenbericht_${label.replace(/[^\wäöüÄÖÜß.-]+/g, '_')}.csv`, 'text/csv;charset=utf-8');
}

async function downloadFile(content, name, type) {
  const blob = new Blob([content], { type });
  // Auf dem iPhone (installierte App) ist das Teilen-Menü der zuverlässigste Weg
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && navigator.canShare) {
    const file = new File([blob], name, { type });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* =====================================================================
   Projekte, Kunden, Tags
   ===================================================================== */
function viewProjects() {
  return `<div class="page">
    <div class="page-head"><h1>Projekte</h1><button class="btn primary" data-action="new-project">${ic('plus')} NEUES PROJEKT</button></div>
    <div class="card">
      <div class="toolbar">
        <input type="search" id="proj-q" placeholder="Projekt suchen…" value="${esc(UI.projQ)}">
        <label class="check" style="margin:0"><input type="checkbox" data-change="proj-arch" ${UI.showArchived ? 'checked' : ''}> Archivierte anzeigen</label>
      </div>
      <div id="proj-list">${projectTableHTML()}</div>
    </div>
  </div>`;
}
function projectTableHTML() {
  const q = UI.projQ.trim().toLowerCase();
  const list = S.projects.filter(p => (UI.showArchived || !p.archived) &&
    (!q || p.name.toLowerCase().includes(q) || (client(p.clientId)?.name || '').toLowerCase().includes(q))).sort(byName);
  if (!list.length) return `<div class="empty"><p>${S.projects.length ? 'Keine passenden Projekte.' : 'Noch keine Projekte angelegt.'}</p></div>`;
  return `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Name</th><th class="hide-mobile">Kunde</th><th class="num">Erfasst</th><th class="num hide-mobile">Stundensatz</th><th class="num hide-mobile">Betrag</th><th></th></tr></thead>
    <tbody>${list.map(p => {
      const es = S.entries.filter(e => e.projectId === p.id);
      return `<tr class="${p.archived ? 'archived' : ''}">
        <td><button class="name-cell" data-action="edit-project" data-id="${p.id}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.archived ? ' <span class="chip">archiviert</span>' : ''}</button></td>
        <td class="hide-mobile">${esc(client(p.clientId)?.name || '–')}</td>
        <td class="num">${fmtDur(sum(es))}</td>
        <td class="num hide-mobile">${p.rate != null ? fmtMoney(Number(p.rate)) : '<span class="muted">Standard</span>'}</td>
        <td class="num hide-mobile">${fmtMoney(es.reduce((a, e) => a + amountOf(e), 0))}</td>
        <td class="act">
          <button class="icon-btn" data-action="edit-project" data-id="${p.id}" title="Bearbeiten">${ic('edit')}</button>
          <button class="icon-btn" data-action="archive-project" data-id="${p.id}" title="${p.archived ? 'Wiederherstellen' : 'Archivieren'}">${ic('archive')}</button>
          <button class="icon-btn" data-action="delete-project" data-id="${p.id}" title="Löschen">${ic('trash')}</button>
        </td></tr>`;
    }).join('')}</tbody></table></div>`;
}
function afterProjects() {
  $('#proj-q').addEventListener('input', ev => { UI.projQ = ev.target.value; $('#proj-list').innerHTML = projectTableHTML(); });
}

function openProjectModal(id) {
  const p = id ? proj(id) : null;
  const d = p ? { ...p } : { name: '', clientId: null, color: COLORS[S.projects.length % COLORS.length], rate: null, billable: true };
  openModal(`<h2>${p ? 'Projekt bearbeiten' : 'Neues Projekt'}</h2><form id="pf">
    <label class="field"><span>Projektname</span><input name="pname" value="${esc(d.name)}" required autocomplete="off"></label>
    <label class="field"><span>Kunde</span><select name="clientId"><option value="">Ohne Kunde</option>
      ${[...S.clients].sort(byName).map(c => `<option value="${c.id}" ${c.id === d.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <div class="field"><span>Farbe</span><div class="swatches">${COLORS.map(c => `<label class="sw" style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === d.color ? 'checked' : ''}><i></i></label>`).join('')}</div></div>
    <label class="field"><span>Stundensatz in ${esc(S.settings.currency)} (leer = Standard ${fmtMoney(Number(S.settings.defaultRate) || 0)})</span>
      <input name="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${d.rate ?? ''}"></label>
    <label class="check"><input type="checkbox" name="billable" ${d.billable ? 'checked' : ''}> Einträge standardmäßig abrechenbar</label>
    <div class="modal-actions"><span class="grow"></span>
      <button type="button" class="btn ghost" data-action="close-modal">Abbrechen</button>
      <button class="btn primary">Speichern</button></div></form>`, m => {
    const f = $('#pf', m), el = f.elements;
    if (!p) el.pname.focus();
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const vals = {
        name: el.pname.value.trim(), clientId: el.clientId.value || null,
        color: f.querySelector('[name=color]:checked')?.value || d.color,
        rate: el.rate.value === '' ? null : Number(el.rate.value), billable: el.billable.checked
      };
      if (!vals.name) return;
      if (p) Object.assign(p, vals); else S.projects.push({ id: uid(), archived: false, ...vals });
      save(); closeModal(); render(); toast(p ? 'Projekt gespeichert' : 'Projekt angelegt');
    });
  });
}

function viewList(kind) {
  const isC = kind === 'clients';
  const list = [...S[kind]].sort(byName);
  return `<div class="page">
    <div class="page-head"><h1>${isC ? 'Kunden' : 'Tags'}</h1></div>
    <div class="card">
      <form class="toolbar" data-form="add-${kind}">
        <input type="text" name="n" placeholder="${isC ? 'Neuen Kunden hinzufügen' : 'Neuen Tag hinzufügen'}" required autocomplete="off">
        <button class="btn primary">HINZUFÜGEN</button>
      </form>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Name</th><th class="num">${isC ? 'Projekte' : 'Einträge'}</th><th class="num">Erfasst</th><th></th></tr></thead>
        <tbody>${list.map(x => {
          const es = isC ? S.entries.filter(e => proj(e.projectId)?.clientId === x.id) : S.entries.filter(e => e.tagIds.includes(x.id));
          const count = isC ? S.projects.filter(p => p.clientId === x.id).length : es.length;
          return `<tr><td><span class="name-cell">${esc(x.name)}</span></td><td class="num">${count}</td><td class="num">${fmtDur(sum(es))}</td>
            <td class="act"><button class="icon-btn" data-action="rename-item" data-kind="${kind}" data-id="${x.id}" title="Umbenennen">${ic('edit')}</button>
            <button class="icon-btn" data-action="delete-item" data-kind="${kind}" data-id="${x.id}" title="Löschen">${ic('trash')}</button></td></tr>`;
        }).join('')}</tbody></table></div>`
      : `<div class="empty"><p>Noch keine ${isC ? 'Kunden' : 'Tags'} angelegt.</p></div>`}
    </div>
  </div>`;
}

/* =====================================================================
   Einstellungen
   ===================================================================== */
function viewSettings() {
  const s = S.settings;
  const opt = (v, t, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `<div class="page"><div class="page-head"><h1>Einstellungen</h1></div>
    <div class="settings-grid">
      <div class="card"><div class="card-head">Profil & Allgemein</div><div class="card-body">
        <div class="row2">
          <label class="field"><span>Ihr Name (erscheint im Bericht)</span><input name="userName" data-change="setting" value="${esc(s.userName)}" autocomplete="name"></label>
          <label class="field"><span>Standard-Stundensatz</span><input name="defaultRate" data-change="setting" type="number" min="0" step="0.01" inputmode="decimal" value="${s.defaultRate}"></label>
          <label class="field"><span>Währung</span><select name="currency" data-change="setting">${['EUR', 'CHF', 'USD', 'GBP'].map(c => opt(c, c, s.currency)).join('')}</select></label>
          <label class="field"><span>Wochenbeginn</span><select name="weekStart" data-change="setting">${opt(1, 'Montag', s.weekStart)}${opt(0, 'Sonntag', s.weekStart)}</select></label>
          <label class="field"><span>Dauerformat</span><select name="durationFormat" data-change="setting">${opt('hms', 'h:mm:ss (1:30:00)', s.durationFormat)}${opt('decimal', 'Dezimal (1,50 h)', s.durationFormat)}</select></label>
        </div>
      </div></div>
      ${window.Cloud ? Cloud.settingsHTML() : ''}
      <div class="card"><div class="card-head">Daten</div><div class="card-body">
        <p class="muted" style="margin-top:0">${S.entries.length} Zeiteinträge, ${S.projects.length} Projekte, ${S.clients.length} Kunden, ${S.tags.length} Tags – ${cloudOn() ? 'in SharePoint gespeichert, mit Offline-Kopie auf diesem Gerät' : 'lokal auf diesem Gerät gespeichert'}.</p>
        <div class="data-actions">
          <button class="btn ghost small" data-action="export-json">${ic('download')} Sicherung exportieren</button>
          ${cloudOn() ? '' : `<button class="btn ghost small" data-action="import-json">${ic('upload')} Sicherung importieren</button>
          <button class="btn ghost small" data-action="load-demo">Demodaten laden</button>
          <button class="btn danger-ghost small" data-action="reset-all">${ic('trash')} Alle Daten löschen</button>`}
        </div>
      </div></div>
      <div class="card"><div class="card-head">Auf dem iPhone installieren ${standalone ? '<span class="chip">installiert</span>' : ''}</div><div class="card-body">
        <ol class="help-list">
          <li>Diese Seite in <b>Safari</b> öffnen.</li>
          <li>Unten auf das <b>Teilen</b>-Symbol tippen.</li>
          <li><b>„Zum Home-Bildschirm“</b> wählen und bestätigen.</li>
          <li>Die App startet danach im Vollbild und funktioniert auch offline.</li>
        </ol>
        <p style="margin-bottom:0"><a href="anleitung.html" target="_blank" rel="noopener">Ausführliche Anleitung für Mitarbeiter öffnen</a></p>
      </div></div>
    </div></div>`;
}

function exportJSON() {
  downloadFile(JSON.stringify({ app: 'zeiterfassung', version: 1, exported: new Date().toISOString(), ...S }, null, 2),
    `Zeiterfassung_Sicherung_${todayStr()}.json`, 'application/json');
}
function importJSON(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.entries) || !Array.isArray(d.projects)) throw new Error('Keine gültige Sicherungsdatei');
      if (!confirm(`Sicherung mit ${d.entries.length} Einträgen importieren? Die aktuellen Daten werden ersetzt.`)) return;
      const def = defaultState();
      S = { settings: Object.assign(def.settings, d.settings || {}), clients: d.clients || [], projects: d.projects, tags: d.tags || [], entries: d.entries, running: d.running || null };
      save(); render(); toast('Sicherung importiert');
    } catch (e) { toast('Import fehlgeschlagen: ' + e.message); }
  };
  r.readAsText(file);
}

function loadDemo() {
  if (S.entries.length && !confirm('Demodaten zu den vorhandenen Daten hinzufügen?')) return;
  const c1 = { id: uid(), name: 'Muster Immobilien GmbH' }, c2 = { id: uid(), name: 'Stadtwerke Beispielstadt' };
  const t1 = { id: uid(), name: 'Vor-Ort' }, t2 = { id: uid(), name: 'Besprechung' }, t3 = { id: uid(), name: 'Dokumentation' };
  const ps = [
    { id: uid(), name: 'TGA-Planung Bürogebäude', clientId: c1.id, color: COLORS[0], rate: 95, billable: true, archived: false },
    { id: uid(), name: 'Brandschutzkonzept', clientId: c1.id, color: COLORS[2], rate: 110, billable: true, archived: false },
    { id: uid(), name: 'Anlagenprüfung Pumpwerk', clientId: c2.id, color: COLORS[1], rate: 90, billable: true, archived: false },
    { id: uid(), name: 'Intern / Verwaltung', clientId: null, color: COLORS[8], rate: null, billable: false, archived: false }
  ];
  const texts = [['Entwurfsplanung Lüftung', 'Abstimmung Architekt', 'Massenermittlung'], ['Stellungnahme Fluchtwege', 'Begehung Bestand'],
    ['Prüfbericht erstellen', 'Messung vor Ort'], ['E-Mails & Organisation', 'Teambesprechung']];
  const tagFor = [[[], [t2.id], [t3.id]], [[t3.id], [t1.id]], [[t3.id], [t1.id]], [[], [t2.id]]];
  S.clients.push(c1, c2); S.tags.push(t1, t2, t3); S.projects.push(...ps);
  for (let back = 20; back >= 0; back--) {
    const day = addDays(startOfDay(Date.now()), -back), wd = new Date(day).getDay();
    if (wd === 0 || wd === 6) continue;
    let t = day + 8 * HOUR + Math.floor(Math.random() * 3) * 15 * 60000;
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const pi = Math.floor(Math.random() * ps.length), ti = Math.floor(Math.random() * texts[pi].length);
      const len = (45 + Math.floor(Math.random() * 12) * 15) * 60000;
      if (back === 0 && t + len > Date.now()) break;
      S.entries.push({ id: uid(), description: texts[pi][ti], projectId: ps[pi].id, tagIds: tagFor[pi][ti], billable: ps[pi].billable, start: t, end: t + len });
      t += len + (i === 1 ? 45 : 10) * 60000;
    }
  }
  if (!S.settings.defaultRate) S.settings.defaultRate = 85;
  save(); render(); toast('Demodaten geladen');
}

/* =====================================================================
   Ereignisse
   ===================================================================== */
const ACTIONS = {
  'toggle-nav': () => {
    if (innerWidth <= 760) return document.body.classList.toggle('nav-open');
    const c = document.body.classList.toggle('nav-collapsed'); // am PC: Leiste ein-/ausklappen
    try { localStorage.setItem('zeiterfassung.navCollapsed', c ? '1' : ''); } catch { }
  },
  'user-menu': el => openUserMenu(el),
  'start': () => startTimer(UI.draft),
  'stop': () => stopTimer(),
  'discard': () => { if (confirm('Laufenden Timer verwerfen?')) { S.running = null; save(); render(); } },
  'add-manual': addManual,
  'set-mode': el => { S.settings.trackMode = el.dataset.mode; save(); render(); },
  'continue': el => { const e = S.entries.find(x => x.id === el.dataset.id); if (e) { startTimer(e); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  'edit-entry': el => openEntryModal(el.dataset.id),
  'entry-menu': el => openEntryMenu(el, el.dataset.id),
  'delete-entry': el => { closeModal(); deleteEntry(el.dataset.id); },
  'save-entry': saveEntryModal,
  'pick-project': el => openProjectPicker(el, el.dataset.target),
  'pick-tags': el => openTagPicker(el, el.dataset.target),
  'toggle-billable': el => applyTarget(el.dataset.target, o => { o.billable = !o.billable; }),
  'load-more': () => { UI.weeksShown += 4; render(); },
  'close-modal': closeModal,
  'rep-shift': el => { UI.report.offset += Number(el.dataset.d); render(); },
  'rep-csv': exportCSV,
  'rep-print': () => window.print(),
  'new-project': () => openProjectModal(null),
  'edit-project': el => openProjectModal(el.dataset.id),
  'archive-project': el => { const p = proj(el.dataset.id); p.archived = !p.archived; save(); render(); toast(p.archived ? 'Projekt archiviert' : 'Projekt wiederhergestellt'); },
  'delete-project': el => {
    const p = proj(el.dataset.id), n = S.entries.filter(e => e.projectId === p.id).length;
    if (!confirm(`Projekt „${p.name}“ löschen?${n ? `\n${n} Einträge bleiben erhalten, verlieren aber die Projektzuordnung.` : ''}`)) return;
    S.projects = S.projects.filter(x => x !== p);
    S.entries.forEach(e => { if (e.projectId === p.id) e.projectId = null; });
    if (S.running?.projectId === p.id) S.running.projectId = null;
    save(); render();
  },
  'rename-item': el => {
    const x = S[el.dataset.kind].find(i => i.id === el.dataset.id);
    promptModal(el.dataset.kind === 'clients' ? 'Kunden umbenennen' : 'Tag umbenennen', x.name, v => { x.name = v; save(); render(); });
  },
  'delete-item': el => {
    const kind = el.dataset.kind, id = el.dataset.id, x = S[kind].find(i => i.id === id);
    if (!confirm(`„${x.name}“ löschen?`)) return;
    S[kind] = S[kind].filter(i => i.id !== id);
    if (kind === 'clients') S.projects.forEach(p => { if (p.clientId === id) p.clientId = null; });
    else [...S.entries, S.running, UI.draft].forEach(e => { if (e) e.tagIds = e.tagIds.filter(t => t !== id); });
    save(); render();
  },
  'cloud-login': () => Cloud.login(),
  'cloud-logout': () => Cloud.logout(),
  'cloud-sync': () => Cloud.sync(),
  'cloud-status': () => Cloud.statusClick(),
  'team-refresh': () => { Cloud.refreshTeam(); render(); },
  'export-json': exportJSON,
  'import-json': () => $('#import-file').click(),
  'load-demo': loadDemo,
  'reset-all': () => {
    if (!confirm('Wirklich ALLE Daten auf diesem Gerät löschen? Vorher eine Sicherung exportieren!')) return;
    S = defaultState(); save(); render(); toast('Alle Daten gelöscht');
  }
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) { ev.preventDefault(); ACTIONS[el.dataset.action](el); return; }
  if (ev.target.closest('.sidebar a')) document.body.classList.remove('nav-open');
});

document.addEventListener('change', ev => {
  const el = ev.target, k = el.dataset.change;
  if (!k) return;
  if (k === 'setting') {
    let v = el.value;
    if (el.type === 'number') v = Number(v) || 0;
    if (el.name === 'weekStart') v = Number(v);
    S.settings[el.name] = v; save(); render(); toast('Einstellung gespeichert');
  } else if (k === 'rep') {
    UI.report[el.name] = el.value;
    if (el.name === 'range') UI.report.offset = 0;
    if (el.name === 'scope') { UI.report.userId = ''; UI.report.groupBy = el.value === 'team' ? 'user' : 'project'; }
    render();
  } else if (k === 'proj-arch') { UI.showArchived = el.checked; render(); }
  else if (k === 'import') { importJSON(el.files[0]); el.value = ''; }
});

document.addEventListener('submit', ev => {
  const f = ev.target, k = f.dataset.form;
  if (!k) return;
  ev.preventDefault();
  const name = f.elements.n.value.trim();
  if (!name) return;
  const kind = k.replace('add-', '');
  if (S[kind].some(x => x.name.toLowerCase() === name.toLowerCase())) return toast('Existiert bereits');
  S[kind].push({ id: uid(), name }); save(); render();
  $('[data-form] input')?.focus();
});

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') { if ($('#popover-root').innerHTML) closePopover(); else closeModal(); }
});

let toastTimer;
function toast(msg, actionLabel, actionFn) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) t.querySelector('button').onclick = () => { actionFn(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), actionLabel ? 6000 : 2800);
}

/* Laufende Uhr (Timer-Anzeige, Kopfzeile, Tab-Titel) */
// Neu darstellen nach Abgleich – aber nicht, während jemand gerade tippt oder einen Dialog offen hat
let pendingRender = false;
window.renderSoft = () => {
  const a = document.activeElement;
  if ((a && a.matches('input, select, textarea')) || $('#modal-root').innerHTML || $('#popover-root').innerHTML) { pendingRender = true; return; }
  pendingRender = false; render();
};

function tick() {
  if (pendingRender) window.renderSoft();
  const tt = $('#top-timer');
  if (!S.running) { tt.hidden = true; document.title = 'Zeiterfassung'; return; }
  const t = fmtClock(Date.now() - S.running.start);
  const el = $('#timer-display');
  if (el) el.textContent = t;
  tt.hidden = UI.route === 'tracker';
  tt.firstElementChild.textContent = t;
  document.title = t + ' · Zeiterfassung';
}
setInterval(tick, 1000);

// Änderungen aus anderem Browser-Tab übernehmen
window.addEventListener('storage', ev => { if (ev.key === STORE_KEY) { S = load(); render(); } });
window.addEventListener('hashchange', () => { closePopover(); render(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

/* ---------- Start ---------- */
UI.manual.date = todayStr();
try { if (localStorage.getItem('zeiterfassung.navCollapsed')) document.body.classList.add('nav-collapsed'); } catch { }
renderNav();
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
