# Changelog

This file is generated from `release-notes/catalog.json`. Do not edit it directly.

## 0.2.0 — 2026-07-13

### English — Measured tracks, durable history, and trustworthy plans

Apex now reconstructs your driven route and braking from official LMU data, keeps durable lifetime distance, and builds one internally consistent fuel strategy.

- **See where the car actually braked** — Official world position, game time, speed, and brake pressure reconstruct a local driven line with distance-linked brake zones in Live and Analysis.
- **Every strategy number belongs to the selected plan** — Integer-lap candidates couple pit and refuelling time back into timed-race distance; fixed illustrative stops, traffic, tyres, drivers, weather, and Virtual Energy claims were removed.
- **Keep durable lifetime driving distance** — A recoverable local SQLite ledger tracks only eligible live local-player driving, with idempotent checkpoints, bounded crash loss, verified backups, and replay or AI exclusion.
- **Replay real LMU data through the Windows desktop** — The strict native harness carries all 18,039 checked frames through the current bridge, Electron, renderer, measured route, overlay, and packaged application boundaries.
- **Edit numbers without losing the last valid result** — Localized numeric drafts accept English and German decimal input, explain invalid values, and prevent empty or malformed fields from crashing calculations.
- **Review a trusted bilingual release history** — Structured English and German notes now drive the in-app update reveal, Settings history, generated changelog, and release publication body.

**Known limitations**

- **Current LMU and physical display checks still matter** — The release has strict fixtures and native package gates, but each game header update and physical multi-display or exclusive-fullscreen setup still needs its own validation.
- **Strategy is a manual fuel-only baseline** — Live calibration, Virtual Energy, tyre, weather, driver, and traffic models remain unavailable until their exact inputs and event rules are verified.
- **Historical DuckDB analysis is not claimed** — Current-session measured braking works, while normalized DuckDB session ingestion and setup-schema optimization require approved real fixtures before implementation.

### Deutsch — Gemessene Strecken, dauerhafter Verlauf und verlässliche Pläne

Apex rekonstruiert jetzt deine Fahrlinie und Bremsvorgänge aus offiziellen LMU-Daten, speichert die Gesamtfahrstrecke dauerhaft und erstellt eine in sich stimmige Kraftstoffstrategie.

- **Sieh, wo das Auto tatsächlich gebremst hat** — Offizielle Weltposition, Spielzeit, Geschwindigkeit und Bremsdruck rekonstruieren lokal eine Fahrlinie mit distanzbasierten Bremszonen in Live und Analyse.
- **Jede Strategieangabe gehört zum ausgewählten Plan** — Kandidaten mit ganzzahligen Stints berücksichtigen Boxen- und Tankzeit bei der Distanz eines Zeitrennens. Feste Beispielstopps und unbelegte Aussagen zu Verkehr, Reifen, Fahrern, Wetter und virtueller Energie wurden entfernt.
- **Speichere deine Gesamtfahrstrecke dauerhaft** — Ein wiederherstellbares lokales SQLite-Kassenbuch erfasst nur geeignete Live-Fahrten des lokalen Spielers – mit idempotenten Checkpoints, begrenztem Verlust bei Abstürzen, geprüften Sicherungen und Ausschluss von Wiedergabe oder KI.
- **Gib echte LMU-Daten in der Windows-Desktop-App wieder** — Die strenge native Teststrecke führt alle 18.039 geprüften Frames durch Bridge, Electron, Renderer, gemessene Strecke, Overlay und die paketierte Anwendung.
- **Bearbeite Zahlen, ohne das letzte gültige Ergebnis zu verlieren** — Lokalisierte Zahlenentwürfe akzeptieren englische und deutsche Dezimaleingaben, erklären ungültige Werte und verhindern Abstürze durch leere oder fehlerhafte Felder.
- **Prüfe einen vertrauenswürdigen zweisprachigen Versionsverlauf** — Strukturierte englische und deutsche Hinweise steuern jetzt die Update-Anzeige in der App, den Verlauf in den Einstellungen, das generierte Änderungsprotokoll und den Veröffentlichungstext.

**Bekannte Einschränkungen**

