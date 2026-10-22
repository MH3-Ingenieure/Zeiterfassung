'use strict';
/* =====================================================================
   Zeit diktieren: „Baustellenbegehung TGA Bürogebäude, heute von 9 bis 12 Uhr“
   → Projekt, Datum, Beginn/Ende, Tags und Kommentar werden erkannt,
     zur Kontrolle angezeigt und erst nach Bestätigung gespeichert.
   Spracherkennung: Microsoft Azure Sprachdienst (ein Tipp genügt), sonst das Gerät.
   ===================================================================== */
const DZ_WORDNUM = {
  null: 0, ein: 1, eins: 1, eine: 1, einer: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, 'zwölf': 12, zwoelf: 12, dreizehn: 13, vierzehn: 14, 'fünfzehn': 15, sechzehn: 16, siebzehn: 17, achtzehn: 18,
  neunzehn: 19, zwanzig: 20, einundzwanzig: 21, zweiundzwanzig: 22, dreiundzwanzig: 23
};
const DZ_WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
const DZ_MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const DZ_NUM = `(?:\\d{1,2}(?:[:.]\\d{2})?|${Object.keys(DZ_WORDNUM).sort((a, b) => b.length - a.length).join('|')})`;
// Minuten nach „Uhr“ nur 00–59 und nicht, wenn eine Dauer folgt („14 Uhr 90 Minuten“)
const DZ_PART = `(?:(?:halb|viertel\\s+nach|viertel\\s+vor|dreiviertel)\\s+)?${DZ_NUM}\\.?(?:\\s*uhr(?:\\s+[0-5]\\d(?![.:\\d])(?!\\s*(?:min|std|stund|h\\b)))?)?`;
const DZ_RANGE_RE = new RegExp(`(?:\\b(?:von|ab|um)\\s+)?(${DZ_PART})\\s*(?:-|–|bis(?:\\s+um)?)\\s*(${DZ_PART})`, 'i');
const DZ_START_RE = new RegExp(`\\b(?:ab|um|von)\\s+(${DZ_PART})`, 'i');
const DZ_DUR_RE = new RegExp(`\\b(anderthalb|eineinhalb|eine\\s+halbe|halbe|\\d+(?:[.,]\\d+)?|${Object.keys(DZ_WORDNUM).join('|')})\\s*(stunden|stunde|std\\.?|h|minuten|min)\\b`, 'i');

const dzNorm = s => String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
const dzWordToNum = s => s.replace(new RegExp(`(^|\\s)(${Object.keys(DZ_WORDNUM).join('|')})(?=\\s|$)`, 'gi'), (m, a, w) => a + DZ_WORDNUM[w.toLowerCase()]);

// „halb 9“ → 8:30, „viertel nach 9“ → 9:15, „9 uhr 30“ → 9:30, „9.30“ → 9:30
function dzTime(part) {
  let s = dzWordToNum(part.toLowerCase().replace(/\buhr\b/g, ' ')).replace(/\s+/g, ' ').trim(), m;
  if ((m = s.match(/^halb\s+(\d{1,2})/))) return [(+m[1] + 23) % 24, 30];
  if ((m = s.match(/^viertel\s+nach\s+(\d{1,2})/))) return [+m[1], 15];
  if ((m = s.match(/^(?:viertel\s+vor|dreiviertel)\s+(\d{1,2})/))) return [(+m[1] + 23) % 24, 45];
  if ((m = s.match(/^(\d{1,2})\s*[:.]?\s*(\d{2})?/))) return [+m[1], +(m[2] || 0)];
  return null;
}
const dzHHMM = ([h, m]) => `${pad(h)}:${pad(m)}`;

function dzDuration(m) {
  const v = m[1].toLowerCase(), unit = m[2].toLowerCase();
  let n = /anderthalb|eineinhalb/.test(v) ? 1.5 : /halbe/.test(v) ? 0.5 : DZ_WORDNUM[v] ?? Number(v.replace(',', '.'));
  return unit.startsWith('min') ? n / 60 : n;
}

