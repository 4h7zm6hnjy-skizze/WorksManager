WorksManager — Zusatz-Update 1.0 (Basis: WorksManager v1.8.4)
Stand: 08.10.2026

Enthaltene Dateien:
  sw.js
  worksmanager-plus.js

VORHER: Im WorksManager unter "Sicherheit & Backup" auf "Backup exportieren"
klicken. Die verschluesselte JSON-Datei auf dem iPhone in "Dateien" sichern.
Bitte kontrollieren, ob die Datei dort wirklich angekommen ist, und das
zugehoerige Passwort sicher aufbewahren.

Installation in GitHub (Repository: 4h7zm6hnjy-skizze/WorksManager):
1. Datei "worksmanager-plus.js" in das Hauptverzeichnis hochladen.
2. Danach die bisherige Datei "sw.js" durch die neue Datei "sw.js" ersetzen.
3. index.html, app.js, styles.css und manifest.json NICHT ersetzen.
4. WorksManager online in Safari oeffnen. Die App danach vollstaendig
   schliessen und erneut online oeffnen, damit der neue Service Worker die
   Erweiterung automatisch zur Webseite hinzufuegen kann.
5. Unter der Startseite nach "Dokumente und Eintraege suchen" und
   "App-Status" schauen. Die neue Ansicht erscheint erst nach dem Update
   des Service Workers und dem erneuten Oeffnen der Seite.
6. Offline-Test: Einmal online oeffnen, schliessen, Flugmodus einschalten,
   WLAN abschalten und WorksManager neu oeffnen. Danach einen Testeintrag
   speichern und nach erneutem Oeffnen pruefen.

Neue, zusaetzliche Bereiche:
- Startseite: Suche; Online-/Offline- und Cache-Status; Update-Kontrolle.
- Sicherheit & Backup: Erinnerung nach 30 Tagen, prueft vorhandene
  gespeicherte Dateien, zeigt Browser-Speicher, Anfrage zur persistenten
  Speicherung, automatische Sperre (Standard: 15 Minuten, deaktivierbar).
- Urlaub: Jahresanspruch, Uebertrag und berechneter Resturlaub.
- Krankheit & AU: zusaetzliche Mo-Fr-Arbeitstage ohne NRW-Feiertage;
  keine Aussage zu tatsaechlicher Schichtarbeit oder Entgeltfortzahlung.
- Schichtplan: optionaler 3-Wochen-Rhythmus mit Vorschau; bestehende
  Schichteintraege werden nicht ueberschrieben.

WICHTIG:
- Daten und Passwort liegen weiterhin im vorhandenen lokalen
  verschluesselten WorksManager-Speicher (IndexedDB). Die neuen
  Einstellungen werden im bestehenden verschluesselten Backup mitgesichert.
- Die PWA ist nicht durch die Backup-Erinnerung automatisch extern
  gesichert. Browserdaten koennen verlorengehen. Regelmaessig manuell
  Backups exportieren und ausserhalb des Browsers ablegen.
- Backup-Meldung "letzter Export" bedeutet, dass ein Dateidownload gestartet
  wurde; das ist KEINE Bestaetigung, dass das iPhone die Datei gespeichert hat.
- Keine automatische KI-Fotoanalyse.
- Die Hauptversion bleibt v1.8.4: das Update ist ein zusaetzliches Modul
  (v1.0), keine Umstellung des App-Datenmodells oder neue Hauptversion.
- Andere GitHub-Dateien und insbesondere vorhandene Nutzerdaten nicht loeschen.

Deinstallation/Rollback:
- Vor der Rueckkehr erneut Backup exportieren.
- sw.js auf die alte Version zuruecksetzen. Der Browser aktiviert bei
  einem nachfolgenden Online-Aufruf die alte Offline-Logik; die
  Haupt-App und gespeicherte Daten bleiben erhalten.
- worksmanager-plus.js kann danach entfernt werden.
- Falls ein defekter Cache die App blockiert, im Browser Cache gezielt
  aktualisieren. NICHT wahllos Websitedaten loeschen, denn dadurch koennen
  die verschluesselten Eintraege verloren gehen.
