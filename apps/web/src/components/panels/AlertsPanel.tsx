import { useState } from 'react'
import type { Resource } from '../../hooks/useResource'
import type { AlertCategory, AlertsResponse } from '../../types/twin'
import { humanize } from '../../utils/format'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { StateMessage } from '../common/StateMessage'

const CATEGORIES: Array<AlertCategory | 'all'> = ['all', 'environmental', 'infrastructure', 'traffic', 'emergency']

export function AlertsPanel({
  alerts,
  onSelectEntity,
}: {
  alerts: Resource<AlertsResponse>
  onSelectEntity: (entityId: string) => void
}) {
  const [category, setCategory] = useState<AlertCategory | 'all'>('all')
  const { data, error, loading, reload } = alerts

  if (loading && !data) return <StateMessage kind="loading">Loading alerts…</StateMessage>
  if (error && !data) return <StateMessage kind="error" onRetry={reload}>{error.message}</StateMessage>
  if (!data) return null

  const visible = data.alerts.filter((alert) => category === 'all' || alert.category === category)

  return (
    <div className="alerts">
      <div className="tab-meta">
        <ProvenanceBadge provenance={data.data_source.provenance} source={data.data_source.source} />
        <span className="muted">Rule-based alerts over demo data</span>
      </div>
      <div className="chips" role="radiogroup" aria-label="Filter alerts by category">
        {CATEGORIES.map((c) => {
          const count = c === 'all' ? data.count : data.alerts.filter((a) => a.category === c).length
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={category === c}
              className={`chip ${category === c ? 'is-active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {humanize(c)} <span>{count}</span>
            </button>
          )
        })}
      </div>
      {visible.length === 0 ? (
        <StateMessage kind="empty">No alerts in this category.</StateMessage>
      ) : (
        <ul className="alert-list">
          {visible.map((alert) => (
            <li key={alert.id} className={`alert alert--${alert.severity}`}>
              <button
                type="button"
                disabled={!alert.entity_id}
                onClick={() => alert.entity_id && onSelectEntity(alert.entity_id)}
              >
                <span className="alert__head">
                  <strong>{alert.title}</strong>
                  <span className="alert__category">{humanize(alert.category)}</span>
                </span>
                <span className="alert__message">{alert.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
