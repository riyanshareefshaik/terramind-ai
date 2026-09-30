import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  DistanceDisplayCondition,
  GeometryInstance,
  LabelCollection,
  LabelStyle,
  NearFarScalar,
  PerInstanceColorAppearance,
  PointPrimitiveCollection,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  VerticalOrigin,
  type Scene,
} from 'cesium'
import {
  BUILDING_KIND_COLORS,
  BUILDING_NATURAL,
  HEIGHT_RAMP,
  HEIGHT_RAMP_MAX_M,
  PLACE_COLORS,
  SELECTED,
} from '../config/palette'
import type { BuildingFeature, MapTile, PlaceFeature } from '../types/api'
import type { BuildingColorMode, Selection, TileStats } from '../types/workspace'
import type { Elevation } from './terrain'

export const TILE_ZOOM = 15
const MAX_TILES_LOADED = 60
const MAX_CONCURRENT = 3
const RETRY_AFTER_MS = 20_000
/** Stop streaming new tiles when the camera is further than this from the ground. */
export const MAX_STREAM_RANGE_M = 9_000
const MAX_TILES_PER_VIEW = 16
const BASE_SINK_M = 1.5 // sink footprints slightly so slopes never show a gap

type FetchTile = (z: number, x: number, y: number, signal: AbortSignal) => Promise<MapTile>

interface LoadedTile {
  key: string
  data: MapTile
  primitive: Primitive | null
  points: PointPrimitiveCollection | null
  labels: LabelCollection | null
  /** Ground elevation per building id (min over its footprint). */
  ground: Map<string, number>
  lastWanted: number
}

interface FeatureRef {
  tileKey: string
  building?: BuildingFeature
  place?: PlaceFeature
}

