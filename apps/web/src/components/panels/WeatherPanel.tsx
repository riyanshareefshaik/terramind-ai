import type { Resource } from '../../hooks/useResource'
import type { WeatherResponse } from '../../types/weather'
import { formatNumber, formatTime } from '../../utils/format'
import { Icon } from '../common/Icon'
import { Panel } from '../common/Panel'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { StateMessage } from '../common/StateMessage'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

function compass(deg: number | null): string {
  return deg === null ? '' : COMPASS[Math.round(deg / 45) % 8]
}

export function WeatherPanel({ weather }: { weather: Resource<WeatherResponse> }) {
  const { data, error, loading, reload } = weather
  const badge = data ? (
    <ProvenanceBadge provenance={data.data_source.provenance} source={data.data_source.source} />
  ) : error ? (
    <ProvenanceBadge provenance="UNAVAILABLE" />
  ) : null

  return (
    <Panel
      title="Weather"
      badge={badge}
      actions={
        <button type="button" className="icon-button" onClick={reload} aria-label="Refresh weather" title="Refresh">
          <Icon name="refresh" size={15} />
        </button>
      }
    >
      {loading && !data && <StateMessage kind="loading">Fetching current conditions…</StateMessage>}
      {error && (
        <StateMessage kind="error" onRetry={data ? undefined : reload}>
          {data ? `Refresh failed — showing last reading. ${error.message}` : error.message}
        </StateMessage>
      )}
      {data && (
        <div className="weather">
          <div className="weather__main">
            <span className="weather__temp">{formatNumber(data.current.temperature_c)}°C</span>
            <span className="weather__condition">
              {data.current.condition}
              <small>Feels like {formatNumber(data.current.apparent_temperature_c)}°C</small>
            </span>
          </div>
          <dl className="metrics">
            <div>
              <dt>Humidity</dt>
              <dd>{formatNumber(data.current.humidity_pct, 0)}%</dd>
            </div>
            <div>
              <dt>Wind</dt>
              <dd>
                {formatNumber(data.current.wind_speed_kmh)} km/h {compass(data.current.wind_direction_deg)}
              </dd>
            </div>
            <div>
              <dt>Precipitation</dt>
              <dd>{formatNumber(data.current.precipitation_mm)} mm</dd>
            </div>
            <div>
              <dt>Cloud cover</dt>
              <dd>{formatNumber(data.current.cloud_cover_pct, 0)}%</dd>
            </div>
          </dl>
          <p className="footnote">
            {data.location.name ?? 'Selected location'} · observed {formatTime(data.current.observed_at)} ·{' '}
            {data.data_source.source}
          </p>
        </div>
      )}
    </Panel>
  )
}
