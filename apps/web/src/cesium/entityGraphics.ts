import {
  Cartesian2,
  Cartesian3,
  ClassificationType,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  DistanceDisplayCondition,
  Entity,
  HeightReference,
  LabelStyle,
  PolygonHierarchy,
  VerticalOrigin,
} from 'cesium'
import { HEIGHT_RAMP_MAX_M, palette } from '../config/palette'
import type {
  BuildingEntity,
  RiskZoneEntity,
  RoadEntity,
  SensorEntity,
  TwinEntity,
} from '../types/twin'
import type { GeoPoint } from '../types/provenance'
import type { BuildingColorMode } from '../types/workspace'

const css = (hex: string) => Color.fromCssColorString(hex)
const SELECTED = css(palette.selected)
const ROAD_WIDTH: Record<RoadEntity['road_class'], number> = { arterial: 7, collector: 4.5, local: 3 }

function degreesArray(points: GeoPoint[]): Cartesian3[] {
  return Cartesian3.fromDegreesArray(points.flatMap((p) => [p.longitude, p.latitude]))
}

export function buildingColor(building: BuildingEntity, mode: BuildingColorMode): Color {
  switch (mode) {
    case 'risk':
      return css(palette.risk[building.risk?.overall ?? 'low'])
    case 'use':
      return css(palette.use[building.use])
    case 'height': {
      const t = Math.min(1, building.height_m / HEIGHT_RAMP_MAX_M)
      return Color.lerp(css(palette.heightRamp[0]), css(palette.heightRamp[1]), t, new Color())
    }
  }
}

export function congestionColor(congestion: number | null): Color {
  if (congestion === null) return css('#8b949e')
  const [low, mid, high] = palette.congestion.map(css)
  return congestion < 0.5
    ? Color.lerp(low, mid, congestion / 0.5, new Color())
    : Color.lerp(mid, high, (congestion - 0.5) / 0.5, new Color())
}

function createBuilding(building: BuildingEntity, mode: BuildingColorMode): Entity {
  return new Entity({
    id: building.id,
    name: building.name,
    polygon: {
      hierarchy: new PolygonHierarchy(degreesArray(building.footprint)),
      height: 0,
      heightReference: HeightReference.RELATIVE_TO_GROUND,
      extrudedHeight: building.height_m,
      extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
      material: buildingColor(building, mode).withAlpha(0.88),
    },
  })
}

function createRoad(road: RoadEntity): Entity {
  return new Entity({
    id: road.id,
    name: road.name,
    polyline: {
      positions: degreesArray(road.path),
      width: ROAD_WIDTH[road.road_class],
      material: congestionColor(road.congestion).withAlpha(0.9),
      clampToGround: true,
    },
  })
}

function createSensor(sensor: SensorEntity): Entity {
  return new Entity({
    id: sensor.id,
    name: sensor.name,
    position: Cartesian3.fromDegrees(sensor.location.longitude, sensor.location.latitude),
    point: {
      pixelSize: 11,
      color: css(palette.sensorStatus[sensor.status]),
      outlineColor: css('#04100b'),
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: sensor.name.replace(/^Demo /, ''),
      font: '500 12px Inter, system-ui, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: css('#04100b'),
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -12),
      heightReference: HeightReference.CLAMP_TO_GROUND,
      distanceDisplayCondition: new DistanceDisplayCondition(0, 1600),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
}

function createRiskZone(zone: RiskZoneEntity): Entity {
  const color = css(palette.hazard[zone.hazard])
  const ring = degreesArray([...zone.polygon, zone.polygon[0]])
  return new Entity({
    id: zone.id,
    name: zone.name,
    polygon: {
      hierarchy: new PolygonHierarchy(degreesArray(zone.polygon)),
      material: color.withAlpha(0.18 + zone.score * 0.2),
      classificationType: ClassificationType.TERRAIN,
    },
    polyline: {
      positions: ring,
      width: 2,
      material: color.withAlpha(0.9),
      clampToGround: true,
    },
  })
}

export function createEntity(entity: TwinEntity, mode: BuildingColorMode): Entity {
  switch (entity.type) {
    case 'building':
      return createBuilding(entity, mode)
    case 'road':
      return createRoad(entity)
    case 'sensor':
      return createSensor(entity)
    case 'risk_zone':
      return createRiskZone(entity)
  }
}

/** Re-applies colours for the current colour mode and selection state. */
export function styleEntity(
  target: Entity,
  entity: TwinEntity,
  mode: BuildingColorMode,
  selected: boolean,
): void {
  switch (entity.type) {
    case 'building':
      if (target.polygon) {
        const color = selected ? SELECTED : buildingColor(entity, mode)
        target.polygon.material = new ColorMaterialProperty(color.withAlpha(selected ? 0.95 : 0.88))
      }
      break
    case 'road':
      if (target.polyline) {
        const color = selected ? SELECTED : congestionColor(entity.congestion)
        target.polyline.material = new ColorMaterialProperty(color.withAlpha(0.9))
        target.polyline.width = new ConstantProperty(ROAD_WIDTH[entity.road_class] * (selected ? 1.8 : 1))
      }
      break
    case 'sensor':
      if (target.point) {
        target.point.pixelSize = new ConstantProperty(selected ? 17 : 11)
        target.point.outlineColor = new ConstantProperty(selected ? SELECTED : css('#04100b'))
      }
      break
    case 'risk_zone':
      if (target.polyline) {
        const color = selected ? SELECTED : css(palette.hazard[entity.hazard])
        target.polyline.material = new ColorMaterialProperty(color.withAlpha(0.95))
        target.polyline.width = new ConstantProperty(selected ? 4 : 2)
      }
      break
  }
}
