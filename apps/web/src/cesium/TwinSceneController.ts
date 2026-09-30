import './setup'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  Cesium3DTileStyle,
  CesiumTerrainProvider,
  Color,
  CustomDataSource,
  EllipsoidTerrainProvider,
  Entity,
  HeadingPitchRange,
  ImageryLayer,
  Ion,
  Math as CesiumMath,
  Matrix4,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  defined,
} from 'cesium'
import type { TwinEntity } from '../types/twin'
import type {
  BaseLayerId,
  BaseLayerState,
  BuildingColorMode,
  CameraState,
} from '../types/workspace'
import { createEntity, styleEntity } from './entityGraphics'

export interface TwinSceneOptions {
  container: HTMLElement
  ionToken: string | null
  home: { latitude: number; longitude: number }
  onSelect: (entityId: string | null) => void
  onCameraChange: (camera: CameraState) => void
  onBaseLayersChange: (layers: BaseLayerState[]) => void
}

const HOME_RADIUS_M = 900
const HOME_RANGE_M = 2500
const HOME_PITCH = CesiumMath.toRadians(-38)
const MIN_PITCH = CesiumMath.toRadians(-89.5)
const MAX_PITCH = CesiumMath.toRadians(-8)

/**
 * Owns the Cesium Viewer and everything drawn in it. React components talk to
 * the 3D scene only through this class, which keeps Cesium's imperative API
 * out of the component tree and makes the renderer replaceable.
 */
export class TwinSceneController {
  private readonly viewer: Viewer
  private readonly options: TwinSceneOptions
  private readonly handler: ScreenSpaceEventHandler
  private readonly dataSources = new Map<string, CustomDataSource>()
  private readonly twinEntities = new Map<string, TwinEntity>()
  private readonly visibility = new Map<string, boolean>()
  private readonly baseLayers: Record<BaseLayerId, BaseLayerState>
  private readonly cleanups: Array<() => void> = []
  private colorMode: BuildingColorMode = 'risk'
  private selectedId: string | null = null
  private worldTerrain: CesiumTerrainProvider | null = null
  private osmBuildings: Cesium3DTileset | null = null
  private hoverFrame = 0
  private destroyed = false

