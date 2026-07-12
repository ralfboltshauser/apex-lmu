import type { CSSProperties } from "react";
import { formatMessage, useMessages } from "../../i18n";
import { visualMessages } from "../../i18n/visualMessages";
import "./visuals.css";

export type StintStatus = "completed" | "current" | "planned";
export type StrategyEventType = "pit" | "driver-change" | "weather" | "caution" | "note";

export interface StrategyStint {
  id: string;
  startLap: number;
  endLap: number;
  driver: string;
  driverCode?: string;
  compound?: string;
  color?: string;
  status?: StintStatus;
  fuelStart?: number;
  fuelEnd?: number;
  targetPace?: string;
}

export interface PitWindow {
  id: string;
  fromLap: number;
  toLap: number;
  label?: string;
  preferredLap?: number;
  color?: string;
}

export interface StrategyEvent {
  id: string;
  lap: number;
  type: StrategyEventType;
  label: string;
  color?: string;
}

export interface StintStrategyTimelineProps {
  stints: readonly StrategyStint[];
  totalLaps: number;
  currentLap?: number;
  pitWindows?: readonly PitWindow[];
  events?: readonly StrategyEvent[];
  title?: string;
  eyebrow?: string;
  reserveLaps?: number;
  className?: string;
  ariaLabel?: string;
}

