import type { Resource } from '../../hooks/useResource'
import type { Alert, AlertsResponse } from '../../types/api'
import { time } from '../../utils/format'
import { Icon } from '../common/Icon'
import { StateMessage } from '../common/StateMessage'

const SEVERITY_LABEL: Record<Alert['severity'], string> = {
  severe: 'Severe',
  warning: 'Warning',
  advisory: 'Advisory',
}

export function AlertsTab({ alerts, placeName, timeZone }: { alerts: Resource<AlertsResponse>; placeName: string; timeZone: string | null }) {
  const { data, error, loading, reload } = alerts
  if (!data && loading) return <StateMessage kind="loading">Checking conditions…</StateMessage>
  if (!data && error) return <StateMessage kind="error" onRetry={reload}>{error.message}</StateMessage>
  if (!data) return null

  return (
    <div className="alerts">
      {data.alerts.length === 0 ? (
        <div className="empty">
          <Icon name="alert" size={24} />
          <p>No weather or air-quality alerts for {placeName} in the next 24 hours.</p>
        </div>
      ) : (
        <ul className="alert-list">
          {data.alerts.map((alert) => (
            <li key={alert.id} className={`alert alert--${alert.severity}`}>
              <div className="alert__head">
                <span className="alert__severity">
                  <Icon name="alert" size={14} /> {SEVERITY_LABEL[alert.severity]}
                </span>
                {alert.starts_at && <span className="muted">from {time(alert.starts_at, timeZone)}</span>}
              </div>
              <strong>{alert.title}</strong>
              <p>{alert.message}</p>
            </li>
          ))}
        </ul>
      )}
      {data.sources_failed.length > 0 && (
        <p className="caption">Some conditions couldn’t be checked right now.</p>
      )}
      <p className="caption">
        Based on the forecast for this area using IMD rainfall and CPCB air-quality thresholds. Not an official
        warning.
      </p>
    </div>
  )
}
