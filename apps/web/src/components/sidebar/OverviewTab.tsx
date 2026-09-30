import { AQI_COLORS } from '../../config/palette'
import type { Resource } from '../../hooks/useResource'
import type { AirQualityResponse, AreaName, WeatherResponse } from '../../types/api'
import { compass, fmt, time } from '../../utils/format'
import { StateMessage } from '../common/StateMessage'
import { ForecastChart } from './ForecastChart'

interface OverviewTabProps {
  area: AreaName | null
  weather: Resource<WeatherResponse>
  air: Resource<AirQualityResponse>
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function WeatherSection({ weather }: { weather: Resource<WeatherResponse> }) {
  const { data, error, loading, reload } = weather
  if (!data) {
    return loading ? (
      <StateMessage kind="loading">Loading weather…</StateMessage>
    ) : error ? (
      <StateMessage kind="error" onRetry={reload}>
        {error.message}
      </StateMessage>
    ) : null
  }
  const { current, today, location } = data
  const tz = location.timezone
  return (
    <section className="section" aria-label="Weather">
      <div className="weather-now">
        <span className="weather-now__temp">{fmt(current.temperature_c)}°</span>
        <div className="weather-now__text">
          <strong>{current.condition}</strong>
          <span>
            Feels like {fmt(current.apparent_temperature_c)}° · H {fmt(today.temperature_max_c)}° L{' '}
            {fmt(today.temperature_min_c)}°
          </span>
        </div>
      </div>
      <dl className="metrics">
        <Metric label="Humidity" value={`${fmt(current.humidity_pct)}%`} />
        <Metric
          label="Wind"
          value={`${fmt(current.wind_speed_kmh)} km/h ${compass(current.wind_direction_deg)}`}
        />
        <Metric label="Gusts" value={`${fmt(current.wind_gusts_kmh)} km/h`} />
        <Metric label="Rain now" value={`${fmt(current.precipitation_mm, 1)} mm`} />
        <Metric label="UV index" value={fmt(current.uv_index, 1)} />
        <Metric label="Pressure" value={`${fmt(current.pressure_hpa)} hPa`} />
        <Metric label="Sunrise" value={time(today.sunrise, tz)} />
        <Metric label="Sunset" value={time(today.sunset, tz)} />
      </dl>
      <ForecastChart hours={data.hourly} timeZone={tz} />
      <p className="caption">
        Updated {time(current.observed_at, tz)}
        {error && ' · refresh failed, showing last update'}
      </p>
    </section>
  )
}

function AirQualitySection({ air }: { air: Resource<AirQualityResponse> }) {
  const { data, error, loading, reload } = air
  return (
    <section className="section" aria-label="Air quality">
      <h3 className="section__title">Air quality</h3>
      {!data && loading && <StateMessage kind="loading">Loading air quality…</StateMessage>}
      {!data && error && (
        <StateMessage kind="error" onRetry={reload}>
          {error.message}
        </StateMessage>
      )}
      {data && (
        <>
          <div className="aqi">
            <span className="aqi__value">{data.aqi ?? '—'}</span>
            <div className="aqi__text">
              {data.category && (
                <span className="aqi__category">
                  <i style={{ background: AQI_COLORS[data.category] }} aria-hidden="true" />
                  {data.category}
                </span>
              )}
              <span className="muted">
                India AQI{data.dominant_pollutant ? ` · mainly ${data.dominant_pollutant}` : ''}
              </span>
            </div>
          </div>
          <table className="pollutants">
            <thead>
              <tr>
                <th scope="col">Pollutant</th>
                <th scope="col">Now</th>
                <th scope="col">Avg</th>
                <th scope="col">Index</th>
              </tr>
            </thead>
            <tbody>
              {data.pollutants.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.label}</th>
                  <td>{fmt(p.current, p.unit === 'mg/m³' ? 2 : 0)}</td>
                  <td>
                    {fmt(p.average, p.unit === 'mg/m³' ? 2 : 0)} <small>{p.unit} · {p.averaging_hours}h</small>
                  </td>
                  <td>{p.sub_index ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="caption">Modelled estimate for this area, not a monitoring-station reading.</p>
        </>
      )}
    </section>
  )
}

export function OverviewTab({ area, weather, air }: OverviewTabProps) {
  const place = area?.name ?? null
  const region = [area?.city !== place ? area?.city : null, area?.state].filter(Boolean).join(', ')
  return (
    <div className="overview">
      <header className="area">
        <h2>{place ?? 'This area'}</h2>
        {region && <p>{region}</p>}
      </header>
      <WeatherSection weather={weather} />
      <AirQualitySection air={air} />
    </div>
  )
}
