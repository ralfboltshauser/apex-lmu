# Changelog

This file is generated from `release-notes/catalog.json`. Do not edit it directly.

## 0.4.3 — 2026-07-20

### English — A local Garage built from measured lifetime history

Garage now shows the cars and tracks Apex has actually measured, groups reviewed team and livery variants under one model, and keeps unknown LMU labels explicit without changing the existing lifetime database.

- **See measured distance by car and track** — The new Garage destination reads the existing local lifetime ledger and shows total kilometres, tracked drives, first and last activity, and exact per-track distance for each car model. Settings keeps database health and verified backups, then links to the richer Garage view.
- **Group liveries without guessing the car** — A versioned local catalog recognizes model-specific names from LMU's official roster. Team, season, livery and number text may wrap a reviewed model sequence; different models and evolutions remain separate, and unmatched raw labels carry an Unrecognized LMU label badge.
- **Reconcile every kilometre with the immutable ledger** — Model totals include measured chunks, the durable live accumulator and explicit corrections exactly once. Per-track totals use only run-linked measured distance; a correction without a source track remains visibly unattributed instead of being distributed across tracks. SQLite stays at schema version 1.
- **Prove upgrades and replay isolation** — A v0.4.2 ledger reopens in v0.4.3 with the same migration record, chunk count and exact integer-millimetre total. English and German ready, empty, unknown and newer-schema states were visually inspected through 200% scaling. Strict replay of the private 1.741 GB recording processed 422,467 frames while creating zero Garage distance, models, drives or chunks.

**Known limitations**

- **Garage starts when Apex tracking starts** — Garage is not a reconstruction of the player's complete LMU history. It includes only eligible official live shared-memory intervals recorded after the local lifetime ledger was enabled; replay, imports, demo, self-test, AI and remote control remain excluded.
- **Unknown models stay separate** — The first catalog groups only reviewed model-specific labels and does not offer manual aliases. Unrecognized or future labels remain truthful separate entries until a later catalog release can identify them; track layouts also remain combined while LMU does not expose an authoritative layout field.

### Deutsch — Eine lokale Garage aus gemessenem Gesamtverlauf

Die Garage zeigt jetzt Autos und Strecken, die Apex tatsächlich gemessen hat, gruppiert geprüfte Team- und Lackierungsvarianten unter einem Modell und lässt unbekannte LMU-Bezeichnungen ausdrücklich unbekannt – ohne die bestehende Gesamtdatenbank zu verändern.

- **Sieh gemessene Distanz nach Auto und Strecke** — Das neue Ziel Garage liest den bestehenden lokalen Gesamtverlauf und zeigt Gesamtkilometer, erfasste Fahrten, erste und letzte Aktivität sowie die exakte Streckendistanz je Automodell. Die Einstellungen behalten Datenbankzustand und geprüfte Sicherungen und verlinken auf die ausführlichere Garage.
- **Gruppiere Lackierungen, ohne das Auto zu erraten** — Ein versionierter lokaler Katalog erkennt modellspezifische Namen aus dem offiziellen LMU-Fahrzeugangebot. Team-, Saison-, Lackierungs- und Startnummerntext darf eine geprüfte Modellfolge umgeben; unterschiedliche Modelle und Evolutionsstufen bleiben getrennt, und nicht zugeordnete Rohbezeichnungen tragen das Badge Unbekannte LMU-Bezeichnung.
- **Gleiche jeden Kilometer mit dem unveränderlichen Verlauf ab** — Modellsummen enthalten gemessene Blöcke, den dauerhaften Live-Akkumulator und ausdrückliche Korrekturen jeweils genau einmal. Streckensummen verwenden nur fahrtenbezogene Messdistanz; eine Korrektur ohne Ursprungsstrecke bleibt sichtbar nicht zugeordnet, statt auf Strecken verteilt zu werden. SQLite bleibt bei Schemaversion 1.
- **Belege Upgrade und Wiedergabe-Isolation** — Ein v0.4.2-Verlauf öffnet sich in v0.4.3 mit demselben Migrationseintrag, derselben Blockanzahl und exakt derselben Ganzzahl-Millimetersumme. Englische und deutsche Bereit-, Leer-, Unbekannt- und Neueres-Schema-Zustände wurden bis 200 % visuell geprüft. Die strikte Wiedergabe der privaten 1,741-GB-Aufzeichnung verarbeitete 422.467 Frames und erzeugte dabei null Garage-Distanz, Modelle, Fahrten oder Blöcke.

