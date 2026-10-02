# WorksManager v1.8.4

Private, lokal verschlüsselte Arbeits- und Dokumentenverwaltung.

## Enthalten
- Firma & Arbeitsvertrag
- Schichtplan mit manuellen Schichten und Foto-/Dokumentenablage
- BEM, AMZ und Gespräche
- Aushänge
- Lohnabrechnung, Stempelübersicht und Arbeitsplan
- Krankheit & AU: Foto plus Von-/Bis-Datum, ohne OCR oder automatische Analyse
- Monatliche und jährliche AU-Statistik mit eindeutigen Krankheitstagen
- Kind krank und Reha
- Treppenzähler mit Datum, Uhrzeit, Grund sowie Monats- und Jahresstatistik
- Jahresstatistik als PDF
- Verschlüsselter Backup-Export und -Import einschließlich gespeicherter Dateien

## v1.5.0 – vollständige Stabilitätsprüfung
- Kritischen Entsperr-/Speicherfehler behoben: Ein Fehler in der Jahresbericht-Anzeige konnte die Oberfläche sichtbar lassen, obwohl der Verschlüsselungsschlüssel verworfen worden war.
- Jahresbericht-Funktionen vervollständigt und gegen Anzeige-Fehler isoliert.
- Fotos und PDFs werden getrennt vom Hauptdatensatz verschlüsselt in IndexedDB gespeichert; alte eingebettete Dateien werden beim Entsperren migriert.
- Speichern, Öffnen und Löschen für AU, Arbeitsverträge, Abrechnung, Aushänge und weitere Anhänge vereinheitlicht.
- AU-Löschung funktioniert über ID mit Index-Fallback für ältere Datensätze.
- Überlappende AU-Zeiträume werden in Monats- und Jahresstatistiken nicht doppelt gezählt.
- Datumsberechnungen sind UTC-/DST-sicher und ungültige Kalenderdaten werden verworfen.
- Alte Gesundheitsdaten/-anhänge werden nicht mehr in die aktuelle App-Struktur übernommen.
- Backup v3 enthält den verschlüsselten Hauptdatensatz und getrennt gespeicherte verschlüsselte Dateien.
- Service Worker aktualisiert WorksManager netzwerkbevorzugt und löscht nur eigene alte WorksManager-Caches.
- iPhone/PWA-Darstellung gegen horizontales Überlaufen und Formular-Zoom gehärtet.
- Asynchrone Speicheraktionen erhalten zentrale Fehlerbehandlung; ein Fehler in einem einzelnen Renderer sperrt die App nicht mehr.
- Initialisierung meldet verständlich, wenn IndexedDB nicht geöffnet werden kann.
- Veraltete OCR-/Scanner-Reste aus dem aktiven Code und Styling entfernt.

## Datenschutz
Es findet keine OCR, Texterkennung oder automatische Fotoanalyse statt. Der Hauptdatensatz und gespeicherte Dateien werden lokal mit AES-GCM verschlüsselt. Der Schlüssel wird aus dem eingegebenen Passwort/PIN abgeleitet und nicht dauerhaft gespeichert.

Copyright Marcel Hentschel.


## v1.6.0 – Mehrere Fotos / Dateien pro Upload

- Alle Foto-/Dokument-Uploads unterstützen Mehrfachauswahl.
- Mehrere AU-Fotos werden als eine Krankschreibung mit einem gemeinsamen Zeitraum gespeichert.
- Mehrseitige Arbeitsverträge, Abrechnungen, Stempelübersichten, Arbeitspläne, Aushänge und weitere Anhänge können gemeinsam abgelegt werden.
- Alte Einträge mit nur einer Datei bleiben kompatibel.
- Öffnen, Löschen, Backup und Jahresstatistik berücksichtigen alle Dateien eines Eintrags.

## v1.5.1 – Komplettprüfung und Fehlerkorrekturen
- Versionsabgleich zwischen HTML und JavaScript ergänzt, damit gemischte Cache-Versionen erkannt werden.
- Foto-/PDF-Erkennung robuster gemacht, auch wenn ein Gerät keinen MIME-Typ liefert.
- Öffnen älterer Bild-/PDF-Dateien mit fehlendem MIME-Typ verbessert.
- Ungültige Dateitypen werden vor dem Speichern abgefangen.
- Gespräche benötigen jetzt ein Datum; Kind-krank-Einträge benötigen Von- und Bis-Datum; manuelle Schichten benötigen Datum und Schichtname.
- Backup-Import wird vor dem Überschreiben vollständig mit dem Backup-Passwort geprüft; Hauptdaten und verschlüsselte Dateien werden kryptografisch validiert.
- Nach erfolgreichem Backup-Import bleibt die App mit dem geprüften Backup entsperrt.
- Backup-Export enthält die App-Version und meldet den erfolgreichen Export sichtbar.
- PDF-/Dateianzeige auf iPhone/PWA robuster verlinkt.
- JavaScript-, Navigation-, ID-, Versions-, Statistik- und PDF-Prüfungen durchgeführt.
- Alte/duplizierte interne IDs werden bereinigt und anschließend dauerhaft gespeichert, damit Öffnen und Löschen nach einem Neustart stabil bleiben.
- AU-Löschen verwendet keinen unsicheren Listenindex mehr, wenn eine konkrete ID vorhanden ist.
- Entsperren blockiert die Bedienoberfläche bis Datenmigration und Speicherbereinigung abgeschlossen sind; dadurch keine parallelen Speicherzugriffe direkt beim Start.
- IndexedDB-Blockierungen und abgebrochene Schreibtransaktionen liefern jetzt klare Fehler statt still hängen zu bleiben.
- Backup-Import prüft zusätzlich doppelte Dateischlüssel und fehlende referenzierte Dateien, bevor bestehende Daten überschrieben werden.
- Backup-Nachbereinigung kann einen bereits erfolgreichen Import nicht mehr fälschlich als fehlgeschlagen melden.


## v1.8.4 – Urlaub

- Neue Rubrik „Urlaub“ mit Von-/Bis-Datum und Mehrfach-Foto-Upload.
- Urlaubstage werden automatisch als Montag bis Freitag gezählt.
- Samstage und Sonntage werden nicht gezählt.
- Gesetzliche Feiertage in Nordrhein-Westfalen werden für jedes gewählte Jahr dynamisch berechnet und nicht als Urlaubstage gezählt.
- Bewegliche Feiertage werden anhand des Osterdatums des jeweiligen Jahres berechnet.
- Urlaub wird im Dashboard und in der Jahresstatistik/PDF berücksichtigt.
- Originalfotos bleiben verschlüsselt in WorksManager und im verschlüsselten Backup enthalten.


## Version 1.8.4
- Startseiten-Layout für iPhone/PWA weiter stabilisiert: keine abgeschnittenen Statistik-Kacheln, keine horizontale Überbreite.
- Neuer Vertragsdauer-Zähler direkt unter „Meine Arbeitsübersicht“.
- Zeigt Kalendertage seit Vertragsbeginn (inklusive Starttag), volle Monate und volle Jahre bis zum aktuellen Tag.
- Aktualisiert sich beim Öffnen und während die App geöffnet ist regelmäßig automatisch.
