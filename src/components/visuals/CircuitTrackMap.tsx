import { useId, type CSSProperties, type KeyboardEvent } from "react";
import "./visuals.css";

export interface TrackPoint {
  x: number;
  y: number;
}

export interface TrackCar {
  id: string;
  number: string | number;
  progress: number;
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
  if (finite.length < 3) return [...DEMO_CIRCUIT_PATH];
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
  }));
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

function closedPath(points: readonly TrackPoint[]) {
  return `${points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ")} Z`;
}

function segmentPath(
  points: readonly TrackPoint[],
  lengths: readonly number[],
  total: number,
  segment: TrackSegment,
) {
  const from = wrapProgress(segment.from);
  let distance = wrapProgress(segment.to) - from;
  if (Math.abs(distance) < 0.000001) return "";
  if (distance <= 0) distance += 1;
  const samples = Math.max(12, Math.ceil(distance * 90));
  const sampled = Array.from({ length: samples + 1 }, (_, index) =>
    pointAtProgress(points, lengths, total, from + (distance * index) / samples),
  );
  return sampled
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

export function CircuitTrackMap({
  points = DEMO_CIRCUIT_PATH,
  cars = [],
  activeSegment,
  circuitName = "Circuit map",
  layoutName,
  currentLap,
  className = "",
  ariaLabel,
  onCarSelect,
}: CircuitTrackMapProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const normalized = normalizePath(points);
  const metrics = pathMetrics(normalized);
  const circuitPath = closedPath(normalized);
  const start = pointAtProgress(normalized, metrics.lengths, metrics.total, 0);
  const tangentPoint = pointAtProgress(normalized, metrics.lengths, metrics.total, 0.008);
  const tangentAngle = Math.atan2(tangentPoint.y - start.y, tangentPoint.x - start.x);
  const normalX = Math.sin(tangentAngle) * 10;
  const normalY = -Math.cos(tangentAngle) * 10;

  const onKeyDown = (event: KeyboardEvent<SVGGElement>, car: TrackCar) => {
    if (!onCarSelect || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onCarSelect(car);
  };

  return (
    <section className={`visual-card circuit-map ${className}`.trim()} aria-label={ariaLabel ?? circuitName}>
      <header className="visual-header circuit-map-header">
        <div className="visual-title-group">
          <span className="visual-eyebrow">Track position</span>
          <h3 className="visual-title">{circuitName}</h3>
          {layoutName && <span className="visual-subtitle">{layoutName}</span>}
        </div>
        {Number.isFinite(currentLap) && (
          <div className="circuit-lap">
            <span>Lap</span>
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
          <title id={`${uid}-title`}>{ariaLabel ?? `${circuitName} live track map`}</title>
          <desc id={`${uid}-desc`}>
            {`${cars.length} cars shown${activeSegment?.label ? `, highlighting ${activeSegment.label}` : ""}.`}
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

          {activeSegment && (
            <>
              <path
                className="circuit-segment-glow"
                d={segmentPath(normalized, metrics.lengths, metrics.total, activeSegment)}
                stroke={activeSegment.color ?? "#f0445d"}
              />
              <path
                className="circuit-segment"
                d={segmentPath(normalized, metrics.lengths, metrics.total, activeSegment)}
                stroke={activeSegment.color ?? "#f0445d"}
              />
            </>
          )}

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
            const position = pointAtProgress(normalized, metrics.lengths, metrics.total, car.progress);
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
                aria-label={`${car.label ?? `Car ${car.number}`}, ${Math.round(wrapProgress(car.progress) * 100)} percent around the lap`}
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
                  <title>{`${car.className}: ${car.label ?? `Car ${car.number}`}`}</title>
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

      <ul className="visuals-sr-only" aria-label="Cars on circuit">
        {cars.map((car) => (
          <li key={car.id}>{`${car.label ?? `Car ${car.number}`}: ${Math.round(wrapProgress(car.progress) * 100)}% lap progress`}</li>
        ))}
      </ul>
    </section>
  );
}
