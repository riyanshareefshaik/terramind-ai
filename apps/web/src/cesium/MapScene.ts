import './setup'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  DirectionalLight,
  HeadingPitchRange,
  Ion,
  Math as CesiumMath,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  defined,
  type ImageryLayer,
} from 'cesium'
import type { MapTile, Place } from '../types/api'
import type {
  BasemapId,
  CameraState,
  LayerSettings,
  Selection,
  TileStats,
  ViewFocus,
} from '../types/workspace'
import { createBasemap } from './basemaps'
import { BuildingTiles } from './BuildingTiles'
import { flatElevation, terrariumElevation, worldElevation, type Elevation } from './terrain'

export interface MapSceneOptions {
  container: HTMLElement
  ionToken: string | null
  home: { latitude: number; longitude: number }
  fetchTile: (z: number, x: number, y: number, signal: AbortSignal) => Promise<MapTile>
  onSelect: (selection: Selection | null) => void
  onCameraChange: (camera: CameraState) => void
  onViewChange: (focus: ViewFocus) => void
  onTileStats: (stats: TileStats) => void
}

const HOME_RANGE_M = 2_400
const HOME_PITCH = CesiumMath.toRadians(-40)
const HOME_HEADING = CesiumMath.toRadians(20)
const MIN_PITCH = CesiumMath.toRadians(-89.5)
const MAX_PITCH = CesiumMath.toRadians(-8)

/**
 * Owns the Cesium Viewer. React talks to the 3D scene only through this class,
 * keeping Cesium's imperative API out of components.
 */
export class MapScene {
  private readonly viewer: Viewer
  private readonly options: MapSceneOptions
  private readonly handler: ScreenSpaceEventHandler
  private readonly tiles: BuildingTiles
  private readonly cleanups: Array<() => void> = []
  private basemapLayers: ImageryLayer[] = []
  private basemap: BasemapId | null = null
  private terrainEnabled: boolean | null = null
  private elevation: Elevation = flatElevation()
  private terrainRequest = 0
  private selectedId: string | null = null
  private hoverFrame = 0
  private settleTimer = 0
  private destroyed = false

