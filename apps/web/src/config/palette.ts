import type { AqiCategory, BuildingKind, PlaceCategory } from '../types/api'

/** Default building colour: a warm light concrete, close to real rooftops. */
export const BUILDING_NATURAL = '#ddd8cf'
export const SELECTED = '#4c8dff'

/** Building use — categorical slots in fixed order (validated on the dark surface). "Other" is neutral. */
export const BUILDING_KIND_COLORS: Record<BuildingKind, string> = {
  residential: '#3987e5',
  commercial: '#d95926',
  public: '#199e70',
  industrial: '#c98500',
  religious: '#d55181',
  other: '#8a8f98',
}

export const BUILDING_KIND_LABELS: Record<BuildingKind, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  public: 'Public & civic',
  industrial: 'Industrial',
  religious: 'Religious',
  other: 'Other',
}

/** Height — one-hue sequential ramp, light (low) → dark (tall). */
export const HEIGHT_RAMP = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#104281'] as const
export const HEIGHT_RAMP_MAX_M = 60

export const PLACE_COLORS: Record<PlaceCategory, string> = {
  health: '#e66767',
  education: '#3987e5',
  emergency: '#d95926',
  transport: '#9085e9',
  government: '#199e70',
  commerce: '#c98500',
  worship: '#d55181',
  landmark: '#8a8f98',
}

export const PLACE_LABELS: Record<PlaceCategory, string> = {
  health: 'Health',
  education: 'Education',
  emergency: 'Police & fire',
  transport: 'Transport',
  government: 'Government',
  commerce: 'Banks & markets',
  worship: 'Places of worship',
  landmark: 'Landmarks',
}

/** CPCB National AQI category colours (official scheme). Always shown with the category label. */
export const AQI_COLORS: Record<AqiCategory, string> = {
  Good: '#00b050',
  Satisfactory: '#92d050',
  'Moderately polluted': '#ffff00',
  Poor: '#ff9900',
  'Very poor': '#ff0000',
  Severe: '#c00000',
}
