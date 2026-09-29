'use strict';
/* =====================================================================
   Hilfe innerhalb der Anwendung
   Jedes Thema: für wen (roles), Titel, Inhalt (HTML).
   roles: 'all' = alle, sonst eine oder mehrere von admin, pl, bh
   ===================================================================== */
const HELP = [
  {
    roles: 'all', title: 'Erste Schritte', body: `
    <p>Die Zeiterfassung erfasst Ihre Arbeitszeit je <b>Projekt</b>, mit <b>Tags</b> (Art der Tätigkeit, z. B. „Ortstermin“) und einem <b>Kommentar</b> (was genau Sie gemacht haben).</p>
    <ul>
      <li><b>Anmelden:</b> mit Ihrem Microsoft-365-Firmenkonto. In Teams geschieht das automatisch.</li>
      <li><b>Links im Menü</b> (auf dem iPhone unten bzw. unter „Mehr“): Zeiterfassung, Berichte, Projekte, Kunden, Tags, Einstellungen, Hilfe.</li>
      <li><b>Oben rechts:</b> das Wolken-Symbol zeigt, ob alles übertragen ist; Ihr Name öffnet das Benutzermenü (Profil, Synchronisieren, Abmelden).</li>
      <li><b>Drei Striche ☰ oben links:</b> Menü ein- und ausklappen.</li>
    </ul>`
  },
  {
    roles: 'all', title: 'Zeit mit dem Timer erfassen', body: `
    <ol>
      <li>Oben in das Feld <b>„Woran arbeitest du? (Kommentar)“</b> eintragen, was Sie tun – z. B. „Begehung Heizraum mit Hausmeister“.</li>
      <li>Auf <b>„+ Projekt“</b> tippen und das Projekt wählen (Suche nach Projekt- oder Kundenname möglich).</li>
      <li>Auf das <b>Etikett-Symbol</b> tippen und einen oder mehrere <b>Tags</b> wählen, z. B. „Ortstermin“.</li>
      <li>Das <b>€-Symbol</b> zeigt, ob die Zeit abrechenbar ist – es wird vom Projekt vorbelegt und muss meist nicht geändert werden.</li>
      <li><b>START</b> tippen. Die Zeit läuft – auch wenn Sie die App schließen oder das iPhone sperren.</li>
      <li>Am Ende <b>STOPP</b> tippen. Der Eintrag steht in der Liste darunter.</li>
    </ol>
    <p>Versehentlich gestartet? Mit dem <b>Papierkorb</b> neben STOPP verwerfen.<br>
    Tipp: Wählen Sie eine früher verwendete Beschreibung aus den Vorschlägen, werden Projekt und Tags automatisch übernommen.</p>`
  },
  {
    roles: 'all', title: 'Zeit nachträglich eintragen', body: `
    <ol>
      <li>Rechts neben START auf das <b>Listen-Symbol</b> tippen (manuelle Eingabe). Das Uhr-Symbol schaltet zurück zum Timer.</li>
      <li>Kommentar, Projekt und Tags wie beim Timer festlegen.</li>
      <li><b>Beginn</b>, <b>Ende</b> und <b>Datum</b> eintragen – die Dauer wird angezeigt. Arbeit über Mitternacht wird erkannt.</li>
      <li><b>HINZUFÜGEN</b> tippen.</li>
    </ol>`
  },
  {
    roles: 'all', title: 'Tags und Kommentar – was gehört wohin?', body: `
    <ul>
      <li><b>Tag</b> = die <b>Art</b> der Tätigkeit aus einer festen Liste, z. B. Besprechung, Ortstermin, Baubesprechung. Mehrere Tags pro Eintrag sind möglich. Die Liste pflegt der Administrator; fehlt ein passender Tag, bitte dort melden.</li>
      <li><b>Kommentar</b> = Ihre eigene Beschreibung, <b>was genau</b> Sie gemacht haben. Im Bearbeiten-Dialog ist das Feld mehrzeilig – dort können Sie auch längere Texte schreiben.</li>
    </ul>
    <p>Beispiel: Tag „Ortstermin“ + Kommentar „Begehung Heizraum mit Hausmeister, Mängel an Pumpe P2 aufgenommen“.</p>`
  },
  {
    roles: 'all', title: 'Einträge ändern, fortsetzen, löschen', body: `
    <ul>
      <li><b>Ändern:</b> auf Kommentar oder Uhrzeit des Eintrags tippen → Dialog mit Kommentar, Projekt, Tags, abrechenbar, Datum, Beginn und Ende → <b>Speichern</b> (am PC auch Strg + Enter).</li>
      <li><b>Projekt oder Tags schnell ändern:</b> direkt auf den farbigen Projektnamen bzw. das Etikett im Eintrag tippen.</li>
      <li><b>Fortsetzen ▶:</b> startet einen neuen Timer mit gleichem Kommentar, Projekt und Tags.</li>
      <li><b>Duplizieren / Löschen:</b> über die drei Punkte ⋮. Nach dem Löschen lässt sich das einige Sekunden mit „Rückgängig“ zurücknehmen.</li>
      <li>Die Liste zeigt die letzten Wochen mit Tages- und Wochensummen; ältere Einträge unten mit <b>„Ältere Einträge laden“</b>.</li>
    </ul>`
  },
  {
    roles: 'all', title: 'Berichte und Export', body: `
    <ol>
      <li>Links auf <b>Berichte</b>.</li>
      <li>Zeitraum wählen: <b>Tag, Woche, Monat, Jahr</b> (mit den Pfeilen blättern) oder <b>Zeitraum</b> mit Von/Bis.</li>
      <li>Bei Bedarf filtern: Projekt, Kunde, Tag, abrechenbar, Suchbegriff im Kommentar.</li>
      <li>Sie sehen Summen, ein Diagramm, eine <b>Aufschlüsselung</b> (nach Projekt, Kunde, Tag, Beschreibung oder Datum) und den <b>Einzelnachweis</b>.</li>
      <li><b>CSV</b> lädt eine Datei für Excel. <b>PDF / Drucken</b> öffnet den Druckdialog – dort „Als PDF speichern“ wählen. Der Ausdruck enthält oben den Firmenkopf mit MH3-Logo, Zeitraum, Filter und Erstellungsdatum.</li>
    </ol>
    <p>Mitarbeiter sehen nur ihre eigenen Zeiten und keine Beträge. Projektleiter, Buchhaltung und Administratoren haben zusätzlich die Team-Auswertung (siehe unten).</p>`
  },
  {
    roles: 'all', title: 'Offline arbeiten und Wolken-Symbol', body: `
    <p>Jede Eingabe wird sofort auf dem Gerät gespeichert und nach wenigen Sekunden nach SharePoint übertragen. Ohne Netz arbeiten Sie normal weiter; übertragen wird, sobald wieder Internet da ist.</p>
    <table class="tbl">
      <tr><th>Anzeige</th><th>Bedeutung / was tun</th></tr>
      <tr><td>Synchron</td><td>Alles übertragen.</td></tr>
      <tr><td>Sync … / Ausstehend</td><td>Übertragung läuft gleich – nichts tun.</td></tr>
      <tr><td>Offline</td><td>Kein Internet – normal weiterarbeiten.</td></tr>
      <tr><td>Anmelden (rot)</td><td>Anmeldung abgelaufen – antippen und Konto wählen.</td></tr>
      <tr><td>Fehler (rot)</td><td>Einstellungen → Microsoft 365: Meldung lesen und ggf. an den Administrator geben.</td></tr>
    </table>
    <p>Hinweis: Innerhalb von Teams ist eine Internetverbindung nötig. Für die Erfassung ohne Netz die App zusätzlich auf dem iPhone installieren (nächster Punkt).</p>`
  },
  {
    roles: 'all', title: 'Auf dem iPhone und in Teams', body: `
    <p><b>In Teams:</b> links in der Leiste (iPhone: Teams-App → „Mehr“) auf <b>Zeiterfassung</b> tippen – fertig.</p>
    <p><b>Als eigene App auf dem iPhone</b> (auch ohne Netz nutzbar):</p>
    <ol>
      <li>Die Adresse der Zeiterfassung in <b>Safari</b> öffnen.</li>
      <li>Unten auf das <b>Teilen-Symbol</b> (Quadrat mit Pfeil) → <b>„Zum Home-Bildschirm“</b> → <b>„Hinzufügen“</b>.</li>
      <li>Die App über das neue blaue Uhr-Symbol starten und anmelden.</li>
    </ol>
    <p>Wichtig: danach immer über das Symbol auf dem Home-Bildschirm arbeiten, nicht in Safari.</p>`
  },
  {
    roles: 'all', title: 'Wer sieht meine Zeiten?', body: `
    <ul>
      <li><b>Sie selbst</b> – immer.</li>
      <li><b>Der Projektleiter</b> des jeweiligen Projekts – nur die Zeiten auf seinen Projekten.</li>
      <li><b>Buchhaltung</b> und <b>Administratoren</b> – alle Zeiten.</li>
    </ul>
    <p>Andere Mitarbeiter sehen Ihre Zeiten nicht – weder in der App noch in SharePoint.</p>`
  },
  {
    roles: 'all', title: 'Welche Projekte sehe ich?', body: `
    <p>Mitarbeiter und Projektleiter sehen nur die Projekte, denen sie <b>zugeordnet</b> sind:</p>
    <ul>
      <li><b>Projektleiter</b> ordnet der Administrator einem Projekt zu.</li>
      <li><b>Mitarbeiter</b> ordnet der jeweilige Projektleiter seinem Projekt zu (Team).</li>
    </ul>
    <p>Fehlt Ihnen ein Projekt in der Auswahl, wenden Sie sich an den Projektleiter. Administratoren und Buchhaltung sehen alle Projekte.</p>`
  },
  {
    roles: ['admin', 'pl'], title: 'Team zuordnen (Projektleiter)', body: `
    <ol>
      <li>Links auf <b>Projekte</b>. Sie sehen die Projekte, deren Projektleiter Sie sind.</li>
      <li>Beim Projekt auf das <b>Personen-Symbol</b> (Team zuordnen) tippen.</li>
      <li>Die Mitarbeiter anhaken, die auf dieses Projekt Zeiten erfassen sollen (Suche oben) → <b>Speichern</b>.</li>
    </ol>
    <p>Die angehakten Personen sehen das Projekt sofort in ihrer Auswahl. Sie als Projektleiter sehen deren Zeiten unter <b>Berichte → „Team meiner Projekte“</b>. Häkchen entfernen nimmt jemanden aus dem Team; bereits erfasste Zeiten bleiben erhalten.</p>`
  },
  {
    roles: ['admin', 'bh'], title: 'Projekte und Kunden anlegen (Buchhaltung, Administratoren)', body: `
    <ol>
      <li>Links auf <b>Projekte</b> → <b>NEUES PROJEKT</b>.</li>
      <li>Name, Kunde, Farbe festlegen. Den <b>Projektleiter</b> wählt der Administrator aus.</li>
      <li><b>„Einträge standardmäßig abrechenbar“</b> anhaken, wenn die Zeiten abgerechnet werden – dann ist der <b>Stundensatz Pflicht</b>.</li>
      <li><b>Speichern.</b></li>
    </ol>
    <ul>
      <li>Ein neues Projekt sieht zunächst niemand außer Administratoren und Buchhaltung. Erst wenn der Administrator den Projektleiter und dieser sein Team zuordnet, erscheint es bei diesen Personen.</li>
      <li>Neue Projekte bekommen ihre SharePoint-Rechte, sobald ein Administrator die App öffnet (bis dahin „Rechte ausstehend“).</li>
      <li><b>Projekt abschließen</b> (Karton-Symbol): Das Projekt wird archiviert und <b>geschlossen</b> – es verschwindet aus der Auswahl, es können keine Zeiten mehr erfasst oder geändert werden (auch nicht direkt in SharePoint). Alle Zeiten bleiben in den Berichten. Mit „Abgeschlossene anzeigen“ und dem Pfeil-Symbol lässt es sich wieder öffnen. <b>Löschen</b> können nur Administratoren.</li>
      <li><b>Kunden</b>: links auf Kunden → Namen eintragen → HINZUFÜGEN.</li>
    </ul>`
  },
  {
    roles: ['admin'], title: 'Administration: Projektleiter zuordnen', body: `
    <ol>
      <li>Links auf <b>Projekte</b> → beim Projekt auf den <b>Stift</b>.</li>
      <li>Unter <b>Projektleiter</b> die Person wählen (sie braucht die Rolle Projektleiter unter Benutzer & Rollen) → <b>Speichern</b>.</li>
      <li>Der Projektleiter sieht das Projekt danach und ordnet sein Team zu. Administratoren können das Team ebenfalls über das Personen-Symbol pflegen.</li>
    </ol>
    <p>In der Projektliste steht „fehlt“, wenn noch kein Projektleiter zugeordnet ist.</p>`
  },
  {
    roles: ['admin', 'pl', 'bh'], title: 'Team-Auswertung (Projektleiter, Buchhaltung, Administratoren)', body: `
    <ol>
      <li>Links auf <b>Berichte</b>.</li>
      <li>Oben statt „Meine Zeiten“ wählen: <b>„Team meiner Projekte“</b> (Projektleiter) bzw. <b>„Alle Mitarbeiter“</b> (Buchhaltung, Administratoren).</li>
      <li>Optional eine Person auswählen; mit ⟳ die Daten neu laden.</li>
      <li>Aufschlüsselung „nach Mitarbeiter“ zeigt die Stunden je Person; der Einzelnachweis enthält Name, Kommentar, Projekt und Betrag.</li>
      <li>Export über <b>CSV</b> (Excel) oder <b>PDF / Drucken</b>.</li>
    </ol>
    <p>Beträge = Stunden × Stundensatz des Projekts, nur für abrechenbare Zeiten.</p>`
  },
  {
    roles: ['admin'], title: 'Administration: Benutzer & Rollen', body: `
    <ol>
      <li>Links auf <b>Benutzer & Rollen</b> → <b>BENUTZER HINZUFÜGEN</b> → Namen eintippen → Person aus Microsoft 365 wählen (erhält zunächst „Mitarbeiter“).</li>
      <li>Rollen per Häkchen: <b>Administrator</b> (alles, ordnet Projektleiter zu), <b>Projektleiter</b> (seine Projekte, ordnet Mitarbeiter zu, Team-Auswertung), <b>Mitarbeiter</b> (zugeordnete Projekte, eigene Zeiten), <b>Buchhaltung</b> (legt Projekte an, sieht alles mit Beträgen).</li>
      <li>Die App setzt die Rechte in SharePoint automatisch; oben steht dann „Rechte aktuell“. Sofort anstoßen mit <b>„Rechte jetzt abgleichen“</b>.</li>
      <li><b>Austritt:</b> „Aktiv“ abwählen – der Zugriff wird entzogen, die Zeiten bleiben erhalten. Bei Projektleitern einen Nachfolger im Projekt eintragen.</li>
    </ol>
    <p>Es muss immer mindestens einen Administrator geben. Wer selbst Zeiten erfasst, braucht „Mitarbeiter“ (Projektleiter können immer erfassen).</p>`
  },
  {
    roles: ['admin'], title: 'Administration: Tags pflegen', body: `
    <ol>
      <li>Links auf <b>Tags</b>.</li>
      <li>Namen eintragen (z. B. Besprechung, Ortstermin, Baubesprechung, Protokoll, Reise, Büroarbeit) → <b>HINZUFÜGEN</b>.</li>
      <li>Stift = umbenennen (wirkt auf alle bisherigen Einträge), Papierkorb = löschen (der Tag verschwindet aus den Einträgen).</li>
    </ol>
    <p>Nur Administratoren können Tags anlegen; alle anderen wählen aus dieser Liste.</p>`
  },
  {
    roles: ['admin'], title: 'Administration: Teams-App und Updates', body: `
    <ul>
      <li><b>Teams-App-Paket:</b> Benutzer & Rollen → „Teams-App-Paket herunterladen“ → im Teams Admin Center (admin.teams.microsoft.com → Teams-Apps → Apps verwalten → „Hochladen einer neuen App“) hochladen und über die Einrichtungsrichtlinien anheften. Details: Einrichtungsanleitung, Kapitel „Verteilung über Teams“.</li>
      <li><b>Updates der App:</b> neue Programmdateien auf GitHub hochladen – <b>config.js nie überschreiben</b>. Alle erhalten das Update beim nächsten Öffnen.</li>
      <li><b>Neues Teams-Paket</b> ist nur nötig, wenn sich die Adresse der App ändert.</li>
    </ul>`
  },
  {
    roles: 'all', title: 'Häufige Fragen', body: `
    <ul>
      <li><b>„Kein Zugriff: Ihr Konto ist nicht freigeschaltet“</b> – der Administrator muss Sie unter Benutzer & Rollen eintragen.</li>
      <li><b>Timer vergessen zu stoppen?</b> Stoppen, Eintrag antippen, Ende korrigieren.</li>
      <li><b>Falsches Projekt?</b> Im Eintrag auf den Projektnamen tippen und das richtige wählen.</li>
      <li><b>Einträge fehlen auf dem anderen Gerät?</b> Auf beiden Geräten auf das Wolken-Symbol tippen; beide müssen mit demselben Konto angemeldet sein.</li>
      <li><b>Passender Tag fehlt?</b> Beim Administrator melden – bis dahin den Kommentar nutzen.</li>
      <li><b>Projekt fehlt in der Auswahl?</b> Sie sind dem Projekt noch nicht zugeordnet – bitte an den Projektleiter wenden.</li>
      <li><b>Eintrag lässt sich nicht ändern („abgeschlossen“)?</b> Das Projekt wurde abgeschlossen. Korrekturen nur noch durch einen Administrator.</li>
      <li><b>Betrag ist 0 €?</b> Beim Projekt fehlt der Stundensatz oder der Eintrag ist nicht abrechenbar (€).</li>
    </ul>`
  }
];