**Bekannte Einschränkungen**

- **Die Garage beginnt mit der Apex-Erfassung** — Die Garage rekonstruiert nicht den vollständigen LMU-Verlauf des Spielers. Sie enthält nur geeignete offizielle Live-Intervalle aus dem Shared Memory nach Aktivierung des lokalen Gesamtverlaufs; Wiedergabe, Importe, Demo, Selbsttest, KI und Fernsteuerung bleiben ausgeschlossen.
- **Unbekannte Modelle bleiben getrennt** — Der erste Katalog gruppiert nur geprüfte modellspezifische Bezeichnungen und bietet keine manuellen Aliase. Unbekannte oder zukünftige Bezeichnungen bleiben wahrheitsgetreu getrennte Einträge, bis ein späteres Katalog-Release sie zuordnen kann; Streckenlayouts bleiben ebenfalls zusammengefasst, solange LMU kein verbindliches Layoutfeld bereitstellt.

## 0.4.2 — 2026-07-20

### English — Truthful, readable race-engineering surfaces

Live, Fuel and Strategy now use a readable responsive type scale, while unavailable session kind and ineligible fuel evidence remain explicit instead of becoming invented race context or personal calibration.

- **Read the pit wall at every supported scale** — Meaningful labels, descriptions, fields, badges, tables and notifications now share a semantic type scale across the shell, Live, Fuel and Strategy. Content reflows without horizontal page overflow through 200% scaling, including long German copy and compact 1280×720 windows.
- **Show Session when LMU does not expose the kind** — The official mapping does not currently provide an authoritative practice, qualifying, test-day or race field. Measured Live therefore shows Session instead of silently labelling every decoded session as Race; generated demo data remains clearly identified and may still use its declared demo race context.
- **Learn fuel only from the local player's complete lap** — Current fuel can remain visible while AI or remote control is active, but AI, remote, mixed-control, scoring-only, self-test and replay evidence cannot enter the durable fuel profile. Existing local profiles keep their keys and remain private on this PC.
- **Verify the real unavailable and replay states** — The release matrix covers Live, Fuel and Strategy in English and German at 100%, 125%, 150% and 200%, plus scoring-only and fuel-learning states. Strict replay of the private 1.741 GB recording reconstructed 422,467 frames and 52 lap crossings while admitting zero replay frames or crossings to durable fuel calibration.

**Known limitations**

- **Session kind remains unavailable** — Apex does not infer session kind from duration, lap count, opponents, phase or other circumstantial values. It will show Session until a supported authoritative LMU field is decoded and validated.
- **Adaptive strategy and movable cards come later** — This release supplies the truthful evidence and responsive typography foundation. It does not yet add the adaptive live fuel plan, Virtual Energy or tyre strategy, or movable and resizable Live dashboard cards.

### Deutsch — Wahrheitsgetreue, lesbare Renningenieur-Ansichten

Live, Kraftstoff und Strategie verwenden jetzt eine lesbare responsive Schriftskala. Ein nicht verfügbarer Sessiontyp und ungeeignete Kraftstoffbelege bleiben ausdrücklich unbekannt, statt zu erfundenem Rennkontext oder persönlicher Kalibrierung zu werden.

