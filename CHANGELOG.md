# Changelog

This file is generated from `release-notes/catalog.json`. Do not edit it directly.

## 0.2.6 — 2026-07-17

### English — Reliable online LMU telemetry

Online races now stay live when LMU publishes transitional scoring values, while unavailable distances and gaps remain explicit instead of becoming invented timing.

- **Keep multi-car races connected** — The bridge now recognizes bounded signed lap-distance and timing transitions plus LMU's unavailable session-end sentinel. One opponent's transitional scoring no longer discards an otherwise coherent player snapshot.
- **Show absence instead of a false number** — Protocol v2 carries unavailable normalized lap distances, session timing and relative gaps as null. Apex keeps the bounded signed lap coordinate separately for start/finish detection, but never presents it as lap progress or opponent timing.
- **Verified across online and offline races** — A private raw recording replayed 422,467 usable frames through the current decoder, Electron, Live view and analysis store: 358,720 multi-car frames across two online races plus the complete solo session, with no invalid-data rejection.

**Known limitations**

- **Transitional gaps remain unavailable** — When LMU publishes a negative or unavailable relative-timing value, Apex shows no gap until a non-negative value arrives rather than guessing what the producer meant.

### Deutsch — Zuverlässige Online-LMU-Telemetrie

Online-Rennen bleiben jetzt live, wenn LMU vorübergehende Wertungswerte veröffentlicht. Nicht verfügbare Distanzen und Abstände bleiben ausdrücklich unbekannt, statt erfundene Zeiten zu erzeugen.

- **Rennen mit mehreren Fahrzeugen bleiben verbunden** — Die Bridge erkennt jetzt begrenzte vorzeichenbehaftete Übergänge bei Rundendistanz und Zeit sowie den LMU-Platzhalter für eine nicht verfügbare Session-Endzeit. Ein vorübergehender Wert eines Gegners verwirft dadurch keinen ansonsten stimmigen Spieler-Snapshot mehr.
- **Zeige Abwesenheit statt einer falschen Zahl** — Protokoll v2 überträgt nicht verfügbare normalisierte Rundendistanzen, Sessionzeiten und relative Abstände als null. Apex behält die begrenzte vorzeichenbehaftete Rundenkoordinate separat für die Erkennung von Start und Ziel, zeigt sie aber nie als Rundenfortschritt oder Gegnerabstand an.
- **Mit Online- und Offline-Rennen geprüft** — Eine private Rohdatenaufzeichnung spielte 422.467 nutzbare Frames durch den aktuellen Decoder, Electron, die Live-Ansicht und den Analysespeicher: 358.720 Mehrfahrzeug-Frames aus zwei Online-Rennen sowie die vollständige Solo-Session – ohne Zurückweisung wegen ungültiger Daten.

**Bekannte Einschränkungen**

- **Vorübergehende Abstände bleiben nicht verfügbar** — Wenn LMU einen negativen oder nicht verfügbaren relativen Zeitwert veröffentlicht, zeigt Apex keinen Abstand, bis ein nicht negativer Wert eintrifft, statt die Bedeutung des Produzenten zu erraten.

## 0.2.5 — 2026-07-13

### English — Durable lap analysis and private feedback

Completed LMU laps now remain available across partial finishes and app restarts, while a new explicit feedback workflow keeps reports precise and privacy-masked.

- **Keep every completed lap available** — Analysis stores full-resolution eligible lap payloads locally, restores them after restart, defaults to a useful completed lap, and keeps earlier laps selectable when the final lap is only partial or telemetry pauses. Lap boundaries follow the measured distance wrap and wait briefly for LMU's authoritative time, so early scoring transitions cannot truncate or mis-time a lap.
- **Learn the centre path from trustworthy evidence** — A durable track model publishes only after at least two clean, countable LMU laps corroborate the route. Untimed, off-track, incomplete, unsafe, replay, remote, pit, and AI-controlled evidence cannot become a PB or silently bias the learned geometry.
- **Replay the exact recorded lap** — Time and distance playback, synchronized controls, speed and brake traces, PB deltas, and brake-zone seeking make each retained lap inspectable while provisional geometry remains clearly labelled as learning.
- **Report an exact interface problem** — Select an Apex element, review an explicit privacy notice, send masked screenshots through a durable offline outbox, and continue the resulting conversation in the new Feedback view. Telemetry, driver and server identities, local paths, recordings, and feedback threads are covered by redaction boundaries.

**Known limitations**

- **A complete centre path needs two clean laps** — Until enough eligible local-player evidence exists, Apex shows the exact selected driven line over a route explicitly labelled as learning or partial rather than claiming a complete centre path.
- **Feedback synchronization uses an explicit cloud service** — Core telemetry and analysis remain local with no account or analytics. Only a report the user explicitly sends crosses the network; an internet connection is required to synchronize it and receive replies.

