Version: **v1.0.2**

# WorksManager

Private PWA zur Verwaltung von Arbeitsdaten.

## Enthalten
- Firma, Vertragsbeginn, Arbeitsvertrag
- Schichtplan mit Foto/OCR und Namenssuche
- BEM, AMZ und Gespräche mit Datum, Uhrzeit, Gesprächspartner, Ort, Notiz
- Aushänge: Kurzarbeit / Sonstige
- Lohnabrechnung und monatliche Stempelübersicht mit Scanner/Ablage
- AU-Scanner mit Erst-/Folgebescheinigung, Zeitraum, ICD-10-Code-Auswertung und Zählern
- Kind krank
- Reha
- Verschlüsselte lokale Datenspeicherung (Web Crypto / AES-GCM)
- Verschlüsselter Backup-Export/-Import
- PWA / Offline-Grundfunktion

## Datenschutz
Die Nutzdaten werden in IndexedDB verschlüsselt gespeichert. Das Passwort wird nicht gespeichert. OCR nutzt Tesseract.js; die Bibliothek wird bei Bedarf aus einem CDN geladen, die Bildauswertung findet im Browser statt. Ohne Internet kann eine noch nicht gecachte OCR-Bibliothek nicht nachgeladen werden.

## GitHub Pages
Repository erstellen, alle Dateien ins Repository-Root laden und GitHub Pages auf den Branch `main` / Root einstellen.

## Wichtiger Hinweis zur OCR
OCR ist eine Erkennungshilfe, keine fehlerfreie medizinische oder rechtliche Datenquelle. Erkannte Schicht-, Datums- und ICD-10-Angaben vor dem Speichern prüfen.

## Gesundheit (v2)
Neue Rubrik mit Lungenfunktionstests (inkl. FEV1/FVC-Werte und Befunddatei), Laborwerten sowie Arztbriefen. Alle Einträge liegen im bestehenden verschlüsselten lokalen Datenspeicher und werden in verschlüsselte Backups einbezogen.

- v1.0.2: Fotoauswahl aus Kamera, Fotomediathek oder Dateien bei allen Bild-/Dokumenten-Uploads.


## Version 1.0.3
- AU-Auswertung auf strikte Formularerkennung umgestellt.
- AU-Zeitraum wird nur aus „arbeitsunfähig seit“ und „voraussichtlich arbeitsunfähig bis einschließlich“ gelesen.
- Geburtsdatum und „festgestellt am“ werden nicht mehr als AU-Zeitraum verwendet.
- ICD-10-Codes werden nur aus „AU-begründende Diagnose(n) / ICD-10“ übernommen; keine Diagnose-zu-Code-Schätzung mehr.
- Mehrere ICD-10-Codes im Diagnosefeld werden vollständig übernommen.
- OCR-Kopie wird für bessere Lesbarkeit in Graustufen und mit moderatem Kontrast optimiert; Originalscan bleibt unverändert gespeichert.
- Unsichere Werte bleiben leer und müssen geprüft werden, statt automatisch falsch befüllt zu werden.
