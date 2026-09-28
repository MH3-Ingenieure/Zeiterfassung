'use strict';
/* =====================================================================
   Microsoft-365-Anbindung
   - Anmeldung mit dem Firmenkonto (Entra ID, MSAL)
   - Synchronisation mit SharePoint-Listen über Microsoft Graph
   Die App bleibt "offline-first": Alles wird zuerst lokal gespeichert und
   im Hintergrund übertragen. Abgleich per Schattenkopie (letzter Serverstand).
   ===================================================================== */
const Cloud = (() => {
  const cfg = window.APP_CONFIG || {};
  const enabled = !!(cfg.tenantId && cfg.clientId && cfg.siteUrl);
  const SCOPES = ['User.Read', 'Sites.Manage.All'];
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const KINDS = ['clients', 'projects', 'tags', 'entries'];

  const text = (name, displayName, indexed) => ({ name, displayName, text: {}, indexed });
  const num = (name, displayName) => ({ name, displayName, number: {} });
  const bool = (name, displayName) => ({ name, displayName, boolean: {} });
  const dt = (name, displayName, indexed) => ({ name, displayName, dateTime: { format: 'dateTime' }, indexed });
  const LISTS = {
    clients: { name: 'ZE_Kunden', cols: [text('AppId', 'App-ID', true)] },
    projects: { name: 'ZE_Projekte', cols: [text('AppId', 'App-ID', true), text('ClientAppId', 'Kunden-ID'), text('Color', 'Farbe'), num('Rate', 'Stundensatz'), bool('Billable', 'Abrechenbar'), bool('Archived', 'Archiviert')] },
    tags: { name: 'ZE_Tags', cols: [text('AppId', 'App-ID', true)] },
    entries: {
      name: 'ZE_Zeiteintraege', cols: [text('AppId', 'App-ID', true), text('UserId', 'Benutzer-ID', true), text('UserName', 'Mitarbeiter'),
        text('ProjectAppId', 'Projekt-ID'), text('ProjectName', 'Projekt'), text('ClientName', 'Kunde'), text('TagAppIds', 'Tag-IDs'), text('TagNames', 'Tags'),
        bool('Billable', 'Abrechenbar'), dt('StartTime', 'Beginn', true), dt('EndTime', 'Ende'), num('Hours', 'Stunden'), num('Amount', 'Betrag')]
    }
  };

  let pca = null, account = null, state = 'init', message = '', syncing = false, again = false, pushTimer = null;
  let team = { key: '', status: 'idle', list: [] };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const baseUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');
  const isoS = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const sec = t => Math.floor(t / 1000) * 1000;

  /* ---------- Status-Anzeige ---------- */
  const STATES = {
    init: ['Verbinde …', 'Verbinde'], ok: ['Synchronisiert', 'Synchron'], syncing: ['Synchronisiere …', 'Sync …'],
    pending: ['Änderungen werden übertragen', 'Ausstehend'], offline: ['Offline – Daten werden später übertragen', 'Offline'],
    login: ['Anmeldung erforderlich – hier tippen', 'Anmelden'], error: ['Fehler', 'Fehler']
  };
  function setState(s, msg = '') { state = s; message = msg; paint(); }
  function paint() {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.hidden = !enabled;
    if (!enabled) return;
    const [long, short] = STATES[state];
    el.className = 'sync-status s-' + state;
    el.title = long + (message ? ': ' + message : '');
    el.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/></svg><span>${short}</span>`;
  }

  /* ---------- Anmeldung ---------- */
  async function init() {
    if (!enabled) return;
    paint();
    if (typeof msal === 'undefined') { setState('offline', 'Anmeldebibliothek nicht geladen'); return; }
    try {
      pca = new msal.PublicClientApplication({
        auth: { clientId: cfg.clientId, authority: 'https://login.microsoftonline.com/' + cfg.tenantId, redirectUri: baseUrl(), navigateToLoginRequestUrl: false },
        cache: { cacheLocation: 'localStorage' }
      });
      await pca.initialize();
      const res = await pca.handleRedirectPromise();
      if (res?.account) account = res.account;
    } catch (e) { console.error(e); setState('error', e.message); }
    if (/[#&](code|error|state)=/.test(location.hash)) history.replaceState(null, '', baseUrl() + '#/tracker');
    account = account || pca?.getActiveAccount() || pca?.getAllAccounts()[0] || null;
    if (!account) { showLoginScreen(); setState('login'); return; }
    pca.setActiveAccount(account);
    hideLoginScreen();
    onAccount();
    render();
    sync();
    setInterval(() => { if (!document.hidden) sync(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
    window.addEventListener('online', () => sync());
  }

  function onAccount() {
    const uidNow = account.localAccountId || account.idTokenClaims?.oid;
    if (S.sync?.userId && S.sync.userId !== uidNow) {
      // anderer Benutzer auf diesem Gerät: lokale Daten des Vorgängers verwerfen
      const settings = S.settings;
      S = defaultState(); S.settings = settings; S.settings.userName = '';
    }
    ensureSync(uidNow);
    if (!S.settings.userName) S.settings.userName = account.name || account.username;
    if (S.running && !S.running.id) S.running.id = uid();
    persist();
  }
  function ensureSync(userId) {
    if (!S.sync) S.sync = { userId: null, ids: null, lastSync: 0, shadow: {} };
    if (userId) S.sync.userId = userId;
    for (const k of KINDS) S.sync.shadow[k] = S.sync.shadow[k] || {};
  }
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { console.warn(e); } }

  async function getToken() {
    try { return (await pca.acquireTokenSilent({ scopes: SCOPES, account })).accessToken; }
    catch (e) {
      if (e instanceof msal.InteractionRequiredAuthError || /interaction_required|login_required|consent_required|no_tokens_found/.test(e.errorCode || '')) {
        const err = new Error('Anmeldung erforderlich'); err.login = true; throw err;
      }
      throw e;
    }
  }
  function login() {
    if (!pca) return location.reload();
    if (account) pca.acquireTokenRedirect({ scopes: SCOPES, account });
    else pca.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
  }
  async function logout() {
    if (!confirm('Abmelden? Noch nicht übertragene Änderungen gehen dabei verloren.')) return;
    const a = account;
    S = defaultState(); persist();
    await pca.logoutRedirect({ account: a, postLogoutRedirectUri: baseUrl() });
  }
  function showLoginScreen() {
    if (document.getElementById('login-screen')) return;
    const d = document.createElement('div');
    d.id = 'login-screen';
    d.innerHTML = `<div class="login-card">
      <div class="logo login-logo"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg></div>
      <h1>Zeiterfassung</h1>
      <p>Bitte mit Ihrem Microsoft-365-Firmenkonto anmelden.</p>
      <button class="btn primary" data-action="cloud-login">MIT MICROSOFT ANMELDEN</button>
      ${typeof msal === 'undefined' ? '<p class="muted">Keine Internetverbindung – Anmeldung ist erst online möglich.</p>' : ''}
    </div>`;
    document.body.appendChild(d);
  }
  function hideLoginScreen() { document.getElementById('login-screen')?.remove(); }

  /* ---------- Microsoft Graph ---------- */
  async function g(path, { method = 'GET', body } = {}) {
    const url = path.startsWith('http') ? path : GRAPH + path;
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await getToken();
      const res = await fetch(url, {
        method, body: body ? JSON.stringify(body) : undefined,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' }
      });
      if (res.status === 429 || res.status === 503) { await sleep((Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000); continue; }
      if (res.status === 204) return null;
      const data = await res.json().catch(() => null);
      if (!res.ok) { const err = new Error(data?.error?.message || 'HTTP ' + res.status); err.status = res.status; throw err; }
      return data;
    }
    throw new Error('Microsoft 365 ist gerade ausgelastet');
  }
  async function getAll(path) {
    const out = [];
    for (let url = path; url;) { const d = await g(url); out.push(...d.value); url = d['@odata.nextLink']; }
    return out;
  }
  async function ensureLists() {
    const ids = S.sync.ids;
    if (ids && ids.site === cfg.siteUrl && KINDS.every(k => ids[k])) return ids;
    const u = new URL(cfg.siteUrl);
    const sitePath = u.pathname.replace(/\/+$/, '');
    let site;
    try { site = await g(`/sites/${u.hostname}:${sitePath}`); }
    catch (e) {
      if (/invalid hostname/i.test(e.message)) {
        // richtige SharePoint-Adresse des Mandanten ermitteln und als Hinweis anzeigen
        let hint = '';
        try { const root = await g('/sites/root?$select=webUrl'); hint = ` Richtige Adresse für config.js: ${root.webUrl}${sitePath}`; } catch { }
        throw new Error(`„${u.hostname}“ ist nicht die SharePoint-Adresse eures Microsoft 365.${hint}`);
      }
      if (e.status === 404) throw new Error(`SharePoint-Website nicht gefunden: ${cfg.siteUrl} – bitte Adresse prüfen bzw. Website anlegen.`);
      throw e;
    }
    const lists = await getAll(`/sites/${site.id}/lists?$select=id,displayName`);
    const out = { site: cfg.siteUrl, siteId: site.id };
    for (const k of KINDS) {
      const def = LISTS[k];
      let l = lists.find(x => x.displayName === def.name);
      if (!l) {
        try {
          l = await g(`/sites/${site.id}/lists`, { method: 'POST', body: { displayName: def.name, list: { template: 'genericList' }, columns: def.cols.map(({ indexed, ...c }) => c) } });
        } catch (e) {
          if (e.status === 403) throw new Error(`Die SharePoint-Liste „${def.name}“ fehlt. Ein Website-Besitzer muss die App einmal öffnen, damit sie angelegt wird.`);
          throw e;
        }
        try { // Indizes für schnelle Filter (nicht kritisch)
          const cols = await getAll(`/sites/${site.id}/lists/${l.id}/columns?$select=id,name`);
          for (const c of def.cols.filter(c => c.indexed)) {
            const col = cols.find(x => x.name === c.name);
            if (col) await g(`/sites/${site.id}/lists/${l.id}/columns/${col.id}`, { method: 'PATCH', body: { indexed: true } });
          }
        } catch (e) { console.warn('Index konnte nicht gesetzt werden', e); }
      }
      out[k] = l.id;
    }
    S.sync.ids = out; persist();
    return out;
  }

  /* ---------- Abbildung App-Datensatz <-> SharePoint-Felder ---------- */
  function localRecords(k) {
    if (k !== 'entries') return S[k];
    return S.running ? [...S.entries, { ...S.running, end: null }] : [...S.entries];
  }
  function canon(k, r) {
    switch (k) {
      case 'projects': return { id: r.id, name: r.name, clientId: r.clientId || null, color: r.color || '', rate: r.rate == null || r.rate === '' ? null : Number(r.rate), billable: !!r.billable, archived: !!r.archived };
      case 'entries': return { id: r.id, description: r.description || '', projectId: r.projectId || null, tagIds: [...(r.tagIds || [])], billable: !!r.billable, start: sec(r.start), end: r.end == null ? null : sec(r.end) };
      default: return { id: r.id, name: r.name };
    }
  }
  const ser = (k, r) => JSON.stringify(canon(k, r));
  function toFields(k, r) {
    const c = canon(k, r);
    switch (k) {
      case 'projects': return { Title: c.name, AppId: c.id, ClientAppId: c.clientId || '', Color: c.color, Rate: c.rate, Billable: c.billable, Archived: c.archived };
      case 'entries': {
        const p = proj(c.projectId), cl = p && client(p.clientId), h = c.end ? (c.end - c.start) / HOUR : 0;
        return {
          Title: c.description || '-', AppId: c.id, UserId: S.sync.userId, UserName: account.name || account.username,
          ProjectAppId: c.projectId || '', ProjectName: p?.name || '', ClientName: cl?.name || '',
          TagAppIds: c.tagIds.join(','), TagNames: c.tagIds.map(tag).filter(Boolean).map(t => t.name).join(', '),
          Billable: c.billable, StartTime: isoS(c.start), EndTime: c.end ? isoS(c.end) : null,
          Hours: Math.round(h * 100) / 100, Amount: c.billable ? Math.round(h * rateOf(c) * 100) / 100 : 0
        };
      }
      default: return { Title: c.name, AppId: c.id };
    }
  }
  function fromFields(k, f) {
    switch (k) {
      case 'projects': return { id: f.AppId, name: f.Title || '', clientId: f.ClientAppId || null, color: f.Color || '#03a9f4', rate: f.Rate == null ? null : Number(f.Rate), billable: !!f.Billable, archived: !!f.Archived };
      case 'entries': return { id: f.AppId, description: f.Title === '-' ? '' : (f.Title || ''), projectId: f.ProjectAppId || null, tagIds: (f.TagAppIds || '').split(',').filter(Boolean), billable: !!f.Billable, start: Date.parse(f.StartTime), end: f.EndTime ? Date.parse(f.EndTime) : null };
      default: return { id: f.AppId, name: f.Title || '' };
    }
  }
  function applyRecords(k, list) {
    if (k !== 'entries') { S[k] = list; return; }
    S.entries = list.filter(r => r.end != null);
    const run = list.filter(r => r.end == null).sort((a, b) => b.start - a.start)[0];
    if (run) { const { end, ...rest } = run; S.running = rest; } else S.running = null;
  }

  /* ---------- Abgleich ---------- */
  async function pull(ids) {
    let changed = false;
    for (const k of KINDS) {
      const filter = k === 'entries' ? `&$filter=fields/UserId eq '${S.sync.userId}'` : '';
      const items = await getAll(`/sites/${ids.siteId}/lists/${ids[k]}/items?$expand=fields&$top=500${filter}`);
      // ab hier synchron: lokale Daten lesen und zusammenführen ohne Unterbrechung
      const shadow = S.sync.shadow[k], server = new Map();
      for (const it of items) if (it.fields?.AppId) server.set(it.fields.AppId, { spId: it.id, rec: fromFields(k, it.fields) });
      const local = new Map(localRecords(k).map(r => [r.id, r]));
      const result = [];
      for (const [id, { spId, rec }] of server) {
        const l = local.get(id), sh = shadow[id], sj = ser(k, rec);
        if (l) {
          if (sh && ser(k, l) !== sh.json) { result.push(l); sh.spId = spId; }          // lokal geändert → lokal gewinnt
          else if (!sh) { result.push(l); shadow[id] = { spId, json: sj }; }            // erstmals zugeordnet
          else { if (ser(k, l) !== sj) changed = true; result.push(rec); shadow[id] = { spId, json: sj }; }
        } else if (!sh) { result.push(rec); shadow[id] = { spId, json: sj }; changed = true; } // neu vom Server
        // sonst: lokal gelöscht, Löschung wird beim Hochladen übertragen
      }
      for (const [id, l] of local) {
        if (server.has(id)) continue;
        if (shadow[id]) {                       // auf dem Server gelöscht
          const untouched = ser(k, l) === shadow[id].json;
          delete shadow[id];
          if (untouched) { changed = true; continue; }
        }
        result.push(l);                         // neu oder lokal geändert → wird hochgeladen
      }
      for (const id of Object.keys(shadow)) if (!server.has(id) && !local.has(id)) delete shadow[id];
      applyRecords(k, result);
    }
    persist();
    return changed;
  }

  async function push(ids) {
    for (const k of KINDS) {
      const shadow = S.sync.shadow[k], recs = localRecords(k), present = new Set(recs.map(r => r.id));
      const base = `/sites/${ids.siteId}/lists/${ids[k]}/items`;
      for (const r of recs) {
        const sh = shadow[r.id], json = ser(k, r);
        if (sh && sh.json === json) continue;
        const fields = toFields(k, r);
        if (!sh) {
          const it = await g(base, { method: 'POST', body: { fields } });
          shadow[r.id] = { spId: it.id, json };
        } else {
          try { await g(`${base}/${sh.spId}/fields`, { method: 'PATCH', body: fields }); shadow[r.id] = { spId: sh.spId, json }; }
          catch (e) { if (e.status === 404) { delete shadow[r.id]; again = true; } else throw e; }
        }
        persist();
      }
      for (const id of Object.keys(shadow)) {
        if (present.has(id)) continue;
        try { await g(`${base}/${shadow[id].spId}`, { method: 'DELETE' }); }
        catch (e) { if (e.status !== 404) throw e; }
        delete shadow[id]; persist();
      }
    }
  }

  function pendingCount() {
    if (!S.sync) return 0;
    let n = 0;
    for (const k of KINDS) {
      const sh = S.sync.shadow[k] || {}, recs = localRecords(k);
      n += recs.filter(r => !sh[r.id] || sh[r.id].json !== ser(k, r)).length;
      n += Object.keys(sh).filter(id => !recs.some(r => r.id === id)).length;
    }
    return n;
  }

  async function sync() {
    if (!enabled || !account) return;
    if (syncing) { again = true; return; }
    if (!navigator.onLine) { setState('offline'); return; }
    syncing = true; setState('syncing');
    try {
      ensureSync();
      const ids = await ensureLists();
      const changed = await pull(ids);
      await push(ids);
      S.sync.lastSync = Date.now(); persist();
      setState(pendingCount() ? 'pending' : 'ok');
      if (changed) window.renderSoft();
    } catch (e) {
      if (e.login) setState('login');
      else if (!navigator.onLine || e instanceof TypeError) setState('offline');
      else { console.error(e); setState('error', e.message); }
    } finally {
      syncing = false;
      if (again) { again = false; setTimeout(sync, 500); }
    }
  }

  function changed() {
    if (!enabled || !account) return;
    if (!syncing && state !== 'login') setState(navigator.onLine ? 'pending' : 'offline');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(sync, 1500);
  }

  /* ---------- Team-Auswertung (alle Mitarbeiter) ---------- */
  function teamEntries(from, to) {
    const key = from + '-' + to;
    if (team.key !== key) { team = { key, status: 'loading', list: [] }; loadTeam(from, to, key); }
    return team;
  }
  async function loadTeam(from, to, key) {
    try {
      ensureSync();
      const ids = await ensureLists();
      const items = await getAll(`/sites/${ids.siteId}/lists/${ids.entries}/items?$expand=fields&$top=500&$filter=fields/StartTime ge '${isoS(from)}' and fields/StartTime lt '${isoS(to)}'`);
      const list = items.map(it => ({ ...fromFields('entries', it.fields), userId: it.fields.UserId, userName: it.fields.UserName || '?' })).filter(e => e.end != null && e.id);
      if (team.key === key) { team = { key, status: 'ok', list }; render(); }
    } catch (e) {
      if (team.key === key) { team = { key, status: 'error', list: [], error: e.login ? 'Bitte erneut anmelden' : e.message }; render(); }
    }
  }

  function settingsHTML() {
    if (!enabled) return `<div class="card"><div class="card-head">Microsoft 365</div><div class="card-body"><p class="muted" style="margin:0">Nicht eingerichtet – die Daten liegen nur auf diesem Gerät. Zum Einrichten die Datei <b>config.js</b> ausfüllen (siehe Anleitung).</p></div></div>`;
    const last = S.sync?.lastSync ? new Date(S.sync.lastSync).toLocaleString('de-DE') : '–';
    return `<div class="card"><div class="card-head">Microsoft 365</div><div class="card-body">
      <p style="margin-top:0">${account ? `Angemeldet als <b>${esc(account.name || '')}</b> (${esc(account.username)})` : 'Nicht angemeldet'}<br>
      <span class="muted">SharePoint: ${esc(cfg.siteUrl)}<br>Status: ${esc(STATES[state][0])}${message ? ' – ' + esc(message) : ''} · Letzter Abgleich: ${last}</span></p>
      <div class="data-actions">
        ${account ? `<button class="btn ghost small" data-action="cloud-sync">Jetzt synchronisieren</button>
          <button class="btn ghost small" data-action="cloud-logout">Abmelden</button>`
        : `<button class="btn primary small" data-action="cloud-login">Anmelden</button>`}
      </div></div></div>`;
  }

  return {
    enabled, init, sync, changed, login, logout, teamEntries, settingsHTML,
    signedIn: () => enabled && !!account,
    account: () => account,
    refreshTeam: () => { team.key = ''; },
    statusClick: () => (state === 'login' ? login() : sync())
  };
})();
window.Cloud = Cloud;
render(); // Ansicht mit Microsoft-365-Elementen neu aufbauen
Cloud.init();