- **Lies den Kommandostand bei jeder unterstützten Skalierung** — Bedeutungsvolle Beschriftungen, Erklärungen, Felder, Badges, Tabellen und Benachrichtigungen verwenden jetzt eine gemeinsame semantische Schriftskala in Navigation, Live, Kraftstoff und Strategie. Inhalte ordnen sich bis 200 % ohne horizontalen Seitenüberlauf neu an – auch mit langen deutschen Texten und kompakten Fenstern mit 1280×720 Pixeln.
- **Zeige Sitzung, wenn LMU den Typ nicht bereitstellt** — Die offizielle Datenabbildung liefert derzeit kein verbindliches Feld für Training, Qualifying, Testtag oder Rennen. Gemessene Live-Daten zeigen deshalb Sitzung, statt jede decodierte Session unbemerkt als Rennen zu bezeichnen; erzeugte Demodaten bleiben klar gekennzeichnet und dürfen weiterhin ihren ausdrücklich festgelegten Demo-Rennkontext verwenden.
- **Lerne Kraftstoff nur aus einer vollständigen Runde des lokalen Spielers** — Der aktuelle Kraftstoff kann bei KI- oder Fernsteuerung sichtbar bleiben. Belege aus KI-, Fern-, gemischter Steuerung, reinen Wertungsdaten, Selbsttest und Wiedergabe können jedoch nicht in das dauerhafte Kraftstoffprofil gelangen. Bestehende lokale Profile behalten ihre Schlüssel und bleiben privat auf diesem PC.
- **Prüfe die echten Nicht-verfügbar- und Wiedergabezustände** — Die Release-Matrix deckt Live, Kraftstoff und Strategie auf Englisch und Deutsch bei 100 %, 125 %, 150 % und 200 % sowie reine Wertungs- und Kraftstoff-Lernzustände ab. Die strikte Wiedergabe der privaten 1,741-GB-Aufzeichnung rekonstruierte 422.467 Frames und 52 Rundenübergänge; kein Wiedergabe-Frame und kein Übergang wurde für die dauerhafte Kraftstoffkalibrierung zugelassen.

**Bekannte Einschränkungen**

- **Der Sessiontyp bleibt nicht verfügbar** — Apex leitet den Sessiontyp weder aus Dauer, Rundenzahl, Gegnern, Phase noch aus anderen Indizien ab. Bis ein unterstütztes verbindliches LMU-Feld decodiert und geprüft ist, zeigt Apex Sitzung.
- **Adaptive Strategie und verschiebbare Karten folgen später** — Dieses Release liefert die wahrheitsgetreue Daten- und responsive Typografiegrundlage. Der adaptive Live-Kraftstoffplan, Virtual-Energy- oder Reifenstrategie sowie verschiebbare und größenveränderbare Live-Karten sind noch nicht enthalten.

## 0.4.1 — 2026-07-18

### English — Evidence-linked deterministic driver debrief

Analysis now finds repeated same-session driving differences with a local deterministic engine, then opens the exact subject and reference laps at the measured distance range behind each finding.

- **Find a pattern that actually repeats** — Apex compares only complete, clean, replayable laps with positive official LMU times from one session. The same laps must repeatedly lose time in the same 256 m zone and share a measured brake, throttle, coast or speed difference before Apex reports a hotspot.
- **Open the laps behind the finding** — Analysis separates Driver debrief from Lap evidence. Show evidence opens the reported representative lap beside that session's fastest strict reference, seeks the exact distance range and highlights it on the measured map and synchronized traces.
- **Keep raw evidence behind the local boundary** — The versioned review engine uses fixed distance, recurrence and measurement gates with at most 16 decoded laps. It runs in Electron's main process without AI or a network call; its review response contains bounded enum findings, counts and safe lap IDs, never raw samples, recording paths, payload hashes or driver identities. Show evidence requests only the named normalized lap pair through the existing local replay path.
- **Audit the complete private recording path** — The release audit strictly rebuilds all 422,467 frames of the gathered 1.7 GB recording, reopens and validates every durable lap payload, runs each session through the shipped review service twice, and rejects privacy leaks, invalid contracts or nondeterministic output.

**Known limitations**

- **A repeated trace difference is not a diagnosis** — The canonical lap payload does not retain comparable fuel, tyres, weather, traffic, setup or damage context. Apex therefore presents measured associations and small experiments, not causal explanations, promised gains or universal targets.
- **A review needs four strict laps** — One same-session reference plus at least three comparable laps are required. Larger cohorts are sampled deterministically to 16 while pinning the fastest reference; excluded and cohort-limited laps remain explicit rather than weakening the evidence gate.
- **The raw mapping does not identify race mode** — The engine has no online/offline branch and works identically for live and imported canonical laps, but the current LMU shared-memory contract has no authoritative mode field. Current-game offline and EAC-protected online compatibility remain separate native checks.