- **Aktuelles LMU und reale Bildschirme müssen weiterhin geprüft werden** — Die Version besitzt strenge Fixtures und native Paketprüfungen. Jedes neue Spiel-Header-Update sowie reale Mehrbildschirm- oder Exklusiv-Vollbild-Konfigurationen benötigen dennoch eine eigene Prüfung.
- **Die Strategie ist eine manuelle reine Kraftstoffbasis** — Live-Kalibrierung sowie Modelle für virtuelle Energie, Reifen, Wetter, Fahrer und Verkehr bleiben nicht verfügbar, bis ihre genauen Eingaben und Eventregeln bestätigt sind.
- **Historische DuckDB-Analyse wird nicht behauptet** — Gemessene Bremsanalyse der aktuellen Sitzung funktioniert. Normalisierte DuckDB-Sessionaufnahme und Setup-Schema-Optimierung benötigen vor der Umsetzung freigegebene reale Fixtures.

## 0.1.14 — 2026-07-12

### English — Working multi-display overlays

Apex can now place its local HUD on a selected Windows display and retain a validated layout.

- **Choose the display that carries the HUD** — The desktop app enumerates real displays, restores a safe display target, and opens a non-activating click-through overlay without capturing the screen.

**Known limitations**

- **Use borderless or windowed mode** — Exclusive fullscreen can cover normal desktop overlay windows; Apex does not inject an in-game DLL.

### Deutsch — Funktionierende Overlays auf mehreren Bildschirmen

Apex kann sein lokales HUD jetzt auf einem ausgewählten Windows-Bildschirm platzieren und ein geprüftes Layout beibehalten.

- **Wähle den Bildschirm für das HUD** — Die Desktop-App erkennt reale Bildschirme, stellt ein sicheres Ziel wieder her und öffnet ein nicht aktivierendes, klickdurchlässiges Overlay, ohne den Bildschirm aufzuzeichnen.

**Bekannte Einschränkungen**

- **Verwende den randlosen oder Fenstermodus** — Exklusives Vollbild kann normale Desktop-Overlayfenster verdecken; Apex klinkt keine DLL in das Spiel ein.

## 0.1.13 — 2026-07-12

### English — Raw LMU recording and replay

Record official LMU shared-memory snapshots locally and replay them through the current decoder.

- **Reproduce integration bugs without LMU** — The append-safe .apexrec format stores raw snapshots with keyframes, compressed deltas, monotonic timing, checksums, and strict reader limits.

**Known limitations**

- **Recordings are private** — Raw LMU memory can contain driver names, Steam IDs, server details, and local paths. Apex stores it locally and never uploads it.

### Deutsch — LMU-Rohdaten aufnehmen und wiedergeben

Zeichne offizielle LMU-Shared-Memory-Snapshots lokal auf und gib sie mit dem aktuellen Decoder wieder.

- **Integrationsfehler ohne LMU reproduzieren** — Das anhängesichere .apexrec-Format speichert Rohdaten mit Schlüsselbildern, komprimierten Deltas, monotoner Zeit, Prüfsummen und strengen Lesergrenzen.

**Bekannte Einschränkungen**

- **Aufzeichnungen sind privat** — LMU-Rohdaten können Fahrernamen, Steam-IDs, Serverdetails und lokale Pfade enthalten. Apex speichert sie lokal und lädt sie niemals hoch.

## 0.1.12 — 2026-07-12

### English — Reliable player identification

The bridge now identifies the LMU player before vehicle telemetry becomes available.

- **Scoring-first sessions stay truthful** — Apex first trusts LMU's player marker, then uniquely correlates the scoring header name, so session context can appear without inventing vehicle values.

### Deutsch — Zuverlässige Spielererkennung

Die Bridge erkennt den LMU-Spieler jetzt, bevor Fahrzeugtelemetrie verfügbar ist.

- **Sessions mit früher Wertung bleiben wahrheitsgetreu** — Apex vertraut zuerst der LMU-Spielermarkierung und ordnet danach den Namen aus dem Wertungskopf eindeutig zu. So erscheint der Sessionkontext ohne erfundene Fahrzeugwerte.

## 0.1.11 — 2026-07-12

### English — Updated development toolchain

The project toolchain was upgraded with builds and tests kept reproducible.

- **Safer contributor builds** — Pinned Node, npm, TypeScript, Vite, Electron, and test dependencies keep local development and CI aligned.

### Deutsch — Aktualisierte Entwicklungswerkzeuge

Die Projektwerkzeuge wurden aktualisiert, während Builds und Tests reproduzierbar bleiben.

