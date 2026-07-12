import type { CSSProperties } from "react";
import "./visuals.css";

export type WheelPosition = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";
export type ThermalStatus = "cold" | "optimal" | "warm" | "hot" | "critical" | "unknown";

export interface TyreTemperatures {
  inner?: number;
  middle?: number;
  outer?: number;
}
export interface WheelState {
  pressure?: number;
  temperatures?: TyreTemperatures;
  brakeTemperature?: number;
  wearRemainingPercent?: number;
  status?: ThermalStatus;
  compound?: string;
}

export interface ThermalRange {
  min: number;
  max: number;
}

export interface TyreBrakeStateProps {
  wheels: Partial<Record<WheelPosition, WheelState>>;
  title?: string;
  eyebrow?: string;
  pressureUnit?: "bar" | "psi" | "kPa";
  temperatureUnit?: "°C" | "°F";
  targetTyreTemperature?: ThermalRange;
  targetBrakeTemperature?: ThermalRange;
  targetPressure?: ThermalRange;
  className?: string;
  ariaLabel?: string;
}

const POSITIONS: readonly WheelPosition[] = ["frontLeft", "frontRight", "rearLeft", "rearRight"];
const POSITION_LABELS: Record<WheelPosition, { short: string; long: string; axle: string; side: "left" | "right" }> = {
  frontLeft: { short: "FL", long: "Front left", axle: "front", side: "left" },
  frontRight: { short: "FR", long: "Front right", axle: "front", side: "right" },
  rearLeft: { short: "RL", long: "Rear left", axle: "rear", side: "left" },
  rearRight: { short: "RR", long: "Rear right", axle: "rear", side: "right" },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number | undefined): value is number => Number.isFinite(value);

function thermalStatus(value: number | undefined, target: ThermalRange): ThermalStatus {
  if (!finite(value)) return "unknown";
  const span = Math.max(target.max - target.min, 1);
  if (value < target.min - span * 0.35) return "cold";
  if (value < target.min) return "warm";
  if (value <= target.max) return "optimal";
  if (value <= target.max + span * 0.35) return "hot";
  return "critical";
}

function statusColor(status: ThermalStatus): string {
  switch (status) {
    case "cold":
      return "#6aa7ff";
    case "optimal":
      return "#55d6ad";
    case "warm":
      return "#f3c96a";
    case "hot":
      return "#ff8a4c";
    case "critical":
      return "#f0445d";
    default:
      return "#6e7582";
  }
}

