import type { ReactNode } from 'react'

type ApiStatus = 'checking' | 'online' | 'offline'

interface AppHeaderProps {
  locationName: string
  apiStatus: ApiStatus
  ionConfigured: boolean
  search: ReactNode
}

const API_LABEL: Record<ApiStatus, string> = {
  checking: 'API: checking…',
  online: 'API online',
  offline: 'API offline',
}

export function AppHeader({ locationName, apiStatus, ionConfigured, search }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="11" />
          <path d="M5 16h22M16 5c4 4 4 18 0 22M16 5c-4 4-4 18 0 22" />
        </svg>
        <div>
          <h1>TerraMind AI</h1>
          <p>{locationName} · Digital Twin Workspace</p>
        </div>
      </div>
      {search}
      <div className="status-chips">
        <span className={`status-chip status-chip--${apiStatus}`}>{API_LABEL[apiStatus]}</span>
        <span
          className={`status-chip status-chip--${ionConfigured ? 'online' : 'warning'}`}
          title={
            ionConfigured
              ? 'Cesium ion token configured: world terrain and OSM 3D buildings enabled.'
              : 'No VITE_CESIUM_ION_TOKEN: using OpenStreetMap imagery without terrain or 3D buildings.'
          }
        >
          {ionConfigured ? 'Cesium ion' : 'Cesium ion: no token'}
        </span>
      </div>
    </header>
  )
}