- **Sicherere Builds für Mitwirkende** — Festgelegte Versionen von Node, npm, TypeScript, Vite, Electron und Testabhängigkeiten halten lokale Entwicklung und CI im Gleichlauf.

## 0.1.10 — 2026-07-12

### English — Automatic fuel calculation

Live measured fuel use and lap samples now feed a local finish-fuel estimate.

- **Fuel planning from your own session** — Apex retains bounded local samples per car and track and exposes the assumptions behind its finish projection.

### Deutsch — Automatische Kraftstoffberechnung

Live gemessener Verbrauch und Rundenwerte speisen jetzt eine lokale Kraftstoffprognose bis ins Ziel.

- **Kraftstoffplanung aus deiner eigenen Session** — Apex bewahrt begrenzte lokale Stichproben pro Auto und Strecke auf und zeigt die Annahmen hinter der Zielprognose.

## 0.1.9 — 2026-07-12

### English — Pre-race session context

Track, car, class, weather, and session information can appear before driving begins.

- **Garage context without fake telemetry** — Scoring-only frames are accepted while fuel, controls, tyres, and wheels remain explicitly unavailable until LMU publishes vehicle telemetry.

### Deutsch — Sessionkontext vor dem Rennstart

Strecke, Auto, Klasse, Wetter und Session können erscheinen, bevor die Fahrt beginnt.

- **Garagenkontext ohne erfundene Telemetrie** — Frames nur mit Wertungsdaten werden akzeptiert. Kraftstoff, Eingaben, Reifen und Räder bleiben ausdrücklich nicht verfügbar, bis LMU Fahrzeugtelemetrie liefert.

## 0.1.8 — 2026-07-12

### English — Complete English and German interface

All rendered application copy is available in English and German with structural parity checks.

- **Switch language throughout Apex** — A local language preference updates the interface, while the build rejects untranslated rendered strings and mismatched message structures.

### Deutsch — Vollständige englische und deutsche Oberfläche

Alle angezeigten Anwendungstexte sind auf Englisch und Deutsch verfügbar und werden strukturell geprüft.

- **Sprache in ganz Apex wechseln** — Eine lokale Spracheinstellung aktualisiert die Oberfläche. Der Build lehnt nicht übersetzte sichtbare Texte und abweichende Nachrichtenstrukturen ab.

## 0.1.7 — 2026-07-12

### English — One-click debug sharing

Prepare complete redacted diagnostics for support without sending anything automatically.

- **Copy, save, or draft support details** — Apex can prepare local logs with common secrets and home paths redacted, then lets the user explicitly copy, save, or open an email draft.

### Deutsch — Debug-Informationen mit einem Klick teilen

Bereite vollständige bereinigte Diagnosen für den Support vor, ohne automatisch etwas zu senden.

- **Supportdetails kopieren, speichern oder als Entwurf öffnen** — Apex bereitet lokale Protokolle mit unkenntlich gemachten üblichen Geheimnissen und Benutzerpfaden vor. Erst der Benutzer kopiert, speichert oder öffnet ausdrücklich einen E-Mail-Entwurf.

## 0.1.6 — 2026-07-12

### English — Correct timed-session lap handling

LMU's timed-session lap sentinel is normalized instead of being displayed as a real lap count.

- **Timed races remain timed** — The bridge now treats the special total-laps value as unavailable and preserves the session's measured remaining time.

### Deutsch — Korrekte Rundenbehandlung in zeitbegrenzten Sessions

Der LMU-Sonderwert für zeitbegrenzte Sessions wird normalisiert und nicht als echte Rundenzahl angezeigt.

- **Zeitrennen bleiben zeitbasiert** — Die Bridge behandelt den speziellen Gesamt-Rundenwert jetzt als nicht verfügbar und bewahrt die gemessene verbleibende Sessionzeit.

## 0.1.5 — 2026-07-12

### English — Persistent LMU discovery and live state

Apex remembers a verified LMU path and exposes the bridge's real connection state.

- **Connection status reflects the local bridge** — The selected installation survives restart, while the UI distinguishes waiting, connected, disconnected, and error states.

### Deutsch — Gespeicherte LMU-Erkennung und Live-Status

Apex merkt sich einen geprüften LMU-Pfad und zeigt den tatsächlichen Verbindungsstatus der Bridge.

- **Der Verbindungsstatus folgt der lokalen Bridge** — Die gewählte Installation bleibt nach einem Neustart erhalten. Die Oberfläche unterscheidet Warten, Verbunden, Getrennt und Fehler.

