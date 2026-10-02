# WorksManager v1.4.3

Private Arbeits- und Dokumentenverwaltung.

## Änderung in v1.1.0
- Automatische OCR-/Fotoanalyse vollständig aus der Bedienoberfläche entfernt.
- Foto-/Dokument-Upload zusätzlich in Firma, Gespräche/BEM/AMZ, Aushänge, Kind krank und Reha.
- Kamera, Fotomediathek und Dateien werden unterstützt.
- Manuelle Eingabefelder bleiben optional verfügbar.
- Alle gespeicherten Daten bleiben lokal verschlüsselt.

## Änderung in v1.2.0
- Neuer täglicher Treppenzähler mit Datum, Uhrzeit, Anzahl und Grund.
- Automatische Monats- und Jahresstatistik mit Summe, Einträgen, aktiven Tagen und Tagesdurchschnitt.

## Änderung in v1.3.1
- Neue Jahresstatistik mit frei wählbarem Jahr.
- Treppen-Monatsstatistik für alle zwölf Monate.
- Vollständige Liste der gespeicherten Jahreseinträge und Dokumentnamen im Jahresbericht.
- Jahresbericht kann direkt als PDF gespeichert werden.
- Originalfotos und Original-PDFs bleiben separat in WorksManager/Backup und werden aus Datenschutz- und Dateigrößengründen nicht erneut in die Statistik-PDF eingebettet.

Copyright Marcel Hentschel.


## Änderung in v1.4.0
- Rubrik Krankheit & AU grundlegend vereinfacht.
- Krankschreibung nur noch als Foto speichern.
- Eingabe ausschließlich des Zeitraums über Kalenderfelder Von/Bis.
- Keine ICD-Codes, AU-Art, Notiz oder automatische Analyse.
- Monatsstatistik mit Fällen und Krankheitstagen.
- Jahresstatistik mit Fällen und Krankheitstagen sowie 12-Monats-Übersicht.

## Änderung in v1.4.2
- Löschen-Funktionen in allen Rubriken repariert.
- Öffnen gespeicherter Fotos und Dokumente repariert.
- Ältere Einträge ohne interne ID erhalten beim Laden automatisch eine ID und können wieder gelöscht werden.
- Arbeitsvertrag-Dateispeicherung repariert.
- PWA-Cache auf v1.4.2 aktualisiert.

## Änderung in v1.4.3

- AU-Löschung vollständig neu angebunden: Löschen erfolgt über die aktuelle interne ID mit Index-Fallback und ist nicht mehr von alten Inline-Handlern abhängig.
- Alte Krankschreibungen ohne Datum oder frühere ID können ebenfalls gelöscht werden.
- iPhone/PWA-Startansicht korrigiert: kein horizontales Überlaufen, Startposition links oben, responsive Statistik-Kacheln und fester 1:1-Viewport.
- PWA-Cache auf v1.4.3 aktualisiert.


## Version 1.4.5
- AU-Speichern auf iPhone/PWA robuster gemacht.
- AU-Fotos werden speicherschonend komprimiert.
- Eingaben werden erst nach erfolgreichem Speichern geleert.
- Sichtbarer Speicherstatus am AU-Button.
