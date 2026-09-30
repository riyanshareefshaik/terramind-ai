import { useId, useState, type PointerEvent } from 'react'
import type { HourlyForecast } from '../../types/api'
import { fmt, hour, time } from '../../utils/format'

const W = 320
const PAD_L = 28
const PAD_R = 8
const TEMP_H = 96
const RAIN_H = 44
const AXIS_H = 18
const PLOT_W = W - PAD_L - PAD_R

interface ForecastChartProps {
  hours: HourlyForecast[]
  timeZone: string | null
}

/**
 * 24-hour temperature line with a separate rain-chance bar chart underneath.
 * Two measures, two charts sharing one time axis and one hover crosshair.
 */
export function ForecastChart({ hours, timeZone }: ForecastChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const titleId = useId()
  const temps = hours.map((h) => h.temperature_c).filter((t): t is number => t !== null)
  if (hours.length < 2 || temps.length < 2) return null

  const min = Math.floor(Math.min(...temps) - 1)
  const max = Math.ceil(Math.max(...temps) + 1)
  const x = (i: number) => PAD_L + (i / (hours.length - 1)) * PLOT_W
  const yTemp = (t: number) => 6 + (1 - (t - min) / (max - min)) * (TEMP_H - 12)
  const rainTop = TEMP_H + 8

  const points = hours
    .map((h, i) => (h.temperature_c === null ? null : `${x(i).toFixed(1)},${yTemp(h.temperature_c).toFixed(1)}`))
    .filter(Boolean)
  const line = `M${points.join('L')}`
  const area = `${line}L${x(hours.length - 1)},${TEMP_H}L${x(0)},${TEMP_H}Z`
  const barW = PLOT_W / hours.length - 2 // 2px surface gap between bars

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = (event.clientX - rect.left) / rect.width
    setActive(Math.max(0, Math.min(hours.length - 1, Math.round(fraction * (hours.length - 1)))))
  }

  const current = active !== null ? hours[active] : null
  const tooltipLeft = active !== null ? (x(active) / W) * 100 : 0

  return (
    <figure className="forecast" aria-labelledby={titleId}>
      <figcaption id={titleId} className="forecast__title">
        Next 24 hours
      </figcaption>
      <div className="forecast__plot">
        <svg viewBox={`0 0 ${W} ${TEMP_H + RAIN_H + AXIS_H + 8}`} role="img" aria-label="Hourly temperature and chance of rain">
          <defs>
            <linearGradient id={`${titleId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* temperature */}
          <text x={0} y={yTemp(max) + 4} className="forecast__axis">{max}°</text>
          <text x={0} y={yTemp(min) + 4} className="forecast__axis">{min}°</text>
          <line x1={PAD_L} x2={W - PAD_R} y1={TEMP_H} y2={TEMP_H} className="forecast__grid" />
          <path d={area} fill={`url(#${titleId}-fill)`} />
          <path d={line} className="forecast__line" />

          {/* rain chance */}
          <text x={0} y={rainTop + 10} className="forecast__axis">Rain</text>
          {hours.map((h, i) => {
            const pct = h.precipitation_probability_pct ?? 0
            const height = Math.max(pct > 0 ? 2 : 0, (pct / 100) * RAIN_H)
            return (
              <rect
                key={h.time}
                x={x(i) - barW / 2}
                y={rainTop + RAIN_H - height}
                width={Math.max(1, barW)}
                height={height}
                rx={Math.min(2, barW / 2)}
                className={i === active ? 'forecast__bar is-active' : 'forecast__bar'}
              />
            )
          })}
          <line x1={PAD_L} x2={W - PAD_R} y1={rainTop + RAIN_H} y2={rainTop + RAIN_H} className="forecast__grid" />

          {/* time axis */}
          {hours.map((h, i) =>
            i % 6 === 0 ? (
              <text key={h.time} x={x(i)} y={rainTop + RAIN_H + 14} textAnchor="middle" className="forecast__axis">
                {i === 0 ? 'Now' : hour(h.time, timeZone)}
              </text>
            ) : null,
          )}

          {current && active !== null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={2} y2={rainTop + RAIN_H} className="forecast__crosshair" />
              {current.temperature_c !== null && (
                <circle cx={x(active)} cy={yTemp(current.temperature_c)} r={4} className="forecast__dot" />
              )}
            </g>
          )}
          <rect
            x={PAD_L}
            y={0}
            width={PLOT_W}
            height={rainTop + RAIN_H}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {current && (
          <div
            className="forecast__tooltip"
            style={{ left: `${tooltipLeft}%`, transform: `translateX(${tooltipLeft > 60 ? '-100%' : '0'})` }}
          >
            <strong>{time(current.time, timeZone)}</strong>
            <span>{fmt(current.temperature_c, 1)}°C · feels {fmt(current.apparent_temperature_c)}°</span>
            <span>
              Rain {fmt(current.precipitation_probability_pct)}% · {fmt(current.precipitation_mm, 1)} mm
            </span>
          </div>
        )}
      </div>
      <details className="forecast__table">
        <summary>View as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Temp</th>
              <th scope="col">Rain chance</th>
              <th scope="col">Rain</th>
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h.time}>
                <td>{time(h.time, timeZone)}</td>
                <td>{fmt(h.temperature_c, 1)}°C</td>
                <td>{fmt(h.precipitation_probability_pct)}%</td>
                <td>{fmt(h.precipitation_mm, 1)} mm</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
