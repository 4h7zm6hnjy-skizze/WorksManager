WORKSMANAGER 1.8.4 + ERWEITERUNGEN 1.1.0 – FERTIGES UPDATE
Stand: 08.10.2026

Das Paket enthält eine VOLLSTÄNDIGE aktualisierte index.html und alle NEUEN/GEÄNDERTEN Dateien des Updates. Du musst KEINE HTML-Zeile selbst einfügen.

WICHTIG: Dieses Paket ist KEIN alleinstehender Ersatz für dein gesamtes GitHub-Repository. Die bereits vorhandenen Dateien app.js, styles.css, manifest.json, Bilder/Symbole usw. werden WEITER BENÖTIGT und müssen erhalten bleiben.

VOR DEM UPDATE
1. WorksManager öffnen, 'Sicherheit & Backup' aufrufen und ein verschlüsseltes Backup exportieren.
2. In der iPhone-Dateien-App prüfen, dass die Sicherungsdatei tatsächlich vorhanden ist.
3. Passwort/PIN sichern. NICHT die Web-App deinstallieren, Safari-Daten löschen oder GitHub-Repository leeren.

GITHUB-UPLOAD
Repository: 4h7zm6hnjy-skizze/WorksManager
Datei              | Aktion in GitHub
index.html          | GLEICHNAMIGE BESTEHENDE Datei VOLLSTÄNDIG ERSETZEN (kein manuelles Editieren nötig)
worksmanager-plus.js| Gleichnamige Datei ersetzen
sw.js               | Gleichnamige Datei ersetzen
worksmanager-release.json | Gleichnamige Datei ersetzen

Wenn du GitHub auf dem iPhone verwendest: nach Auswahl der jeweiligen Datei 'Edit' bzw. 'Upload files' – ACHTUNG: Manche GitHub-Upload-Ansichten erlauben kein Ersetzen existierender Dateien; dann zuerst die passende Datei im Editor ersetzen. GitHub-Seiten mit gleichem Pfad müssen die neue Version enthalten.

DIE DATEIEN app.js, styles.css, manifest.json und alle Icons BLEIBEN UNVERÄNDERT. DIESE DATEIEN NICHT LÖSCHEN.

NACH DEM UPLOAD
1. App mit Internet öffnen, schließen und erneut öffnen.
2. Auf der Startseite unter 'Meine Arbeitsübersicht' nach 'App-Updates' / 'Updates suchen' suchen.
3. Ganz unten unter 'Private Daten' sollten die zusätzlichen Such-/Statusabschnitte erscheinen.
4. In 'Sicherheit & Backup' die Einstellungen und Speicheranzeige testen.
5. Im Flugmodus Offline-Start und Anzeigen überprüfen. Internetdienste brauchen weiter Internet.

DATENSPEICHER
Die neue index.html ersetzt nur die Benutzeroberfläche und lädt die vorhandene Haupt-App app.js unverändert. Die verschlüsselte IndexedDB wird nicht gelöscht oder absichtlich zurückgesetzt. Trotzdem kann lokale iPhone-Speicherung unabhängig vom App-Code verloren gehen. Regelmäßiges Backup bleibt wichtig.

VERSION
Haupt-App: 1.8.4 (unverändert)
Erweiterungsmodul: 1.1.0
Release-Build: 2026100802
Eine neue Update-Anzeige erscheint nur, wenn online ein höherer Build gefunden wird oder ein aktualisierter Offline-Dienst wartet.