### Deutsch — Deterministische Fahrerauswertung mit Belegsprung

Die Analyse findet jetzt wiederkehrende Fahrunterschiede innerhalb einer Session mit einer lokalen deterministischen Engine und öffnet danach die exakten Vergleichsrunden im gemessenen Distanzbereich jeder Erkenntnis.

- **Finde ein Muster, das sich wirklich wiederholt** — Apex vergleicht ausschließlich vollständige, saubere und exakt abspielbare Runden mit positiven offiziellen LMU-Zeiten aus derselben Session. Dieselben Runden müssen im selben 256-m-Bereich wiederholt Zeit verlieren und einen gemeinsamen gemessenen Unterschied bei Bremse, Gas, Rollen oder Geschwindigkeit zeigen, bevor Apex einen Schwerpunkt meldet.
- **Öffne die Runden hinter der Erkenntnis** — Die Analyse trennt Fahrerauswertung und Rundenbelege. Belege anzeigen öffnet die gemeldete repräsentative Runde neben der schnellsten strikten Referenz dieser Session, springt in den exakten Distanzbereich und hebt ihn auf der gemessenen Karte und den synchronisierten Kurven hervor.
- **Halte Rohbelege hinter der lokalen Grenze** — Die versionierte Auswertungs-Engine verwendet feste Distanz-, Wiederholungs- und Messregeln mit höchstens 16 decodierten Runden. Sie läuft im Electron-Hauptprozess ohne KI oder Netzwerkaufruf; ihre Antwort enthält begrenzte Enum-Erkenntnisse, Anzahlen und sichere Runden-IDs, niemals Rohmesspunkte, Aufzeichnungspfade, Nutzdaten-Hashes oder Fahreridentitäten. Belege anzeigen fordert nur das benannte normalisierte Rundenpaar über den bestehenden lokalen Wiedergabepfad an.
- **Prüfe den vollständigen Pfad der privaten Aufzeichnung** — Das Release-Audit baut alle 422.467 Frames der gesammelten 1,7-GB-Aufzeichnung strikt neu auf, öffnet und prüft jede dauerhafte Rundennutzlast und führt jede Session zweimal durch den ausgelieferten Auswertungsdienst. Datenschutzlecks, ungültige Verträge oder nicht deterministische Ergebnisse lassen das Audit fehlschlagen.

**Bekannte Einschränkungen**

- **Ein wiederkehrender Kurvenunterschied ist keine Diagnose** — Die kanonischen Rundendaten speichern keinen vergleichbaren Kontext zu Kraftstoff, Reifen, Wetter, Verkehr, Setup oder Schäden. Apex zeigt deshalb gemessene Zusammenhänge und kleine Versuche, keine Ursachenbehauptungen, versprochenen Gewinne oder universellen Zielwerte.
- **Eine Auswertung benötigt vier strikte Runden** — Eine Referenz derselben Session und mindestens drei vergleichbare Runden sind erforderlich. Größere Gruppen werden deterministisch auf 16 Runden begrenzt, wobei die schnellste Referenz fest enthalten bleibt; ausgeschlossene und begrenzte Runden bleiben sichtbar, statt die Belegregel abzuschwächen.
- **Die Rohdatenabbildung kennzeichnet den Rennmodus nicht** — Die Engine besitzt keinen Online-/Offline-Zweig und arbeitet für live erfasste und importierte kanonische Runden gleich. Der aktuelle LMU-Shared-Memory-Vertrag enthält jedoch kein verbindliches Modusfeld; aktuelle Offline- und EAC-geschützte Online-Kompatibilität bleiben getrennte native Prüfungen.

## 0.3.2 — 2026-07-18

### English — Private race memory from raw recordings

