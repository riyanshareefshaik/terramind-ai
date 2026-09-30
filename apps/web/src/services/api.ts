import type { AlertsResponse, AnalyticsResponse, EntitiesResponse, LayersResponse, TwinEntity } from '../types/twin'
import type { WeatherResponse } from '../types/weather'
import { getJson } from './http'

export const api = {
  health: (signal?: AbortSignal) => getJson<{ status: string }>('/health', signal),

  weather: (signal?: AbortSignal) => getJson<WeatherResponse>('/api/weather', signal),

  twinLayers: (signal?: AbortSignal) => getJson<LayersResponse>('/api/twin/layers', signal),

  twinEntities: (signal?: AbortSignal) => getJson<EntitiesResponse>('/api/twin/entities', signal),

  twinEntity: (id: string, signal?: AbortSignal) =>
    getJson<TwinEntity>(`/api/twin/entities/${encodeURIComponent(id)}`, signal),

  alerts: (signal?: AbortSignal) => getJson<AlertsResponse>('/api/alerts', signal),

  analytics: (signal?: AbortSignal) => getJson<AnalyticsResponse>('/api/analytics', signal),
}
