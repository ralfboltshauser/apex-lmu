import { useId, useMemo, type CSSProperties } from "react";
import "./visuals.css";

export interface TelemetryPoint {
  x: number;
  y: number;
}

export interface TelemetrySeries {
  id: string;
  label: string;
  values: readonly TelemetryPoint[];
  color?: string;
  unit?: string;
  area?: boolean;
  dashed?: boolean;
  hidden?: boolean;
}

export interface TelemetryZone {
  id: string;
  from: number;
  to: number;
  label?: string;
  color?: string;
}

export interface TelemetryChartProps {
  series: readonly TelemetrySeries[];
  zones?: readonly TelemetryZone[];
  xDomain?: readonly [number, number];
  yDomain?: readonly [number, number];
  cursorX?: number;
  height?: number;
  title?: string;
  eyebrow?: string;
  xLabel?: string;
  live?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  className?: string;
  ariaLabel?: string;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  formatValue?: (value: number, series: TelemetrySeries) => string;
}

const PALETTE = ["#f0445d", "#60d6b1", "#ffcb66", "#6aa7ff", "#b78cff"];
const WIDTH = 720;
const PADDING = { top: 14, right: 14, bottom: 30, left: 48 };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function safeDomain(
  values: readonly number[],
  domain: readonly [number, number] | undefined,
  pad = false,
): [number, number] {
  const finiteDomain = domain?.every(Number.isFinite) ? domain : undefined;
  let min = finiteDomain?.[0] ?? Math.min(...values);
  let max = finiteDomain?.[1] ?? Math.max(...values);

  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    const expansion = Math.max(Math.abs(min) * 0.08, 1);
    return [min - expansion, max + expansion];
  }

  if (!domain && pad) {
    const expansion = (max - min) * 0.08;
    return [min - expansion, max + expansion];
  }

  return [min, max];
}