// Datum: heute, gestern, vorgestern, Wochentag (letzter), 12.10.(2026), 12. Oktober
function dzDate(text) {
  const t = text.toLowerCase(), today = startOfDay(Date.now());
  let m;
  const rel = { heute: 0, gestern: -1, vorgestern: -2 };
  for (const [w, d] of Object.entries(rel)) {
    const re = new RegExp(`\\b${w}\\b`, 'i');
    if (re.test(t)) return { date: dateStr(addDays(today, d)), re };
  }
  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`(?:\\b(?:am|letzten|vergangenen)\\s+)?\\b${DZ_WEEKDAYS[i]}\\b`, 'i');
    if (re.test(t)) { const back = (new Date(today).getDay() - i + 7) % 7; return { date: dateStr(addDays(today, -back)), re }; }
  }
  const reNum = /(?:\bam\s+)?\b(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{2,4}))?/i;
  if ((m = t.match(reNum))) {
    let y = m[3] ? +m[3] : new Date(today).getFullYear(); if (y < 100) y += 2000;
    return { date: `${y}-${pad(+m[2])}-${pad(+m[1])}`, re: reNum };
  }
  const reMon = new RegExp(`(?:\\bam\\s+)?\\b(\\d{1,2})\\.?\\s+(${DZ_MONTHS.join('|')}|maerz)(?:\\s+(\\d{4}))?`, 'i');
  if ((m = t.match(reMon))) {
    const mon = m[2] === 'maerz' ? 3 : DZ_MONTHS.indexOf(m[2]) + 1;
    return { date: `${m[3] || new Date(today).getFullYear()}-${pad(mon)}-${pad(+m[1])}`, re: reMon };
  }
  return { date: null, re: null };
}

// Ähnlichkeit zweier Wörter (bereits normalisiert)
function dzLev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function dzSim(a, b) {
  if (a === b) return 1;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return 0;                // Zahlen nur exakt
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.9;
  if ((a.length >= 5 && b.includes(a)) || (b.length >= 5 && a.includes(b))) return 0.8;
  const l = Math.min(a.length, b.length);
  if (l >= 5 && dzLev(a, b) <= 1) return 0.85;
  if (l >= 8 && dzLev(a, b) <= 2) return 0.75;
  return 0;
}
const DZ_STOP = new Set(['und', 'der', 'die', 'das', 'fur', 'mit', 'von', 'bis', 'uhr', 'projekt', 'heute', 'gestern', 'gmbh', 'fur', 'auf', 'beim', 'bei', 'zum', 'zur', 'den', 'dem', 'des']);