  constructor(options: TwinSceneOptions) {
    this.options = options
    const { ionToken } = options
    if (ionToken) Ion.defaultAccessToken = ionToken

    this.viewer = new Viewer(options.container, {
      baseLayer: ionToken
        ? ImageryLayer.fromWorldImagery({})
        : new ImageryLayer(new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })),
      terrainProvider: new EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: true,
      // Only re-render when something changes: keeps an idle dashboard cheap.
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
    })

    const { scene } = this.viewer
    scene.globe.baseColor = Color.fromCssColorString('#0b1611')
    scene.globe.depthTestAgainstTerrain = true
    scene.backgroundColor = Color.fromCssColorString('#030806')
    scene.screenSpaceCameraController.minimumZoomDistance = 40
    scene.screenSpaceCameraController.maximumZoomDistance = 2_000_000

    this.baseLayers = {
      imagery: {
        id: 'imagery',
        name: 'Imagery',
        source: ionToken ? 'Bing Maps aerial via Cesium ion' : 'OpenStreetMap standard tiles',
        status: 'ready',
        message: null,
      },
      terrain: {
        id: 'terrain',
        name: '3D terrain',
        source: 'Cesium World Terrain',
        status: ionToken ? 'loading' : 'unavailable',
        message: ionToken ? null : 'Set VITE_CESIUM_ION_TOKEN to enable.',
      },
      'osm-buildings': {
        id: 'osm-buildings',
        name: '3D buildings (OSM)',
        source: 'Cesium OSM Buildings · © OpenStreetMap contributors',
        status: ionToken ? 'loading' : 'unavailable',
        message: ionToken ? null : 'Set VITE_CESIUM_ION_TOKEN to enable.',
      },
    }

    this.handler = new ScreenSpaceEventHandler(scene.canvas)
    this.bindEvents()
    this.flyHome(0)
    this.emitCamera()
    this.emitBaseLayers()
    if (ionToken) {
      void this.loadWorldTerrain()
      void this.loadOsmBuildings()
    }
  }

  // -- lifecycle ------------------------------------------------------------

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.hoverFrame)
    this.cleanups.forEach((cleanup) => cleanup())
    this.handler.destroy()
    this.viewer.destroy()
  }

  private bindEvents(): void {
    const { viewer, handler } = this
    const { camera, scene } = viewer

    // Replace Cesium's default double-click (lock camera to entity) with a fly-to.
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    handler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const id = this.pickEntityId(event.position)
      if (id) this.flyToEntity(id)
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    handler.setInputAction((event: ScreenSpaceEventHandler.MotionEvent) => {
      cancelAnimationFrame(this.hoverFrame)
      this.hoverFrame = requestAnimationFrame(() => {
        if (this.destroyed) return
        scene.canvas.style.cursor = this.pickEntityId(event.endPosition) ? 'pointer' : ''
      })
    }, ScreenSpaceEventType.MOUSE_MOVE)

    this.cleanups.push(
      viewer.selectedEntityChanged.addEventListener((entity?: Entity) => {
        const id = entity && this.twinEntities.has(entity.id) ? entity.id : null
        this.applySelection(id)
        this.options.onSelect(id)
      }),
    )

    camera.percentageChanged = 0.02
    this.cleanups.push(camera.changed.addEventListener(() => this.emitCamera()))
    this.cleanups.push(camera.moveEnd.addEventListener(() => this.emitCamera()))
  }

  private pickEntityId(position: Cartesian2): string | null {
    const picked: unknown = this.viewer.scene.pick(position)
    if (picked && typeof picked === 'object' && 'id' in picked && picked.id instanceof Entity) {
      return this.twinEntities.has(picked.id.id) ? picked.id.id : null
    }
    return null
  }

  // -- base layers ----------------------------------------------------------

  private async loadWorldTerrain(): Promise<void> {
    try {
      const provider = await createWorldTerrainAsync()
      if (this.destroyed) return
      this.worldTerrain = provider
      this.updateBaseLayer('terrain', { status: 'ready', message: null })
      this.applyTerrainVisibility()
    } catch (error) {
      this.updateBaseLayer('terrain', { status: 'error', message: errorMessage(error) })
    }
  }

  private async loadOsmBuildings(): Promise<void> {
    try {
      const tileset = await createOsmBuildingsAsync()
      if (this.destroyed) {
        tileset.destroy()
        return
      }
      tileset.style = new Cesium3DTileStyle({ color: "color('#dfe9e4', 0.92)" })
      tileset.show = this.visibility.get('osm-buildings') ?? true
      this.viewer.scene.primitives.add(tileset)
      this.osmBuildings = tileset
      this.updateBaseLayer('osm-buildings', { status: 'ready', message: null })
    } catch (error) {
      this.updateBaseLayer('osm-buildings', { status: 'error', message: errorMessage(error) })
    }
  }

  private applyTerrainVisibility(): void {
    if (!this.worldTerrain) return
    const visible = this.visibility.get('terrain') ?? true
    this.viewer.terrainProvider = visible ? this.worldTerrain : new EllipsoidTerrainProvider()
    this.viewer.scene.requestRender()
  }

  private updateBaseLayer(id: BaseLayerId, patch: Partial<BaseLayerState>): void {
    if (this.destroyed) return
    this.baseLayers[id] = { ...this.baseLayers[id], ...patch }
    this.emitBaseLayers()
  }

  private emitBaseLayers(): void {
    this.options.onBaseLayersChange(Object.values(this.baseLayers))
  }

  // -- twin entities --------------------------------------------------------

  /** Replaces all twin entities, grouped into one data source per layer. */
  setEntities(entities: TwinEntity[]): void {
    this.twinEntities.clear()
    const byLayer = new Map<string, TwinEntity[]>()
    for (const entity of entities) {
      this.twinEntities.set(entity.id, entity)
      byLayer.set(entity.layer_id, [...(byLayer.get(entity.layer_id) ?? []), entity])
    }

    for (const [layerId, source] of this.dataSources) {
      if (!byLayer.has(layerId)) {
        void this.viewer.dataSources.remove(source, true)
        this.dataSources.delete(layerId)
      }
    }

    for (const [layerId, layerEntities] of byLayer) {
      let source = this.dataSources.get(layerId)
      if (!source) {
        source = new CustomDataSource(layerId)
        source.show = this.visibility.get(layerId) ?? true
        this.dataSources.set(layerId, source)
        void this.viewer.dataSources.add(source)
      }
      source.entities.suspendEvents()
      source.entities.removeAll()
      for (const entity of layerEntities) {
        const graphic = createEntity(entity, this.colorMode)
        styleEntity(graphic, entity, this.colorMode, entity.id === this.selectedId)
        source.entities.add(graphic)
      }
      source.entities.resumeEvents()
    }
    this.viewer.scene.requestRender()
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    this.visibility.set(layerId, visible)
    if (layerId === 'terrain') {
      this.applyTerrainVisibility()
    } else if (layerId === 'osm-buildings') {
      if (this.osmBuildings) this.osmBuildings.show = visible
    } else if (layerId === 'imagery') {
      const layer = this.viewer.imageryLayers.get(0)
      if (layer) layer.show = visible
    } else {
      const source = this.dataSources.get(layerId)
      if (source) source.show = visible
    }
    this.viewer.scene.requestRender()
  }

  setBuildingColorMode(mode: BuildingColorMode): void {
    if (mode === this.colorMode) return
    this.colorMode = mode
    for (const entity of this.twinEntities.values()) {
      if (entity.type !== 'building') continue
      const graphic = this.findGraphic(entity.id)
      if (graphic) styleEntity(graphic, entity, mode, entity.id === this.selectedId)
    }
    this.viewer.scene.requestRender()
  }

  /** Selects an entity from outside the scene (search, alerts, inspector). */
  select(entityId: string | null): void {
    const graphic = entityId ? this.findGraphic(entityId) : undefined
    if (this.viewer.selectedEntity !== graphic) this.viewer.selectedEntity = graphic
  }

  private applySelection(entityId: string | null): void {
    const previous = this.selectedId
    this.selectedId = entityId
    for (const id of [previous, entityId]) {
      if (!id) continue
      const entity = this.twinEntities.get(id)
      const graphic = this.findGraphic(id)
      if (entity && graphic) styleEntity(graphic, entity, this.colorMode, id === entityId)
    }
    this.viewer.scene.requestRender()
  }

  private findGraphic(entityId: string): Entity | undefined {
    const entity = this.twinEntities.get(entityId)
    return entity ? this.dataSources.get(entity.layer_id)?.entities.getById(entityId) : undefined
  }

  // -- camera ---------------------------------------------------------------

  flyHome(duration = 1.6): void {
    const { latitude, longitude } = this.options.home
    this.viewer.camera.flyToBoundingSphere(
      new BoundingSphere(Cartesian3.fromDegrees(longitude, latitude), HOME_RADIUS_M),
      { offset: new HeadingPitchRange(0, HOME_PITCH, HOME_RANGE_M), duration },
    )
  }

  flyToEntity(entityId: string): void {
    const graphic = this.findGraphic(entityId)
    const entity = this.twinEntities.get(entityId)
    if (!graphic || !entity) return
    // Point entities have a zero-radius bounding sphere, so give them a range.
    const range = entity.type === 'sensor' ? 450 : 0
    void this.viewer.flyTo(graphic, {
      duration: 1.4,
      offset: new HeadingPitchRange(this.viewer.camera.heading, CesiumMath.toRadians(-35), range),
    })
  }

  flyToLocation(latitude: number, longitude: number): void {
    this.viewer.camera.flyToBoundingSphere(
      new BoundingSphere(Cartesian3.fromDegrees(longitude, latitude), 200),
      { offset: new HeadingPitchRange(this.viewer.camera.heading, HOME_PITCH, 1500), duration: 1.6 },
    )
  }

  /** Orbits the point at screen centre, changing pitch by `deltaDeg`. */
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

  /** Rotates the view so north is up, keeping the current target and pitch. */
  resetNorth(): void {
    const target = this.screenCenterTarget()
    if (target) this.orbit(target, 0, this.viewer.camera.pitch)
  }

  /** Top-down view of the current target. */
  topDown(): void {
    const target = this.screenCenterTarget()
    if (target) this.orbit(target, this.viewer.camera.heading, MIN_PITCH)
  }

  zoom(direction: 'in' | 'out'): void {
    const { camera } = this.viewer
    const target = this.screenCenterTarget()
    const distance = target
      ? Cartesian3.distance(camera.positionWC, target)
      : camera.positionCartographic.height
    const amount = distance * 0.4
    if (direction === 'in') camera.zoomIn(amount)
    else camera.zoomOut(amount)
  }

  private screenCenterTarget(): Cartesian3 | undefined {
    const { scene, camera } = this.viewer
    const center = new Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2)
    const ray = camera.getPickRay(center)
    return ray ? scene.globe.pick(ray, scene) : undefined
  }

  private orbit(target: Cartesian3, heading: number, pitch: number): void {
    const { camera } = this.viewer
    const range = Cartesian3.distance(camera.positionWC, target)
    // Compute the destination by orbiting, then restore and animate to it.
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
    camera.flyTo({ ...end, duration: 0.45 })
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load from Cesium ion.'
}
