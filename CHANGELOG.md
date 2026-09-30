# Zeiterfassung – Änderungsprotokoll

Aktuelles Release: **1.9.5** vom 30.09.2026

Nummerierung: *Hauptversion.Funktion.Korrektur*. Neue Funktionen erhöhen die mittlere Zahl, reine Korrekturen die letzte.
Die gleiche Liste ist in der App unter **Einstellungen → Über diese App → Änderungsprotokoll anzeigen** zu sehen (Quelle: `version.js`).

---

## 1.9.5 – 30.09.2026 – Automatischer Update-Hinweis, Diktieren in Teams
- Hinweis „Neue Version verfügbar – Jetzt aktualisieren“, sobald auf dem Server eine neuere Version liegt.
- Teams zuverlässiger erkannt; dort keine eigene Mikrofon-Anfrage mehr, stattdessen Anleitung zur Diktierfunktion des Geräts.
- Diktierfenster zeigt die Versionsnummer.
- Geänderte Dateien: `app.js`, `dictate.js`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.9.4 – 30.09.2026 – Updates kommen sofort an
- Die App fragt ihre Dateien immer frisch beim Server an statt bis zu 10 Minuten alte Kopien zu verwenden; Offline-Betrieb bleibt erhalten.
- Geänderte Dateien: `sw.js`, `version.js`, `CHANGELOG.md`

## 1.9.3 – 30.09.2026 – Diktieren auf dem iPhone repariert
- iPhone/iPad und Teams: keine Browser-Spracherkennung mehr (hing sich auf); Diktat über die Mikrofontaste der iPhone-Tastatur, Anleitung im Fenster.
- Andere Geräte: Mikrofon-Knopf mit Sicherung (Abbruch nach 12 s ohne Sprache), Abbrechen beendet die Aufnahme.
- Auswertung erst nach kurzer Pause statt bei jedem Zeichen.
- Geänderte Dateien: `dictate.js`, `help.js`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.9.2 – 30.09.2026 – Mikrofon in Teams
- Teams-App-Paket meldet die Mikrofon-Berechtigung an (`devicePermissions: media`); das Paket trägt jetzt die App-Versionsnummer.
- Diktierfenster erklärt bei verweigertem Mikrofon den Ausweichweg über die Diktierfunktion des Geräts (Windows-Taste + H, Mac-Diktat, iPhone-Tastatur).
- Geänderte Dateien: `dictate.js`, `app.js`, `version.js`, `sw.js`, `CHANGELOG.md` – danach **neues Teams-Paket hochladen**

## 1.9.1 – 30.09.2026 – Änderungsprotokoll und Versionsanzeige
- Release-Bezeichnung und Datum unter Einstellungen → „Über diese App“, im Namensmenü und in der Hilfe.
- Änderungsprotokoll in der App und als Datei `CHANGELOG.md` im Repository.
- Geänderte Dateien: `version.js` (neu), `CHANGELOG.md` (neu), `index.html`, `app.js`, `help.js`, `styles.css`, `sw.js`

## 1.9.0 – 30.09.2026 – Zeit diktieren (Spracheingabe)
- Knopf „Zeit diktieren“ auf der Startseite und im Eingabefenster – ohne vorher ein Projekt zu öffnen.
- Erkennt Projekt (auch ungefähr), Datum (heute, gestern, Wochentag, 12.10.), Beginn/Ende („9 bis 12“, „halb neun bis viertel nach elf“), Dauer („90 Minuten“), Tags und Kommentar.
- Kontrollfenster mit Korrekturmöglichkeit vor dem Speichern; Projektvorschläge, wenn nicht eindeutig.
- Geänderte Dateien: `dictate.js` (neu), `index.html`, `app.js`, `help.js`, `styles.css`, `sw.js`

## 1.8.0 – 30.09.2026 – Neue Startseite und Eingabefenster, Rollen-Vorschau
- Startseite ist die Projektübersicht; Klick auf den Projektnamen öffnet die Zeiterfassung für das Projekt.
- Eingabefenster: Projekt → Kommentar (schwarz umrandet) → Tag/€ → Datum, Beginn, Ende → HINZUFÜGEN; Timer optional.
- Eintragsliste mit Projekt als Überschrift, darunter der Kommentar.
- Projektleiter und Mitarbeiter können Projektname/-farbe nicht bearbeiten.
- „Ansicht testen als …“ für Administratoren.

## 1.7.1 – 30.09.2026 – Personenauswahl in Berichten
- Feld „Person“ immer sichtbar, mit allen aktiven Mitarbeitern (Projektleiter: ihr Team).

## 1.7.0 – 29.09.2026 – Projekte abschließen, MH3-Logo
- Projekte abschließen: archiviert, Einträge gesperrt, SharePoint-Liste schreibgeschützt; wieder öffnen möglich.
- MH3-Logo in Kopfzeile und Anmeldebildschirm; Berichte/PDF mit Firmenkopf.

## 1.6.0 – 29.09.2026 – Projektzuordnung
- Mitarbeiter und Projektleiter sehen nur zugeordnete Projekte; Projektleiter ordnen Mitarbeiter zu, Administratoren die Projektleiter.
- Projekte/Kunden legen Administratoren und Buchhaltung an.

## 1.5.0 – 29.09.2026 – Teams-App, Hilfe, Einrichtungsanleitung
- Teams-App mit Anmeldung über Teams, Teams-App-Paket zum Herunterladen.
- Hilfe-Menü in der App; Einrichtungsanleitung (Word).

## 1.4.0 – 29.09.2026 – Tags und Kommentar
- Tags nur durch Administrator; mehrzeiliger Kommentar, vollständig in SharePoint.

## 1.3.0 – 29.09.2026 – Rollen und Rechte
- Rollen Administrator, Projektleiter, Mitarbeiter, Buchhaltung; „Benutzer & Rollen“.
- Je Projekt eine SharePoint-Liste mit automatisch gesetzten Rechten; Stundensätze geschützt.

## 1.2.0 – 29.09.2026 – Stundensätze je Projekt
- Stundensatz bei abrechenbaren Projekten Pflicht; Nutzeranleitung (Word).

## 1.1.0 – 28.09.2026 – Microsoft 365
- Anmeldung mit Firmenkonto, Speicherung in SharePoint, offline-fähig; Benutzermenü.

## 1.0.0 – 28.09.2026 – Erste Version
- Timer und manuelle Erfassung, Projekte, Kunden, Tags, Berichte mit CSV/PDF, iPhone-installierbar.