// Projekt: Wörter des Projektnamens (und Kunden) mit dem Text vergleichen
function dzProjects(text) {
  const words = dzNorm(text).split(' ').filter(w => w.length >= 2);
  const scored = visibleProjects().filter(p => !p.archived).map(p => {
    const nameW = dzNorm(p.name).split(' ').filter(w => (w.length >= 3 || /\d/.test(w)) && !DZ_STOP.has(w));
    const cliW = dzNorm(client(p.clientId)?.name || '').split(' ').filter(w => w.length >= 4 && !DZ_STOP.has(w));
    if (!nameW.length) return { p, score: 0, hits: [] };
    // ganzer Projektname im Text (dank Wortliste des Sprachdienstes häufig exakt) → sicherer Treffer
    const full = dzNorm(p.name);
    if (full.length >= 4 && (' ' + words.join(' ') + ' ').includes(' ' + full + ' ')) return { p, score: 1.2, hits: full.split(' ') };
    const hits = [];
    let sum = 0;
    for (const nw of nameW) {
      let best = 0, bw = null;
      for (const w of words) { const s = dzSim(w, nw); if (s > best) { best = s; bw = w; } }
      if (best >= 0.75) { sum += best; hits.push(bw); }
    }
    let score = sum / nameW.length;
    if (score > 0 && cliW.some(cw => words.some(w => dzSim(w, cw) >= 0.8))) score = Math.min(1, score + 0.1);
    if (hits.length && nameW.length > 1 && hits.length === 1) score = Math.max(score, 0.55); // ein markantes Wort genügt oft
    return { p, score, hits };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  const best = scored[0], second = scored[1];
  const sure = best && best.score >= 0.5 && (!second || best.score - second.score >= 0.15);
  return { project: sure ? best.p : null, hits: sure ? best.hits : [], candidates: scored.slice(0, 4).map(x => x.p) };
}

// Tags: „Baustellenbegehung“ → Tag „Begehung“
function dzTags(text) {
  const words = dzNorm(text).split(' ');
  return S.tags.filter(t => dzNorm(t.name).split(' ').filter(w => w.length >= 4).some(tw => words.some(w => w === tw || (tw.length >= 5 && w.includes(tw)) || dzSim(w, tw) >= 0.85))).map(t => t.id);
}

function parseDictation(text) {
  let rest = ' ' + text + ' ';
  const r = { date: null, start: null, end: null, projectId: null, candidates: [], tagIds: [], comment: '', assumed: [] };
  // 1) Uhrzeiten
  let m = rest.match(DZ_RANGE_RE);
  if (m) {
    let a = dzTime(m[1].replace(/^(von|ab|um)\s+/i, '')), b = dzTime(m[2]);
    if (a && b) {
      if (a[0] >= 1 && a[0] <= 6) a[0] += 12;                              // „2 bis 4“ → nachmittags
      if (b[0] * 60 + b[1] <= a[0] * 60 + a[1] && b[0] + 12 < 24 && (b[0] + 12) * 60 + b[1] > a[0] * 60 + a[1]) b[0] += 12; // „9 bis 2“ → 14 Uhr
      r.start = dzHHMM(a); r.end = dzHHMM(b);
    }
    rest = rest.replace(m[0], ' ');
  } else {
    const dm = rest.match(DZ_DUR_RE), sm = rest.match(DZ_START_RE);
    if (dm) {
      const h = dzDuration(dm);
      let a = sm ? dzTime(sm[1]) : null;
      if (sm) rest = rest.replace(sm[0], ' ');
      if (!a) { // Beginn annehmen: Ende des letzten Eintrags an dem Tag oder 8:00
        a = [8, 0]; r.assumed.push('Beginn');
      }
      const endMin = a[0] * 60 + a[1] + Math.round(h * 60);
      r.start = dzHHMM(a); r.end = dzHHMM([Math.floor(endMin / 60) % 24, endMin % 60]);
      rest = rest.replace(dm[0], ' ');
    }
  }
  // 2) Datum (Standard: heute)
  const d = dzDate(rest);
  if (d.date) { r.date = d.date; rest = rest.replace(d.re, ' '); } else { r.date = todayStr(); r.assumed.push('Datum (heute)'); }
  // Beginn aus letztem Eintrag des Tages übernehmen, wenn angenommen
  if (r.assumed.includes('Beginn')) {
    const dayStart = parseDT(r.date, '00:00'), last = S.entries.filter(e => startOfDay(e.start) === dayStart).sort((x, y) => y.end - x.end)[0];
    if (last) {
      const dur = parseDT(r.date, r.end) - parseDT(r.date, r.start);
      r.start = fmtTime(last.end); r.end = fmtTime(last.end + dur);
    }
  }
  // 3) Projekt
  const pr = dzProjects(rest);
  r.projectId = pr.project?.id || null; r.candidates = pr.candidates;
  // erkannte Projektwörter aus dem Kommentar entfernen (Vergleich ohne Umlaute/Satzzeichen)
  if (pr.project) rest = rest.split(/(\s+)/).map(tok => { const n = dzNorm(tok); return n && pr.hits.some(h => n === h || dzSim(n, h) >= 0.85) ? ' ' : tok; }).join('');
  // 4) Tags
  r.tagIds = dzTags(text);
  // 5) Kommentar = Rest ohne Füllwörter
  r.comment = rest.replace(/\b(projekt|für das projekt|für projekt|beim projekt|auf dem projekt|auf projekt)\b/gi, ' ')
    .replace(/(^|\s)[,.;:–-]+(?=\s|$)/g, ' ').replace(/\s+[,.;:]/g, m => m.trim()).replace(/([,.;:])[,.;:\s]*[,.;:]/g, '$1').replace(/\s+/g, ' ')
    .replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '').replace(/\b(von|bis|uhr|am|um|ab|und)$/i, '').trim();
  if (r.comment) r.comment = r.comment[0].toUpperCase() + r.comment.slice(1);
  return r;
}

/* ---------- Spracherkennung ---------- */
// 1. Microsoft Azure Sprachdienst (wenn in config.js eingerichtet): ein Tipp auf das Mikrofon genügt –
//    auf dem iPhone, in Teams und im Browser. Anmeldung mit dem Firmenkonto, kein Schlüssel im Code.
//    Projekt-, Kunden- und Tag-Namen werden dem Dienst als Wortliste mitgegeben (bessere Schreibweise).
// 2. Ersatz ohne Azure: Spracherkennung des Browsers (PC) bzw. Diktierfunktion der Tastatur (iPhone/Teams).
const DZ_SDK_URL = 'https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.53.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js';
const DZ_SDK_SRI = 'sha384-YG0CfpDhvvBF6YvDNHgeAPtRBdnkEnbLtXyPhAfT+dB7uCoCZgcIruOnhmQhJQqv';
const DZ_SCOPE = 'https://cognitiveservices.azure.com/.default';

const dzInTeams = () => !!window.Cloud?.inTeams?.() || window.parent !== window || /Teams\//i.test(navigator.userAgent) || new URLSearchParams(location.search).has('teams');
const dzIsIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const dzAzureCfg = () => { const c = window.APP_CONFIG || {}; return c.speechRegion && c.speechResourceId && window.Cloud?.signedIn?.() ? c : null; };
// Browser-Spracherkennung nur dort, wo sie zuverlässig läuft (nicht iPhone-App, nicht Teams)
const dzWebSpeech = () => (dzIsIOS() || dzInTeams() ? null : (window.SpeechRecognition || window.webkitSpeechRecognition || null));
const dzEngine = () => dzAzureCfg() && navigator.mediaDevices?.getUserMedia ? 'azure' : dzWebSpeech() ? 'web' : 'kbd';

function dzOsHint() {
  const ua = navigator.userAgent;
  if (dzIsIOS()) return 'Ins Textfeld tippen, dann unten auf der Tastatur das <b>Mikrofon 🎤</b> antippen und sprechen.';
  if (/Android/.test(ua)) return 'Ins Textfeld tippen und auf der Tastatur das <b>Mikrofon</b> nutzen.';
  if (/Mac/.test(ua)) return 'Ins Textfeld klicken und <b>zweimal die Fn- bzw. Globus-Taste</b> drücken (Diktat des Mac).';
  if (/Windows/.test(ua)) return 'Ins Textfeld klicken und <b>Windows-Taste + H</b> drücken (Spracheingabe von Windows).';
  return 'Ins Textfeld klicken und die Diktierfunktion des Geräts nutzen.';
}

let dzSdkP = null, dzTok = null;
function dzLoadSdk() {
  if (window.SpeechSDK) return Promise.resolve(window.SpeechSDK);
  return dzSdkP ||= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = DZ_SDK_URL; s.integrity = DZ_SDK_SRI; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window.SpeechSDK); s.onerror = () => { dzSdkP = null; fail(new Error('Sprachbibliothek konnte nicht geladen werden (keine Internetverbindung?)')); };
    document.head.appendChild(s);
  });
}
async function dzToken() { // Token des Firmenkontos für den Sprachdienst, ca. 50 Minuten zwischengespeichert
  if (dzTok && dzTok.exp > Date.now()) return dzTok.t;
  try { dzTok = { t: await Cloud.token([DZ_SCOPE]), exp: Date.now() + 50 * 60000 }; return dzTok.t; }
  catch (e) { const err = new Error('Keine Berechtigung für den Sprachdienst (Zustimmung in Entra oder Rolle „Cognitive Services Speech User“ fehlt).'); err.auth = true; throw err; }
}
// Vorladen, damit der Start nach dem Tipp schnell geht
function dzWarm() { if (dzAzureCfg()) { dzLoadSdk().catch(() => {}); dzToken().catch(() => {}); } }

