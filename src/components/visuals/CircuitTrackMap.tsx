import { useId, type CSSProperties, type KeyboardEvent } from "react";
import { formatMessage, useMessages } from "../../i18n";
import { visualMessages } from "../../i18n/visualMessages";
import "./visuals.css";

export interface TrackPoint {
  x: number;
  y: number;
  /** LMU lap distance retained independently from rendered polyline length. */
  distanceM?: number;
}

export interface TrackCar {
  id: string;
  number: string | number;
  progress?: number;
  distanceM?: number;
  /** Measured world position in the same coordinate space as points. */
  position?: TrackPoint;
  color?: string;
  label?: string;
  className?: string;
  selected?: boolean;
}

export interface TrackSegment {
  from: number;
  to: number;
  label?: string;
  color?: string;
}

export interface CircuitTrackMapProps {
  points?: readonly TrackPoint[];
  cars?: readonly TrackCar[];
  activeSegment?: TrackSegment;
  segments?: readonly TrackSegment[];
  trackLengthM?: number;
  closed?: boolean;
  emptyMessage?: string;
  circuitName?: string;
  layoutName?: string;
  currentLap?: number;
  className?: string;
  ariaLabel?: string;
  onCarSelect?: (car: TrackCar) => void;
}

export const DEMO_CIRCUIT_PATH: readonly TrackPoint[] = [
  { x: 84, y: 190 },
  { x: 62, y: 155 },
  { x: 74, y: 119 },
  { x: 128, y: 98 },
  { x: 171, y: 63 },
  { x: 243, y: 54 },
  { x: 314, y: 66 },
  { x: 352, y: 46 },
  { x: 398, y: 64 },
  { x: 421, y: 100 },
  { x: 410, y: 126 },
  { x: 366, y: 137 },
  { x: 350, y: 171 },
  { x: 371, y: 204 },
  { x: 345, y: 226 },
  { x: 297, y: 218 },
  { x: 258, y: 189 },
  { x: 220, y: 202 },
  { x: 181, y: 224 },
  { x: 130, y: 221 },
];

const WIDTH = 480;
const HEIGHT = 280;
const MAP_PADDING = 30;
const wrapProgress = (value: number) => ((value % 1) + 1) % 1;

function normalizePath(points: readonly TrackPoint[]): TrackPoint[] {
  const finite = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (finite.length < 2) return finite;
  const xs = finite.map((point) => point.x);
  const ys = finite.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sourceWidth = Math.max(maxX - minX, 1);
  const sourceHeight = Math.max(maxY - minY, 1);
  const scale = Math.min(
    (WIDTH - MAP_PADDING * 2) / sourceWidth,
    (HEIGHT - MAP_PADDING * 2) / sourceHeight,
  );
  const offsetX = (WIDTH - sourceWidth * scale) / 2;
  const offsetY = (HEIGHT - sourceHeight * scale) / 2;
  return finite.map((point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
    distanceM: point.distanceM,
  }));
}

function projectPoint(point: TrackPoint, source: readonly TrackPoint[], normalized: readonly TrackPoint[]) {
  if (source.length < 2 || normalized.length < 2) return normalized[0] ?? { x: WIDTH / 2, y: HEIGHT / 2 };
  const minX = Math.min(...source.map((value) => value.x));
  const maxX = Math.max(...source.map((value) => value.x));
  const minY = Math.min(...source.map((value) => value.y));
  const maxY = Math.max(...source.map((value) => value.y));
  const normalizedMinX = Math.min(...normalized.map((value) => value.x));
  const normalizedMaxX = Math.max(...normalized.map((value) => value.x));
  const normalizedMinY = Math.min(...normalized.map((value) => value.y));
  const normalizedMaxY = Math.max(...normalized.map((value) => value.y));
  return {
    x: normalizedMinX + (point.x - minX) / Math.max(1, maxX - minX) * (normalizedMaxX - normalizedMinX),
    y: normalizedMinY + (point.y - minY) / Math.max(1, maxY - minY) * (normalizedMaxY - normalizedMinY),
  };
}

function pathMetrics(points: readonly TrackPoint[]) {
  const lengths: number[] = [];
  let total = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const length = Math.hypot(next.x - point.x, next.y - point.y);
    lengths.push(length);
    total += length;
  });
  return { lengths, total };
}

