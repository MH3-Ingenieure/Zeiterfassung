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
    settings: { userName: '', currency: 'EUR', defaultRate: 0, weekStart: 1, durationFormat: 'hms', trackMode: 'manual', modeV2: true },
    clients: [], projects: [], tags: [], entries: [], running: null, roles: []
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw), def = defaultState();
      const st = Object.assign(def.settings, d.settings || {});
      if (!st.modeV2) { st.trackMode = 'manual'; st.modeV2 = true; } // Zeiten eintragen ist jetzt der Standard, Timer optional
      return Object.assign(def, d, { settings: st });
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
  return p && p.rate != null ? Number(p.rate) : 0; // Stundensatz ausschließlich am Projekt
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
  archive: '<path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;

/* ---------- Navigation ---------- */
const NAV = [ // Startseite ist die Projektübersicht
  ['projects', 'folder', 'Projekte'],
  ['tracker', 'clock', 'Zeiterfassung'],
  ['reports', 'chart', 'Berichte'],
  ['clients', 'users', 'Kunden'],
  ['tags', 'tag', 'Tags'],
  ['settings', 'cog', 'Einstellungen'],
  ['help', 'help', 'Hilfe']
];
/* ---------- Rollen (ohne Microsoft 365: alles erlaubt) ---------- */
const baseRole = () => window.Cloud?.myRole ? Cloud.myRole() : { admin: true, pl: true, ma: true, bh: true, local: true };
// Rollen-Vorschau für Administratoren: nur die Ansicht wird eingeschränkt, die echten Rechte bleiben
const PREVIEW = { pl: ['Projektleiter', { pl: true, ma: true }], ma: ['Mitarbeiter', { ma: true }], bh: ['Buchhaltung', { bh: true }] };
try { UI.previewRole = sessionStorage.getItem('zeiterfassung.preview') || null; } catch { UI.previewRole = null; }
const role = () => {
  const b = baseRole();
  return b.admin && PREVIEW[UI.previewRole] ? { admin: false, pl: false, ma: false, bh: false, ...PREVIEW[UI.previewRole][1], preview: UI.previewRole } : b;
};
function setPreview(r) {
  UI.previewRole = PREVIEW[r] ? r : null;
  try { UI.previewRole ? sessionStorage.setItem('zeiterfassung.preview', r) : sessionStorage.removeItem('zeiterfassung.preview'); } catch { }
  if (window.Cloud?.refreshTeam) Cloud.refreshTeam();
  UI.report.scope = 'me'; UI.report.userId = ''; UI.report.groupBy = 'project';
  location.hash = '#/projects'; render();
  toast(UI.previewRole ? `Vorschau: Ansicht als ${PREVIEW[r][0]}` : 'Vorschau beendet – wieder Administrator');
}
function previewBanner() {
  const p = role().preview;
  return p ? `<div class="preview-banner">${ic('shield')} <span><b>Vorschau als ${PREVIEW[p][0]}</b> – so sieht die App für diese Rolle aus. Ihre echten Rechte bleiben erhalten.</span>
    <button class="btn small" data-action="preview-end">Vorschau beenden</button></div>` : '';
}
const meId = () => S.sync?.userId || null;
const canSeeRates = () => { const r = role(); return r.admin || r.pl || r.bh; };
// Projekte anlegen/pflegen: Administrator und Buchhaltung. Projektleiter ordnet nur sein Team zu.
const canCreateProject = () => { const r = role(); return r.admin || r.bh; };
const canEditProject = () => { const r = role(); return r.admin || r.bh; };
const canEditTeam = p => { const r = role(); return r.admin || (r.pl && p.leadId === meId()); };
const canEditClients = () => { const r = role(); return r.admin || r.bh; };
// Mitarbeiter und Projektleiter sehen nur Projekte, denen sie zugeordnet sind
const canSeeAllProjects = () => { const r = role(); return !cloudOn() || r.admin || r.bh; };
const isAssigned = p => p.leadId === meId() || (p.memberIds || []).includes(meId());
const visibleProjects = () => (canSeeAllProjects() ? S.projects : S.projects.filter(isAssigned));
const canEditTags = () => role().admin;
const canTeam = () => { const r = role(); return !!window.Cloud?.signedIn() && (r.admin || r.pl || r.bh); };
const canManageUsers = () => cloudOn() && role().admin;

function renderNav() {
  const nav = canManageUsers() ? [...NAV.slice(0, 5), ['users', 'shield', 'Benutzer & Rollen'], ...NAV.slice(5)] : NAV;
  $('#sidebar').innerHTML = nav.map(([r, i, t], n) =>
    (n === 3 || r === 'settings' ? '<div class="nav-sep"></div>' : '') +
    `<a class="nav-link" href="#/${r}" data-route="${r}" title="${t}">${ic(i)}<span>${t}</span></a>`).join('');
  $('#bottombar').innerHTML = NAV.slice(0, 3).map(([r, i, t]) =>
    `<a href="#/${r}" data-route="${r}">${ic(i)}<span>${r === 'tracker' ? 'Zeiten' : t}</span></a>`).join('') +
    `<button data-action="toggle-nav">${ic('menu')}<span>Mehr</span></button>`;
}

const VIEWS = { tracker: viewTracker, reports: viewReports, projects: viewProjects, clients: () => viewList('clients'), tags: () => viewList('tags'), users: viewUsers, settings: viewSettings, help: () => viewHelp() };
const AFTER = { tracker: afterTracker, projects: afterProjects, help: () => afterHelp() };