function viewHelp() {
  const r = role();
  const visible = HELP.filter(h => h.roles === 'all' || r.local || h.roles.some(x => r[x]));
  return `<div class="page help-page">
    <div class="page-head"><h1>Hilfe</h1></div>
    <input type="search" id="help-q" class="help-search" placeholder="Hilfe durchsuchen … z. B. „nachtragen“, „Tag“, „iPhone“" autocomplete="off">
    <div id="help-list">${visible.map((h, i) => `
      <details class="card help-item" ${i === 0 ? 'open' : ''}>
        <summary>${esc(h.title)}${h.roles !== 'all' ? ' <span class="chip">' + h.roles.map(x => ({ admin: 'Administrator', pl: 'Projektleiter', bh: 'Buchhaltung' })[x]).join(' · ') + '</span>' : ''}</summary>
        <div class="help-body">${h.body}</div>
      </details>`).join('')}</div>
    <p id="help-none" class="muted" hidden>Nichts gefunden. Anderen Begriff versuchen.</p>
  </div>`;
}
// Suche: Groß/klein und Umlaute egal, Wortstamm genügt („nachtragen“ findet „nachträglich“)
const norm = s => s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
const stem = w => (w.length > 5 ? w.slice(0, Math.max(4, w.length - 3)) : w);
function afterHelp() {
  const q = $('#help-q'), items = $$('.help-item');
  q.addEventListener('input', () => {
    const t = q.value.trim().toLowerCase(), words = norm(t).split(/\s+/).filter(Boolean).map(stem);
    let n = 0;
    for (const d of items) {
      const text = norm(d.textContent);
      const hit = !t || words.some(w => text.includes(w));
      d.hidden = !hit; if (hit) n++;
      d.open = !!t && hit;
    }
    if (!t && items[0]) items[0].open = true;
    $('#help-none').hidden = n > 0;
  });
}