## 0.1.4 — 2026-07-12

### English — Progressive in-app guidance

Onboarding and contextual explanations introduce Apex without blocking experienced users.

- **Guidance stays available** — Setup checks, view-specific help, and dismissible introductions can be reopened or reset from Settings.

### Deutsch — Schrittweise Hilfe in der App

Onboarding und kontextbezogene Erklärungen führen in Apex ein, ohne erfahrene Benutzer aufzuhalten.

- **Hinweise bleiben verfügbar** — Einrichtungsprüfungen, ansichtsbezogene Hilfe und schließbare Einführungen lassen sich in den Einstellungen erneut öffnen oder zurücksetzen.

## 0.1.3 — 2026-07-12

### English — Consent-driven application updates

Installed Windows builds can check GitHub Releases while keeping download and installation under user control.

- **Two explicit update decisions** — Apex asks before downloading and again before restarting to install; automatic checks never trigger an automatic download.

**Known limitations**

- **Installer update path** — Automatic replacement is available to the installed Windows build; portable ZIP users download a new package manually.

### Deutsch — Anwendungsupdates mit Zustimmung

Installierte Windows-Builds können GitHub Releases prüfen, während Download und Installation unter Kontrolle des Benutzers bleiben.

- **Zwei ausdrückliche Update-Entscheidungen** — Apex fragt vor dem Download und erneut vor dem Neustart zur Installation. Automatische Prüfungen starten niemals automatisch einen Download.

**Bekannte Einschränkungen**

- **Updatepfad für den Installer** — Die installierte Windows-App kann sich automatisch ersetzen; Benutzer des portablen ZIP laden ein neues Paket manuell herunter.

## 0.1.2 — 2026-07-12

### English — Evidence-driven LMU discovery

Installation detection now reports exactly what was checked and why a candidate passed or failed.

- **Steam libraries and manual paths are inspectable** — Apex checks the LMU executable or Steam manifest, shared-memory support folder, telemetry folder, and setup directory without modifying them.

### Deutsch — Nachvollziehbare LMU-Erkennung

Die Installationserkennung zeigt jetzt genau, was geprüft wurde und warum ein Kandidat bestanden hat oder abgelehnt wurde.

- **Steam-Bibliotheken und manuelle Pfade sind prüfbar** — Apex prüft LMU-Programmdatei oder Steam-Manifest, Shared-Memory-Supportordner, Telemetrieordner und Setup-Verzeichnis, ohne sie zu verändern.

## 0.1.1 — 2026-07-12

### English — Release artifacts are gated

Desktop pushes now require a synchronized version and verified Windows release artifacts.

- **Installer, ZIP, metadata, and checksums stay together** — The pre-push gate runs tests and builds every public Windows artifact before a desktop-impacting commit can be published.

### Deutsch — Release-Artefakte werden geprüft

Desktop-Pushes erfordern jetzt eine synchronisierte Version und geprüfte Windows-Release-Artefakte.

- **Installer, ZIP, Metadaten und Prüfsummen bleiben zusammen** — Die Pre-Push-Prüfung führt Tests aus und baut jedes öffentliche Windows-Artefakt, bevor ein Desktop-relevanter Commit veröffentlicht werden kann.

## 0.1.0 — 2026-07-12

### English — Public alpha foundation

The first public alpha packages Apex's local-first LMU companion, bridge, diagnostics, and Windows release tooling.

- **Local-first by design** — Apex has no account, analytics, or cloud runtime and reads LMU's official shared-memory mapping from a separate local process.

**Known limitations**

- **Alpha compatibility boundary** — The initial package proves the application and fixture contract, not every current LMU build, car, session, or hardware configuration.

### Deutsch — Grundlage der öffentlichen Alpha

Die erste öffentliche Alpha bündelt den lokalen LMU-Begleiter, die Bridge, Diagnose und Windows-Release-Werkzeuge.

- **Von Grund auf lokal** — Apex hat kein Konto, keine Analyse und keine Cloud-Laufzeit. Es liest LMUs offizielles Shared-Memory-Mapping aus einem getrennten lokalen Prozess.

**Bekannte Einschränkungen**

- **Kompatibilitätsgrenze der Alpha** — Das erste Paket weist Anwendung und Fixture-Vertrag nach, aber nicht jede aktuelle LMU-Version, jedes Auto, jede Session oder Hardwarekonfiguration.
