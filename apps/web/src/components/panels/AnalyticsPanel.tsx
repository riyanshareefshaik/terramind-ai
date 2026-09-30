import { palette } from '../../config/palette'
import type { Resource } from '../../hooks/useResource'
import type { AnalyticsResponse } from '../../types/twin'
import { formatWithUnit, humanize } from '../../utils/format'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { StateMessage } from '../common/StateMessage'

const BUCKET_COLORS: Record<string, string> = {
  ...palette.risk,
  ...palette.use,
  ...palette.sensorStatus,
}

export function AnalyticsPanel({ analytics }: { analytics: Resource<AnalyticsResponse> }) {
  const { data, error, loading, reload } = analytics

  if (loading && !data) return <StateMessage kind="loading">Computing analytics…</StateMessage>
  if (error && !data) return <StateMessage kind="error" onRetry={reload}>{error.message}</StateMessage>
  if (!data) return null

  return (
    <div className="analytics">
      <div className="tab-meta">
        <ProvenanceBadge provenance={data.data_source.provenance} source={data.data_source.source} />
        <span className="muted">Aggregated from demo entities</span>
      </div>
      <div className="kpis">
        {data.kpis.map((kpi) => (
          <div className="kpi" key={kpi.id}>
            <span className="kpi__value">{formatWithUnit(kpi.value, kpi.unit)}</span>
            <span className="kpi__label">{kpi.label}</span>
          </div>
        ))}
      </div>
      {data.distributions.map((distribution) => {
        const total = Object.values(distribution.buckets).reduce((sum, n) => sum + n, 0)
        return (
          <section className="distribution" key={distribution.id}>
            <h3>{distribution.label}</h3>
            <div className="distribution__bar" role="img" aria-label={distribution.label}>
              {Object.entries(distribution.buckets).map(([bucket, count]) =>
                count > 0 ? (
                  <span
                    key={bucket}
                    style={{ flexGrow: count, background: BUCKET_COLORS[bucket] ?? '#6b7a73' }}
                    title={`${humanize(bucket)}: ${count}`}
                  />
                ) : null,
              )}
            </div>
            <ul className="distribution__legend">
              {Object.entries(distribution.buckets).map(([bucket, count]) => (
                <li key={bucket}>
                  <i style={{ background: BUCKET_COLORS[bucket] ?? '#6b7a73' }} />
                  {humanize(bucket)} <strong>{count}</strong>
                  <span className="muted">{total ? `${Math.round((100 * count) / total)}%` : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <p className="footnote">Trends and anomaly detection arrive once a time-series store is connected.</p>
    </div>
  )
}