Apex can now rebuild an explicitly selected .apexrec recording through the installed decoder into durable local Analysis, then describe only the pace and quality that LMU's measured evidence supports.

- **Import a complete recording into Analysis** — Import reconstructs every raw snapshot through the current decoder, writes into an isolated staging database, verifies the exact decoded byte stream and staged payloads, then commits the complete batch atomically. Cancellation, corruption, protocol faults and storage failures expose no partial history.
- **Debrief authoritative lap evidence** — Best lap, median pace, consistency, second-half change and the lap ledger use only positive lap times published by LMU. Untimed laps can retain their measured trace, but cannot silently become pace, a personal best or a comparison reference.
- **Judge route quality at LMU's measured cadence** — The versioned quality policy now uses 16 m circular coverage bins plus a separate 32 m maximum-gap guard, correcting false rejections caused by roughly 14–15.5 m scoring-distance updates while still rejecting real holes and incomplete laps.
- **Keep recording history private and separate** — The absolute source path never enters renderer state, diagnostics or durable history. Imported frames cannot feed the live overlay, lifetime distance or fuel calibration; ordinary Replay remains transient, and a complete matching import is deduplicated locally by recording hash and processing version.

**Known limitations**

- **Unproven legacy times are not pace** — Previously retained laps without durable proof that LMU published their time keep their trace but expose no pace, PB or learned-track eligibility. Re-importing the raw recording with this version can rebuild authoritative provenance.
- **The raw mapping does not identify race mode** — Online and offline sessions use the same supported decoder path, but the current LMU shared-memory contract has no authoritative online/offline field. Apex therefore never infers mode from opponent count or other circumstantial data.
- **A first import verifies the whole file** — Apex reads the selected recording completely for preflight hashing, strict decoding and commit-boundary verification. Work is accelerated without captured-time waits, but large recordings can still take time. Analysis retains at most 40 sessions and 2 GiB of compressed lap traces, so a successful import can replace older retained sessions.

### Deutsch — Privates Renngedächtnis aus Rohaufzeichnungen

Apex kann eine ausdrücklich gewählte .apexrec-Aufzeichnung jetzt mit dem installierten Decoder in die dauerhafte lokale Analyse übertragen und beschreibt danach nur Tempo und Qualität, die durch gemessene LMU-Daten belegt sind.

- **Importiere eine vollständige Aufzeichnung in die Analyse** — Der Import rekonstruiert jeden Rohdaten-Snapshot mit dem aktuellen Decoder, schreibt in eine isolierte Staging-Datenbank, prüft den exakt decodierten Bytestrom und alle zwischengespeicherten Nutzdaten und überträgt danach den vollständigen Satz atomar. Abbruch, Beschädigung, Protokollfehler und Speicherfehler machen keinen Teilverlauf sichtbar.
- **Werte verbindliche Rundenbelege aus** — Beste Runde, Mediandauer, Konstanz, Veränderung in der zweiten Hälfte und das Rundenprotokoll verwenden ausschließlich positive, von LMU veröffentlichte Rundenzeiten. Runden ohne Zeit können ihre gemessene Spur behalten, werden aber nicht unbemerkt zu Tempo, persönlicher Bestzeit oder Vergleichsreferenz.
- **Bewerte die Streckenqualität im gemessenen LMU-Takt** — Die versionierte Qualitätsregel nutzt jetzt umlaufende 16-m-Abdeckungssegmente und zusätzlich einen maximalen Abstand von 32 m. Dadurch verschwinden falsche Ablehnungen bei ungefähr 14–15,5 m großen Wertungsdistanz-Schritten, während echte Lücken und unvollständige Runden weiterhin abgelehnt werden.
- **Halte Aufzeichnungsverlauf privat und getrennt** — Der absolute Quellpfad gelangt weder in den Renderer-Zustand noch in Diagnosen oder den dauerhaften Verlauf. Importierte Frames können weder Live-Overlay, Gesamtdistanz noch Kraftstoffkalibrierung speisen; die normale Wiedergabe bleibt flüchtig, und ein vollständig vorhandener Import wird lokal anhand von Aufzeichnungshash und Verarbeitungsversion dedupliziert.