function linePath(points: readonly { x: number; y: number }[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

function closestPoint(values: readonly TelemetryPoint[], targetX: number) {
  if (!values.length) return undefined;
  return values.reduce((closest, point) =>
    Math.abs(point.x - targetX) < Math.abs(closest.x - targetX) ? point : closest,
  );
}

const defaultNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

export function TelemetryChart({
  series,
  zones = [],
  xDomain,
  yDomain,
  cursorX,
  height = 220,
  title = "Telemetry",
  eyebrow,
  xLabel,
  live = false,
  showLegend = true,
  showGrid = true,
  className = "",
  ariaLabel,
  formatX = defaultNumber,
  formatY = defaultNumber,
  formatValue,
}: TelemetryChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const visibleSeries = series.filter((item) => !item.hidden);
  const allPoints = visibleSeries.flatMap((item) =>
    item.values.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
  );
  const [xMin, xMax] = safeDomain(
    allPoints.map((point) => point.x),
    xDomain,
  );
  const [yMin, yMax] = safeDomain(
    allPoints.map((point) => point.y),
    yDomain,
    true,
  );
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const scaleX = (value: number) =>
    PADDING.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const scaleY = (value: number) =>
    PADDING.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  const renderedSeries = useMemo(
    () =>
      visibleSeries.map((item, index) => {
        const points = item.values
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
          .map((point) => ({ x: scaleX(point.x), y: scaleY(point.y) }));
        return {
          ...item,
          color: item.color ?? PALETTE[index % PALETTE.length],
          gradientId: `${uid}-series-${index}-area`,
          points,
          path: linePath(points),
          last: item.values.at(-1),
        };
      }),
    // Domains are primitive dependencies; callers do not need to memoize series.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleSeries, xMin, xMax, yMin, yMax, height],
  );

  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    return { value: yMax - ratio * (yMax - yMin), y: PADDING.top + ratio * plotHeight };
  });
  const xTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return { value: xMin + ratio * (xMax - xMin), x: PADDING.left + ratio * plotWidth };
  });
  const cursorInRange = Number.isFinite(cursorX) && cursorX! >= xMin && cursorX! <= xMax;
  const descriptionId = `${uid}-description`;
  const style = { "--telemetry-height": `${height}px` } as CSSProperties;

  return (
    <section
      className={`visual-card telemetry-chart ${className}`.trim()}
      style={style}
      aria-label={ariaLabel ?? title}
    >
      <header className="visual-header">
        <div className="visual-title-group">
          {eyebrow && <span className="visual-eyebrow">{eyebrow}</span>}
          <h3 className="visual-title">{title}</h3>
        </div>
        {live && (
          <span className="visual-live" aria-label="Receiving live data">
            <span aria-hidden="true" /> Live
          </span>
        )}
      </header>

      {showLegend && renderedSeries.length > 0 && (
        <div className="telemetry-legend" aria-label="Telemetry channels">
          {renderedSeries.map((item) => {
            const formatted = item.last
              ? formatValue?.(item.last.y, item) ?? `${defaultNumber(item.last.y)}${item.unit ?? ""}`
              : "—";
            return (
              <div className="telemetry-legend-item" key={item.id}>
                <span className="telemetry-swatch" style={{ backgroundColor: item.color, color: item.color }} />
                <span>{item.label}</span>
                <strong>{formatted}</strong>
              </div>
            );
          })}
        </div>
      )}

      <div className="telemetry-canvas">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel ?? `${title} line chart`}
          aria-describedby={descriptionId}
        >
          <defs>
            {renderedSeries.map((item) => (
              <linearGradient id={item.gradientId} x1="0" x2="0" y1="0" y2="1" key={item.id}>
                <stop offset="0" stopColor={item.color} stopOpacity="0.24" />
                <stop offset="1" stopColor={item.color} stopOpacity="0" />
              </linearGradient>
            ))}
            <clipPath id={`${uid}-plot-clip`}>
              <rect x={PADDING.left} y={PADDING.top} width={plotWidth} height={plotHeight} rx="8" />
            </clipPath>
          </defs>

          {zones.map((zone) => {
            const from = scaleX(clamp(zone.from, xMin, xMax));
            const to = scaleX(clamp(zone.to, xMin, xMax));
            const zoneX = Math.min(from, to);
            const zoneWidth = Math.abs(to - from);
            return (
              <g key={zone.id} className="telemetry-zone">
                <rect
                  x={zoneX}
                  y={PADDING.top}
                  width={zoneWidth}
                  height={plotHeight}
                  fill={zone.color ?? "#f0445d"}
                  opacity="0.07"
                />
                {zone.label && zoneWidth > 56 && (
                  <text x={zoneX + 8} y={PADDING.top + 15} fill={zone.color ?? "#f0445d"}>
                    {zone.label}
                  </text>
                )}
              </g>
            );
          })}

          {showGrid && (
            <g className="telemetry-grid" aria-hidden="true">
              {yTicks.map((tick) => (
                <line key={tick.y} x1={PADDING.left} x2={WIDTH - PADDING.right} y1={tick.y} y2={tick.y} />
              ))}
              {xTicks.map((tick) => (
                <line key={tick.x} x1={tick.x} x2={tick.x} y1={PADDING.top} y2={height - PADDING.bottom} />
              ))}
            </g>
          )}

          <g className="telemetry-axis" aria-hidden="true">
            {yTicks.map((tick) => (
              <text key={tick.y} x={PADDING.left - 9} y={tick.y + 4} textAnchor="end">
                {formatY(tick.value)}
              </text>
            ))}
            {xTicks.map((tick, index) => (
              <text
                key={tick.x}
                x={tick.x}
                y={height - 9}
                textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}
              >
                {formatX(tick.value)}
              </text>
            ))}
            {xLabel && (
              <text className="telemetry-x-label" x={WIDTH - PADDING.right} y={PADDING.top + 11} textAnchor="end">
                {xLabel}
              </text>
            )}
          </g>

          <g clipPath={`url(#${uid}-plot-clip)`}>
            {renderedSeries.map((item) => (
              <g key={item.id}>
                {item.area && item.points.length > 1 && (
                  <path
                    className="telemetry-area"
                    d={`${item.path} L${item.points.at(-1)!.x},${height - PADDING.bottom} L${item.points[0].x},${height - PADDING.bottom} Z`}
                    fill={`url(#${item.gradientId})`}
                  />
                )}
                <path
                  className="telemetry-line-shadow"
                  d={item.path}
                  stroke={item.color}
                  strokeDasharray={item.dashed ? "7 6" : undefined}
                />
                <path
                  className="telemetry-line"
                  d={item.path}
                  stroke={item.color}
                  strokeDasharray={item.dashed ? "7 6" : undefined}
                />
              </g>
            ))}

            {cursorInRange && (
              <g className="telemetry-cursor" aria-hidden="true">
                <line
                  x1={scaleX(cursorX!)}
                  x2={scaleX(cursorX!)}
                  y1={PADDING.top}
                  y2={height - PADDING.bottom}
                />
                {renderedSeries.map((item) => {
                  const point = closestPoint(item.values, cursorX!);
                  if (!point) return null;
                  return (
                    <circle
                      key={item.id}
                      cx={scaleX(point.x)}
                      cy={scaleY(point.y)}
                      r="4.25"
                      fill={item.color}
                    />
                  );
                })}
              </g>
            )}
          </g>
        </svg>
      </div>

      <p id={descriptionId} className="visuals-sr-only">
        {renderedSeries.length
          ? renderedSeries
              .map((item) => `${item.label}: ${item.values.length} samples${item.unit ? ` in ${item.unit}` : ""}`)
              .join(". ")
          : "No telemetry samples available."}
      </p>
    </section>
  );
}