function pointAtProgress(
  points: readonly TrackPoint[],
  lengths: readonly number[],
  total: number,
  progress: number,
) {
  let remaining = wrapProgress(progress) * total;
  for (let index = 0; index < points.length; index += 1) {
    const segmentLength = lengths[index];
    if (remaining <= segmentLength || index === points.length - 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const ratio = segmentLength ? remaining / segmentLength : 0;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    remaining -= segmentLength;
  }
  return points[0];
}

function pointAtMeasuredProgress(
  source: readonly TrackPoint[],
  normalized: readonly TrackPoint[],
  trackLengthM: number | undefined,
  progress: number,
) {
  if (!trackLengthM || !source.every((point) => Number.isFinite(point.distanceM))) return null;
  const target = wrapProgress(progress) * trackLengthM;
  if (target <= source[0].distanceM!) return normalized[0];
  if (target >= source.at(-1)!.distanceM!) return normalized.at(-1)!;
  let after = 1;
  while (after < source.length && source[after].distanceM! < target) after += 1;
  const before = after - 1;
  const span = source[after].distanceM! - source[before].distanceM!;
  const ratio = span > 0 ? (target - source[before].distanceM!) / span : 0;
  return {
    x: normalized[before].x + (normalized[after].x - normalized[before].x) * ratio,
    y: normalized[before].y + (normalized[after].y - normalized[before].y) * ratio,
  };
}

function renderedPath(points: readonly TrackPoint[], closed: boolean) {
  return `${points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ")}${closed ? ' Z' : ''}`;
}

function segmentPath(
  segment: TrackSegment,
  resolveProgress: (progress: number) => TrackPoint,
) {
  const from = wrapProgress(segment.from);
  let distance = wrapProgress(segment.to) - from;
  if (Math.abs(distance) < 0.000001) return "";
  if (distance <= 0) distance += 1;
  const samples = Math.max(12, Math.ceil(distance * 90));
  const sampled = Array.from({ length: samples + 1 }, (_, index) =>
    resolveProgress(from + (distance * index) / samples),
  );
  return sampled
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

export function CircuitTrackMap({
  points = DEMO_CIRCUIT_PATH,
  cars = [],
  activeSegment,
  segments = activeSegment ? [activeSegment] : [],
  trackLengthM,
  closed = true,
  emptyMessage,
  circuitName,
  layoutName,
  currentLap,
  className = "",
  ariaLabel,
  onCarSelect,
}: CircuitTrackMapProps) {
  const m = useMessages(visualMessages).circuit;
  const resolvedCircuitName = circuitName ?? m.defaultTitle;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const normalized = normalizePath(points);
  if (normalized.length < 2) {
    return <section className={`visual-card circuit-map ${className}`.trim()} aria-label={ariaLabel ?? resolvedCircuitName}>
      <header className="visual-header circuit-map-header"><div className="visual-title-group"><span className="visual-eyebrow">{m.trackPosition}</span><h3 className="visual-title">{resolvedCircuitName}</h3>{layoutName && <span className="visual-subtitle">{layoutName}</span>}</div></header>
      <div className="circuit-canvas circuit-canvas--empty"><span>{emptyMessage ?? resolvedCircuitName}</span></div>
    </section>;
  }
  const metrics = pathMetrics(normalized);
  const resolveProgress = (progress: number) => pointAtMeasuredProgress(points, normalized, trackLengthM, progress)
    ?? pointAtProgress(normalized, metrics.lengths, metrics.total, progress);
  const circuitPath = renderedPath(normalized, closed);
  const start = resolveProgress(0);
  const tangentPoint = resolveProgress(0.008);
  const tangentAngle = Math.atan2(tangentPoint.y - start.y, tangentPoint.x - start.x);
  const normalX = Math.sin(tangentAngle) * 10;
  const normalY = -Math.cos(tangentAngle) * 10;

  const onKeyDown = (event: KeyboardEvent<SVGGElement>, car: TrackCar) => {
    if (!onCarSelect || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onCarSelect(car);
  };

  return (
    <section className={`visual-card circuit-map ${className}`.trim()} aria-label={ariaLabel ?? resolvedCircuitName}>
      <header className="visual-header circuit-map-header">
        <div className="visual-title-group">
          <span className="visual-eyebrow">{m.trackPosition}</span>
          <h3 className="visual-title">{resolvedCircuitName}</h3>
          {layoutName && <span className="visual-subtitle">{layoutName}</span>}
        </div>
        {Number.isFinite(currentLap) && (
          <div className="circuit-lap">
            <span>{m.lap}</span>
            <strong>{currentLap}</strong>
          </div>
        )}
      </header>

      <div className="circuit-canvas">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role={onCarSelect ? "group" : "img"}
          aria-labelledby={`${uid}-title ${uid}-desc`}
        >
          <title id={`${uid}-title`}>{ariaLabel ?? formatMessage(m.liveMap, { circuit: resolvedCircuitName })}</title>
          <desc id={`${uid}-desc`}>
            {formatMessage(m.carsShown, { count: cars.length })}{activeSegment?.label ? formatMessage(m.highlighting, { segment: activeSegment.label }) : ''}.
          </desc>
          <defs>
            <filter id={`${uid}-track-glow`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <filter id={`${uid}-car-shadow`} x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity="0.7" />
            </filter>
            <pattern id={`${uid}-grid`} width="22" height="22" patternUnits="userSpaceOnUse">
              <path d="M 22 0 L 0 0 0 22" fill="none" stroke="rgba(255,255,255,.035)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect x="0" y="0" width={WIDTH} height={HEIGHT} rx="14" fill={`url(#${uid}-grid)`} />
          <path className="circuit-track-glow" d={circuitPath} filter={`url(#${uid}-track-glow)`} />
          <path className="circuit-track-bed" d={circuitPath} />
          <path className="circuit-track-line" d={circuitPath} />
          <path className="circuit-track-center" d={circuitPath} />

          {segments.map((segment, index) => (
            <g key={`${segment.from}-${segment.to}-${index}`}>
              <path
                className="circuit-segment-glow"
                d={segmentPath(segment, resolveProgress)}
                stroke={segment.color ?? "#f0445d"}
              />
              <path
                className="circuit-segment"
                d={segmentPath(segment, resolveProgress)}
                stroke={segment.color ?? "#f0445d"}
              />
            </g>
          ))}

          <g className="circuit-start" aria-hidden="true">
            <line
              x1={start.x - normalX}
              y1={start.y - normalY}
              x2={start.x + normalX}
              y2={start.y + normalY}
            />
            <circle cx={start.x} cy={start.y} r="2.3" />
          </g>

          {cars.map((car) => {
            const progress = car.progress ?? (trackLengthM && car.distanceM !== undefined ? car.distanceM / trackLengthM : 0);
            const position = car.position ? projectPoint(car.position, points, normalized) : resolveProgress(progress);
            const color = car.color ?? (car.selected ? "#f0445d" : "#f5f7fb");
            const style = { "--car-color": color } as CSSProperties;
            return (
              <g
                className="circuit-car"
                data-selected={car.selected || undefined}
                key={car.id}
                transform={`translate(${position.x} ${position.y})`}
                style={style}
                role={onCarSelect ? "button" : undefined}
                tabIndex={onCarSelect ? 0 : undefined}
                aria-label={formatMessage(m.carPosition, { car: car.label ?? formatMessage(m.car, { number: car.number }), percent: Math.round(wrapProgress(progress) * 100) })}
                onClick={onCarSelect ? () => onCarSelect(car) : undefined}
                onKeyDown={(event) => onKeyDown(event, car)}
                filter={`url(#${uid}-car-shadow)`}
              >
                {car.selected && <circle className="circuit-car-halo" r="15" />}
                <circle className="circuit-car-dot" r={car.selected ? 9.5 : 8.2} />
                <text y="3.2" textAnchor="middle" aria-hidden="true">
                  {String(car.number).slice(0, 3)}
                </text>
                {car.className && (
                  <title>{`${car.className}: ${car.label ?? formatMessage(m.car, { number: car.number })}`}</title>
                )}
              </g>
            );
          })}
        </svg>

        {activeSegment?.label && (
          <div className="circuit-segment-label">
            <span style={{ background: activeSegment.color ?? "#f0445d" }} />
            {activeSegment.label}
          </div>
        )}
      </div>

      <ul className="visuals-sr-only" aria-label={m.carsOnCircuit}>
        {cars.map((car) => (
          <li key={car.id}>{formatMessage(m.lapProgress, { car: car.label ?? formatMessage(m.car, { number: car.number }), percent: Math.round(wrapProgress(car.progress ?? (trackLengthM && car.distanceM !== undefined ? car.distanceM / trackLengthM : 0)) * 100) })}</li>
        ))}
      </ul>
    </section>
  );
}
