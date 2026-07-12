# Apex for LMU 0.1.14

## English

- Select any connected display for the race overlay, including mixed-scale and
  negative-origin desktop layouts.
- Overlay opening now waits for the renderer, reports failures and never steals
  LMU focus or creates a taskbar entry.
- Widget visibility and opacity use one validated local configuration shared by
  Overlay Studio and the live HUD.
- Session-only scoring remains visible while unavailable vehicle telemetry is
  shown as unavailable instead of zero.
- Added deterministic close/reopen, display hot-plug fallback, diagnostics and
  default-deny handling for unexpected Chromium permission requests.

No screen-capture permission is required. Use LMU in borderless or windowed
mode; exclusive fullscreen can cover desktop overlays.

## Deutsch

- Das Renn-Overlay kann auf jedem angeschlossenen Bildschirm angezeigt werden,
  auch bei gemischter Skalierung und Bildschirmen links vom Primärbildschirm.
- Das Öffnen wartet jetzt auf den Renderer, meldet Fehler und entzieht LMU nie
  den Fokus oder erzeugt einen Taskleisteneintrag.
- Widget-Sichtbarkeit und Deckkraft verwenden eine validierte lokale
  Konfiguration für Overlay-Studio und Live-HUD.
- Wertungsdaten bleiben ohne Fahrzeugtelemetrie sichtbar; fehlende Messwerte
  erscheinen als nicht verfügbar statt als Null.
- Schließen und erneutes Öffnen, Bildschirmwechsel, Diagnose und das Ablehnen
  unerwarteter Chromium-Berechtigungen sind jetzt definiert und getestet.

Eine Bildschirmaufnahme-Berechtigung ist nicht erforderlich. Verwende LMU im
randlosen oder Fenstermodus; exklusives Vollbild kann Desktop-Overlays verdecken.