// Aufnahme über den Azure-Sprachdienst. Das Mikrofon öffnet die App selbst (eigener AudioContext, im Tipp
// erzeugt – nötig für das iPhone) und reicht den Ton als 16-kHz-PCM an den Dienst weiter.
function dzAzureSession({ onText, onState, onEnd }) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume?.();
  let rec, push, stream, proc, src, finalText = '', closed = false, stopTimer, idleTimer;
  const cleanup = () => {
    if (closed) return; closed = true;
    clearTimeout(stopTimer); clearTimeout(idleTimer);
    try { proc?.disconnect(); src?.disconnect(); } catch { }
    stream?.getTracks().forEach(t => t.stop());
    try { push?.close(); } catch { }
    try { ctx.close(); } catch { }
  };
  const finish = (err) => {
    if (closed) return;
    const done = () => { try { rec?.close(); } catch { } cleanup(); onEnd(finalText.trim(), err); };
    if (rec) { try { rec.stopContinuousRecognitionAsync(done, done); } catch { done(); } } else done();
  };
  // Automatisch beenden: 2,5 s Stille nach dem Sprechen, 10 s ohne Sprache am Anfang, höchstens 60 s
  const armIdle = ms => { clearTimeout(idleTimer); idleTimer = setTimeout(() => finish(), ms); };
  stopTimer = setTimeout(() => finish(), 60000);
  (async () => {
    try {
      onState('start');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      if (closed) return cleanup();
      const [SDK, token] = await Promise.all([dzLoadSdk(), dzToken()]);
      if (closed) return cleanup();
      const cfg = dzAzureCfg();
      const sc = SDK.SpeechConfig.fromAuthorizationToken(`aad#${cfg.speechResourceId}#${token}`, cfg.speechRegion);
      sc.speechRecognitionLanguage = 'de-DE';
      sc.setProperty(SDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, '900');
      push = SDK.AudioInputStream.createPushStream(SDK.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1));
      rec = new SDK.SpeechRecognizer(sc, SDK.AudioConfig.fromStreamInput(push));
      // Wortliste: so schreibt der Dienst Projekt- und Tag-Namen richtig
      const pl = SDK.PhraseListGrammar.fromRecognizer(rec), seen = new Set();
      const add = n => { n = String(n || '').trim(); if (n && !seen.has(n)) { seen.add(n); pl.addPhrase(n); } };
      visibleProjects().filter(p => !p.archived).forEach(p => { add(p.name); add(client(p.clientId)?.name); });
      S.tags.forEach(t => add(t.name));
      rec.recognizing = (s, e) => { onText((finalText + ' ' + e.result.text).trim()); armIdle(3500); };
      rec.recognized = (s, e) => {
        if (e.result.reason === SDK.ResultReason.RecognizedSpeech && e.result.text) { finalText = (finalText + ' ' + e.result.text).trim(); onText(finalText); }
        armIdle(2500);
      };
      rec.canceled = (s, e) => { if (e.reason === SDK.CancellationReason.Error) finish(new Error(e.errorDetails || 'Sprachdienst nicht erreichbar')); };
      // Mikrofon → 16 kHz, 16 Bit, mono
      src = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(4096, 1, 1);
      const ratio = ctx.sampleRate / 16000;
      proc.onaudioprocess = ev => {
        if (closed) return;
        const inp = ev.inputBuffer.getChannelData(0), n = Math.floor(inp.length / ratio), out = new Int16Array(n);
        for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, inp[Math.floor(i * ratio)])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
        push.write(out.buffer);
      };
      src.connect(proc); proc.connect(ctx.destination);
      rec.startContinuousRecognitionAsync(() => { onState('listening'); armIdle(10000); }, err => finish(new Error(String(err))));
    } catch (e) {
      finish(e.name === 'NotAllowedError' ? Object.assign(new Error('Die App darf das Mikrofon nicht verwenden.'), { mic: true }) : e);
    }
  })();
  return { stop: () => finish(), abort: () => { closed || (rec ? finish() : (cleanup(), onEnd(finalText, null))); } };
}