### Deutsch — Dauerhafte Rundenanalyse und privates Feedback

Abgeschlossene LMU-Runden bleiben jetzt auch nach einem Teilrunden-Finish und App-Neustarts verfügbar. Gleichzeitig hält ein neuer ausdrücklicher Feedback-Ablauf Meldungen präzise und datenschutzmaskiert.

- **Behalte jede abgeschlossene Runde verfügbar** — Die Analyse speichert vollständige geeignete Rundendaten lokal, stellt sie nach einem Neustart wieder her, wählt standardmäßig eine nützliche abgeschlossene Runde und hält frühere Runden auswählbar, wenn die letzte Runde nur teilweise gefahren wurde oder die Telemetrie pausiert. Rundengrenzen folgen dem gemessenen Distanzsprung und warten kurz auf die verbindliche LMU-Rundenzeit, damit frühe Wertungsübergänge eine Runde weder abschneiden noch zeitlich falsch zuordnen.
- **Lerne die Mittellinie aus vertrauenswürdigen Belegen** — Ein dauerhaftes Streckenmodell wird erst veröffentlicht, nachdem mindestens zwei saubere und zählbare LMU-Runden die Strecke bestätigen. Runden ohne Zeit sowie Daten von Ausritten, unvollständigen oder unsicheren Runden, Wiedergaben, Fernsteuerung, Boxenfahrten und KI-Steuerung können weder PB werden noch die gelernte Geometrie unbemerkt verzerren.
- **Spiele die exakt aufgezeichnete Runde ab** — Wiedergabe nach Zeit oder Distanz, synchronisierte Eingaben, Geschwindigkeits- und Bremskurven, PB-Deltas und das Anspringen von Bremszonen machen jede gespeicherte Runde prüfbar. Vorläufige Geometrie bleibt dabei klar als Lernstand gekennzeichnet.
- **Melde ein genaues Oberflächenproblem** — Wähle ein Apex-Element aus, prüfe einen ausdrücklichen Datenschutzhinweis, sende maskierte Screenshots über einen dauerhaften Offline-Ausgang und führe die Unterhaltung in der neuen Feedback-Ansicht fort. Telemetrie, Fahrer- und Serveridentitäten, lokale Pfade, Aufzeichnungen und Feedback-Unterhaltungen sind durch Maskierungsgrenzen geschützt.

**Bekannte Einschränkungen**

- **Eine vollständige Mittellinie benötigt zwei saubere Runden** — Bis genügend geeignete Belege des lokalen Spielers vorhanden sind, zeigt Apex die exakt ausgewählte Fahrlinie über einer ausdrücklich als lernend oder teilweise gekennzeichneten Strecke, statt eine vollständige Mittellinie zu behaupten.
- **Die Feedback-Synchronisierung nutzt einen ausdrücklichen Cloud-Dienst** — Kerntelemetrie und Analyse bleiben ohne Konto oder Analysefunktionen lokal. Nur eine vom Nutzer ausdrücklich gesendete Meldung verlässt den Computer; für die Synchronisierung und Antworten ist eine Internetverbindung erforderlich.

## 0.2.4 — 2026-07-13

### English — Clear overlay display-mode guidance

The Overlays tab now turns the Alt+Tab-only visibility symptom into an explicit LMU display-mode fix.

- **Know exactly what to change in LMU** — If the HUD appears after Alt+Tab but vanishes when LMU is focused, Apex now tells you to select Borderless (recommended) or Windowed and reopen the overlay.

**Known limitations**

- **Exclusive fullscreen cannot compose the local overlay** — Apex remains local and injection-free, so it cannot draw a normal desktop window over a true exclusive-fullscreen game surface.

### Deutsch — Klare Hinweise zum Anzeigemodus für Overlays

Der Overlays-Tab übersetzt das Sichtbarkeitsproblem nach Alt+Tab jetzt in eine konkrete Einstellung für den LMU-Anzeigemodus.

- **Du weißt genau, was du in LMU ändern musst** — Wenn das HUD nach Alt+Tab erscheint, aber bei fokussiertem LMU verschwindet, fordert Apex dich jetzt auf, Randlos (Borderless, empfohlen) oder Fenstermodus zu wählen und das Overlay erneut zu öffnen.

**Bekannte Einschränkungen**

- **Exklusives Vollbild kann das lokale Overlay nicht darstellen** — Apex bleibt lokal und frei von Injektionen. Deshalb kann es ein normales Desktop-Fenster nicht über einer echten exklusiven Vollbildoberfläche zeichnen.

## 0.2.3 — 2026-07-13

### English — Complete laps stay available in Analysis

