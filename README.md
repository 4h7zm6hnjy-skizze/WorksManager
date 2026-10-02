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