const STINT_COLORS = ["#f0445d", "#5f9cff", "#55d6ad", "#f4c35d", "#b28cff"];
const EVENT_SYMBOLS: Record<StrategyEventType, string> = {
  pit: "P",
  "driver-change": "D",
  weather: "W",
  caution: "!",
  note: "•",
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const percent = (lap: number, totalLaps: number) => `${(clamp(lap, 0, totalLaps) / totalLaps) * 100}%`;

export function StintStrategyTimeline({
  stints,
  totalLaps,
  currentLap = 0,
  pitWindows = [],
  events = [],
  title,
  eyebrow,
  reserveLaps,
  className = "",
  ariaLabel,
}: StintStrategyTimelineProps) {
  const m = useMessages(visualMessages).strategy;
  const resolvedTitle = title ?? m.defaultTitle;
  const resolvedEyebrow = eyebrow ?? m.defaultEyebrow;
  const safeTotal = Math.max(totalLaps, 1);
  const progress = clamp(currentLap / safeTotal, 0, 1);
  const remaining = Math.max(Math.ceil(totalLaps - currentLap), 0);
  const tickCount = safeTotal <= 12 ? safeTotal : 6;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) =>
    Math.round((safeTotal * index) / tickCount),
  );

  return (
    <section className={`visual-card visual-strategy-timeline ${className}`.trim()} aria-label={ariaLabel ?? resolvedTitle}>
      <header className="visual-header strategy-header">
        <div className="visual-title-group">
          <span className="visual-eyebrow">{resolvedEyebrow}</span>
          <h3 className="visual-title">{resolvedTitle}</h3>
        </div>
        <div className="strategy-summary" aria-label={m.raceProgress}>
          <span><i>{m.now}</i><strong>L{Math.floor(currentLap)}</strong></span>
          <span><i>{m.remaining}</i><strong>{remaining} {m.laps}</strong></span>
          {Number.isFinite(reserveLaps) && <span><i>{m.reserve}</i><strong>+{reserveLaps} L</strong></span>}
        </div>
      </header>

      <div className="strategy-overview">
        <div className="strategy-scale" aria-hidden="true">
          {ticks.map((tick, index) => (
            <span
              key={`${tick}-${index}`}
              style={{ left: percent(tick, safeTotal) }}
              data-edge={index === 0 ? "start" : index === ticks.length - 1 ? "end" : undefined}
            >
              {tick === 0 ? m.start : `L${tick}`}
            </span>
          ))}
        </div>

        <div className="strategy-track">
          <div className="strategy-grid-lines" aria-hidden="true">
            {ticks.map((tick, index) => (
              <i key={`${tick}-${index}`} style={{ left: percent(tick, safeTotal) }} />
            ))}
          </div>

          {pitWindows.map((window) => {
            const left = (clamp(window.fromLap, 0, safeTotal) / safeTotal) * 100;
            const right = (clamp(window.toLap, 0, safeTotal) / safeTotal) * 100;
            const style = {
              left: `${Math.min(left, right)}%`,
              width: `${Math.abs(right - left)}%`,
              "--window-color": window.color ?? "#f4c35d",
            } as CSSProperties;
            return (
              <div
                key={window.id}
                className="strategy-pit-window"
                style={style}
                title={window.label ?? formatMessage(m.pitWindowRange, { from: window.fromLap, to: window.toLap })}
              >
                {window.preferredLap !== undefined && (
                  <i
                    style={{ left: percent(window.preferredLap - window.fromLap, Math.max(window.toLap - window.fromLap, 1)) }}
                  />
                )}
              </div>
            );
          })}

          <div className="strategy-stint-bar" aria-hidden="true">
            {stints.map((stint, index) => {
              const from = clamp(stint.startLap, 0, safeTotal);
              const to = clamp(stint.endLap, 0, safeTotal);
              const color = stint.color ?? STINT_COLORS[index % STINT_COLORS.length];
              const style = {
                left: percent(Math.min(from, to), safeTotal),
                width: percent(Math.max(Math.abs(to - from), 0.2), safeTotal),
                "--stint-color": color,
              } as CSSProperties;
              return (
                <div
                  className="strategy-stint-segment"
                  data-status={stint.status ?? (currentLap >= stint.endLap ? "completed" : currentLap >= stint.startLap ? "current" : "planned")}
                  key={stint.id}
                  style={style}
                >
                  <span>{stint.driverCode ?? stint.driver.slice(0, 3).toUpperCase()}</span>
                  {stint.compound && <i>{stint.compound}</i>}
                </div>
              );
            })}
          </div>

          {events.map((event) => {
            const style = {
              left: percent(event.lap, safeTotal),
              "--event-color": event.color ?? "#f5f7fb",
            } as CSSProperties;
            return (
              <div className="strategy-event" key={event.id} style={style} title={formatMessage(m.eventLap, { event: event.label, lap: event.lap })}>
                <span>{EVENT_SYMBOLS[event.type]}</span>
              </div>
            );
          })}

          <div className="strategy-now" style={{ left: `${progress * 100}%` }} aria-hidden="true">
            <span>{m.now.toUpperCase()}</span>
            <i />
          </div>
        </div>

        {pitWindows.length > 0 && (
          <div className="strategy-window-labels">
            {pitWindows.map((window) => (
              <span key={window.id}>
                <i style={{ background: window.color ?? "#f4c35d" }} />
                {window.label ?? m.pitWindow} · L{window.fromLap}–{window.toLap}
              </span>
            ))}
          </div>
        )}
      </div>

      <ol className="strategy-stint-list" aria-label={m.plannedStints}>
        {stints.map((stint, index) => {
          const status = stint.status ??
            (currentLap >= stint.endLap ? "completed" : currentLap >= stint.startLap ? "current" : "planned");
          const color = stint.color ?? STINT_COLORS[index % STINT_COLORS.length];
          const style = { "--stint-color": color } as CSSProperties;
          return (
            <li key={stint.id} data-status={status} style={style}>
              <div className="strategy-stint-index">
                <span>{index + 1}</span>
                <i />
              </div>
              <div className="strategy-stint-driver">
                <strong>{stint.driver}</strong>
                <span>L{stint.startLap}–{stint.endLap} · {Math.max(stint.endLap - stint.startLap, 0)} {m.laps}</span>
              </div>
              <div className="strategy-stint-meta">
                {stint.compound && <span><i>{m.tyre}</i><strong>{stint.compound}</strong></span>}
                {Number.isFinite(stint.fuelStart) && (
                  <span><i>{m.fuel}</i><strong>{stint.fuelStart} → {stint.fuelEnd ?? "—"} L</strong></span>
                )}
                {stint.targetPace && <span><i>{m.target}</i><strong>{stint.targetPace}</strong></span>}
              </div>
              {status === "current" && <b className="strategy-current-badge">{m.onTrack}</b>}
            </li>
          );
        })}
      </ol>

      {events.length > 0 && (
        <ul className="visuals-sr-only" aria-label={m.events}>
          {events.map((event) => <li key={event.id}>{formatMessage(m.eventOnLap, { event: event.label, lap: event.lap })}</li>)}
        </ul>
      )}
    </section>
  );
}
