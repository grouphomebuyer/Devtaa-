import { useId } from 'react';
import type { SCurvePoint } from '@/mocks/types';

/**
 * Planned vs actual progress S-curve.
 *
 * Hand-rolled SVG rather than a charting dependency: the shape is fixed, the
 * data is small, and it renders identically in both themes because it uses the
 * same design tokens as everything else. A table of the same numbers is
 * exposed to screen readers.
 */
export function SCurve({ points, height = 200 }: { points: SCurvePoint[]; height?: number }) {
  const gradientId = useId();
  if (points.length === 0) return null;

  const width = 640;
  const padding = { top: 12, right: 12, bottom: 24, left: 32 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const x = (i: number) => padding.left + (i / (points.length - 1)) * innerW;
  const y = (pct: number) => padding.top + innerH - (pct / 100) * innerH;

  const plannedPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.planned_pct)}`).join(' ');
  const actualPoints = points.filter((p) => p.actual_pct !== null);
  const actualPath = actualPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(points.indexOf(p))},${y(p.actual_pct!)}`)
    .join(' ');
  const areaPath =
    actualPoints.length > 0
      ? `${actualPath} L${x(points.indexOf(actualPoints[actualPoints.length - 1]))},${y(0)} L${x(0)},${y(0)} Z`
      : '';

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Planned versus actual progress S-curve. The equivalent figures are listed in the table below."
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--data-1))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--data-1))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgb(var(--border-subtle))"
              strokeWidth="1"
            />
            <text
              x={padding.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-[rgb(var(--text-tertiary))] text-[9px]"
            >
              {tick}%
            </text>
          </g>
        ))}

        {points.map((p, i) =>
          i % 2 === 0 ? (
            <text
              key={p.month}
              x={x(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-[rgb(var(--text-tertiary))] text-[9px]"
            >
              {p.month}
            </text>
          ) : null,
        )}

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
        <path
          d={plannedPath}
          fill="none"
          stroke="rgb(var(--text-tertiary))"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path d={actualPath} fill="none" stroke="rgb(var(--data-1))" strokeWidth="2" />
        {actualPoints.map((p) => (
          <circle
            key={p.month}
            cx={x(points.indexOf(p))}
            cy={y(p.actual_pct!)}
            r="2.5"
            fill="rgb(var(--data-1))"
          />
        ))}
      </svg>

      <figcaption className="mt-1 flex items-center gap-4 text-micro text-content-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 bg-data-1" />
          Actual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-0 w-4 border-t-2 border-dashed border-[rgb(var(--text-tertiary))]"
          />
          Planned
        </span>
      </figcaption>

      <table className="sr-only">
        <caption>Planned versus actual progress by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Planned %</th>
            <th scope="col">Actual %</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.month}>
              <th scope="row">{p.month}</th>
              <td>{p.planned_pct}</td>
              <td>{p.actual_pct ?? 'not yet reported'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
