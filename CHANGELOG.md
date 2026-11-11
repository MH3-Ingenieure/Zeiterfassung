# Zeiterfassung – Änderungsprotokoll

Aktuelles Release: **1.20.0** vom 12.11.2026

Nummerierung: *Hauptversion.Funktion.Korrektur*. Neue Funktionen erhöhen die mittlere Zahl, reine Korrekturen die letzte.
Die gleiche Liste ist in der App unter **Einstellungen → Über diese App → Änderungsprotokoll anzeigen** zu sehen (Quelle: `version.js`).

---

## 1.20.0 – 12.11.2026 – Funktionen mit Stundensätzen je Projekt (Vertrag)
- Ersetzt die einheitlichen Satzarten aus 1.19.0 (Liste `ZE_Satzarten` und Spalten `Rate2`–`Rate4`, `RateLevel`, `RateLevels` bleiben in SharePoint ungenutzt stehen und können gelöscht werden). `COLS_VERSION` und `PERM_VERSION` 4 (neue Spalten und Rechte für `ZE_Funktionen`).
- Projekt umbenennen: `Cloud.projectRenamed` zieht die Spalte `ProjectName` in den Zeitenlisten (Projektliste und Sammelliste) per Graph-`$batch` nach, nur Administrator.
- Rechte: `canSeeRates` nur Administrator und Buchhaltung; Projektleiter verlieren Lesezugriff auf `ZE_Stundensaetze` (Rechteabgleich `PERM_VERSION` 4), behalten die Team-Berichte ohne Beträge.
- Funktionen: gemeinsame Liste `S.functions` (SharePoint `ZE_Funktionen`, Administrator und Buchhaltung schreiben, IDs `f01`…); je Projekt `funcs = [{id, rate}]` (höchstens `FUNC_MAX` = 6) als JSON in `ZE_Stundensaetze` (Spalte `Funcs`, neben `Rate` = Satz ohne Funktion), angebotene Funktionen `funcIds` in `ZE_Projekte` (Spalte `FuncIds`, auch für Mitarbeiter lesbar, ohne Beträge); je Eintrag `funcId` (Spalten `FuncId`, `FuncName` in den Zeitenlisten). Fehlen die neuen Spalten noch, werden leere Werte weggelassen (`withFallback`), damit Mitarbeiter nicht blockiert sind, bevor ein Administrator die App öffnet.
- Auswahl „Funktion“ im Eingabefenster, Bearbeiten-Dialog und Diktat („als Bauleiter“); Berichte/Export (Spalte „Funktion“, Aufschlüsselung nach Funktion) rechnen mit dem Satz der gewählten Funktion; Satz-Rückfall: Funktion → Satz ohne Funktion → erster Funktionssatz.
- Projekt: neue Felder `number`, `title`; `name` bleibt die zusammengesetzte Anzeige „Nummer – Bezeichnung“ (`projName`, `projTitle`), damit Anzeige, Suche, Sortierung, Berichte und Export unverändert funktionieren. Alte Projekte: Bezeichnung = Name.
- SharePoint ZE_Projekte: Spalten `ProjectNumber`, `ProjectTitle` (Title = Anzeigename).
- Diktieren vergleicht die Bezeichnung; genannte Nummer = sicherer Treffer.
- Geänderte Dateien: `app.js`, `cloud.js`, `dictate.js`, `help.js`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.19.0 – 12.11.2026 – Projektnummer, Projektbezeichnung und bis zu 4 Stundensätze
- Projektnummer/-bezeichnung und einheitliche Satzarten (Stundensätze); in 1.20.0 durch Funktionen je Projekt weiterentwickelt (Projektnummer/-bezeichnung siehe 1.20.0).