function render() {
  const r = location.hash.replace(/^#\/?/, '') || 'projects';
  UI.route = VIEWS[r] && (r !== 'users' || canManageUsers()) ? r : 'projects';
  renderNav();
  $$('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === UI.route));
  $('#view').innerHTML = previewBanner() + VIEWS[UI.route]();
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

// Eingabeformular: 1. Projekt, 2. Kommentar (umrandet), 3. Tags/€, 4. Datum, Beginn, Ende → HINZUFÜGEN.
// Der Timer ist nur eine Nebenoption.
function timerBarHTML() {
  const r = S.running, d = r || UI.draft;
  const manual = S.settings.trackMode !== 'timer' && !r;
  const m = UI.manual;
  return `<div class="card entry-form ${r ? 'running' : ''}">
    <div class="ef-title">${r ? `${ic('clock')} Timer läuft` : manual ? 'Zeit eintragen' : `${ic('clock')} Zeit mit Timer erfassen`}
      ${r ? '' : `<button class="btn ghost small ef-dict" data-action="dictate">${ic('mic')} diktieren</button>`}</div>
    <div class="ef-field">
      <span class="ef-label">Projekt</span>
      <button class="ef-proj" data-action="pick-project" data-target="timer">${projLabel(d.projectId, 'Projekt wählen')}<span class="ef-change">${d.projectId ? 'ändern' : ''}</span></button>
    </div>
    <label class="ef-field"><span class="ef-label">Kommentar – was wurde gemacht?</span>
      <textarea id="tb-desc" class="ef-comment" rows="2" maxlength="4000" placeholder="z. B. Begehung Heizraum mit Hausmeister, Mängel an Pumpe P2 aufgenommen">${esc(d.description)}</textarea></label>
    <div class="ef-row">
      <button class="btn ghost small ${d.tagIds.length ? 'ef-on' : ''}" data-action="pick-tags" data-target="timer">${ic('tag')} ${d.tagIds.length ? esc(d.tagIds.map(tag).filter(Boolean).map(t => t.name).join(', ')) : 'Tag wählen'}</button>
      <button class="btn ghost small ${d.billable ? 'ef-on' : ''}" data-action="toggle-billable" data-target="timer" title="Abrechenbar">€ ${d.billable ? 'abrechenbar' : 'nicht abrechenbar'}</button>
    </div>
    ${manual ? `<div class="ef-row ef-times">
        <label class="ef-mini"><span>Datum</span><input type="date" id="m-date" value="${m.date}"></label>
        <label class="ef-mini"><span>Beginn</span><input type="time" id="m-start" value="${m.start}"></label>
        <label class="ef-mini"><span>Ende</span><input type="time" id="m-end" value="${m.end}"></label>
        <div class="ef-mini"><span>Dauer</span><b class="m-dur" id="m-dur">0:00:00</b></div>
        <button class="btn primary ef-main" data-action="add-manual">HINZUFÜGEN</button>
      </div>
      <button class="ef-switch" data-action="set-mode" data-mode="timer">${ic('clock')} stattdessen Timer starten</button>`
    : `<div class="ef-row ef-times">
        <span class="tb-time" id="timer-display">${r ? fmtClock(Date.now() - r.start) : '0:00:00'}</span>
        ${r ? `<button class="btn danger ef-main" data-action="stop">STOPP</button>
          <button class="icon-btn" data-action="discard" title="Timer verwerfen">${ic('trash')}</button>`
        : `<button class="btn primary ef-main" data-action="start">START</button>`}
      </div>
      ${r ? '' : `<button class="ef-switch" data-action="set-mode" data-mode="manual">${ic('list')} zurück zur Eingabe von Beginn und Ende</button>`}`}
  </div>`;
}

// Einträge auf abgeschlossenen Projekten sind gesperrt (nur Administratoren können noch korrigieren)
const isLocked = e => !!proj(e?.projectId)?.archived && !role().admin;
const entryLocked = target => target !== 'timer' && target !== 'modal' && isLocked(S.entries.find(x => x.id === target));
function lockedToast() { toast('Das Projekt ist abgeschlossen – Einträge können nicht mehr geändert werden.'); }

function entryRowHTML(e) {
  const tags = e.tagIds.map(tag).filter(Boolean), locked = isLocked(e);
  const overnight = startOfDay(e.end) !== startOfDay(e.start) && e.end - startOfDay(e.end) > 0;
  return `<div class="entry ${locked ? 'locked' : ''}">
    <div class="e-left">
      <div class="e-head">
        <button class="proj-btn e-proj" data-action="pick-project" data-target="${e.id}">${projLabel(e.projectId, 'ohne Projekt')}</button>
        ${locked ? `<span class="chip lock-chip" title="Projekt abgeschlossen">${ic('lock')} abgeschlossen</span>` : ''}
        ${tags.length ? `<span class="e-tags">${tags.map(t => `<span class="chip">${esc(t.name)}</span>`).join('')}</span>` : ''}
      </div>
      <button class="e-desc" data-action="edit-entry" data-id="${e.id}" title="${esc(e.description)}">${e.description ? esc(e.description) : '<span class="muted">(ohne Kommentar)</span>'}</button>
    </div>
    <div class="e-right">
      <button class="e-range" data-action="edit-entry" data-id="${e.id}">${fmtTime(e.start)} – ${fmtTime(e.end)}${overnight ? '<sup>+1</sup>' : ''}</button>
      <button class="icon-btn ${tags.length ? 'active' : ''}" data-action="pick-tags" data-target="${e.id}" title="Tags">${ic('tag')}</button>
      <button class="icon-btn ${e.billable ? 'active' : ''}" data-action="toggle-billable" data-target="${e.id}" title="Abrechenbar">€</button>
      <span class="e-dur">${fmtDur(dur(e))}</span>
      ${locked ? '' : `<button class="icon-btn" data-action="continue" data-id="${e.id}" title="Fortsetzen">${ic('play')}</button>`}
      <button class="icon-btn" data-action="entry-menu" data-id="${e.id}" title="Weitere Aktionen">${ic('more')}</button>
    </div>
  </div>`;
}

function entriesHTML() {
  if (!S.entries.length) {
    return `<div class="card empty">${ic('clock').replace('class="ic"', 'class="ic big"')}
      <h3>Noch keine Zeiten erfasst</h3>
      <p>Oben Projekt wählen, Kommentar schreiben, Beginn und Ende eintragen und auf HINZUFÜGEN tippen.</p>
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
  inp.addEventListener('keydown', ev => { // Enter = neue Zeile, Strg+Enter = hinzufügen/starten
    if (ev.key !== 'Enter' || !(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    if (S.running) inp.blur();
    else if (S.settings.trackMode !== 'timer') addManual();
    else startTimer(UI.draft);
  });
  if (S.settings.trackMode !== 'timer' && !S.running) {
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
  if (!d.projectId && visibleProjects().some(p => !p.archived) && !confirm('Kein Projekt gewählt. Eintrag trotzdem ohne Projekt speichern?')) return;
  S.entries.push({ id: uid(), description: d.description.trim(), projectId: d.projectId, tagIds: [...d.tagIds], billable: d.billable, start: s, end: e });
  // Projekt bleibt für den nächsten Eintrag gewählt; Kommentar, Tags und Ende werden geleert
  UI.draft = { ...emptyDraft(), projectId: d.projectId, billable: d.billable };
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
        const ps = visibleProjects().filter(p => (p.clientId || null) === cid && match(p)).sort(byName);
        if (!ps.length) continue;
        html += `<div class="pp-group">${esc(cname)}</div>` + ps.map(p =>
          `<button class="pp-item ${p.id === cur ? 'sel' : ''}" data-pick="${p.id}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</button>`).join('');
      }
      if (q && canCreateProject() && !S.projects.some(p => p.name.toLowerCase() === q)) {
        html += `<button class="pp-item pp-create" data-create>${ic('plus')} Projekt „${esc(inp.value.trim())}“ erstellen</button>`;
      } else if (!visibleProjects().length) {
        html += `<div class="pp-empty">${canCreateProject() ? 'Noch keine Projekte – Namen eintippen zum Anlegen' : 'Ihnen ist noch kein Projekt zugeordnet – bitte an Ihren Projektleiter wenden.'}</div>`;
      } else if (q && !html.includes('data-pick="')) {
        html += '<div class="pp-empty">Kein passendes Projekt gefunden</div>';
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
        // neues Projekt immer über den Projektdialog anlegen, damit der Stundensatz erfasst wird
        const name = inp.value.trim();
        closePopover();
        openProjectModal(null, { name, onSaved: id => choose(id), onCancel: () => { if (target === 'modal') renderEntryModal(); } });
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
  const mayCreate = canEditTags(); // Tags vergibt der Administrator
  openPopover(anchor, `<input class="pp-search" placeholder="${mayCreate ? 'Tag suchen oder erstellen…' : 'Tag suchen…'}" autocomplete="off"><div class="pp-list"></div>`, pop => {
    const inp = $('.pp-search', pop), listEl = $('.pp-list', pop);
    const draw = () => {
      const o = targetObj(target);
      if (!o) return closePopover();
      const q = inp.value.trim().toLowerCase();
      const list = S.tags.filter(t => t.name.toLowerCase().includes(q)).sort(byName);
      listEl.innerHTML = list.map(t => `<label class="pp-check"><input type="checkbox" data-tag="${t.id}" ${o.tagIds.includes(t.id) ? 'checked' : ''}>${esc(t.name)}</label>`).join('')
        + (mayCreate && q && !S.tags.some(t => t.name.toLowerCase() === q) ? `<button class="pp-item pp-create" data-create>${ic('plus')} Tag „${esc(inp.value.trim())}“ erstellen</button>` : '')
        + (!S.tags.length && !q ? `<div class="pp-empty">${mayCreate ? 'Noch keine Tags – Namen eintippen zum Anlegen' : 'Noch keine Tags – Tags legt der Administrator an'}</div>` : '')
        + (!mayCreate && q && !list.length ? '<div class="pp-empty">Kein passender Tag. Neue Tags legt der Administrator an.</div>' : '');
    };
    listEl.addEventListener('change', ev => {
      const id = ev.target.dataset.tag;
      if (!id) return;
      applyTarget(target, o => { o.tagIds = ev.target.checked ? [...o.tagIds, id] : o.tagIds.filter(x => x !== id); });
    });
    const create = () => {
      const name = inp.value.trim();
      if (!name || !mayCreate || S.tags.some(t => t.name.toLowerCase() === name.toLowerCase())) return;
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
    <button class="pp-item" data-m="help">${ic('help')} Hilfe</button>
    ${baseRole().admin ? `<div class="pp-group">Ansicht testen als …</div>
      ${Object.entries(PREVIEW).map(([k, [t]]) => `<button class="pp-item ${UI.previewRole === k ? 'sel' : ''}" data-m="pv-${k}">${ic('shield')} ${t}</button>`).join('')}
      ${UI.previewRole ? `<button class="pp-item" data-m="pv-end">${ic('x')} Vorschau beenden (Administrator)</button>` : ''}` : ''}
    ${cloud && acc ? `<button class="pp-item" data-m="sync">${ic('upload')} Jetzt synchronisieren</button>
      <button class="pp-item danger" data-m="logout">${ic('x')} Abmelden</button>` : ''}
    ${cloud && !acc ? `<button class="pp-item" data-m="login">${ic('users')} Anmelden</button>` : ''}
    <button class="pp-item um-version" data-m="changelog">Version ${APP_VERSION} · ${APP_RELEASE_DATE}</button>`, pop => {
    pop.addEventListener('click', ev => {
      const m = ev.target.closest('[data-m]')?.dataset.m;
      if (!m) return;
      closePopover();
      if (m === 'profile') location.hash = '#/settings';
      if (m === 'help') location.hash = '#/help';
      if (m === 'changelog') openChangelog();
      if (m.startsWith('pv-')) setPreview(m === 'pv-end' ? null : m.slice(3));
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
    <div class="field"><span>Projekt</span><button class="select-btn" data-action="pick-project" data-target="modal">${projLabel(d.projectId, 'Projekt wählen')}</button></div>
    <label class="field"><span>Kommentar – was genau wurde gemacht?</span><textarea id="md-desc" class="ef-comment" rows="4" placeholder="z. B. Begehung Heizraum mit Hausmeister, Mängel an Pumpe P2 aufgenommen">${esc(d.description)}</textarea></label>
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
    $('#md-desc', m).addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) saveEntryModal(); }); // Strg+Enter speichert
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
  if (UI.report.scope === 'team' && window.Cloud?.signedIn()) {
    const t = Cloud.teamEntries(from, to);
    // Vorschau als Projektleiter: wie beim echten Projektleiter nur Zeiten seiner Projekte (und eigene)
    if (role().preview === 'pl') return { ...t, list: t.list.filter(e => e.userId === meId() || proj(e.projectId)?.leadId === meId()) };
    return t;
  }
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
  const teamOk = canTeam(), money = canSeeRates();
  if (!teamOk) R.scope = 'me';
  const teamLabel = role().admin || role().bh ? 'Alle Mitarbeiter' : 'Team meiner Projekte';
  const isTeam = R.scope === 'team';
  if (!isTeam && R.groupBy === 'user') R.groupBy = 'project';
  const src = reportSource(from, to), list = reportEntries(from, to, src);
  const users = reportPeople(isTeam ? src.list : []);
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
    ${printHeadHTML(label, from, to, isTeam, users)}
    <div class="card rep-bar no-print">
      <div class="rep-row">
        ${teamOk ? `<label class="rep-person"><span>Person</span><select data-change="rep-person">
            ${opt('me', 'Nur ich (' + (S.settings.userName || 'eigene Zeiten') + ')', !isTeam ? 'me' : '')}
            ${opt('team', teamLabel + ' (alle zusammen)', isTeam && !R.userId ? 'team' : '')}
            <optgroup label="Einzelne Person">${users.filter(([id]) => id !== meId()).map(([id, n]) => opt('u:' + id, n, isTeam && R.userId === id ? 'u:' + id : '')).join('')}</optgroup>
          </select></label>
          ${isTeam ? '<button class="icon-btn" data-action="team-refresh" title="Daten neu laden">⟳</button>' : ''}` : ''}
        <select name="range" data-change="rep">${[['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat'], ['year', 'Jahr'], ['custom', 'Zeitraum']].map(([v, t]) => opt(v, t, R.range)).join('')}</select>
        ${R.range === 'custom'
          ? `<input type="date" name="from" data-change="rep" value="${R.from}"><span>–</span><input type="date" name="to" data-change="rep" value="${R.to}">`
          : `<div class="range-nav"><button class="icon-btn" data-action="rep-shift" data-d="-1" aria-label="Zurück">${ic('chevL')}</button><span class="range-label">${esc(label)}</span><button class="icon-btn" data-action="rep-shift" data-d="1" aria-label="Weiter">${ic('chevR')}</button></div>`}
      </div>
      <div class="rep-row">
        ${sel('projectId', 'Alle Projekte', [['none', 'Ohne Projekt'], ...[...(isTeam || canSeeAllProjects() ? S.projects : visibleProjects())].sort(byName).map(p => [p.id, p.name])])}
        ${sel('clientId', 'Alle Kunden', [['none', 'Ohne Kunde'], ...[...S.clients].sort(byName).map(c => [c.id, c.name])])}
        ${sel('tagId', 'Alle Tags', [...S.tags].sort(byName).map(t => [t.id, t.name]))}
        ${sel('billable', 'Abrechenbar & nicht', [['true', 'Nur abrechenbar'], ['false', 'Nur nicht abrechenbar']])}
        <input type="search" name="q" data-change="rep" value="${esc(R.q)}" placeholder="Beschreibung suchen…">
      </div>
    </div>
    ${note}
    <div class="stats ${money ? '' : 'two'}">
      <div class="card stat"><div class="k">Gesamt</div><div class="v">${fmtDur(total)}</div></div>
      <div class="card stat"><div class="k">Abrechenbar</div><div class="v">${fmtDur(billMs)}</div></div>
      ${money ? `<div class="card stat"><div class="k">Betrag</div><div class="v">${fmtMoney(amount)}</div></div>` : ''}
    </div>
    <div class="card chart"><div class="card-body">${barChartSVG(list, from, to)}</div></div>
    <div class="card section-gap">
      <div class="card-head">Aufschlüsselung nach
        <span class="print-inline">${({ user: 'Mitarbeiter', project: 'Projekt', client: 'Kunde', tag: 'Tag', description: 'Beschreibung', day: 'Datum' })[R.groupBy] || ''}</span>
        <select name="groupBy" data-change="rep" class="no-print" style="height:32px;border:1px solid var(--border);border-radius:4px;background:var(--surface);padding:0 6px">
          ${[...(isTeam ? [['user', 'Mitarbeiter']] : []), ['project', 'Projekt'], ['client', 'Kunde'], ['tag', 'Tag'], ['description', 'Beschreibung'], ['day', 'Tag (Datum)']].map(([v, t]) => opt(v, t, R.groupBy)).join('')}
        </select>
      </div>
      <div class="card-body breakdown">
        ${donutSVG(groups)}
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Name</th><th class="num">Dauer</th>${money ? '<th class="num hide-mobile">Betrag</th>' : ''}<th class="hide-mobile" style="width:28%">Anteil</th></tr></thead>
          <tbody>${groups.map(g => `<tr>
            <td><span class="name-cell"><span class="dot" style="background:${g.color}"></span>${esc(g.name)}</span></td>
            <td class="num">${fmtDur(g.ms)}</td>${money ? `<td class="num hide-mobile">${fmtMoney(g.amount)}</td>` : ''}
            <td class="hide-mobile"><div class="pct" title="${Math.round(g.ms / gsum * 100)} %"><i style="width:${(g.ms / gsum * 100).toFixed(1)}%;background:${g.color}"></i></div></td></tr>`).join('')
            || '<tr><td colspan="4" class="muted">Keine Einträge im gewählten Zeitraum</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head">Einzelnachweis <span class="muted" style="font-weight:400">(${list.length} Einträge)</span></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Datum</th>${isTeam ? '<th>Mitarbeiter</th>' : ''}<th>Beschreibung</th><th>Projekt</th><th class="hide-mobile">Zeit</th><th class="num">Dauer</th>${money ? '<th class="num hide-mobile">Betrag</th>' : ''}</tr></thead>
        <tbody>${rows.slice(0, 1000).map(e => `<tr>
          <td class="num" style="text-align:left">${fmtD(e.start)}</td>
          ${isTeam ? `<td>${esc(e.userName)}</td>` : ''}
          <td><button ${isTeam ? '' : `data-action="edit-entry" data-id="${e.id}"`} style="text-align:left">${e.description ? esc(e.description) : '<span class="muted">(ohne)</span>'}</button>
            ${e.tagIds.map(tag).filter(Boolean).map(t => `<span class="chip">${esc(t.name)}</span>`).join(' ')}</td>
          <td>${proj(e.projectId) ? projLabel(e.projectId) : '<span class="muted">–</span>'}</td>
          <td class="num hide-mobile" style="text-align:left">${fmtTime(e.start)} – ${fmtTime(e.end)}</td>
          <td class="num">${fmtDur(dur(e))}</td>
          ${money ? `<td class="num hide-mobile">${e.billable ? fmtMoney(amountOf(e)) : '<span class="muted">–</span>'}</td>` : ''}</tr>`).join('')
          || '<tr><td colspan="6" class="muted">Keine Einträge</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}

// Personen für die Auswahl im Bericht: Administratoren/Buchhaltung alle aktiven Mitarbeiter,
// Projektleiter das Team ihrer Projekte – jeweils ergänzt um Personen, die im Zeitraum Zeiten haben
function reportPeople(entries = []) {
  const r = role(), m = new Map();
  const add = (id, name) => { if (id && !m.has(id)) m.set(id, name || '?'); };
  if (r.admin || r.bh) S.roles.filter(u => u.active && (u.roles.includes('ma') || u.roles.includes('pl'))).forEach(u => add(u.id, u.name));
  else if (r.pl) S.projects.filter(p => p.leadId === meId()).forEach(p => (p.memberIds || []).forEach(id => add(id, S.roles.find(u => u.id === id)?.name)));
  entries.forEach(e => add(e.userId, e.userName));
  return [...m.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'de'));
}

// Firmenkopf für Druck / PDF: Logo, Titel, Zeitraum, gewählte Filter, Erstellungsdatum
function printHeadHTML(label, from, to, isTeam, users) {
  const R = UI.report, f = [];
  f.push(isTeam ? (R.userId ? 'Mitarbeiter: ' + (users.find(u => u[0] === R.userId)?.[1] || '') : (role().admin || role().bh ? 'Alle Mitarbeiter' : 'Team meiner Projekte')) : 'Mitarbeiter: ' + (S.settings.userName || '–'));
  if (R.projectId) f.push('Projekt: ' + (R.projectId === 'none' ? 'ohne Projekt' : proj(R.projectId)?.name || ''));
  if (R.clientId) f.push('Kunde: ' + (R.clientId === 'none' ? 'ohne Kunde' : client(R.clientId)?.name || ''));
  if (R.tagId) f.push('Tag: ' + (tag(R.tagId)?.name || ''));
  if (R.billable) f.push(R.billable === 'true' ? 'nur abrechenbar' : 'nur nicht abrechenbar');
  if (R.q.trim()) f.push('Suche: „' + R.q.trim() + '“');
  const range = `${fmtD(from)} – ${fmtD(addDays(to, -1))}`;
  return `<div class="print-head">
    <img src="icons/logo-quer-schwarz.png" alt="MH3 Ingenieure" class="ph-logo">
    <div class="ph-meta">
      <div class="ph-title">Stundenbericht</div>
      <div><b>Zeitraum:</b> ${esc(label === range ? range : label + ' (' + range + ')')}</div>
      <div>${esc(f.join(' · '))}</div>
      <div class="ph-date">Erstellt am ${new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</div>
    </div>
  </div>`;
}

function exportCSV() {
  const { from, to, label } = reportRange(), list = reportEntries(from, to);
  const num = v => v.toFixed(2).replace('.', ',');
  const money = canSeeRates();
  const rows = [['Datum', 'Beginn', 'Ende', 'Dauer (h:mm:ss)', 'Dauer (Stunden)', 'Beschreibung', 'Projekt', 'Kunde', 'Tags', 'Abrechenbar', ...(money ? ['Stundensatz', 'Betrag'] : []), 'Mitarbeiter']];
  for (const e of list) {
    const p = proj(e.projectId), c = client(p?.clientId);
    rows.push([fmtD(e.start), fmtTime(e.start), fmtTime(e.end), fmtClock(dur(e)), num(dur(e) / HOUR), e.description,
      p?.name || '', c?.name || '', e.tagIds.map(tag).filter(Boolean).map(t => t.name).join(', '),
      e.billable ? 'Ja' : 'Nein', ...(money ? [num(rateOf(e)), num(amountOf(e))] : []), e.userName || S.settings.userName]);
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
const canTrack = () => { const r = role(); return !!(r.local || r.admin || r.ma || r.pl); };
function viewProjects() {
  return `<div class="page">
    <div class="page-head"><h1>${canSeeAllProjects() ? 'Projekte' : 'Meine Projekte'}</h1>${canCreateProject() ? `<button class="btn primary" data-action="new-project">${ic('plus')} NEUES PROJEKT</button>` : ''}</div>
    ${canTrack() ? `<div class="dz-start"><button class="btn primary dz-btn" data-action="dictate">${ic('mic')} Zeit diktieren</button>
      <span class="page-hint">oder auf einen <b>Projektnamen</b> klicken, um Zeiten für dieses Projekt einzutragen.</span></div>` : ''}
    <div class="card">
      <div class="toolbar">
        <input type="search" id="proj-q" placeholder="Projekt suchen…" value="${esc(UI.projQ)}">
        <label class="check" style="margin:0"><input type="checkbox" data-change="proj-arch" ${UI.showArchived ? 'checked' : ''}> Abgeschlossene anzeigen</label>
      </div>
      <div id="proj-list">${projectTableHTML()}</div>
    </div>
  </div>`;
}
function projectTableHTML() {
  const q = UI.projQ.trim().toLowerCase();
  const list = visibleProjects().filter(p => (UI.showArchived || !p.archived) &&
    (!q || p.name.toLowerCase().includes(q) || (client(p.clientId)?.name || '').toLowerCase().includes(q))).sort(byName);
  if (!list.length) return `<div class="empty"><p>${visibleProjects().length ? 'Keine passenden Projekte.' : canSeeAllProjects() ? 'Noch keine Projekte angelegt.' : 'Ihnen ist noch kein Projekt zugeordnet. Projekte ordnet Ihnen Ihr Projektleiter zu.'}</p></div>`;
  const money = canSeeRates(), cloud = cloudOn(), admin = role().admin;
  const teamNames = p => (p.memberIds || []).map(id => S.roles.find(r => r.id === id)?.name).filter(Boolean);
  return `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Name</th><th class="hide-mobile">Kunde</th>${cloud ? '<th class="hide-mobile">Projektleiter</th><th class="hide-mobile">Team</th>' : ''}<th class="num">${cloud ? 'Meine Zeit' : 'Erfasst'}</th>${money ? '<th class="num hide-mobile">Stundensatz</th>' : ''}<th></th></tr></thead>
    <tbody>${list.map(p => {
      const es = S.entries.filter(e => e.projectId === p.id), edit = canEditProject(p), team = cloud && canEditTeam(p), tn = teamNames(p);
      const open = canTrack() && !p.archived; // Klick auf den Namen → Zeiterfassung für dieses Projekt
      return `<tr class="${p.archived ? 'archived' : ''}">
        <td><button class="name-cell ${open ? 'name-open' : ''}" ${open ? `data-action="open-project" data-id="${p.id}" title="Zeit für dieses Projekt eintragen"` : edit ? `data-action="edit-project" data-id="${p.id}"` : ''}><span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.archived ? ` <span class="chip lock-chip">${ic('lock')} abgeschlossen</span>` : ''}${money && p.billable && p.rate == null ? ' <span class="chip warn">Stundensatz fehlt</span>' : ''}${cloud && admin && !p.listId ? ' <span class="chip">Rechte ausstehend</span>' : ''}</button></td>
        <td class="hide-mobile">${esc(client(p.clientId)?.name || '–')}</td>
        ${cloud ? `<td class="hide-mobile">${p.leadName ? esc(p.leadName) : '<span class="warn-text">fehlt</span>'}</td>
          <td class="hide-mobile" title="${esc(tn.join(', '))}">${tn.length ? tn.length + (tn.length === 1 ? ' Person' : ' Personen') : '<span class="muted">–</span>'}</td>` : ''}
        <td class="num">${fmtDur(sum(es))}</td>
        ${money ? `<td class="num hide-mobile">${p.rate != null ? fmtMoney(Number(p.rate)) : p.billable ? '<span class="warn-text">fehlt</span>' : '<span class="muted">–</span>'}</td>` : ''}
        <td class="act">
          ${open ? `<button class="icon-btn" data-action="open-project" data-id="${p.id}" title="Zeit eintragen">${ic('clock')}</button>` : ''}
          ${team ? `<button class="icon-btn" data-action="edit-team" data-id="${p.id}" title="Team zuordnen">${ic('users')}</button>` : ''}
          ${edit ? `<button class="icon-btn" data-action="edit-project" data-id="${p.id}" title="Bearbeiten">${ic('edit')}</button>
          <button class="icon-btn" data-action="archive-project" data-id="${p.id}" title="${p.archived ? 'Projekt wieder öffnen' : 'Projekt abschließen (archivieren)'}">${ic(p.archived ? 'upload' : 'archive')}</button>` : ''}
          ${admin || !cloud ? `<button class="icon-btn" data-action="delete-project" data-id="${p.id}" title="Löschen">${ic('trash')}</button>` : ''}
        </td></tr>`;
    }).join('')}</tbody></table></div>`;
}

// Team eines Projekts: Projektleiter (seine Projekte) und Administratoren ordnen Mitarbeiter zu
function openTeamModal(id) {
  const p = proj(id);
  if (!p || !canEditTeam(p)) return toast('Keine Berechtigung, das Team dieses Projekts zu ändern');
  const people = S.roles.filter(r => r.active && (r.roles.includes('ma') || r.roles.includes('pl')) && r.id !== p.leadId).sort(byName);
  const sel = new Set(p.memberIds || []);
  openModal(`<h2>Team: ${esc(p.name)}</h2>
    <p class="muted" style="margin-top:-8px">Projektleiter: <b>${esc(p.leadName || '–')}</b>. Angehakte Personen sehen dieses Projekt und können darauf Zeiten erfassen.</p>
    <input type="search" id="tm-q" class="help-search" placeholder="Name suchen …" autocomplete="off">
    <div class="us-res" id="tm-list">${people.map(r => `<label class="pp-check" data-name="${esc(r.name.toLowerCase())}"><input type="checkbox" data-uid="${r.id}" ${sel.has(r.id) ? 'checked' : ''}> ${esc(r.name)} <span class="muted small">${r.roles.includes('pl') ? 'Projektleiter' : ''}</span></label>`).join('')
      || '<p class="muted">Noch keine Mitarbeiter unter „Benutzer & Rollen“ eingetragen.</p>'}</div>
    <div class="modal-actions"><span class="grow"></span>
      <button class="btn ghost" data-action="close-modal">Abbrechen</button>
      <button class="btn primary" id="tm-save">Speichern</button></div>`, m => {
    $('#tm-q', m).addEventListener('input', ev => {
      const t = ev.target.value.trim().toLowerCase();
      $$('[data-name]', m).forEach(l => { l.hidden = t && !l.dataset.name.includes(t); });
    });
    $('#tm-save', m).addEventListener('click', () => {
      p.memberIds = $$('[data-uid]', m).filter(c => c.checked).map(c => c.dataset.uid).sort();
      save(); closeModal(); render(); toast(`Team gespeichert (${p.memberIds.length} ${p.memberIds.length === 1 ? 'Person' : 'Personen'})`);
    });
  });
}
function afterProjects() {
  $('#proj-q').addEventListener('input', ev => { UI.projQ = ev.target.value; $('#proj-list').innerHTML = projectTableHTML(); });
}

// opts: { name, onSaved(id), onCancel() } – für das Anlegen direkt aus der Projektauswahl
function openProjectModal(id, opts = {}) {
  const p = id ? proj(id) : null;
  if (p ? !canEditProject(p) : !canCreateProject()) return toast('Keine Berechtigung, dieses Projekt zu bearbeiten');
  const cloud = cloudOn(), admin = role().admin;
  const d = p ? { ...p } : { name: opts.name || '', clientId: null, color: COLORS[S.projects.length % COLORS.length], rate: null, billable: true, leadId: null, memberIds: [] };
  const leads = S.roles.filter(r => r.active && r.roles.includes('pl')).sort(byName);
  // Projektleiter ordnet nur der Administrator zu
  const leadField = !cloud ? '' : admin
    ? `<label class="field"><span>Projektleiter</span><select name="leadId"><option value="">– kein Projektleiter –</option>
        ${leads.map(r => `<option value="${r.id}" ${r.id === d.leadId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
       ${leads.length ? '' : '<p class="muted" style="margin-top:-8px">Noch niemand hat die Rolle Projektleiter (Benutzer & Rollen).</p>'}`
    : `<div class="field"><span>Projektleiter</span><div class="select-btn">${d.leadName ? esc(d.leadName) : '<span class="muted">wird vom Administrator zugeordnet</span>'}</div></div>`;
  openModal(`<h2>${p ? 'Projekt bearbeiten' : 'Neues Projekt'}</h2><form id="pf" novalidate>
    <label class="field"><span>Projektname</span><input name="pname" value="${esc(d.name)}" autocomplete="off"></label>
    <label class="field"><span>Kunde</span><select name="clientId"><option value="">Ohne Kunde</option>
      ${[...S.clients].sort(byName).map(c => `<option value="${c.id}" ${c.id === d.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    ${leadField}
    <div class="field"><span>Farbe</span><div class="swatches">${COLORS.map(c => `<label class="sw" style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === d.color ? 'checked' : ''}><i></i></label>`).join('')}</div></div>
    <label class="check"><input type="checkbox" name="billable" ${d.billable ? 'checked' : ''}> Einträge standardmäßig abrechenbar</label>
    <label class="field"><span>Stundensatz in ${esc(S.settings.currency)} <span class="req">*</span> (Pflicht bei abrechenbaren Projekten)</span>
      <input name="rate" type="number" min="0" step="0.01" inputmode="decimal" placeholder="z. B. 95" value="${d.rate ?? ''}"></label>
    <div class="form-error" id="pf-err" hidden></div>
    <div class="modal-actions"><span class="grow"></span>
      <button type="button" class="btn ghost" id="pf-cancel">Abbrechen</button>
      <button class="btn primary">Speichern</button></div></form>`, m => {
    const f = $('#pf', m), el = f.elements, err = $('#pf-err', m);
    if (!p) (opts.name ? el.rate : el.pname).focus();
    // Entwurf eines darunterliegenden Zeiteintrag-Dialogs erhalten
    const close = () => { const draft = UI.modalDraft; closeModal(); UI.modalDraft = draft; };
    const fail = (msg, input) => { err.textContent = msg; err.hidden = false; input.focus(); };
    $('#pf-cancel', m).addEventListener('click', () => { close(); opts.onCancel?.(); });
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const rateStr = String(el.rate.value).trim().replace(',', '.');
      const vals = {
        name: el.pname.value.trim(), clientId: el.clientId.value || null,
        color: f.querySelector('[name=color]:checked')?.value || d.color,
        rate: rateStr === '' ? null : Number(rateStr), billable: el.billable.checked
      };
      if (cloud) {
        vals.leadId = admin ? (el.leadId.value || null) : d.leadId || null;
        vals.leadName = vals.leadId ? (S.roles.find(r => r.id === vals.leadId)?.name || d.leadName || '') : '';
        vals.memberIds = (d.memberIds || []).filter(id => id !== vals.leadId);
      }
      if (!vals.name) return fail('Bitte einen Projektnamen eingeben.', el.pname);
      if (vals.rate != null && (isNaN(vals.rate) || vals.rate < 0)) return fail('Bitte einen gültigen Stundensatz eingeben.', el.rate);
      if (vals.billable && !(vals.rate > 0)) return fail('Für abrechenbare Projekte ist ein Stundensatz Pflicht. Bitte eintragen oder „abrechenbar“ abwählen.', el.rate);
      let pid = p?.id;
      if (p) Object.assign(p, vals); else { pid = uid(); S.projects.push({ id: pid, archived: false, ...vals }); }
      save(); close();
      if (opts.onSaved) opts.onSaved(pid); else render();
      toast(p ? 'Projekt gespeichert' : 'Projekt angelegt');
    });
  });
}

function viewList(kind) {
  const isC = kind === 'clients';
  const list = [...S[kind]].sort(byName), edit = isC ? canEditClients() : canEditTags();
  return `<div class="page">
    <div class="page-head"><h1>${isC ? 'Kunden' : 'Tags'}</h1></div>
    <div class="card">
      ${edit ? `<form class="toolbar" data-form="add-${kind}">
        <input type="text" name="n" placeholder="${isC ? 'Neuen Kunden hinzufügen' : 'Neuen Tag hinzufügen'}" required autocomplete="off">
        <button class="btn primary">HINZUFÜGEN</button>
      </form>` : ''}
      ${list.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Name</th><th class="num">${isC ? 'Projekte' : 'Einträge'}</th><th class="num">Erfasst</th><th></th></tr></thead>
        <tbody>${list.map(x => {
          const es = isC ? S.entries.filter(e => proj(e.projectId)?.clientId === x.id) : S.entries.filter(e => e.tagIds.includes(x.id));
          const count = isC ? S.projects.filter(p => p.clientId === x.id).length : es.length;
          return `<tr><td><span class="name-cell">${esc(x.name)}</span></td><td class="num">${count}</td><td class="num">${fmtDur(sum(es))}</td>
            <td class="act">${edit ? `<button class="icon-btn" data-action="rename-item" data-kind="${kind}" data-id="${x.id}" title="Umbenennen">${ic('edit')}</button>
            <button class="icon-btn" data-action="delete-item" data-kind="${kind}" data-id="${x.id}" title="Löschen">${ic('trash')}</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>`
      : `<div class="empty"><p>Noch keine ${isC ? 'Kunden' : 'Tags'} angelegt.</p></div>`}
    </div>
  </div>`;
}

/* =====================================================================
   Benutzer & Rollen (nur Administratoren, nur mit Microsoft 365)
   ===================================================================== */
const ROLE_KEYS = [['admin', 'Administrator'], ['pl', 'Projektleiter'], ['ma', 'Mitarbeiter'], ['bh', 'Buchhaltung']];
function viewUsers() {
  const st = Cloud.permStatus(), users = [...S.roles].sort(byName);
  const status = st.running ? '<span class="perm-run">Rechte werden in SharePoint gesetzt …</span>'
    : st.error ? `<span class="warn-text">Fehler: ${esc(st.error)}</span>`
    : st.pending || st.pendingLists ? '<span class="muted">Änderungen werden beim nächsten Abgleich übernommen.</span>'
    : `<span class="ok-text">Rechte aktuell${st.at ? ' (Stand ' + new Date(st.at).toLocaleString('de-DE') + ')' : ''}.</span>`;
  return `<div class="page">
    <div class="page-head"><h1>Benutzer & Rollen</h1><button class="btn primary" data-action="user-add">${ic('plus')} BENUTZER HINZUFÜGEN</button></div>
    <div class="card section-gap"><div class="card-body perm-bar">${status}
      <button class="btn ghost small" data-action="perm-apply" ${st.running ? 'disabled' : ''}>Rechte jetzt abgleichen</button></div></div>
    <div class="card section-gap">
      ${users.length ? `<div class="tbl-wrap"><table class="tbl users-tbl">
        <thead><tr><th>Name</th>${ROLE_KEYS.map(([, t]) => `<th class="c">${t}</th>`).join('')}<th class="c">Aktiv</th></tr></thead>
        <tbody>${users.map(u => `<tr class="${u.active ? '' : 'archived'}">
          <td><div class="name-cell">${esc(u.name)}</div><div class="muted small">${esc(u.upn)}</div></td>
          ${ROLE_KEYS.map(([k, t]) => `<td class="c"><input type="checkbox" aria-label="${t}" data-change="role" data-id="${u.id}" data-role="${k}" ${u.roles.includes(k) ? 'checked' : ''}></td>`).join('')}
          <td class="c"><input type="checkbox" aria-label="Aktiv" data-change="role-active" data-id="${u.id}" ${u.active ? 'checked' : ''}></td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty"><p>Noch keine Benutzer.</p></div>'}
    </div>
    ${teamsCardHTML()}
    <div class="card"><div class="card-head">Was die Rollen dürfen</div><div class="card-body">
      <ul class="help-list">
        <li><b>Administrator:</b> alles, auch Benutzer & Rollen und Tags; legt Projekte an und <b>ordnet die Projektleiter zu</b>; sieht alle Zeiten und Stundensätze.</li>
        <li><b>Projektleiter:</b> sieht nur seine Projekte, <b>ordnet diesen Mitarbeiter zu</b> (Team) und sieht alle Zeiten darauf; legt keine Projekte an.</li>
        <li><b>Mitarbeiter:</b> sieht nur Projekte, denen er zugeordnet ist; erfasst eigene Zeiten und sieht nur diese; keine Stundensätze und Beträge.</li>
        <li><b>Buchhaltung:</b> legt Projekte und Kunden an und pflegt Stundensätze; sieht alle Projekte und alle Zeiten mit Beträgen.</li>
        <li><b>Aktiv</b> abwählen, wenn jemand ausscheidet: Zugriff wird entzogen, erfasste Zeiten bleiben erhalten.</li>
      </ul>
      <p class="muted" style="margin-bottom:0">Eine Person kann mehrere Rollen haben. Wer selbst Zeiten erfasst, braucht zusätzlich „Mitarbeiter“ (Projektleiter können immer erfassen).</p>
    </div></div>
  </div>`;
}
/* ---------- Teams-App-Paket (manifest.json + 2 Symbole als ZIP) ---------- */
const appBaseUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');
function teamsCardHTML() {
  const host = location.host, local = /^(localhost|127\.)/.test(location.hostname);
  return `<div class="card section-gap"><div class="card-head">Microsoft Teams</div><div class="card-body">
    <p style="margin-top:0">Die Zeiterfassung als App in der Teams-Leiste – für alle Mitarbeiter ohne Installation, Anmeldung automatisch über Teams.</p>
    <ol class="help-list">
      <li>In Entra ID bei der App-Registrierung unter <b>Authentifizierung → Single-Page-Anwendung</b> zusätzlich diese Umleitungs-URI eintragen: <code>brk-multihub://${esc(host)}</code></li>
      <li>Paket herunterladen und im <b>Teams Admin Center</b> hochladen (Anleitung Kapitel 4.3).</li>
    </ol>
    <button class="btn primary small" data-action="teams-package" ${local ? 'disabled title="Nur über die veröffentlichte Adresse möglich"' : ''}>${ic('download')} Teams-App-Paket herunterladen</button>
    ${local ? '<p class="muted small">Hinweis: Das Paket lässt sich nur erstellen, wenn die App über ihre veröffentlichte Adresse (https) geöffnet ist.</p>' : ''}
  </div></div>`;
}
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC_TABLE[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) { // unkomprimiertes ZIP (Methode „stored“) – reicht für Teams
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((a, p) => a + p.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
async function stableGuid(seed) { // gleiche App-ID bei jedem Herunterladen → Updates statt Duplikate
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(seed))).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
function outlineIcon() { // 32×32, weiß auf transparent (Vorgabe von Teams)
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 2.6; g.lineCap = 'round';
  g.beginPath(); g.arc(16, 17, 10.5, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(16, 11); g.lineTo(16, 17); g.lineTo(20, 20); g.stroke();
  g.beginPath(); g.moveTo(13, 3.5); g.lineTo(19, 3.5); g.stroke();
  return new Promise(ok => c.toBlob(b => b.arrayBuffer().then(a => ok(new Uint8Array(a))), 'image/png'));
}
async function downloadTeamsPackage() {
  try {
    const base = appBaseUrl(), cfg = Cloud.config();
    const manifest = {
      $schema: 'https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json',
      manifestVersion: '1.17', version: APP_VERSION, // gleiche Nummer wie das App-Release (muss bei jedem neuen Paket steigen)
      id: await stableGuid('zeiterfassung-teams|' + cfg.clientId + '|' + base),
      developer: { name: 'Interne Zeiterfassung', websiteUrl: base, privacyUrl: base + 'anleitung.html', termsOfUseUrl: base + 'anleitung.html' },
      name: { short: 'Zeiterfassung', full: 'Zeiterfassung – Stundenreporting' },
      description: { short: 'Arbeitszeiten je Projekt erfassen und auswerten', full: 'Timer und manuelle Zeiterfassung je Projekt mit Tags und Kommentar, Berichte und Export. Daten liegen in SharePoint im eigenen Microsoft 365.' },
      icons: { color: 'color.png', outline: 'outline.png' },
      accentColor: '#03A9F4',
      staticTabs: [{ entityId: 'zeiterfassung', name: 'Zeiterfassung', contentUrl: base + '?teams=1#/projects', websiteUrl: base, scopes: ['personal'] }],
      permissions: ['identity'],
      devicePermissions: ['media'], // Mikrofon für „Zeit diktieren“ in Teams
      validDomains: [location.host]
    };
    const color = new Uint8Array(await (await fetch('icons/icon-192.png', { cache: 'no-store' })).arrayBuffer());
    const zip = makeZip([
      { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
      { name: 'color.png', data: color },
      { name: 'outline.png', data: await outlineIcon() }
    ]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip); a.download = 'Zeiterfassung_Teams.zip';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Teams-App-Paket heruntergeladen');
  } catch (e) { toast('Paket konnte nicht erstellt werden: ' + e.message); }
}

function setRole(id, key, on) {
  const u = S.roles.find(r => r.id === id);
  if (!u) return;
  const admins = S.roles.filter(r => r.active && r.roles.includes('admin'));
  if (key === 'admin' && !on && admins.length === 1 && admins[0].id === id) { toast('Es muss mindestens einen Administrator geben'); return render(); }
  if (key === 'admin' && !on && id === meId() && !confirm('Sich selbst die Administrator-Rolle entziehen? Danach haben Sie keinen Zugriff mehr auf diese Seite.')) return render();
  u.roles = on ? [...new Set([...u.roles, key])] : u.roles.filter(r => r !== key);
  save(); render();
}
function setActive(id, on) {
  const u = S.roles.find(r => r.id === id);
  if (!u) return;
  if (!on && id === meId()) { toast('Sie können sich nicht selbst deaktivieren'); return render(); }
  u.active = on; save(); render();
}
function openUserAdd() {
  openModal(`<h2>Benutzer hinzufügen</h2>
    <label class="field"><span>Name oder E-Mail (aus Microsoft 365)</span><input id="us-q" placeholder="z. B. Müller" autocomplete="off"></label>
    <div id="us-res" class="us-res"><p class="muted">Mindestens 2 Zeichen eingeben.</p></div>
    <div class="modal-actions"><span class="grow"></span><button class="btn ghost" data-action="close-modal">Schließen</button></div>`, m => {
    const q = $('#us-q', m), res = $('#us-res', m);
    let t, found = [];
    q.focus();
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        if (q.value.trim().length < 2) { res.innerHTML = '<p class="muted">Mindestens 2 Zeichen eingeben.</p>'; return; }
        res.innerHTML = '<p class="muted">Suche …</p>';
        try { found = await Cloud.searchUsers(q.value); }
        catch (e) { res.innerHTML = `<p class="warn-text">${esc(e.message)}</p>`; return; }
        res.innerHTML = found.length ? found.map((u, i) => {
          const exists = S.roles.some(r => r.id === u.id);
          return `<button class="pp-item" data-i="${i}" ${exists ? 'disabled' : ''}><span class="avatar">${esc((u.name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</span>
            <span><b>${esc(u.name)}</b><br><span class="muted small">${esc(u.mail)}</span></span>${exists ? '<span class="chip">bereits vorhanden</span>' : ''}</button>`;
        }).join('') : '<p class="muted">Niemand gefunden.</p>';
      }, 300);
    });
    res.addEventListener('click', ev => {
      const b = ev.target.closest('[data-i]');
      if (!b || b.disabled) return;
      const u = found[Number(b.dataset.i)];
      S.roles.push({ id: u.id, name: u.name, upn: u.upn, roles: ['ma'], active: true });
      save(); closeModal(); render(); toast(`${u.name} als Mitarbeiter hinzugefügt – Rollen bei Bedarf anpassen`);
    });
  });
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
      <div class="card"><div class="card-head">Über diese App</div><div class="card-body about">
        <div><b>Zeiterfassung – MH3 Ingenieure</b></div>
        <div>Release <b>Version ${APP_VERSION}</b> vom ${APP_RELEASE_DATE} – ${esc(CHANGELOG[0].title)}</div>
        <button class="btn ghost small" data-action="changelog" style="margin-top:10px">${ic('list')} Änderungsprotokoll anzeigen</button>
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
  'continue': el => { const e = S.entries.find(x => x.id === el.dataset.id); if (isLocked(e)) return lockedToast(); if (e) { startTimer(e); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  'edit-entry': el => (isLocked(S.entries.find(x => x.id === el.dataset.id)) ? lockedToast() : openEntryModal(el.dataset.id)),
  'entry-menu': el => (isLocked(S.entries.find(x => x.id === el.dataset.id)) ? lockedToast() : openEntryMenu(el, el.dataset.id)),
  'delete-entry': el => { closeModal(); if (isLocked(S.entries.find(x => x.id === el.dataset.id))) return lockedToast(); deleteEntry(el.dataset.id); },
  'save-entry': saveEntryModal,
  'pick-project': el => (entryLocked(el.dataset.target) ? lockedToast() : openProjectPicker(el, el.dataset.target)),
  'pick-tags': el => (entryLocked(el.dataset.target) ? lockedToast() : openTagPicker(el, el.dataset.target)),
  'toggle-billable': el => (entryLocked(el.dataset.target) ? lockedToast() : applyTarget(el.dataset.target, o => { o.billable = !o.billable; })),
  'load-more': () => { UI.weeksShown += 4; render(); },
  'close-modal': closeModal,
  'rep-shift': el => { UI.report.offset += Number(el.dataset.d); render(); },
  'rep-csv': exportCSV,
  'rep-print': () => window.print(),
  'new-project': () => openProjectModal(null),
  'edit-project': el => openProjectModal(el.dataset.id),
  'archive-project': el => {
    const p = proj(el.dataset.id);
    if (!canEditProject(p)) return;
    const msg = p.archived
      ? `Projekt „${p.name}“ wieder öffnen?\n\nEs erscheint wieder in der Auswahl, und auf das Projekt können wieder Zeiten erfasst werden.`
      : `Projekt „${p.name}“ abschließen?\n\n• Das Projekt wird archiviert und verschwindet aus der Auswahl.\n• Es können keine Zeiten mehr darauf erfasst oder geändert werden.\n• Alle Zeiten bleiben in den Berichten erhalten.\n\nWieder öffnen ist jederzeit möglich.`;
    if (!confirm(msg)) return;
    p.archived = !p.archived; save(); render();
    toast(p.archived ? 'Projekt abgeschlossen und archiviert' : 'Projekt wieder geöffnet');
  },
  'delete-project': el => {
    const p = proj(el.dataset.id), n = S.entries.filter(e => e.projectId === p.id).length;
    if (cloudOn() && !role().admin) return; // löschen nur Administratoren
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
  'user-add': () => openUserAdd(),
  'edit-team': el => openTeamModal(el.dataset.id),
  'preview-end': () => setPreview(null),
  'dictate': () => openDictate(),
  'changelog': () => openChangelog(),
  'open-project': el => { // Projekt aus der Übersicht → Zeiterfassung mit vorgewähltem Projekt
    const p = proj(el.dataset.id);
    if (!p) return;
    const d = S.running || UI.draft;
    if (!S.running) { d.projectId = p.id; d.billable = !!p.billable; }
    location.hash = '#/tracker';
    setTimeout(() => { window.scrollTo(0, 0); $('#tb-desc')?.focus(); }, 50);
    if (S.running) toast('Es läuft noch ein Timer – bitte zuerst stoppen.');
  },
  'teams-package': () => downloadTeamsPackage(),
  'perm-apply': () => { Cloud.reconcile(); render(); },
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
  } else if (k === 'rep-person') {
    const v = el.value, R = UI.report, wasTeam = R.scope === 'team';
    if (v === 'me') { R.scope = 'me'; R.userId = ''; }
    else { R.scope = 'team'; R.userId = v.startsWith('u:') ? v.slice(2) : ''; }
    if (R.scope === 'team' && !wasTeam) R.groupBy = R.userId ? 'project' : 'user';
    if (R.scope === 'me' && R.groupBy === 'user') R.groupBy = 'project';
    if (R.userId && R.groupBy === 'user') R.groupBy = 'project'; // eine Person → nach Projekten aufschlüsseln
    render();
  } else if (k === 'proj-arch') { UI.showArchived = el.checked; render(); }
  else if (k === 'role') setRole(el.dataset.id, el.dataset.role, el.checked);
  else if (k === 'role-active') setActive(el.dataset.id, el.checked);  else if (k === 'import') { importJSON(el.files[0]); el.value = ''; }
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