// Aufnahme über die Spracherkennung des Browsers (Chrome/Edge am PC)
function dzWebSession({ onText, onState, onEnd }) {
  const SR = dzWebSpeech(), rec = new SR();
  rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = false;
  let text = '', err = null, ended = false;
  let watchdog = setTimeout(() => { try { rec.abort(); } catch { } }, 12000);
  rec.onresult = ev => { text = ''; for (const r of ev.results) text += r[0].transcript; onText(text); clearTimeout(watchdog); watchdog = setTimeout(() => { try { rec.stop(); } catch { } }, 4000); };
  rec.onerror = ev => { if (ev.error !== 'no-speech' && ev.error !== 'aborted') err = Object.assign(new Error(ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Die App darf das Mikrofon nicht verwenden.' : 'Die Spracherkennung ist hier nicht verfügbar.'), { mic: true }); };
  rec.onend = () => { if (ended) return; ended = true; clearTimeout(watchdog); onEnd(text.trim(), err); };
  try { rec.start(); onState('listening'); } catch (e) { ended = true; onEnd('', e); }
  return { stop: () => { try { rec.stop(); } catch { } }, abort: () => { try { rec.abort(); } catch { } } };
}

/* ---------- Dialog ---------- */
// Wird direkt aus dem Tipp auf den roten Knopf aufgerufen: Die Aufnahme startet sofort.
function openDictate() {
  const engine = dzEngine();
  const ex = visibleProjects().find(p => !p.archived)?.name || 'Projektname';
  let res = null, session = null, listening = false, base = '';
  openModal(`<h2>${ic('mic')} Zeit diktieren</h2>
    <div class="dz-rec">
      <button type="button" class="dz-big" id="dz-mic" aria-label="Aufnahme starten oder beenden">${ic('mic')}</button>
      <div class="dz-state" id="dz-state"></div>
    </div>
    <div class="dz-input"><textarea id="dz-text" class="ef-comment" rows="3" placeholder="z. B. „Baustellenbegehung ${esc(ex)}, heute von 9 bis 12 Uhr“"></textarea></div>
    <p class="dz-hint muted small" id="dz-hint"></p>
    <div id="dz-result"></div>
    <div class="modal-actions"><span class="muted small">${engine === 'azure' ? 'Microsoft-Sprachdienst' : 'Spracherkennung des Geräts'} · ${APP_VERSION}</span><span class="grow"></span>
      <button class="btn ghost" data-action="close-modal">Abbrechen</button>
      <button class="btn primary" id="dz-save" disabled>Speichern</button></div>`, m => {
    const ta = $('#dz-text', m), out = $('#dz-result', m), saveBtn = $('#dz-save', m), mic = $('#dz-mic', m), st = $('#dz-state', m), hint = $('#dz-hint', m);
    const setState = s => {
      listening = s === 'listening' || s === 'start';
      mic.classList.toggle('on', s === 'listening'); mic.classList.toggle('wait', s === 'start');
      st.innerHTML = s === 'start' ? 'Mikrofon wird gestartet …'
        : s === 'listening' ? '<b>Ich höre zu …</b> Projekt, Tag und Uhrzeit sagen. Zum Beenden tippen oder kurz schweigen.'
        : s === 'kbd' ? `<b>So diktierst du hier:</b> ${dzOsHint()}`
        : 'Zum Diktieren auf das <b>Mikrofon</b> tippen. Text lässt sich unten auch korrigieren.';
    };
    const draw = () => {
      if (!ta.value.trim()) { out.innerHTML = ''; res = null; saveBtn.disabled = true; return; }
      res = parseDictation(ta.value);
      const projOpts = visibleProjects().filter(p => !p.archived).sort(byName);
      out.innerHTML = `<div class="dz-card">
        <div class="dz-head">Erkannt – bitte prüfen</div>
        <label class="field"><span>Projekt ${res.projectId ? '<span class="dz-ok">✓ erkannt</span>' : '<span class="dz-miss">bitte wählen</span>'}</span>
          <select id="dz-proj"><option value="">– Projekt wählen –</option>${projOpts.map(p => `<option value="${p.id}" ${p.id === res.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        ${!res.projectId && res.candidates.length ? `<div class="dz-cands">Meinst du: ${res.candidates.map(p => `<button type="button" class="chip dz-cand" data-pid="${p.id}">${esc(p.name)}</button>`).join(' ')}</div>` : ''}
        <div class="row3">
          <label class="field"><span>Datum</span><input type="date" id="dz-date" value="${res.date || ''}"></label>
          <div class="field"><span>Beginn ${res.assumed.includes('Beginn') ? '<span class="dz-miss">angenommen</span>' : ''}</span>${timeSelHTML('dz-start', res.start || '')}</div>
          <div class="field"><span>Ende</span>${timeSelHTML('dz-end', res.end || '')}</div>
        </div>
        <div class="field"><span>Tags</span><div class="dz-tags">${S.tags.length ? [...S.tags].sort(byName).map(t => `<button type="button" class="chip dz-tag ${res.tagIds.includes(t.id) ? 'on' : ''}" data-tid="${t.id}">${esc(t.name)}</button>`).join(' ') : '<span class="muted">keine Tags angelegt</span>'}</div></div>
        <label class="field"><span>Kommentar</span><input id="dz-comment" value="${esc(res.comment)}"></label>
        <div class="dz-sum" id="dz-sum"></div>
      </div>`;
      const sum = () => {
        const [s, e] = rangeFrom($('#dz-date', out).value, $('#dz-start', out).value, $('#dz-end', out).value);
        const pid = $('#dz-proj', out).value;
        $('#dz-sum', out).innerHTML = s != null ? `Dauer: <b>${fmtClock(e - s)}</b>` : '<span class="dz-miss">Beginn und Ende fehlen – bitte ergänzen oder z. B. „von 9 bis 12“ sagen.</span>';
        saveBtn.disabled = s == null || (!pid && visibleProjects().some(p => !p.archived));
      };
      out.querySelectorAll('input, select').forEach(i => i.addEventListener('input', sum));
      out.querySelectorAll('.dz-cand').forEach(b => b.addEventListener('click', () => { $('#dz-proj', out).value = b.dataset.pid; sum(); }));
      out.querySelectorAll('.dz-tag').forEach(b => b.addEventListener('click', () => b.classList.toggle('on')));
      sum();
    };
    let deb;
    ta.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(draw, 250); });
    ta.addEventListener('blur', () => { clearTimeout(deb); draw(); });
    const toKeyboard = (msg) => { // Rückfall: Diktierfunktion der Tastatur
      setState('kbd');
      if (msg) hint.innerHTML = `<span class="dz-miss">${esc(msg)}</span>${dzInTeams() ? ' In Teams: Zeiterfassung links mit Rechtsklick → <b>App-Berechtigungen</b> → <b>Medien</b> erlauben.' : ''}`;
      ta.focus();
    };
    const start = () => {
      const eng = dzEngine();
      if (eng === 'kbd') return toKeyboard();
      base = ta.value.trim();
      hint.textContent = '';
      const opts = {
        onText: t => { ta.value = (base ? base + ' ' : '') + t; clearTimeout(deb); deb = setTimeout(draw, 300); },
        onState: setState,
        onEnd: (t, err) => {
          session = null; setState('idle'); draw();
          if (err) toKeyboard(err.message);
          else if (!t && !base) st.innerHTML = 'Nichts verstanden. Nochmal auf das <b>Mikrofon</b> tippen und deutlich sprechen.';
        }
      };
      session = eng === 'azure' ? dzAzureSession(opts) : dzWebSession(opts);
    };
    mic.addEventListener('click', () => { if (session) session.stop(); else start(); });
    UI.onModalClose = () => session?.abort(); // Fenster zu (auch per Klick daneben) → Mikrofon aus
    saveBtn.addEventListener('click', () => {
      const date = $('#dz-date', out).value, [s, e] = rangeFrom(date, $('#dz-start', out).value, $('#dz-end', out).value);
      if (s == null) return;
      const pid = $('#dz-proj', out).value || null, p = proj(pid);
      const tagIds = [...out.querySelectorAll('.dz-tag.on')].map(b => b.dataset.tid);
      S.entries.push({ id: uid(), description: $('#dz-comment', out).value.trim(), projectId: pid, tagIds, billable: !!p?.billable, start: s, end: e });
      save(); closeModal(); render();
      toast(`Gespeichert: ${p ? p.name + ', ' : ''}${fmtD(s)} ${fmtTime(s)}–${fmtTime(e)}`);
    });
    setState('idle');
    start(); // sofort aufnehmen – noch innerhalb des Tipps auf den roten Knopf
  });
}