## 1.18.0 – 11.11.2026 – Zeitraum-Kalender und gespeicherte Berichte für alle
- Testschalter (`betaRangeCal`, `betaSavedReports`) und Karte „Testfunktionen“ entfernt; beide Funktionen immer aktiv. Hilfe ergänzt.
- Geänderte Dateien: `app.js`, `help.js`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.17.1 – 11.11.2026 – TEST: Zeitraum-Kalender verbessert
- Weiterhin nur mit Testschalter; Mouse-over-Vorschau nach dem ersten Klick, Kalender wird beim Wählen von „Benutzerdefiniert“ vollständig ins Bild gescrollt (letzte Wochen waren abgeschnitten), Zeitraum in der Berichtsleiste öffnet ihn direkt.
- Touch: `touch-action: pan-y`, Ziehen zum Markieren nur mit Maus – Wischen blättert wieder.
- Geänderte Dateien: `app.js`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.17.0 – 10.11.2026 – TEST: Zeitraum-Kalender und gespeicherte Berichte
- Kalender (Vorschlag von Kris Johannsen, wie sevDesk): Testschalter `S.settings.betaRangeCal`; Klick Anfang/Klick Ende oder Ziehen; am PC zwei Monate.
- Gespeicherte Berichte: Testschalter `S.settings.betaSavedReports`; neue Liste `ZE_Berichte` (neue Art `reports` im Abgleich, OPTIONAL), Rechte Lesen=alle (ReadSecurity 1), Schreiben=eigene (WriteSecurity 2); `PERM_VERSION` 2 löst den Rechteabgleich einmal neu aus.
- Ohne Schalter unverändert; die Liste ZE_Berichte wird aber angelegt, sobald ein Administrator die Version öffnet (schadet nicht).
- Rückweg: Schalter aus oder Sicherung `Stundenreporting_Sicherung_1.16.0` hochladen.
- Geänderte Dateien: `app.js`, `cloud.js`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.16.0 – 02.11.2026 – Als Administrator für einen Mitarbeiter eintragen
- „Ansicht als … → Mitarbeiter“ fragt die Person ab; normale Maske inkl. Diktieren, Einträge getrennt von `S.entries` (`UI.actAs`), direkte Schreibvorgänge über `Cloud.syncEntriesFor`, neue Einträge per `validateUpdateListItem` an die Person übergeben. Fenster „Stunden nachtragen“ entfällt.
- Geänderte Dateien: `app.js`, `cloud.js`, `dictate.js`, `help.js`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.15.0 – 02.11.2026 – Stunden für Mitarbeiter nachtragen
- „Stunden nachtragen“ für Administratoren (Berichte, Benutzer & Rollen); Eintrag wird direkt in die Projektliste geschrieben, danach wird der Mitarbeiter per `validateUpdateListItem` als Ersteller gesetzt.
- Geänderte Dateien: `app.js`, `cloud.js`, `help.js`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.14.0 – 31.10.2026 – Stapeleingabe per Sprache
- Mehrere Zeitspannen in einem Diktat → mehrere Einträge (Datum gilt weiter bis zum nächsten genannten; Projekt vor oder hinter der Zeitspanne).
- Datumsspannen („vom 28.10. bis 30.10. jeweils“, „Montag bis Mittwoch“) → ein Eintrag pro Tag.
- Kontrollfenster mit Karten, ✕ zum Herausnehmen, „Alle speichern“; Aufnahme bis 3 Minuten, 3,5 s Pause erlaubt.
- Tätigkeit (Tag) je Eintrag; Aufteilung an Satzzeichen/„und“; Tätigkeit am Anfang gilt für alle; Tätigkeitswörter zählen bei der Projektsuche nur schwach.
- Versionsnummer dauerhaft unten in der Menüleiste (Handy: „Mehr“), Klick → Änderungsprotokoll.
- Geänderte Dateien: `dictate.js`, `app.js`, `help.js`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.13.1 – 22.10.2026 – Diktieren: bessere Zuordnung, Timer entfernt
- „zwischen … und … Uhr“; Dauer neben Uhrzeit wird ignoriert; Projektnamen mit Punkt/zusammengeschrieben/anderer Endung; Kommentar enthält nur noch den Rest (ohne Projekt-, Kunden- und Tag-Wörter).
- Genannter Kunde hat Vorrang; Kunde mit nur einem offenen Projekt → automatisch zugeordnet.
- Timer aus der Oberfläche entfernt (START, Umschalter, ▶ Fortsetzen); Hilfe angepasst.
- Geänderte Dateien: `dictate.js`, `app.js`, `help.js`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.13.0 – 22.10.2026 – Diktieren mit einem Tipp (Microsoft-Sprachdienst)
- Roter Knopf „Zeit diktieren“ startet sofort die Aufnahme (iPhone, Teams, Browser); Ende nach kurzer Stille.
- Azure AI Speech mit Anmeldung über das Firmenkonto (Entra-Token, keine Schlüssel im Code); Wortliste aus Projekt-, Kunden- und Tag-Namen.
- Rückfall auf die Diktierfunktion des Geräts; Teams-Paket wieder mit Mikrofon-Berechtigung.
- Neue Einträge in `config.js`: `speechRegion`, `speechResourceId` (auf GitHub direkt bearbeiten).
- Geänderte Dateien: `dictate.js` (wieder da), `app.js`, `cloud.js`, `help.js`, `index.html`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.12.0 – 22.10.2026 – Uhrzeit in 5-Minuten-Schritten
- Beginn/Ende als Auswahl Stunde : Minute (5-Minuten-Takt), im Eingabefenster und beim Bearbeiten; Minute „00“ wird nach Wahl der Stunde vorbelegt.
- Geänderte Dateien: `app.js`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.11.0 – 10.10.2026 – Diktierfunktion entfernt
- „Zeit diktieren“ entfällt (Startseite, Eingabefenster, Hilfe); Teams-Paket ohne Mikrofon-Berechtigung.
- Geänderte Dateien: `app.js`, `help.js`, `index.html`, `version.js`, `sw.js`, `CHANGELOG.md` – `dictate.js` auf GitHub löschen

## 1.10.0 – 02.10.2026 – Berichtsfilter und Export wie Clockify, Benutzerliste, Update-Hinweis
- Berichte: Filterfenster (Zeitraum-Vorgaben wie Clockify, Team/Kunde/Projekt/Tag mit Mehrfachauswahl, nur abrechenbar).
- Berichte: Exportieren als PDF, CSV oder Excel (.xlsx).
- Benutzer & Rollen: Suche, Alle/Aktiv/Inaktiv, Inaktive durchgestrichen.
- Projekte: „Neues Projekt“ unter dem Suchfeld; „Zeit diktieren“ rot und oval (auch in der Zeiterfassung).
- Update-Hinweis an der Wolke oben rechts; Prüfung alle 30 Minuten.
- Geänderte Dateien: `app.js`, `cloud.js`, `help.js`, `styles.css`, `version.js`, `sw.js`, `CHANGELOG.md`

## 1.9.6 – 01.10.2026 – Namenssuche ab dem ersten Buchstaben
- Benutzer hinzufügen: Vorschläge schon nach dem ersten Buchstaben; Suche auch nach Vor- und Nachnamen einzeln, Treffer alphabetisch.
- Geänderte Dateien: `app.js`, `cloud.js`, `version.js`, `sw.js`, `CHANGELOG.md`

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
