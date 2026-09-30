import type {
  AirQualityResponse,
  AlertsResponse,
  AreaName,
  MapTile,
  Place,
  WeatherResponse,
} from '../types/api'
import { getJson } from './http'

export interface LatLon {
  latitude: number
  longitude: number
}

const at = ({ latitude, longitude }: LatLon) =>
  `latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}`

export const api = {
  health: (signal?: AbortSignal) => getJson<{ status: string }>('/health', signal),

  weather: (point: LatLon, signal?: AbortSignal) =>
    getJson<WeatherResponse>(`/api/weather?${at(point)}`, signal),

  airQuality: (point: LatLon, signal?: AbortSignal) =>
    getJson<AirQualityResponse>(`/api/air-quality?${at(point)}`, signal),

  alerts: (point: LatLon, signal?: AbortSignal) =>
    getJson<AlertsResponse>(`/api/alerts?${at(point)}`, signal),

  searchPlaces: async (query: string, signal?: AbortSignal) =>
    (await getJson<{ places: Place[] }>(`/api/places/search?q=${encodeURIComponent(query)}`, signal))
      .places,

  areaName: (point: LatLon, signal?: AbortSignal) =>
    getJson<AreaName>(`/api/places/reverse?${at(point)}`, signal),

  tile: (z: number, x: number, y: number, signal?: AbortSignal) =>
    getJson<MapTile>(`/api/tiles/${z}/${x}/${y}`, signal),
}