**Bekannte Einschränkungen**

- **Unbelegte ältere Zeiten gelten nicht als Tempo** — Früher gespeicherte Runden ohne dauerhaften Nachweis einer von LMU veröffentlichten Zeit behalten ihre Spur, zeigen aber weder Tempo noch PB- oder Streckenmodell-Eignung. Ein erneuter Import der Rohaufzeichnung mit dieser Version kann die verbindliche Herkunft wiederherstellen.
- **Die Rohdatenabbildung kennzeichnet den Rennmodus nicht** — Online- und Offline-Sessions verwenden denselben unterstützten Decoderpfad, doch der aktuelle LMU-Shared-Memory-Vertrag enthält kein verbindliches Online-/Offline-Feld. Apex leitet den Modus deshalb weder aus der Gegnerzahl noch aus anderen Indizien ab.
- **Ein erster Import prüft die gesamte Datei** — Apex liest die gewählte Aufzeichnung vollständig für Vorab-Hash, strikte Decodierung und Prüfung an der Commit-Grenze. Die Verarbeitung läuft ohne aufgezeichnete Zeitpausen, doch große Aufzeichnungen können weiterhin Zeit benötigen. Die Analyse behält höchstens 40 Sessions und 2 GiB komprimierte Rundendaten, daher kann ein erfolgreicher Import ältere gespeicherte Sessions ersetzen.

## 0.2.6 — 2026-07-17

### English — Reliable LMU scoring transitions

Sessions now stay live when LMU publishes transitional scoring values, while unavailable distances and gaps remain explicit instead of becoming invented timing.

- **Keep multi-car races connected** — The bridge now recognizes bounded signed lap-distance and timing transitions plus LMU's unavailable session-end sentinel. One opponent's transitional scoring no longer discards an otherwise coherent player snapshot.
- **Show absence instead of a false number** — Protocol v2 carries unavailable normalized lap distances, session timing and relative gaps as null. Apex keeps the bounded signed lap coordinate separately for start/finish detection, but never presents it as lap progress or opponent timing.
- **Verified across populated and solo-car sessions** — A private raw recording replayed 422,467 usable frames through the current decoder, including 358,720 frames with opponents and 63,747 without. Those population regimes do not by themselves identify online or offline mode, which the current LMU contract does not expose authoritatively.

**Known limitations**

- **Transitional gaps remain unavailable** — When LMU publishes a negative or unavailable relative-timing value, Apex shows no gap until a non-negative value arrives rather than guessing what the producer meant.

### Deutsch — Zuverlässige LMU-Wertungsübergänge

Sessions bleiben jetzt live, wenn LMU vorübergehende Wertungswerte veröffentlicht. Nicht verfügbare Distanzen und Abstände bleiben ausdrücklich unbekannt, statt erfundene Zeiten zu erzeugen.

- **Rennen mit mehreren Fahrzeugen bleiben verbunden** — Die Bridge erkennt jetzt begrenzte vorzeichenbehaftete Übergänge bei Rundendistanz und Zeit sowie den LMU-Platzhalter für eine nicht verfügbare Session-Endzeit. Ein vorübergehender Wert eines Gegners verwirft dadurch keinen ansonsten stimmigen Spieler-Snapshot mehr.
- **Zeige Abwesenheit statt einer falschen Zahl** — Protokoll v2 überträgt nicht verfügbare normalisierte Rundendistanzen, Sessionzeiten und relative Abstände als null. Apex behält die begrenzte vorzeichenbehaftete Rundenkoordinate separat für die Erkennung von Start und Ziel, zeigt sie aber nie als Rundenfortschritt oder Gegnerabstand an.
- **Mit belegten Mehr- und Einzelfahrzeug-Sessions geprüft** — Eine private Rohdatenaufzeichnung spielte 422.467 nutzbare Frames durch den aktuellen Decoder, darunter 358.720 Frames mit Gegnern und 63.747 ohne. Diese Belegung beweist allein weder Online- noch Offline-Modus; der aktuelle LMU-Vertrag stellt diesen Modus nicht verbindlich bereit.

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