function meanTemperature(temperatures: TyreTemperatures | undefined) {
  const values = [temperatures?.inner, temperatures?.middle, temperatures?.outer].filter(finite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

function formatMetric(value: number | undefined, digits = 0) {
  return finite(value) ? value.toFixed(digits) : "—";
}

interface WheelCardProps {
  position: WheelPosition;
  state: WheelState | undefined;
  pressureUnit: string;
  temperatureUnit: string;
  targetTyreTemperature: ThermalRange;
  targetBrakeTemperature: ThermalRange;
  targetPressure?: ThermalRange;
}

function WheelCard({
  position,
  state,
  pressureUnit,
  temperatureUnit,
  targetTyreTemperature,
  targetBrakeTemperature,
  targetPressure,
}: WheelCardProps) {
  const meta = POSITION_LABELS[position];
  const average = meanTemperature(state?.temperatures);
  const status = state?.status ?? thermalStatus(average, targetTyreTemperature);
  const brakeStatus = thermalStatus(state?.brakeTemperature, targetBrakeTemperature);
  const pressureStatus = targetPressure ? thermalStatus(state?.pressure, targetPressure) : "unknown";
  const visualTemperatures =
    meta.side === "left"
      ? [state?.temperatures?.outer, state?.temperatures?.middle, state?.temperatures?.inner]
      : [state?.temperatures?.inner, state?.temperatures?.middle, state?.temperatures?.outer];
  const wear = finite(state?.wearRemainingPercent) ? clamp(state.wearRemainingPercent, 0, 100) : undefined;
  const style = {
    "--wheel-status": statusColor(status),
    "--brake-status": statusColor(brakeStatus),
    "--pressure-status": statusColor(pressureStatus),
    "--wear": `${wear ?? 0}%`,
  } as CSSProperties;

  return (
    <article
      className="wheel-card"
      data-axle={meta.axle}
      data-side={meta.side}
      data-status={status}
      style={style}
      aria-label={`${meta.long} tyre and brake`}
    >
      <header className="wheel-card-header">
        <div>
          <strong>{meta.short}</strong>
          {state?.compound && <span>{state.compound}</span>}
        </div>
        <span className="wheel-status">
          <i aria-hidden="true" /> {status === "unknown" ? "No data" : status}
        </span>
      </header>

      <div className="wheel-visual-row" aria-hidden="true">
        <div className="tyre-glyph">
          <span className="tyre-tread tyre-tread-a" />
          <span className="tyre-tread tyre-tread-b" />
          <div className="tyre-thermal-bands">
            {visualTemperatures.map((temperature, index) => (
              <span
                key={index}
                style={{ backgroundColor: statusColor(thermalStatus(temperature, targetTyreTemperature)) }}
              />
            ))}
          </div>
        </div>
        <div className="brake-glyph" title="Brake temperature">
          <span />
          <i />
        </div>
        <div className="wheel-primary-temp">
          <strong>{formatMetric(average)}</strong>
          <span>{temperatureUnit} avg</span>
        </div>
      </div>

      <dl className="wheel-metrics">
        <div>
          <dt>Pressure</dt>
          <dd data-alert={targetPressure && pressureStatus !== "optimal" ? true : undefined}>
            {formatMetric(state?.pressure, pressureUnit === "bar" ? 2 : 1)} <span>{pressureUnit}</span>
          </dd>
        </div>
        <div>
          <dt>Brake</dt>
          <dd>
            {formatMetric(state?.brakeTemperature)} <span>{temperatureUnit}</span>
          </dd>
        </div>
      </dl>

      <div className="tyre-temperature-detail" aria-label="Tyre carcass temperatures">
        {(["inner", "middle", "outer"] as const).map((zone) => (
          <div key={zone}>
            <span>{zone[0].toUpperCase()}</span>
            <strong>{formatMetric(state?.temperatures?.[zone])}</strong>
          </div>
        ))}
      </div>

      <div className="wheel-wear" data-empty={!finite(wear) || undefined}>
        <span>
          <i>Tyre remaining</i>
          <b>{finite(wear) ? `${Math.round(wear)}%` : "—"}</b>
        </span>
        <div aria-hidden="true">
          <i />
        </div>
      </div>
    </article>
  );
}

export function TyreBrakeState({
  wheels,
  title = "Tyres & brakes",
  eyebrow = "Car state",
  pressureUnit = "bar",
  temperatureUnit = "°C",
  targetTyreTemperature = { min: 75, max: 105 },
  targetBrakeTemperature = { min: 350, max: 750 },
  targetPressure,
  className = "",
  ariaLabel,
}: TyreBrakeStateProps) {
  return (
    <section className={`visual-card tyre-state ${className}`.trim()} aria-label={ariaLabel ?? title}>
      <header className="visual-header">
        <div className="visual-title-group">
          <span className="visual-eyebrow">{eyebrow}</span>
          <h3 className="visual-title">{title}</h3>
        </div>
        <div className="thermal-legend" aria-label="Temperature status legend">
          <span><i className="is-cold" /> Cold</span>
          <span><i className="is-optimal" /> Window</span>
          <span><i className="is-hot" /> Hot</span>
        </div>
      </header>

      <div className="wheel-grid">
        <div className="car-silhouette" aria-hidden="true">
          <svg viewBox="0 0 76 212">
            <path d="M27 10h22l7 30 10 18 2 41-7 21 2 63-10 19H23l-10-19 2-63-7-21 2-41 10-18z" />
            <path d="M25 48h26l7 20-5 29H23l-5-29zM24 112h28l3 56-8 19H29l-8-19z" />
            <path d="M7 36h16M53 36h16M5 178h18M53 178h18" />
          </svg>
          <span>Front</span>
        </div>
        {POSITIONS.map((position) => (
          <WheelCard
            key={position}
            position={position}
            state={wheels[position]}
            pressureUnit={pressureUnit}
            temperatureUnit={temperatureUnit}
            targetTyreTemperature={targetTyreTemperature}
            targetBrakeTemperature={targetBrakeTemperature}
            targetPressure={targetPressure}
          />
        ))}
      </div>
    </section>
  );
}
