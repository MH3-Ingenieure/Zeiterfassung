'use strict';
/* =====================================================================
   Microsoft-365-Anbindung
   - Anmeldung mit dem Firmenkonto (Entra ID, MSAL)
   - Synchronisation mit SharePoint-Listen über Microsoft Graph
   - Rollen und Rechte: je Projekt eine eigene Zeitenliste, deren Rechte die
     App (als Administrator) über die SharePoint-REST-Schnittstelle setzt:
       Mitarbeiter   → nur eigene Einträge (Elementebene)
       Projektleiter → alle Einträge seiner Projekte
       Buchhaltung   → alle Einträge aller Projekte (lesend)
       Administrator → Besitzergruppe der Website (alles)
   Offline-first: Alles wird zuerst lokal gespeichert und im Hintergrund
   übertragen. Abgleich per Schattenkopie (letzter bekannter Serverstand).
   ===================================================================== */
const Cloud = (() => {
  const cfg = window.APP_CONFIG || {};
  const enabled = !!(cfg.tenantId && cfg.clientId && cfg.siteUrl);
  const SCOPES = ['User.Read', 'User.ReadBasic.All', 'Sites.Manage.All'];
  const spScopes = () => [`https://${new URL(cfg.siteUrl).hostname}/AllSites.FullControl`];
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const spBase = () => cfg.siteUrl.replace(/\/+$/, '');
  const SHARED = ['roles', 'clients', 'projects', 'rates', 'tags'];
  const KINDS = [...SHARED, 'entries'];
  const OPTIONAL = new Set(['roles', 'rates']); // für Mitarbeiter ggf. nicht sichtbar
  const ROLE_NAMES = { admin: 'Administrator', pl: 'Projektleiter', ma: 'Mitarbeiter', bh: 'Buchhaltung' };

  const text = (name, displayName, indexed) => ({ name, displayName, text: {}, indexed });
  const num = (name, displayName) => ({ name, displayName, number: {} });
  const bool = (name, displayName) => ({ name, displayName, boolean: {} });
  const dt = (name, displayName, indexed) => ({ name, displayName, dateTime: { format: 'dateTime' }, indexed });
  const ENTRY_COLS = [text('AppId', 'App-ID', true), text('UserId', 'Benutzer-ID', true), text('UserName', 'Mitarbeiter'),
    text('ProjectAppId', 'Projekt-ID'), text('ProjectName', 'Projekt'), text('ClientName', 'Kunde'), text('TagAppIds', 'Tag-IDs'),
    text('TagNames', 'Tags'), bool('Billable', 'Abrechenbar'), dt('StartTime', 'Beginn', true), dt('EndTime', 'Ende'), num('Hours', 'Stunden'),
    { name: 'Comment', displayName: 'Kommentar', text: { allowMultipleLines: true, linesForEditing: 6 } }]; // vollständiger Kommentar (Titel max. 255 Zeichen)
  const LISTS = {
    roles: { name: 'ZE_Rollen', cols: [text('AppId', 'Benutzer-ID', true), text('Upn', 'Anmeldename'), text('Roles', 'Rollen'), bool('Active', 'Aktiv')] },
    clients: { name: 'ZE_Kunden', cols: [text('AppId', 'App-ID', true)] },
    projects: {
      name: 'ZE_Projekte', cols: [text('AppId', 'App-ID', true), text('ClientAppId', 'Kunden-ID'), text('Color', 'Farbe'), bool('Billable', 'Abrechenbar'),
        bool('Archived', 'Archiviert'), text('LeadId', 'Projektleiter-ID'), text('LeadName', 'Projektleiter'), text('ListId', 'Zeitenliste'),
        { name: 'MemberIds', displayName: 'Team (IDs)', text: { allowMultipleLines: true } }]
    },
    rates: { name: 'ZE_Stundensaetze', cols: [text('AppId', 'Projekt-ID', true), num('Rate', 'Stundensatz')] },
    tags: { name: 'ZE_Tags', cols: [text('AppId', 'App-ID', true)] },
    entries: { name: 'ZE_Zeiteintraege', cols: ENTRY_COLS } // Sammelliste: Einträge ohne Projekt bzw. bis die Projektliste existiert
  };
  // SharePoint-Berechtigungsarten (SP.PermissionKind) für die eigenen Rechtestufen
  const PK = { view: 1, add: 2, edit: 3, del: 4, open: 6, versions: 7, override: 9, manageLists: 12, forms: 13, openWeb: 17, pages: 18, userInfo: 28, client: 37, api: 38 };
  const ROLE_DEFS = {
    pl: { name: 'ZE Projektleitung', desc: 'Zeiterfassung: alle Einträge der eigenen Projekte lesen und bearbeiten', kinds: [PK.view, PK.add, PK.edit, PK.del, PK.open, PK.versions, PK.override, PK.manageLists, PK.forms, PK.openWeb, PK.pages, PK.userInfo, PK.client, PK.api] },
    bh: { name: 'ZE Buchhaltung', desc: 'Zeiterfassung: alle Einträge lesen', kinds: [PK.view, PK.open, PK.versions, PK.override, PK.manageLists, PK.forms, PK.openWeb, PK.pages, PK.userInfo, PK.client, PK.api] }
  };

  let pca = null, account = null, state = 'init', message = '', syncing = false, again = false, pushTimer = null;
  let listsChecked = false, team = { key: '', status: 'idle', list: [] };
  const noAccess = new Set();      // Projektlisten ohne Zugriff (Rechte noch nicht gesetzt)
  const forceServer = {};          // nach „Zugriff verweigert“: Serverstand übernehmen
  const perm = { running: false, error: '', queued: false };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const baseUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '');
  const isoS = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const sec = t => Math.floor(t / 1000) * 1000;

  /* ---------- Rollen des angemeldeten Benutzers ---------- */
  function myRole() {
    if (!enabled) return { admin: true, pl: true, ma: true, bh: true, local: true };
    const roles = S.roles || [], me = roles.find(r => r.id === S.sync?.userId);
    // nicht (mehr) in der Rollenliste: nur eigene Zeiten erfassen
    const list = me ? (me.active ? me.roles : []) : ['ma'];
    return { admin: list.includes('admin'), pl: list.includes('pl'), ma: list.includes('ma'), bh: list.includes('bh') };
  }
  const canWrite = k => {
    const r = myRole();
    if (k === 'roles' || k === 'tags') return r.admin;
    if (k === 'projects') return r.admin || r.bh || r.pl;   // Projektleiter: nur Team seiner Projekte (in der App begrenzt)
    if (k === 'clients' || k === 'rates') return r.admin || r.bh;
    return true;
  };

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

  /* ---------- Microsoft Teams (App in der Teams-Leiste) ---------- */
  const TEAMS_JS = 'https://cdn.jsdelivr.net/npm/@microsoft/teams-js@2.34.0/dist/umd/MicrosoftTeams.min.js';
  const TEAMS_SRI = 'sha384-brW9AazbKR2dYw2DucGgWCCcmrm2oBFV4HQidyuyZRI/TnAkmOOnTARSTdps3Hwt';
  let teamsMode = false, teamsHint = '';
  const loadScript = (src, integrity) => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.integrity = integrity; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
  });
  async function initTeams() {
    const hinted = new URLSearchParams(location.search).has('teams') || window.parent !== window;
    if (!hinted) return false;
    try {
      await loadScript(TEAMS_JS, TEAMS_SRI);
      await Promise.race([microsoftTeams.app.initialize(), sleep(5000).then(() => { throw new Error('Teams antwortet nicht'); })]);
      const ctx = await microsoftTeams.app.getContext();
      teamsHint = ctx?.user?.loginHint || ctx?.user?.userPrincipalName || '';
      microsoftTeams.app.notifySuccess?.();
      return true;
    } catch (e) { console.warn('Kein Teams-Kontext', e); return false; }
  }

  /* ---------- Anmeldung ---------- */
  async function init() {
    if (!enabled) return;
    paint();
    if (typeof msal === 'undefined') { setState('offline', 'Anmeldebibliothek nicht geladen'); return; }
    teamsMode = await initTeams();
    try {
      const auth = { clientId: cfg.clientId, authority: 'https://login.microsoftonline.com/' + cfg.tenantId };
      if (teamsMode) {
        // In Teams: Anmeldung über das Teams-Konto (Nested App Authentication), ohne Umleitung
        pca = await msal.createNestablePublicClientApplication({ auth: { ...auth, supportsNestedAppAuth: true }, cache: { cacheLocation: 'localStorage' } });
        account = pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
        if (!account) {
          try { account = (await pca.ssoSilent({ scopes: SCOPES, loginHint: teamsHint })).account; }
          catch (e) { console.warn('Stille Teams-Anmeldung nicht möglich', e); }
        }
      } else {
        pca = new msal.PublicClientApplication({ auth: { ...auth, redirectUri: baseUrl(), navigateToLoginRequestUrl: false }, cache: { cacheLocation: 'localStorage' } });
        await pca.initialize();
        const res = await pca.handleRedirectPromise();
        if (res?.account) account = res.account;
      }
    } catch (e) { console.error(e); setState('error', e.message); }
    if (/[#&](code|error|state)=/.test(location.hash)) history.replaceState(null, '', baseUrl() + '#/tracker');
    account = account || pca?.getActiveAccount() || pca?.getAllAccounts()[0] || null;
    if (!account) { showLoginScreen(); setState('login'); return; }
    start();
  }

  let started = false;
  function start() {
    pca.setActiveAccount(account);
    hideLoginScreen();
    onAccount();
    render();
    sync();
    if (started) return;
    started = true;
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
    S.sync.spIds = S.sync.spIds || {};
    for (const k of KINDS) S.sync.shadow[k] = S.sync.shadow[k] || {};
    S.roles = S.roles || [];
  }
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { console.warn(e); } }

  async function getToken(scopes = SCOPES) {
    try { return (await pca.acquireTokenSilent({ scopes, account })).accessToken; }
    catch (e) {
      if (e instanceof msal.InteractionRequiredAuthError || /interaction_required|login_required|consent_required|no_tokens_found/.test(e.errorCode || '')) {
        const err = new Error(scopes === SCOPES ? 'Anmeldung erforderlich' : 'Zusätzliche SharePoint-Berechtigung fehlt oder Anmeldung erforderlich');
        err.login = scopes === SCOPES; err.consent = scopes !== SCOPES; throw err;
      }
      throw e;
    }
  }
  async function login() {
    if (!pca) return location.reload();
    if (teamsMode) { // in Teams: Anmeldefenster von Teams, keine Umleitung der Seite
      try {
        const r = await pca.acquireTokenPopup({ scopes: SCOPES, loginHint: teamsHint || undefined });
        account = r.account; start();
      } catch (e) { toast('Anmeldung in Teams fehlgeschlagen: ' + (e.errorMessage || e.message)); }
      return;
    }
    if (account) pca.acquireTokenRedirect({ scopes: SCOPES, extraScopesToConsent: spScopes(), account });
    else pca.loginRedirect({ scopes: SCOPES, extraScopesToConsent: spScopes(), prompt: 'select_account' });
  }
  async function logout() {
    if (!confirm('Abmelden? Noch nicht übertragene Änderungen gehen dabei verloren.')) return;
    const a = account;
    S = defaultState(); persist();
    if (teamsMode) { await pca.clearCache?.(); location.reload(); return; }
    await pca.logoutRedirect({ account: a, postLogoutRedirectUri: baseUrl() });
  }
  function showLoginScreen() {
    if (document.getElementById('login-screen')) return;
    const d = document.createElement('div');
    d.id = 'login-screen';
    d.innerHTML = `<div class="login-card">
      <picture><source media="(prefers-color-scheme: dark)" srcset="icons/logo-quer-weiss.png"><img class="login-brand" src="icons/logo-quer-schwarz.png" alt="MH3 Ingenieure"></picture>
      <h1>Zeiterfassung</h1>
      <p>Bitte mit Ihrem Microsoft-365-Firmenkonto anmelden.</p>
      <button class="btn primary" data-action="cloud-login">MIT MICROSOFT ANMELDEN</button>
      ${teamsMode ? `<p class="muted" style="margin:14px 0 0">Klappt die Anmeldung in Teams nicht? <a href="${esc(baseUrl())}" target="_blank" rel="noopener">Im Browser öffnen</a></p>` : ''}
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

  /* ---------- SharePoint-REST (nur für Rechte, nur Administratoren) ---------- */
  async function sp(path, { method = 'GET', body, merge = false } = {}) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await getToken(spScopes());
      const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json;odata=nometadata' };
      if (body !== undefined) headers['Content-Type'] = 'application/json;odata=verbose';
      if (merge) { headers['X-HTTP-Method'] = 'MERGE'; headers['IF-MATCH'] = '*'; }
      const res = await fetch(spBase() + '/_api/' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      if (res.status === 429 || res.status === 503) { await sleep((Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000); continue; }
      if (res.status === 204) return null;
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error(data?.['odata.error']?.message?.value || data?.error?.message?.value || data?.error?.message || 'HTTP ' + res.status);
        err.status = res.status; throw err;
      }
      return data;
    }
    throw new Error('SharePoint ist gerade ausgelastet');
  }
  function mask(kinds) {
    let lo = 0n, hi = 0n;
    for (const k of kinds) { const b = BigInt(k - 1); if (b < 32n) lo |= 1n << b; else hi |= 1n << (b - 32n); }
    return { High: hi.toString(), Low: lo.toString() };
  }
  async function canManageSite() {
    try { const p = await sp('web/effectivebasepermissions'); return (Number(p.Low) & (1 << 25)) !== 0; } // ManagePermissions
    catch { return false; }
  }

  /* ---------- Listen finden bzw. anlegen ---------- */
  async function createList(siteId, displayName, cols, description = '') {
    const l = await g(`/sites/${siteId}/lists`, { method: 'POST', body: { displayName, description, list: { template: 'genericList' }, columns: cols.map(({ indexed, ...c }) => c) } });
    await indexColumns(siteId, l.id, cols);
    return l;
  }
  async function indexColumns(siteId, listId, cols) {
    try { // Indizes für schnelle Filter (nicht kritisch)
      const have = await getAll(`/sites/${siteId}/lists/${listId}/columns?$select=id,name,indexed`);
      for (const c of cols.filter(c => c.indexed)) {
        const col = have.find(x => x.name === c.name);
        if (col && !col.indexed) await g(`/sites/${siteId}/lists/${listId}/columns/${col.id}`, { method: 'PATCH', body: { indexed: true } });
      }
    } catch (e) { console.warn('Index konnte nicht gesetzt werden', e); }
  }
  async function ensureColumns(siteId, listId, cols) {
    try { // neue Spalten in bestehenden Listen ergänzen (nach Updates)
      const have = new Set((await getAll(`/sites/${siteId}/lists/${listId}/columns?$select=name`)).map(c => c.name));
      for (const { indexed, ...c } of cols) if (!have.has(c.name)) await g(`/sites/${siteId}/lists/${listId}/columns`, { method: 'POST', body: c });
    } catch (e) { if (e.status !== 403) console.warn('Spalten konnten nicht ergänzt werden', e); }
  }
  async function ensureLists() {
    const cached = S.sync.ids;
    if (listsChecked && cached?.site === cfg.siteUrl) return cached;
    const u = new URL(cfg.siteUrl), sitePath = u.pathname.replace(/\/+$/, '');
    let site;
    try { site = await g(`/sites/${u.hostname}:${sitePath}`); }
    catch (e) {
      if (/invalid hostname/i.test(e.message)) {
        let hint = '';
        try { const root = await g('/sites/root?$select=webUrl'); hint = ` Richtige Adresse für config.js: ${root.webUrl}${sitePath}`; } catch { }
        throw new Error(`„${u.hostname}“ ist nicht die SharePoint-Adresse eures Microsoft 365.${hint}`);
      }
      if (e.status === 404 || e.status === 403) throw new Error(`SharePoint-Website nicht gefunden oder kein Zugriff: ${cfg.siteUrl} – ggf. ist Ihr Konto noch nicht freigeschaltet.`);
      throw e;
    }
    const lists = await getAll(`/sites/${site.id}/lists?$select=id,displayName`);
    const out = { site: cfg.siteUrl, siteId: site.id };
    for (const k of KINDS) {
      const def = LISTS[k];
      let l = lists.find(x => x.displayName === def.name);
      if (!l) {
        try { l = await createList(site.id, def.name, def.cols); }
        catch (e) {
          if (e.status === 403 && OPTIONAL.has(k)) continue;
          if (e.status === 403) throw new Error(lists.length
            ? `Kein Zugriff auf „${def.name}“. Ihr Konto ist (noch) nicht für die Zeiterfassung freigeschaltet – bitte an einen Administrator wenden.`
            : 'Kein Zugriff: Ihr Konto ist (noch) nicht für die Zeiterfassung freigeschaltet – bitte an einen Administrator wenden.');
          throw e;
        }
      } else await ensureColumns(site.id, l.id, def.cols);
      out[k] = l.id;
    }
    S.sync.ids = out; listsChecked = true; persist();
    return out;
  }

  /* ---------- Abbildung App-Datensatz <-> SharePoint-Felder ---------- */
  function localRecords(k) {
    switch (k) {
      case 'entries': return S.running ? [...S.entries, { ...S.running, end: null }] : [...S.entries];
      case 'rates': return S.projects.filter(p => p.rate != null && p.rate !== '').map(p => ({ id: p.id, rate: Number(p.rate) }));
      default: return S[k] || [];
    }
  }
  function canon(k, r) {
    switch (k) {
      case 'roles': return { id: r.id, name: r.name || '', upn: r.upn || '', roles: [...(r.roles || [])].sort(), active: !!r.active };
      case 'projects': return { id: r.id, name: r.name, clientId: r.clientId || null, color: r.color || '', billable: !!r.billable, archived: !!r.archived, leadId: r.leadId || null, leadName: r.leadName || '', listId: r.listId || null, memberIds: [...(r.memberIds || [])].sort() };
      case 'rates': return { id: r.id, rate: Number(r.rate) };
      case 'entries': return { id: r.id, description: r.description || '', projectId: r.projectId || null, tagIds: [...(r.tagIds || [])], billable: !!r.billable, start: sec(r.start), end: r.end == null ? null : sec(r.end) };
      default: return { id: r.id, name: r.name };
    }
  }
  const ser = (k, r) => JSON.stringify(canon(k, r));
  function toFields(k, r) {
    const c = canon(k, r);
    switch (k) {
      case 'roles': return { Title: c.name || c.upn, AppId: c.id, Upn: c.upn, Roles: c.roles.join(','), Active: c.active };
      case 'projects': return { Title: c.name, AppId: c.id, ClientAppId: c.clientId || '', Color: c.color, Billable: c.billable, Archived: c.archived, LeadId: c.leadId || '', LeadName: c.leadName, ListId: c.listId || '', MemberIds: c.memberIds.join(',') };
      case 'rates': return { Title: proj(c.id)?.name || c.id, AppId: c.id, Rate: c.rate };
      case 'entries': {
        const p = proj(c.projectId), cl = p && client(p.clientId), h = c.end ? (c.end - c.start) / HOUR : 0;
        return {
          Title: (c.description.replace(/\s+/g, ' ').trim().slice(0, 250)) || '-', Comment: c.description,
          AppId: c.id, UserId: S.sync.userId, UserName: account.name || account.username,
          ProjectAppId: c.projectId || '', ProjectName: p?.name || '', ClientName: cl?.name || '',
          TagAppIds: c.tagIds.join(','), TagNames: c.tagIds.map(tag).filter(Boolean).map(t => t.name).join(', '),
          Billable: c.billable, StartTime: isoS(c.start), EndTime: c.end ? isoS(c.end) : null, Hours: Math.round(h * 100) / 100
        };
      }
      default: return { Title: c.name, AppId: c.id };
    }
  }
  function fromFields(k, f) {
    switch (k) {
      case 'roles': return { id: f.AppId, name: f.Title || '', upn: f.Upn || '', roles: (f.Roles || '').split(',').filter(Boolean).sort(), active: !!f.Active };
      case 'projects': return { id: f.AppId, name: f.Title || '', clientId: f.ClientAppId || null, color: f.Color || '#03a9f4', billable: !!f.Billable, archived: !!f.Archived, leadId: f.LeadId || null, leadName: f.LeadName || '', listId: f.ListId || null, memberIds: (f.MemberIds || '').split(',').filter(Boolean).sort() };
      case 'rates': return { id: f.AppId, rate: Number(f.Rate) };
      case 'entries': return { id: f.AppId, description: f.Comment != null ? f.Comment : f.Title === '-' ? '' : (f.Title || ''), projectId: f.ProjectAppId || null, tagIds: (f.TagAppIds || '').split(',').filter(Boolean), billable: !!f.Billable, start: Date.parse(f.StartTime), end: f.EndTime ? Date.parse(f.EndTime) : null };
      default: return { id: f.AppId, name: f.Title || '' };
    }
  }
  function applyRecords(k, list) {
    switch (k) {
      case 'entries': {
        S.entries = list.filter(r => r.end != null);
        const run = list.filter(r => r.end == null).sort((a, b) => b.start - a.start)[0];
        if (run) { const { end, ...rest } = run; S.running = rest; } else S.running = null;
        break;
      }
      case 'projects': { // Stundensatz kommt aus eigener Liste – lokal vorhandenen Wert behalten
        const old = new Map(S.projects.map(p => [p.id, p]));
        S.projects = list.map(p => ({ ...p, rate: p.rate !== undefined ? p.rate : (old.get(p.id)?.rate ?? null) }));
        break;
      }
      case 'rates': {
        const m = new Map(list.map(r => [r.id, r.rate]));
        S.projects.forEach(p => { p.rate = m.has(p.id) ? m.get(p.id) : null; });
        break;
      }
      default: S[k] = list;
    }
  }

  /* Zeitenlisten: Sammelliste + je Projekt eine Liste */
  const entryListIds = (all = false) => [...new Set([S.sync.ids.entries, ...S.projects.map(p => p.listId).filter(id => id && (all || !noAccess.has(id)))])];
  function targetList(r) {
    const p = proj(r.projectId);
    return p?.listId && !noAccess.has(p.listId) ? p.listId : S.sync.ids.entries;
  }
  const listOf = (k, ids, r) => (k === 'entries' ? targetList(r) : ids[k]);

  /* ---------- Abgleich ---------- */
  async function fetchServer(k, ids) {
    const server = new Map(), dupes = [];
    if (k !== 'entries') {
      const items = await getAll(`/sites/${ids.siteId}/lists/${ids[k]}/items?$expand=fields&$top=500`);
      for (const it of items) if (it.fields?.AppId) server.set(it.fields.AppId, { spId: it.id, listId: ids[k], rec: fromFields(k, it.fields), fields: it.fields });
      return { server, dupes };
    }
    for (const lid of entryListIds()) {
      let items;
      try { items = await getAll(`/sites/${ids.siteId}/lists/${lid}/items?$expand=fields&$top=500&$filter=fields/UserId eq '${S.sync.userId}'`); }
      catch (e) { if ((e.status === 403 || e.status === 404) && lid !== ids.entries) { noAccess.add(lid); continue; } throw e; }
      for (const it of items) {
        if (!it.fields?.AppId) continue;
        const rec = fromFields(k, it.fields), entry = { spId: it.id, listId: lid, rec }, ex = server.get(rec.id);
        if (!ex) server.set(rec.id, entry);
        else if (lid === targetList(rec)) { dupes.push(ex); server.set(rec.id, entry); } // Umzug unterbrochen: Kopie am Ziel behalten
        else dupes.push(entry);
      }
    }
    return { server, dupes };
  }

  async function pull(ids, dupesOut) {
    let changed = false, legacyRates = [];
    for (const k of KINDS) {
      if (!ids[k]) continue;
      let fetched;
      try { fetched = await fetchServer(k, ids); }
      catch (e) { if (OPTIONAL.has(k) && (e.status === 403 || e.status === 404)) continue; throw e; } // z. B. Stundensätze für Mitarbeiter
      const { server, dupes } = fetched;
      dupesOut.push(...dupes);
      if (k === 'projects') for (const [id, s] of server) if (s.fields.Rate != null) legacyRates.push({ id, spId: s.spId, rate: Number(s.fields.Rate) });
      // ab hier synchron: lokale Daten lesen und zusammenführen ohne Unterbrechung
      const shadow = S.sync.shadow[k], local = new Map(localRecords(k).map(r => [r.id, r])), result = [];
      const force = forceServer[k] || !canWrite(k); forceServer[k] = false; // ohne Schreibrecht gilt immer der Serverstand
      for (const [id, { spId, listId, rec }] of server) {
        const l = local.get(id), sh = shadow[id], sj = ser(k, rec);
        if (l && !force) {
          if (sh && ser(k, l) !== sh.json) { result.push(l); sh.spId = spId; sh.listId = listId; } // lokal geändert → lokal gewinnt
          else if (!sh) { result.push(l); shadow[id] = { spId, listId, json: sj }; }                  // erstmals zugeordnet
          else { if (ser(k, l) !== sj) changed = true; result.push(rec); shadow[id] = { spId, listId, json: sj }; }
        } else if (!sh || force) { result.push(rec); shadow[id] = { spId, listId, json: sj }; changed = true; } // neu vom Server
        // sonst: lokal gelöscht, Löschung wird beim Hochladen übertragen
      }
      for (const [id, l] of local) {
        if (server.has(id)) continue;
        if (shadow[id]) {                    // auf dem Server gelöscht
          const untouched = ser(k, l) === shadow[id].json;
          delete shadow[id];
          if (untouched || force) { changed = true; continue; }
        } else if (force) { changed = true; continue; }
        result.push(l);                      // neu oder lokal geändert → wird hochgeladen
      }
      for (const id of Object.keys(shadow)) if (!server.has(id) && !local.has(id)) delete shadow[id];
      applyRecords(k, result);
    }
    await migrateLegacyRates(ids, legacyRates);
    persist();
    return changed;
  }

  // Früher standen Stundensätze in ZE_Projekte (für alle lesbar) → in eigene Liste übernehmen und dort löschen
  async function migrateLegacyRates(ids, legacy) {
    if (!legacy.length || !ids.rates || !myRole().admin) return;
    for (const { id, spId, rate } of legacy) {
      const p = proj(id);
      if (p && p.rate == null) p.rate = rate;
      try { await g(`/sites/${ids.siteId}/lists/${ids.projects}/items/${spId}/fields`, { method: 'PATCH', body: { Rate: null } }); } catch (e) { console.warn(e); }
    }
  }

  // Listen, die noch keine Kommentar-Spalte haben (vor dem Update angelegt): ohne sie schreiben
  async function withFallback(fields, fn) {
    try { return await fn(fields); }
    catch (e) {
      if (e.status === 400 && /not recognized|nicht erkannt/i.test(e.message) && !/comment/i.test(e.message))
        throw new Error('Die SharePoint-Listen sind noch nicht auf dem neuesten Stand – ein Administrator muss die App einmal öffnen.');
      if (e.status !== 400 || !('Comment' in fields) || !/comment/i.test(e.message)) throw e;
      const { Comment, ...rest } = fields;
      return fn(rest);
    }
  }
  async function postItem(ids, k, listId, fields) {
    return withFallback(fields, f => g(`/sites/${ids.siteId}/lists/${listId}/items`, { method: 'POST', body: { fields: f } }));
  }
  async function push(ids, dupes) {
    for (const d of dupes) { try { await g(`/sites/${ids.siteId}/lists/${d.listId}/items/${d.spId}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) console.warn(e); } }
    for (const k of KINDS) {
      if (!ids[k] || !canWrite(k)) continue;
      const shadow = S.sync.shadow[k], recs = localRecords(k), present = new Set(recs.map(r => r.id));
      try {
        for (const r of recs) {
          const sh = shadow[r.id], json = ser(k, r);
          let tgt = listOf(k, ids, r);
          if (sh && sh.json === json && sh.listId === tgt) continue;
          const fields = toFields(k, r);
          if (sh && sh.listId === tgt) {
            try { await withFallback(fields, f => g(`/sites/${ids.siteId}/lists/${tgt}/items/${sh.spId}/fields`, { method: 'PATCH', body: f })); shadow[r.id] = { ...sh, json }; }
            catch (e) { if (e.status === 404) { delete shadow[r.id]; again = true; } else throw e; }
          } else {
            let it;
            try { it = await postItem(ids, k, tgt, fields); }
            catch (e) {
              if (k !== 'entries' || e.status !== 403 || tgt === ids.entries) throw e;
              noAccess.add(tgt); tgt = targetList(r);             // Projektliste noch nicht freigegeben → Sammelliste
              if (sh && sh.listId === tgt) { again = true; continue; }
              it = await postItem(ids, k, tgt, fields);
            }
            if (sh) { try { await g(`/sites/${ids.siteId}/lists/${sh.listId}/items/${sh.spId}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) throw e; } }
            shadow[r.id] = { spId: it.id, listId: tgt, json };
          }
          persist();
        }
        for (const id of Object.keys(shadow)) {
          if (present.has(id)) continue;
          try { await g(`/sites/${ids.siteId}/lists/${shadow[id].listId || ids[k]}/items/${shadow[id].spId}`, { method: 'DELETE' }); }
          catch (e) { if (e.status !== 404) throw e; }
          delete shadow[id]; persist();
        }
      } catch (e) {
        if (e.status !== 403) throw e;
        forceServer[k] = true; again = true;                         // keine Schreibrechte → Serverstand wiederherstellen
        console.warn('Keine Schreibrechte für', k);
      }
    }
  }

  function pendingCount() {
    if (!S.sync?.ids) return 0;
    let n = 0;
    for (const k of KINDS) {
      if (!S.sync.ids[k] || !canWrite(k)) continue;
      const sh = S.sync.shadow[k] || {}, recs = localRecords(k);
      n += recs.filter(r => !sh[r.id] || sh[r.id].json !== ser(k, r)).length;
      n += Object.keys(sh).filter(id => !recs.some(r => r.id === id)).length;
    }
    return n;
  }

  // Schattenkopien aus der Vorversion kennen ihre Liste noch nicht
  function normalizeShadow(ids) {
    for (const k of KINDS) for (const s of Object.values(S.sync.shadow[k])) if (!s.listId) s.listId = ids[k];
  }

  async function bootstrapRoles(ids) {
    // Erste Inbetriebnahme: Website-Besitzer wird Administrator
    if (!ids.roles || (S.roles || []).length || !(await canManageSite())) return;
    S.roles = [{ id: S.sync.userId, name: account.name || account.username, upn: account.username, roles: ['admin', 'ma'], active: true }];
    persist();
  }

  async function sync() {
    if (!enabled || !account) return;
    if (syncing) { again = true; return; }
    if (!navigator.onLine) { setState('offline'); return; }
    syncing = true; setState('syncing');
    try {
      ensureSync();
      const ids = await ensureLists();
      normalizeShadow(ids);
      const dupes = [];
      const changed = await pull(ids, dupes);
      await bootstrapRoles(ids);
      await push(ids, dupes);
      S.sync.lastSync = Date.now(); persist();
      setState(pendingCount() ? 'pending' : 'ok');
      if (changed) window.renderSoft();
      if (myRole().admin) maybeReconcile();
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

  /* =====================================================================
     Rechteabgleich (nur Administratoren)
     ===================================================================== */
  const permSignature = () => JSON.stringify([
    (S.roles || []).map(r => [r.id, r.upn, [...r.roles].sort().join(), r.active]).sort(),
    S.projects.map(p => [p.id, p.leadId || '', p.listId || '', !!p.archived]).sort()
  ]);
  const COLS_VERSION = 2; // erhöhen, wenn Zeitenlisten neue Spalten bekommen
  function maybeReconcile() {
    const pending = S.projects.some(p => !p.listId) || S.sync.permApplied !== permSignature() || S.sync.colsV !== COLS_VERSION;
    if (pending && !perm.running && !perm.error) reconcile();
  }

  async function reconcile() {
    if (!enabled || !account || !myRole().admin) return;
    if (perm.running) { perm.queued = true; return; }
    perm.running = true; perm.error = ''; window.renderSoft();
    try {
      const ids = await ensureLists();
      // 1) Zeitenliste für neue Projekte anlegen
      let listsCreated = false;
      for (const p of S.projects) {
        if (p.listId) continue;
        const name = ('ZE_Zeiten ' + p.name).replace(/[\\/:*?"<>|#%{}~&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) + ' ' + p.id.slice(-5);
        const existing = (await getAll(`/sites/${ids.siteId}/lists?$select=id,displayName`)).find(l => l.displayName === name);
        const l = existing || await createList(ids.siteId, name, ENTRY_COLS, 'Zeiteinträge Projekt ' + p.name);
        p.listId = l.id; listsCreated = true; persist();
      }
      if (listsCreated) save(); // Projekt-Datensätze mit Listen-ID an alle verteilen
      if (S.sync.colsV !== COLS_VERSION) { // neue Spalten in bestehenden Projekt-Zeitenlisten ergänzen
        for (const p of S.projects.filter(p => p.listId)) await ensureColumns(ids.siteId, p.listId, ENTRY_COLS);
        S.sync.colsV = COLS_VERSION; persist();
      }

      // 2) Rechtestufen
      let defs = (await sp('web/roledefinitions?$select=Id,Name,RoleTypeKind')).value;
      for (const d of Object.values(ROLE_DEFS)) {
        if (defs.some(x => x.Name === d.name)) continue;
        await sp('web/roledefinitions', { method: 'POST', body: { __metadata: { type: 'SP.RoleDefinition' }, Name: d.name, Description: d.desc, Order: 180, BasePermissions: { __metadata: { type: 'SP.BasePermissions' }, ...mask(d.kinds) } } });
      }
      defs = (await sp('web/roledefinitions?$select=Id,Name,RoleTypeKind')).value;
      const RD = {
        read: defs.find(d => d.RoleTypeKind === 2).Id, contribute: defs.find(d => d.RoleTypeKind === 3).Id,
        pl: defs.find(d => d.Name === ROLE_DEFS.pl.name).Id, bh: defs.find(d => d.Name === ROLE_DEFS.bh.name).Id
      };

      // 3) Benutzer in SharePoint bekannt machen, Gruppen pflegen
      const spId = async r => {
        if (!S.sync.spIds[r.id]) S.sync.spIds[r.id] = (await sp('web/ensureuser', { method: 'POST', body: { logonName: 'i:0#.f|membership|' + r.upn } })).Id;
        return S.sync.spIds[r.id];
      };
      const all = [];
      for (const r of (S.roles || []).filter(r => r.upn)) {
        try { await spId(r); all.push(r); }
        catch (e) { if (r.active) throw new Error(`Benutzer ${r.name || r.upn} ist in SharePoint nicht bekannt: ${e.message}`); } // gelöschtes Konto: überspringen
      }
      const owners = await sp('web/associatedownergroup?$select=Id'), visitors = await sp('web/associatedvisitorgroup?$select=Id');
      const members = async gid => new Set((await sp(`web/sitegroups(${gid})/users?$select=Id`)).value.map(u => u.Id));
      const setGroup = async (gid, want) => {
        const have = await members(gid);
        for (const r of all) {
          const id = S.sync.spIds[r.id], w = want(r);
          if (w && !have.has(id)) await sp(`web/sitegroups(${gid})/users`, { method: 'POST', body: { __metadata: { type: 'SP.User' }, LoginName: 'i:0#.f|membership|' + r.upn } });
          if (!w && have.has(id) && r.id !== S.sync.userId) await sp(`web/sitegroups(${gid})/users/removebyid(${id})`, { method: 'POST' });
        }
      };
      await setGroup(owners.Id, r => r.active && r.roles.includes('admin'));
      await setGroup(visitors.Id, r => r.active);

      // 4) Rechte je Liste
      const act = all.filter(r => r.active && !r.roles.includes('admin')); // Administratoren über die Besitzergruppe
      const has = (r, x) => r.roles.includes(x), tracks = r => has(r, 'ma') || has(r, 'pl');
      // closed = Projekt abgeschlossen: niemand (außer Besitzern) darf noch schreiben
      const entriesPlan = (leadId, closed) => new Map(act.flatMap(r => {
        const lead = leadId && r.id === leadId && has(r, 'pl');
        const d = closed
          ? (lead || has(r, 'bh') ? RD.bh : tracks(r) ? RD.read : null)
          : (lead || (has(r, 'bh') && tracks(r)) ? RD.pl : has(r, 'bh') ? RD.bh : tracks(r) ? RD.contribute : null);
        return d ? [[S.sync.spIds[r.id], d]] : [];
      }));
      const plan = (fn) => new Map(act.flatMap(r => { const d = fn(r); return d ? [[S.sync.spIds[r.id], d]] : []; }));
      const lists = [
        { id: ids.entries, entries: true, assign: entriesPlan(null) },
        ...S.projects.filter(p => p.listId).map(p => ({ id: p.listId, entries: true, assign: entriesPlan(p.leadId, p.archived) })),
        { id: ids.projects, assign: plan(r => (has(r, 'pl') || has(r, 'bh') ? RD.contribute : RD.read)) },
        { id: ids.clients, assign: plan(r => (has(r, 'bh') ? RD.contribute : RD.read)) },
        { id: ids.tags, assign: plan(() => RD.read) }, // Tags pflegt nur der Administrator
        { id: ids.roles, assign: plan(() => RD.read) },
        { id: ids.rates, assign: plan(r => (has(r, 'bh') ? RD.contribute : has(r, 'pl') ? RD.read : null)) }
      ].filter(l => l.id);
      for (const l of lists) await applyListPerms(l, owners.Id);

      S.sync.permApplied = permSignature(); S.sync.permAt = Date.now(); persist();
    } catch (e) {
      console.error(e);
      perm.error = e.consent
        ? 'Die App darf noch keine SharePoint-Rechte setzen. In Entra ID bei der App-Registrierung die Berechtigung „SharePoint → AllSites.FullControl“ hinzufügen und die Administratorzustimmung erteilen, danach neu anmelden.'
        : e.message;
    } finally {
      perm.running = false; window.renderSoft();
      if (perm.queued) { perm.queued = false; setTimeout(reconcile, 300); }
    }
  }

  async function applyListPerms({ id, assign, entries }, ownersId) {
    const L = `web/lists(guid'${id}')`;
    const info = await sp(`${L}?$select=HasUniqueRoleAssignments`);
    if (!info.HasUniqueRoleAssignments) await sp(`${L}/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=true)`, { method: 'POST' });
    const cur = (await sp(`${L}/roleassignments?$expand=Member,RoleDefinitionBindings`)).value;
    if (!cur.some(a => a.PrincipalId === ownersId)) {
      const full = (await sp('web/roledefinitions?$select=Id,RoleTypeKind')).value.find(d => d.RoleTypeKind === 5).Id;
      await sp(`${L}/roleassignments/addroleassignment(principalid=${ownersId},roledefid=${full})`, { method: 'POST' });
    }
    for (const a of cur) {
      if (a.PrincipalId === ownersId) continue;
      const want = assign.get(a.PrincipalId);
      for (const b of a.RoleDefinitionBindings) {
        if (b.RoleTypeKind === 1 || b.Id === want) continue; // „Beschränkter Zugriff“ verwaltet SharePoint selbst
        await sp(`${L}/roleassignments/removeroleassignment(principalid=${a.PrincipalId},roledefid=${b.Id})`, { method: 'POST' });
      }
    }
    for (const [pid, d] of assign) {
      const a = cur.find(x => x.PrincipalId === pid);
      if (!a || !a.RoleDefinitionBindings.some(b => b.Id === d)) await sp(`${L}/roleassignments/addroleassignment(principalid=${pid},roledefid=${d})`, { method: 'POST' });
    }
    // Zeitenlisten: jeder sieht und bearbeitet nur eigene Einträge (außer Projektleitung, Buchhaltung, Besitzer)
    if (entries) await sp(L, { method: 'POST', merge: true, body: { __metadata: { type: 'SP.List' }, ReadSecurity: 2, WriteSecurity: 2 } });
  }

  /* ---------- Team-Auswertung (alle sichtbaren Zeiten) ---------- */
  function teamEntries(from, to) {
    const key = from + '-' + to;
    if (team.key !== key) { team = { key, status: 'loading', list: [] }; loadTeam(from, to, key); }
    return team;
  }
  async function loadTeam(from, to, key) {
    try {
      ensureSync();
      const ids = await ensureLists(), list = [];
      for (const lid of entryListIds(true)) {
        let items;
        // SharePoint liefert nur, was der Benutzer sehen darf (Projektleitung: eigene Projekte)
        try { items = await getAll(`/sites/${ids.siteId}/lists/${lid}/items?$expand=fields&$top=500&$filter=fields/StartTime ge '${isoS(from)}' and fields/StartTime lt '${isoS(to)}'`); }
        catch (e) { if (e.status === 403 || e.status === 404) continue; throw e; }
        for (const it of items) list.push({ ...fromFields('entries', it.fields), userId: it.fields.UserId, userName: it.fields.UserName || '?' });
      }
      const seen = new Set(), uniq = list.filter(e => e.end != null && e.id && !seen.has(e.id) && seen.add(e.id));
      if (team.key === key) { team = { key, status: 'ok', list: uniq }; render(); }
    } catch (e) {
      if (team.key === key) { team = { key, status: 'error', list: [], error: e.login ? 'Bitte erneut anmelden' : e.message }; render(); }
    }
  }

  /* ---------- Benutzersuche im Microsoft-365-Verzeichnis ---------- */
  async function searchUsers(q) {
    q = q.trim().replace(/'/g, "''");
    if (q.length < 2) return [];
    const d = await g(`/users?$filter=startswith(displayName,'${q}') or startswith(mail,'${q}') or startswith(userPrincipalName,'${q}')&$select=id,displayName,mail,userPrincipalName&$top=15`);
    return d.value.map(u => ({ id: u.id, name: u.displayName, upn: u.userPrincipalName, mail: u.mail || u.userPrincipalName }));
  }

  function settingsHTML() {
    if (!enabled) return `<div class="card"><div class="card-head">Microsoft 365</div><div class="card-body"><p class="muted" style="margin:0">Nicht eingerichtet – die Daten liegen nur auf diesem Gerät. Zum Einrichten die Datei <b>config.js</b> ausfüllen (siehe Anleitung).</p></div></div>`;
    const last = S.sync?.lastSync ? new Date(S.sync.lastSync).toLocaleString('de-DE') : '–';
    const r = myRole(), roleText = Object.keys(ROLE_NAMES).filter(k => r[k]).map(k => ROLE_NAMES[k]).join(', ') || 'keine';
    return `<div class="card"><div class="card-head">Microsoft 365</div><div class="card-body">
      <p style="margin-top:0">${account ? `Angemeldet als <b>${esc(account.name || '')}</b> (${esc(account.username)})<br>Rollen: <b>${esc(roleText)}</b>` : 'Nicht angemeldet'}<br>
      <span class="muted">SharePoint: ${esc(cfg.siteUrl)}<br>Status: ${esc(STATES[state][0])}${message ? ' – ' + esc(message) : ''} · Letzter Abgleich: ${last}</span></p>
      <div class="data-actions">
        ${account ? `<button class="btn ghost small" data-action="cloud-sync">Jetzt synchronisieren</button>
          <button class="btn ghost small" data-action="cloud-logout">Abmelden</button>`
        : `<button class="btn primary small" data-action="cloud-login">Anmelden</button>`}
      </div></div></div>`;
  }

  return {
    enabled, init, sync, changed, login, logout, teamEntries, settingsHTML, searchUsers, myRole, ROLE_NAMES,
    signedIn: () => enabled && !!account,
    inTeams: () => teamsMode,
    config: () => ({ ...cfg }),
    account: () => account,
    meId: () => S.sync?.userId || null,
    reconcile: () => { perm.error = ''; return reconcile(); },
    permStatus: () => ({ running: perm.running, error: perm.error, at: S.sync?.permAt || 0, pendingLists: S.projects.filter(p => !p.listId).length, pending: S.sync?.permApplied !== permSignature() }),
    refreshTeam: () => { team.key = ''; },
    statusClick: () => (state === 'login' ? login() : sync())
  };
})();
window.Cloud = Cloud;
render(); // Ansicht mit Microsoft-365-Elementen neu aufbauen
Cloud.init();
