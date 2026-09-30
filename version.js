'use strict';
/* =====================================================================
   Version und Änderungsprotokoll der Zeiterfassung
   Bei jeder Änderung: APP_VERSION erhöhen, Eintrag oben in CHANGELOG ergänzen,
   CHANGELOG.md und den Cache-Namen in sw.js mitziehen.
   Nummerierung: Hauptversion.Funktion.Korrektur (z. B. 1.9.1)
   ===================================================================== */
const APP_VERSION = '1.9.3';
const APP_RELEASE_DATE = '30.09.2026';

const CHANGELOG = [
  {
    v: '1.9.3', date: '30.09.2026', title: 'Diktieren auf dem iPhone repariert', items: [
      'Auf iPhone/iPad und in Teams wird die hängende Browser-Spracherkennung nicht mehr verwendet; stattdessen Diktat über die Mikrofontaste der iPhone-Tastatur (Anleitung direkt im Fenster).',
      'Sicherung für den Mikrofon-Knopf auf anderen Geräten: bricht nach 12 s ohne Sprache ab statt einzufrieren; Abbrechen beendet die Aufnahme.',
      'Auswertung erst nach kurzer Pause statt bei jedem Zeichen (flüssiger beim Diktieren).'
    ]
  },
  {
    v: '1.9.2', date: '30.09.2026', title: 'Mikrofon in Teams', items: [
      'Teams-App-Paket meldet die Mikrofon-Berechtigung an (devicePermissions „media“) – neues Paket im Teams Admin Center hochladen.',
      'Teams-Paket trägt jetzt die App-Versionsnummer (steigt mit jedem Release).',
      'Diktierfenster: Ist das Mikrofon nicht erlaubt, erklärt die App den Ausweichweg über die Diktierfunktion des Geräts (Windows-Taste + H, Mac-Diktat, iPhone-Tastatur).'
    ]
  },
  {
    v: '1.9.1', date: '30.09.2026', title: 'Änderungsprotokoll und Versionsanzeige', items: [
      'Release-Bezeichnung und Datum unter Einstellungen → „Über diese App“, im Namensmenü und in der Hilfe.',
      'Änderungsprotokoll in der App (Einstellungen → „Änderungsprotokoll anzeigen“) und als Datei CHANGELOG.md im Repository.'
    ]
  },
  {
    v: '1.9.0', date: '30.09.2026', title: 'Zeit diktieren (Spracheingabe)', items: [
      'Neuer Knopf „Zeit diktieren“ auf der Startseite und im Eingabefenster – ohne vorher ein Projekt zu öffnen.',
      'Erkennt Projekt (auch ungefähr), Datum (heute, gestern, Wochentag, 12.10.), Beginn/Ende („9 bis 12“, „halb neun bis viertel nach elf“), Dauer („90 Minuten“), Tags und Kommentar.',
      'Kontrollfenster mit Korrekturmöglichkeit vor dem Speichern; Projektvorschläge, wenn nicht eindeutig.',
      'Spracheingabe über das Gerät (Mikrofon-Knopf bzw. Mikrofontaste der iPhone-Tastatur).'
    ]
  },
  {
    v: '1.8.0', date: '30.09.2026', title: 'Neue Startseite und Eingabefenster, Rollen-Vorschau', items: [
      'Startseite ist die Projektübersicht; Klick auf den Projektnamen öffnet die Zeiterfassung für das Projekt.',
      'Eingabefenster in der Reihenfolge Projekt → Kommentar (schwarz umrandet) → Tag/€ → Datum, Beginn, Ende → HINZUFÜGEN; Timer nur noch optional.',
      'Nach dem Hinzufügen bleibt das Projekt gewählt, der nächste Beginn wird mit dem letzten Ende vorbelegt.',
      'Eintragsliste: Projekt als Überschrift, darunter der Kommentar.',
      'Projektleiter und Mitarbeiter können Projektname und -farbe nicht mehr bearbeiten.',
      'Administratoren können die Ansicht als Projektleiter, Mitarbeiter oder Buchhaltung testen („Ansicht testen als …“).'
    ]
  },
  {
    v: '1.7.1', date: '30.09.2026', title: 'Personenauswahl in Berichten', items: [
      'Feld „Person“ in den Berichten ist immer sichtbar und enthält alle aktiven Mitarbeiter (Projektleiter: ihr Team).',
      'Bei Auswahl einer Person automatische Aufschlüsselung nach Projekten.'
    ]
  },
  {
    v: '1.7.0', date: '29.09.2026', title: 'Projekte abschließen, MH3-Logo', items: [
      'Projekte können abgeschlossen werden: archiviert, aus der Auswahl entfernt, Einträge gesperrt; die SharePoint-Liste wird schreibgeschützt. Wieder öffnen möglich.',
      'MH3-Logo in der Kopfzeile (hell/dunkel, Wortmarke auf dem iPhone) und auf dem Anmeldebildschirm.',
      'Berichte/PDF mit Firmenkopf (Logo, Zeitraum, Filter, Erstellungsdatum) und verbessertem Drucklayout.'
    ]
  },
  {
    v: '1.6.0', date: '29.09.2026', title: 'Projektzuordnung', items: [
      'Mitarbeiter und Projektleiter sehen nur Projekte, denen sie zugeordnet sind.',
      'Projektleiter ordnen ihren Projekten Mitarbeiter zu (Team); Administratoren ordnen Projektleiter zu.',
      'Projekte und Kunden legen Administratoren und Buchhaltung an; Stundensätze pflegt die Buchhaltung.'
    ]
  },
  {
    v: '1.5.0', date: '29.09.2026', title: 'Teams-App, Hilfe, Einrichtungsanleitung', items: [
      'Zeiterfassung als Teams-App mit Anmeldung über das Teams-Konto; Teams-App-Paket zum Herunterladen für Administratoren.',
      'Hilfe-Menü in der App mit Suche und rollenabhängigen Themen.',
      'Einrichtungsanleitung für Administratoren (Word).'
    ]
  },
  {
    v: '1.4.0', date: '29.09.2026', title: 'Tags und Kommentar', items: [
      'Tags legt nur der Administrator an; alle anderen wählen aus der Liste.',
      'Mehrzeiliges Kommentarfeld; lange Kommentare vollständig in SharePoint (Spalte „Kommentar“).'
    ]
  },
  {
    v: '1.3.0', date: '29.09.2026', title: 'Rollen und Rechte', items: [
      'Rollen Administrator, Projektleiter, Mitarbeiter, Buchhaltung; Verwaltung unter „Benutzer & Rollen“.',
      'Je Projekt eine eigene SharePoint-Liste; die App setzt die Rechte automatisch (Mitarbeiter: nur eigene Zeiten, Projektleiter: ihre Projekte, Buchhaltung: alles lesend).',
      'Stundensätze in geschützter Liste, für Mitarbeiter nicht sichtbar.',
      'Schutz davor, den letzten Administrator zu entfernen.'
    ]
  },
  {
    v: '1.2.0', date: '29.09.2026', title: 'Stundensätze je Projekt', items: [
      'Stundensatz ist bei abrechenbaren Projekten Pflicht; geräteabhängiger Standardsatz entfernt.',
      'Nutzeranleitung (Word).'
    ]
  },
  {
    v: '1.1.0', date: '28.09.2026', title: 'Microsoft 365', items: [
      'Anmeldung mit dem Firmenkonto (Entra ID), Speicherung und Abgleich über SharePoint, offline-fähig.',
      'Benutzermenü (Profil, Synchronisieren, Abmelden), Menü ein-/ausklappbar, Hinweis bei falscher SharePoint-Adresse.'
    ]
  },
  {
    v: '1.0.0', date: '28.09.2026', title: 'Erste Version', items: [
      'Zeiterfassung per Timer und manuell, Einträge nach Woche/Tag, Projekte, Kunden, Tags.',
      'Berichte mit Diagrammen, CSV- und PDF-Export; Einstellungen; auf dem iPhone installierbar (auch offline).'
    ]
  }
];

function openChangelog() {
  openModal(`<h2>Änderungsprotokoll</h2>
    <p class="muted" style="margin-top:-8px">Aktuelles Release: <b>Version ${APP_VERSION}</b> vom ${APP_RELEASE_DATE}</p>
    <div class="cl-list">${CHANGELOG.map(r => `<div class="cl-item">
      <div class="cl-head"><span class="chip ${r.v === APP_VERSION ? 'cl-cur' : ''}">${r.v}</span> <b>${esc(r.title)}</b> <span class="muted small">${r.date}</span></div>
      <ul>${r.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>
    <div class="modal-actions"><span class="grow"></span><button class="btn primary" data-action="close-modal">Schließen</button></div>`);
}