export function lonLatToTile(lon: number, lat: number, z = TILE_ZOOM): [number, number] {
  const n = 2 ** z
  const phi = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180
  const x = Math.floor(((lon + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n)
  return [Math.min(Math.max(x, 0), n - 1), Math.min(Math.max(y, 0), n - 1)]
}

function heightColor(height: number): Color {
  const t = Math.min(1, Math.max(0, height / HEIGHT_RAMP_MAX_M)) * (HEIGHT_RAMP.length - 1)
  const i = Math.min(Math.floor(t), HEIGHT_RAMP.length - 2)
  return Color.lerp(
    Color.fromCssColorString(HEIGHT_RAMP[i]),
    Color.fromCssColorString(HEIGHT_RAMP[i + 1]),
    t - i,
    new Color(),
  )
}

function buildingColor(feature: BuildingFeature, mode: BuildingColorMode): Color {
  switch (mode) {
    case 'natural':
      return Color.fromCssColorString(BUILDING_NATURAL)
    case 'height':
      return heightColor(feature.properties.height)
    case 'use':
      return Color.fromCssColorString(BUILDING_KIND_COLORS[feature.properties.kind])
  }
}

/** Open ring without the closing duplicate, or null if degenerate. */
function openRing(ring: number[][]): number[][] | null {
  const points = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]
    ? ring.slice(0, -1)
    : ring
  return points.length >= 3 ? points : null
}

/**
 * Streams OpenStreetMap buildings and places as map tiles around the camera.
 * Each tile becomes one batched Primitive, so thousands of buildings stay fast.
 */
export class BuildingTiles {
  private readonly tiles = new Map<string, LoadedTile>()
  private readonly features = new Map<string, FeatureRef>()
  private readonly loading = new Map<string, AbortController>()
  private readonly failedUntil = new Map<string, number>()
  private queue: Array<[number, number]> = []
  private wanted = new Set<string>()
  private colorMode: BuildingColorMode = 'natural'
  private selectedId: string | null = null
  private buildingsVisible = true
  private placesVisible = true
  private tooFar = false
  private generation = 0
  private destroyed = false
  private readonly scene: Scene
  private readonly fetchTile: FetchTile
  private readonly getElevation: () => Elevation
  private readonly onStats: (stats: TileStats) => void

  constructor(
    scene: Scene,
    fetchTile: FetchTile,
    getElevation: () => Elevation,
    onStats: (stats: TileStats) => void,
  ) {
    this.scene = scene
    this.fetchTile = fetchTile
    this.getElevation = getElevation
    this.onStats = onStats
  }

  destroy(): void {
    this.destroyed = true
    this.loading.forEach((controller) => controller.abort())
    for (const tile of this.tiles.values()) this.removeGraphics(tile)
    this.tiles.clear()
    this.features.clear()
  }

  // -- streaming --------------------------------------------------------------

  /** Loads the tiles covering a square of `radius` metres around a point. */
  update(latitude: number, longitude: number, range: number): void {
    this.tooFar = range > MAX_STREAM_RANGE_M
    if (this.tooFar) {
      this.queue = []
      this.emitStats()
      return
    }
    const radius = Math.min(2_500, Math.max(600, range * 0.9))
    const dLat = radius / 111_320
    const dLon = radius / (111_320 * Math.cos((latitude * Math.PI) / 180))
    const [x0, y0] = lonLatToTile(longitude - dLon, latitude + dLat)
    const [x1, y1] = lonLatToTile(longitude + dLon, latitude - dLat)
    const [cx, cy] = lonLatToTile(longitude, latitude)

    const candidates: Array<[number, number]> = []
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) candidates.push([x, y])
    candidates.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))
    const selected = candidates.slice(0, MAX_TILES_PER_VIEW)

    const now = Date.now()
    this.wanted = new Set(selected.map(([x, y]) => `${x}/${y}`))
    for (const key of this.wanted) {
      const tile = this.tiles.get(key)
      if (tile) tile.lastWanted = now
    }
    this.queue = selected.filter(([x, y]) => {
      const key = `${x}/${y}`
      return !this.tiles.has(key) && !this.loading.has(key) && (this.failedUntil.get(key) ?? 0) < now
    })
    this.evict()
    this.pump()
    this.emitStats()
  }

  private pump(): void {
    while (!this.destroyed && this.loading.size < MAX_CONCURRENT && this.queue.length) {
      const [x, y] = this.queue.shift()!
      void this.load(x, y)
    }
  }

  private async load(x: number, y: number): Promise<void> {
    const key = `${x}/${y}`
    const controller = new AbortController()
    this.loading.set(key, controller)
    this.emitStats()
    try {
      const data = await this.fetchTile(TILE_ZOOM, x, y, controller.signal)
      if (this.destroyed) return
      const tile: LoadedTile = {
        key,
        data,
        primitive: null,
        points: null,
        labels: null,
        ground: new Map(),
        lastWanted: Date.now(),
      }
      this.tiles.set(key, tile)
      this.failedUntil.delete(key)
      this.index(tile)
      await this.build(tile, this.generation)
    } catch (error) {
      if (controller.signal.aborted || this.destroyed) return
      this.failedUntil.set(key, Date.now() + RETRY_AFTER_MS)
      console.warn(`Building tile ${key} failed`, error)
    } finally {
      this.loading.delete(key)
      if (!this.destroyed) {
        this.emitStats()
        this.pump()
      }
    }
  }

  private evict(): void {
    if (this.tiles.size <= MAX_TILES_LOADED) return
    const removable = [...this.tiles.values()]
      .filter((tile) => !this.wanted.has(tile.key))
      .sort((a, b) => a.lastWanted - b.lastWanted)
    for (const tile of removable.slice(0, this.tiles.size - MAX_TILES_LOADED)) {
      this.removeGraphics(tile)
      for (const feature of [...tile.data.buildings.features, ...tile.data.places.features]) {
        if (feature.id !== this.selectedId) this.features.delete(feature.id)
      }
      this.tiles.delete(tile.key)
    }
  }

  private index(tile: LoadedTile): void {
    for (const building of tile.data.buildings.features) {
      this.features.set(building.id, { tileKey: tile.key, building })
    }
    for (const place of tile.data.places.features) {
      // A place that is also a building keeps its building entry for picking.
      const existing = this.features.get(place.id)
      if (existing) existing.place = place
      else this.features.set(place.id, { tileKey: tile.key, place })
    }
  }

  // -- graphics -----------------------------------------------------------------

  private async build(tile: LoadedTile, generation: number): Promise<void> {
    const { buildings, places } = tile.data
    const elevation = this.getElevation()

    // Ground height under every building (min over its outer ring) and every place.
    const vertices: Array<[number, number]> = []
    const spans: Array<[string, number, number]> = []
    for (const building of buildings.features) {
      const start = vertices.length
      for (const polygon of building.geometry.coordinates) {
        for (const [lon, lat] of polygon[0]) vertices.push([lon, lat])
      }
      spans.push([building.id, start, vertices.length])
    }
    const placeStart = vertices.length
    for (const place of places.features) vertices.push(place.geometry.coordinates)

    let heights: number[]
    try {
      heights = await elevation.sample(vertices)
    } catch {
      heights = vertices.map(() => 0)
    }
    if (this.destroyed || generation !== this.generation || !this.tiles.has(tile.key)) return

    tile.ground.clear()
    for (const [id, start, end] of spans) {
      let min = Number.POSITIVE_INFINITY
      for (let i = start; i < end; i++) min = Math.min(min, heights[i])
      tile.ground.set(id, Number.isFinite(min) ? min : 0)
    }

    this.removeGraphics(tile)
    tile.primitive = this.createBuildingPrimitive(buildings.features, tile.ground)
    if (tile.primitive) {
      tile.primitive.show = this.buildingsVisible
      this.scene.primitives.add(tile.primitive)
    }

    if (places.features.length) {
      tile.points = new PointPrimitiveCollection()
      tile.labels = new LabelCollection()
      places.features.forEach((place, i) => {
        const [lon, lat] = place.geometry.coordinates
        const ground = tile.ground.get(place.id)
        const top = ground !== undefined ? ground + (this.features.get(place.id)?.building?.properties.height ?? 0) : heights[placeStart + i]
        const position = Cartesian3.fromDegrees(lon, lat, top + 4)
        const color = Color.fromCssColorString(PLACE_COLORS[place.properties.category])
        tile.points!.add({
          id: place.id,
          position,
          color,
          pixelSize: 9,
          outlineColor: Color.fromCssColorString('#0b0d10'),
          outlineWidth: 2,
          scaleByDistance: new NearFarScalar(300, 1.2, 8000, 0.6),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        })
        if (place.properties.name) {
          tile.labels!.add({
            id: place.id,
            position,
            text: place.properties.name,
            font: '500 12px Inter, system-ui, sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.fromCssColorString('#0b0d10'),
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -10),
            distanceDisplayCondition: new DistanceDisplayCondition(0, 1400),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          })
        }
      })
      tile.points.show = tile.labels.show = this.placesVisible
      this.scene.primitives.add(tile.points)
      this.scene.primitives.add(tile.labels)
    }
    this.scene.requestRender()
    this.emitStats()
  }

  private createBuildingPrimitive(features: BuildingFeature[], ground: Map<string, number>): Primitive | null {
    const instances: GeometryInstance[] = []
    for (const feature of features) {
      const base = (ground.get(feature.id) ?? 0) - BASE_SINK_M
      const color = feature.id === this.selectedId
        ? Color.fromCssColorString(SELECTED)
        : buildingColor(feature, this.colorMode)
      feature.geometry.coordinates.forEach((polygon, i) => {
        const outer = openRing(polygon[0])
        if (!outer) return
        const holes = polygon
          .slice(1)
          .map(openRing)
          .filter((hole): hole is number[][] => hole !== null)
          .map((hole) => new PolygonHierarchy(Cartesian3.fromDegreesArray(hole.flat())))
        instances.push(
          new GeometryInstance({
            id: i === 0 ? feature.id : `${feature.id}#${i}`,
            geometry: new PolygonGeometry({
              polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(outer.flat()), holes),
              height: base,
              extrudedHeight: base + BASE_SINK_M + feature.properties.height,
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
          }),
        )
      })
    }
    if (!instances.length) return null
    return new Primitive({
      geometryInstances: instances,
      appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }),
      releaseGeometryInstances: false,
      asynchronous: true,
    })
  }

  private removeGraphics(tile: LoadedTile): void {
    for (const graphic of [tile.primitive, tile.points, tile.labels]) {
      if (graphic && !graphic.isDestroyed()) this.scene.primitives.remove(graphic)
    }
    tile.primitive = tile.points = tile.labels = null
  }

  /** Re-places every loaded building on a new terrain surface. */
  rebuildAll(): void {
    this.generation++
    for (const tile of this.tiles.values()) void this.build(tile, this.generation)
  }

  // -- styling & selection ------------------------------------------------------

  setVisibility(buildings: boolean, places: boolean): void {
    this.buildingsVisible = buildings
    this.placesVisible = places
    for (const tile of this.tiles.values()) {
      if (tile.primitive) tile.primitive.show = buildings
      if (tile.points) tile.points.show = places
      if (tile.labels) tile.labels.show = places
    }
    this.scene.requestRender()
  }

  setColorMode(mode: BuildingColorMode): void {
    if (mode === this.colorMode) return
    this.colorMode = mode
    for (const tile of this.tiles.values()) {
      if (!tile.primitive) continue
      if (tile.primitive.ready) {
        for (const building of tile.data.buildings.features) this.paintIn(tile.primitive, building)
      } else {
        // Still compiling in a worker: attributes can't be changed yet, so recreate it.
        this.scene.primitives.remove(tile.primitive)
        tile.primitive = this.createBuildingPrimitive(tile.data.buildings.features, tile.ground)
        if (tile.primitive) {
          tile.primitive.show = this.buildingsVisible
          this.scene.primitives.add(tile.primitive)
        }
      }
    }
    this.scene.requestRender()
  }

  private paint(ref: FeatureRef): void {
    const primitive = this.tiles.get(ref.tileKey)?.primitive
    if (ref.building && primitive) this.paintIn(primitive, ref.building)
  }

  /** Recolours one building inside a specific tile's primitive. */
  private paintIn(primitive: Primitive, building: BuildingFeature): void {
    if (!primitive.ready) return
    const color = building.id === this.selectedId
      ? Color.fromCssColorString(SELECTED)
      : buildingColor(building, this.colorMode)
    const value = ColorGeometryInstanceAttribute.toValue(color)
    building.geometry.coordinates.forEach((_, i) => {
      const attributes = primitive.getGeometryInstanceAttributes(i === 0 ? building.id : `${building.id}#${i}`)
      if (attributes) attributes.color = value
    })
  }

  /** Resolves a scene pick result to a feature id we manage. */
  resolvePick(picked: unknown): string | null {
    if (!picked || typeof picked !== 'object' || !('id' in picked)) return null
    const id = picked.id
    if (typeof id !== 'string') return null
    const base = id.split('#')[0]
    return this.features.has(base) ? base : null
  }

  select(id: string | null): Selection | null {
    const previous = this.selectedId ? this.features.get(this.selectedId) : undefined
    this.selectedId = id
    if (previous) this.paint(previous)
    const ref = id ? this.features.get(id) : undefined
    if (ref) this.paint(ref)
    this.scene.requestRender()
    if (!ref) return null
    const ground = this.tiles.get(ref.tileKey)?.ground.get(ref.building?.id ?? '') ?? null
    return ref.building
      ? { kind: 'building', feature: ref.building, groundElevation: ground }
      : { kind: 'place', feature: ref.place!, groundElevation: null }
  }

  /** Bounding points of a feature, for camera fly-to. */
  featurePositions(id: string): Cartesian3[] {
    const ref = this.features.get(id)
    if (!ref) return []
    if (ref.building) {
      const ground = this.tiles.get(ref.tileKey)?.ground.get(id) ?? 0
      const top = ground + ref.building.properties.height
      return ref.building.geometry.coordinates.flatMap((polygon) =>
        polygon[0].flatMap(([lon, lat]) => [
          Cartesian3.fromDegrees(lon, lat, ground),
          Cartesian3.fromDegrees(lon, lat, top),
        ]),
      )
    }
    const [lon, lat] = ref.place!.geometry.coordinates
    return [Cartesian3.fromDegrees(lon, lat, 0)]
  }

  private emitStats(): void {
    let buildings = 0
    let places = 0
    for (const key of this.wanted) {
      const tile = this.tiles.get(key)
      if (!tile) continue
      buildings += tile.data.buildings.features.length
      places += tile.data.places.features.length
    }
    this.onStats({
      tiles: [...this.wanted].filter((key) => this.tiles.has(key)).length,
      loading: this.loading.size + this.queue.length,
      failed: [...this.wanted].filter((key) => (this.failedUntil.get(key) ?? 0) > Date.now()).length,
      buildings,
      places,
      tooFar: this.tooFar,
    })
  }
}
