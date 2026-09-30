import type { DataSource, GeoPoint, Provenance } from './provenance'

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical'
export type EntityType = 'building' | 'road' | 'sensor' | 'risk_zone'
export type LayerCategory = 'infrastructure' | 'mobility' | 'environment' | 'risk' | 'utilities'

interface EntityBase {
  id: string
  name: string
  layer_id: string
  location: GeoPoint
  data_source: DataSource
}

export interface BuildingEntity extends EntityBase {
  type: 'building'
  footprint: GeoPoint[]
  height_m: number
  floors: number
  use: 'residential' | 'commercial' | 'mixed' | 'civic' | 'industrial'
  year_built: number | null
  temperature_c: number | null
  energy: { current_kw: number; daily_kwh: number } | null
  risk: { overall: RiskLevel; flood: number; fire: number; heat: number } | null
}

export interface RoadEntity extends EntityBase {
  type: 'road'
  path: GeoPoint[]
  road_class: 'arterial' | 'collector' | 'local'
  lanes: number
  speed_limit_kmh: number
  congestion: number | null
}

export interface SensorReading {
  metric: string
  label: string
  value: number
  unit: string
  observed_at: string
}

export interface SensorEntity extends EntityBase {
  type: 'sensor'
  sensor_kind: 'air_quality' | 'weather' | 'noise' | 'water_level'
  status: 'online' | 'degraded' | 'offline'
  readings: SensorReading[]
}

export interface RiskZoneEntity extends EntityBase {
  type: 'risk_zone'
  hazard: 'flood' | 'heat'
  severity: RiskLevel
  score: number
  polygon: GeoPoint[]
}

export type TwinEntity = BuildingEntity | RoadEntity | SensorEntity | RiskZoneEntity

export interface TwinLayer {
  id: string
  name: string
  category: LayerCategory
  description: string
  entity_type: EntityType | null
  provenance: Provenance
  available: boolean
  default_visible: boolean
  entity_count: number
}

export interface LayersResponse {
  layers: TwinLayer[]
  data_source: DataSource
}

export interface EntitiesResponse {
  count: number
  entities: TwinEntity[]
  data_source: DataSource
}

export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertCategory = 'environmental' | 'infrastructure' | 'traffic' | 'emergency'

export interface Alert {
  id: string
  severity: AlertSeverity
  category: AlertCategory
  title: string
  message: string
  entity_id: string | null
  raised_at: string
  provenance: Provenance
}

export interface AlertsResponse {
  count: number
  alerts: Alert[]
  data_source: DataSource
}

export interface Kpi {
  id: string
  label: string
  value: number | null
  unit: string | null
  provenance: Provenance
}

export interface Distribution {
  id: string
  label: string
  buckets: Record<string, number>
  provenance: Provenance
}

export interface AnalyticsResponse {
  kpis: Kpi[]
  distributions: Distribution[]
  data_source: DataSource
}