Analysis now keeps the current driving session and its completed laps when telemetry pauses or the final lap is only partial.

- **Choose the lap you meant to inspect** — A bounded main-process session store retains completed, incomplete, and current laps across bridge interruptions. Analysis defaults to the latest clean completed lap and exposes session, lap, quality, and exclusion-reason controls.
- **Validated with the real LMU recording** — The 18,039-frame raw replay now verifies selectable clean laps, aggregate measured-route coverage, and all 11 expected braking zones through the same session-store path used by the desktop app.

**Known limitations**

- **Measured lap history lasts for the current app run** — High-rate position and pedal traces remain private, bounded in memory, and are not silently persisted. Under memory pressure, old trace payloads may be discarded while their lap summaries remain visible; raw .apexrec recording is the lossless opt-in path.

### Deutsch — Abgeschlossene Runden bleiben in der Analyse verfügbar

Die Analyse behält jetzt die aktuelle Fahrsitzung und ihre abgeschlossenen Runden, wenn die Telemetrie pausiert oder die letzte Runde nur teilweise gefahren wurde.

- **Wähle genau die Runde aus, die du untersuchen möchtest** — Ein begrenzter Sitzungsspeicher im Hauptprozess behält abgeschlossene, unvollständige und aktuelle Runden über Unterbrechungen der Bridge hinweg. Die Analyse wählt standardmäßig die neueste saubere abgeschlossene Runde und zeigt Steuerelemente für Sitzung, Runde, Qualität und Ausschlussgründe.
- **Mit der echten LMU-Aufzeichnung geprüft** — Die Rohdatenwiedergabe mit 18.039 Frames prüft jetzt auswählbare saubere Runden, die zusammengefasste Abdeckung der gemessenen Fahrlinie und alle 11 erwarteten Bremszonen über denselben Sitzungsspeicher, den die Desktop-App verwendet.

**Bekannte Einschränkungen**

- **Der gemessene Rundenverlauf gilt für den aktuellen App-Lauf** — Hochfrequente Positions- und Pedaldaten bleiben privat, werden begrenzt im Arbeitsspeicher gehalten und nicht unbemerkt dauerhaft gespeichert. Bei Speicherdruck können alte Detaildaten verworfen werden, während ihre Rundenübersichten sichtbar bleiben; die rohe .apexrec-Aufzeichnung ist der verlustfreie optionale Pfad.

## 0.2.2 — 2026-07-13

### English — Overlay stays above focused LMU

Apex now restores its non-activating Windows z-order when a focused borderless LMU window moves ahead of the HUD.

- **Keep the HUD visible while driving** — A Windows-specific guard reorders the already-topmost overlay without taking keyboard focus or mouse input, including after the game raises its own topmost window.

**Known limitations**

- **Use borderless or windowed mode** — True exclusive fullscreen can bypass composed desktop windows; Apex remains injection-free and therefore requires LMU in borderless or windowed mode for overlays.

### Deutsch — Overlay bleibt über dem fokussierten LMU

Apex stellt jetzt seine nicht aktivierende Windows-Z-Reihenfolge wieder her, wenn sich ein fokussiertes randloses LMU-Fenster vor das HUD schiebt.

- **Das HUD bleibt während der Fahrt sichtbar** — Ein Windows-spezifischer Wächter ordnet das bereits oberste Overlay neu, ohne Tastaturfokus oder Mauseingaben zu übernehmen – auch nachdem das Spiel sein eigenes oberstes Fenster angehoben hat.

**Bekannte Einschränkungen**

- **Verwende den randlosen oder Fenstermodus** — Echtes exklusives Vollbild kann zusammengesetzte Desktop-Fenster umgehen. Apex bleibt frei von Injektionen und benötigt für Overlays daher den randlosen oder Fenstermodus von LMU.

## 0.2.1 — 2026-07-13

### English — Marketing-site page-view analytics

The Apex marketing site now reports page views through Vercel Analytics while the desktop app remains local-first and analytics-free.

- **Understand visits to the public website** — The deployed marketing site loads Vercel Analytics to count page views; this change does not add analytics, accounts, or a cloud runtime to the Apex desktop app.

### Deutsch — Seitenaufrufanalyse für die Marketing-Website

Die Apex-Marketing-Website erfasst jetzt Seitenaufrufe mit Vercel Analytics, während die Desktop-App weiterhin lokal und ohne Analysefunktionen arbeitet.

- **Besuche der öffentlichen Website verstehen** — Die bereitgestellte Marketing-Website lädt Vercel Analytics, um Seitenaufrufe zu zählen. Diese Änderung fügt der Apex-Desktop-App weder Analysefunktionen noch Konten oder eine Cloud-Laufzeit hinzu.

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