  constructor(options: MapSceneOptions) {
    this.options = options
    if (options.ionToken) Ion.defaultAccessToken = options.ionToken

    this.viewer = new Viewer(options.container, {
      baseLayer: false,
      terrainProvider: this.elevation.provider,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    })

    const { scene } = this.viewer
    scene.globe.baseColor = Color.fromCssColorString('#1a1d21')
    scene.globe.depthTestAgainstTerrain = true
    scene.globe.maximumScreenSpaceError = 1.5 // sharper imagery and terrain
    scene.backgroundColor = Color.fromCssColorString('#0b0d10')
    scene.fog.density = 1.2e-4
    scene.screenSpaceCameraController.minimumZoomDistance = 25
    scene.screenSpaceCameraController.maximumZoomDistance = 12_000_000
    // Light buildings from the viewer's direction so they read clearly at any
    // time of day, instead of going dark when the real sun is down in India.
    const light = new DirectionalLight({ direction: Cartesian3.clone(scene.camera.directionWC), intensity: 2.2 })
    scene.light = light
    this.cleanups.push(
      scene.preRender.addEventListener(() => {
        Cartesian3.clone(scene.camera.directionWC, light.direction)
      }),
    )

    this.tiles = new BuildingTiles(scene, options.fetchTile, () => this.elevation, options.onTileStats)
    this.handler = new ScreenSpaceEventHandler(scene.canvas)
    this.bindEvents()
    this.flyHome(0)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.hoverFrame)
    window.clearTimeout(this.settleTimer)
    this.cleanups.forEach((cleanup) => cleanup())
    this.tiles.destroy()
    this.handler.destroy()
    this.viewer.destroy()
  }

  // -- events -------------------------------------------------------------------

  private bindEvents(): void {
    const { viewer, handler } = this
    const { camera, scene } = viewer

    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      this.select(this.tiles.resolvePick(scene.pick(event.position)))
    }, ScreenSpaceEventType.LEFT_CLICK)

    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const id = this.tiles.resolvePick(scene.pick(event.position))
      if (id) {
        this.select(id)
        this.flyToSelection()
      }
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    handler.setInputAction((event: ScreenSpaceEventHandler.MotionEvent) => {
      cancelAnimationFrame(this.hoverFrame)
      this.hoverFrame = requestAnimationFrame(() => {
        if (this.destroyed) return
        const id = this.tiles.resolvePick(scene.pick(event.endPosition))
        scene.canvas.style.cursor = id ? 'pointer' : ''
        this.tiles.setHover(id)
      })
    }, ScreenSpaceEventType.MOUSE_MOVE)

    // With render-on-demand, Cesium's moveEnd can fire mid-flight and then not
    // at the real end, so also settle after camera changes and on flight completion.
    camera.percentageChanged = 0.02
    this.cleanups.push(
      camera.changed.addEventListener(() => {
        this.emitCamera()
        this.scheduleSettle()
      }),
    )
    this.cleanups.push(camera.moveEnd.addEventListener(() => this.scheduleSettle()))
  }

  private scheduleSettle(delayMs = 400): void {
    window.clearTimeout(this.settleTimer)
    this.settleTimer = window.setTimeout(() => this.onMoveEnd(), delayMs)
  }

  private readonly settled = () => this.scheduleSettle(50)

  private onMoveEnd(): void {
    if (this.destroyed) return
    this.emitCamera()
    const focus = this.focus()
    if (!focus) return
    this.tiles.update(focus.latitude, focus.longitude, focus.range)
    this.options.onViewChange(focus)
  }

  private focus(): ViewFocus | null {
    const { camera, scene } = this.viewer
    // The ellipsoid hit doesn't depend on which terrain tiles happen to be
    // rendered (they lag behind after a flight), and is well within tile-sized
    // accuracy for choosing what to load.
    const target = this.centerOnEllipsoid()
    if (target) {
      const c = scene.globe.ellipsoid.cartesianToCartographic(target)
      return {
        latitude: CesiumMath.toDegrees(c.latitude),
        longitude: CesiumMath.toDegrees(c.longitude),
        range: Cartesian3.distance(camera.positionWC, target),
      }
    }
    const p = camera.positionCartographic
    return defined(p)
      ? { latitude: CesiumMath.toDegrees(p.latitude), longitude: CesiumMath.toDegrees(p.longitude), range: p.height }
      : null
  }

  // -- layers -------------------------------------------------------------------

  applyLayers(settings: LayerSettings): void {
    if (settings.basemap !== this.basemap) this.setBasemap(settings.basemap)
    if (settings.terrain !== this.terrainEnabled) void this.setTerrain(settings.terrain)
    this.tiles.setVisibility(settings.buildings, settings.places)
    this.tiles.setColorMode(settings.colorMode)
    this.viewer.scene.requestRender()
  }

  private setBasemap(id: BasemapId): void {
    this.basemap = id
    const layers = this.viewer.imageryLayers
    for (const layer of this.basemapLayers) layers.remove(layer, true)
    this.basemapLayers = createBasemap(id)
    this.basemapLayers.forEach((layer, i) => layers.add(layer, i))
  }

  private async setTerrain(enabled: boolean): Promise<void> {
    this.terrainEnabled = enabled
    const request = ++this.terrainRequest
    let next: Elevation
    if (!enabled) {
      next = flatElevation()
    } else if (this.options.ionToken) {
      try {
        next = await worldElevation()
      } catch {
        next = terrariumElevation()
      }
    } else {
      next = terrariumElevation()
    }
    if (this.destroyed || request !== this.terrainRequest) return
    this.elevation = next
    this.viewer.terrainProvider = next.provider
    this.tiles.rebuildAll()
    this.viewer.scene.requestRender()
  }


  // -- selection ----------------------------------------------------------------

  private select(id: string | null): void {
    this.selectedId = id
    this.options.onSelect(this.tiles.select(id))
  }

  clearSelection(): void {
    this.select(null)
  }

  flyToSelection(): void {
    if (!this.selectedId) return
    const positions = this.tiles.featurePositions(this.selectedId)
    if (!positions.length) return
    const sphere = BoundingSphere.fromPoints(positions)
    this.viewer.camera.flyToBoundingSphere(sphere, {
      duration: 1.4,
      offset: new HeadingPitchRange(
        this.viewer.camera.heading,
        CesiumMath.toRadians(-32),
        Math.max(180, sphere.radius * 4),
      ),
      complete: this.settled,
    })
  }

  // -- camera -------------------------------------------------------------------

  flyHome(duration = 1.8): void {
    const { latitude, longitude } = this.options.home
    this.viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(longitude, latitude), 400), {
      offset: new HeadingPitchRange(HOME_HEADING, HOME_PITCH, HOME_RANGE_M),
      duration,
      complete: this.settled,
    })
  }

  flyToPlace(place: Place): void {
    // Frame the place at a range that fits its size, but stay close enough for
    // buildings to stream in (cities are shown at their centre, not whole).
    let range = 1_200
    if (place.bbox) {
      const [south, west, north, east] = place.bbox
      const spanM = Math.max(north - south, (east - west) * Math.cos((place.latitude * Math.PI) / 180)) * 111_320
      range = CesiumMath.clamp(spanM * 0.8, 600, 6_000)
    }
    this.viewer.camera.flyToBoundingSphere(
      new BoundingSphere(Cartesian3.fromDegrees(place.longitude, place.latitude), 150),
      { offset: new HeadingPitchRange(this.viewer.camera.heading, HOME_PITCH, range), duration: 2.2, complete: this.settled },
    )
  }

  flyToLocation(latitude: number, longitude: number): void {
    this.viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(longitude, latitude), 150), {
      offset: new HeadingPitchRange(this.viewer.camera.heading, HOME_PITCH, 1_200),
      duration: 2,
      complete: this.settled,
    })
  }

  tilt(deltaDeg: number): void {
    const { camera } = this.viewer
    const target = this.screenCenterTarget()
    if (!target) {
      if (deltaDeg > 0) camera.lookUp(CesiumMath.toRadians(deltaDeg))
      else camera.lookDown(CesiumMath.toRadians(-deltaDeg))
      return
    }
    const pitch = CesiumMath.clamp(camera.pitch + CesiumMath.toRadians(deltaDeg), MIN_PITCH, MAX_PITCH)
    this.orbit(target, camera.heading, pitch)
  }

  rotate(deltaDeg: number): void {
    const target = this.screenCenterTarget()
    if (target) this.orbit(target, this.viewer.camera.heading + CesiumMath.toRadians(deltaDeg), this.viewer.camera.pitch)
  }

  resetNorth(): void {
    const target = this.screenCenterTarget()
    if (target) this.orbit(target, 0, this.viewer.camera.pitch)
  }

  zoom(direction: 'in' | 'out'): void {
    const { camera } = this.viewer
    const target = this.screenCenterTarget()
    const distance = target ? Cartesian3.distance(camera.positionWC, target) : camera.positionCartographic.height
    const amount = distance * (direction === 'in' ? 0.45 : 0.8)
    if (direction === 'in') camera.zoomIn(amount)
    else camera.zoomOut(amount)
  }

  private screenCenter(): Cartesian2 {
    const { canvas } = this.viewer.scene
    return new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
  }

  private centerOnEllipsoid(): Cartesian3 | undefined {
    return this.viewer.camera.pickEllipsoid(this.screenCenter()) ?? undefined
  }

  /** Ground point at screen centre: terrain when it's trustworthy, else the ellipsoid. */
  private screenCenterTarget(): Cartesian3 | undefined {
    const { scene, camera } = this.viewer
    const ray = camera.getPickRay(this.screenCenter())
    const terrain = ray ? scene.globe.pick(ray, scene) : undefined
    const ellipsoid = this.centerOnEllipsoid()
    if (terrain && ellipsoid) {
      // A terrain hit far beyond the ellipsoid hit comes from stale tiles.
      const toTerrain = Cartesian3.distance(camera.positionWC, terrain)
      const toEllipsoid = Cartesian3.distance(camera.positionWC, ellipsoid)
      return toTerrain < toEllipsoid * 1.5 ? terrain : ellipsoid
    }
    return terrain ?? ellipsoid
  }

  private orbit(target: Cartesian3, heading: number, pitch: number): void {
    const { camera } = this.viewer
    const range = Cartesian3.distance(camera.positionWC, target)
    const start = {
      destination: Cartesian3.clone(camera.positionWC),
      orientation: { heading: camera.heading, pitch: camera.pitch, roll: camera.roll },
    }
    camera.lookAt(target, new HeadingPitchRange(heading, pitch, range))
    camera.lookAtTransform(Matrix4.IDENTITY)
    const end = {
      destination: Cartesian3.clone(camera.positionWC),
      orientation: { heading: camera.heading, pitch: camera.pitch, roll: 0 },
    }
    camera.setView(start)
    camera.flyTo({ ...end, duration: 0.45, complete: this.settled })
  }

  private emitCamera(): void {
    if (this.destroyed) return
    const { camera } = this.viewer
    const position = camera.positionCartographic
    if (!defined(position)) return
    this.options.onCameraChange({
      latitude: CesiumMath.toDegrees(position.latitude),
      longitude: CesiumMath.toDegrees(position.longitude),
      height: position.height,
      headingDeg: CesiumMath.toDegrees(camera.heading),
      pitchDeg: CesiumMath.toDegrees(camera.pitch),
    })
  }
}
