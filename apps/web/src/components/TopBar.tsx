import type { ReactNode } from 'react'
import type { AirQualityResponse, WeatherResponse } from '../types/api'
import { fmt } from '../utils/format'

interface TopBarProps {
  search: ReactNode
  placeName: string
  weather: WeatherResponse | null
  air: AirQualityResponse | null
  offline: boolean
}

export function TopBar({ search, placeName, weather, air, offline }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="11" />
          <path d="M5 16h22M16 5c4 4 4 18 0 22M16 5c-4 4-4 18 0 22" />
        </svg>
        <span className="brand__name">TerraMind</span>
      </div>
      {search}
      <div className="topbar__status">
        {offline ? (
          <span className="topbar__offline" role="status">
            Server offline
          </span>
        ) : (
          <span className="topbar__now">
            <strong>{placeName}</strong>
            {weather && <span>{fmt(weather.current.temperature_c)}° {weather.current.condition}</span>}
            {air?.aqi != null && <span>AQI {air.aqi}</span>}
          </span>
        )}
      </div>
    </header>
  )
}
