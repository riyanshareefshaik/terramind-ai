import {
  Cartographic,
  CustomHeightmapTerrainProvider,
  EllipsoidTerrainProvider,
  GeographicTilingScheme,
  Math as CesiumMath,
  createWorldTerrainAsync,
  sampleTerrainMostDetailed,
  type TerrainProvider,
} from 'cesium'

/** A terrain surface plus a way to read ground heights for placing buildings on it. */
export interface Elevation {
  provider: TerrainProvider
  sample: (points: Array<[number, number]>) => Promise<number[]>
}

export function flatElevation(): Elevation {
  return {
    provider: new EllipsoidTerrainProvider(),
    sample: async (points) => points.map(() => 0),
  }
}

// -- Terrarium: free global elevation tiles (Mapzen / AWS Open Data) -----------

const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const TERRARIUM_MAX_ZOOM = 14
const TILE_PX = 256
const GRID = 33
const MAX_CACHED_TILES = 400

type Heights = Float32Array | null

class TerrariumSource {
  private readonly tiles = new Map<string, Promise<Heights>>()

  private load(z: number, x: number, y: number): Promise<Heights> {
    const key = `${z}/${x}/${y}`
    let tile = this.tiles.get(key)
    if (tile) {
      // Refresh LRU position.
      this.tiles.delete(key)
      this.tiles.set(key, tile)
      return tile
    }
    // A failed tile falls back to sea level for now and is retried on a later request,
    // so a network blip never leaves holes in the globe.
    tile = this.decode(z, x, y).catch((error: unknown) => {
      console.warn('Elevation tile unavailable', key, error)
      this.tiles.delete(key)
      return null
    })
    this.tiles.set(key, tile)
    if (this.tiles.size > MAX_CACHED_TILES) {
      this.tiles.delete(this.tiles.keys().next().value as string)
    }
    return tile
  }

  private async decode(z: number, x: number, y: number): Promise<Heights> {
    const url = TERRARIUM_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
    const response = await fetch(url)
    if (response.status === 404) return null // no data (open ocean)
    if (!response.ok) throw new Error(`Elevation tile ${z}/${x}/${y}: HTTP ${response.status}`)
    const bitmap = await createImageBitmap(await response.blob())
    const canvas = new OffscreenCanvas(TILE_PX, TILE_PX)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('2D canvas unavailable')
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const rgba = context.getImageData(0, 0, TILE_PX, TILE_PX).data
    const heights = new Float32Array(TILE_PX * TILE_PX)
    for (let i = 0; i < heights.length; i++) {
      const h = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768
      heights[i] = Math.max(0, h) // sea level floor: imagery covers water, bathymetry is not wanted
    }
    return heights
  }

  /** Samples heights (m) at [lon, lat] points using tiles at zoom `z`. */
  async sample(points: Array<[number, number]>, z: number): Promise<number[]> {
    const n = 2 ** z
    const coords = points.map(([lon, lat]) => {
      const clampedLat = CesiumMath.clamp(lat, -85.05, 85.05)
      const phi = CesiumMath.toRadians(clampedLat)
      const fx = ((lon + 180) / 360) * n
      const fy = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n
      const tx = CesiumMath.clamp(Math.floor(fx), 0, n - 1)
      const ty = CesiumMath.clamp(Math.floor(fy), 0, n - 1)
      return { tx, ty, px: (fx - tx) * TILE_PX - 0.5, py: (fy - ty) * TILE_PX - 0.5 }
    })

    const needed = new Map<string, Promise<Heights>>()
    for (const { tx, ty } of coords) {
      const key = `${tx}/${ty}`
      if (!needed.has(key)) needed.set(key, this.load(z, tx, ty))
    }
    const resolved = new Map<string, Heights>()
    await Promise.all([...needed].map(async ([key, tile]) => resolved.set(key, await tile)))

    return coords.map(({ tx, ty, px, py }) => {
      const heights = resolved.get(`${tx}/${ty}`)
      if (!heights) return 0
      const x0 = CesiumMath.clamp(Math.floor(px), 0, TILE_PX - 1)
      const y0 = CesiumMath.clamp(Math.floor(py), 0, TILE_PX - 1)
      const x1 = Math.min(x0 + 1, TILE_PX - 1)
      const y1 = Math.min(y0 + 1, TILE_PX - 1)
      const dx = CesiumMath.clamp(px - x0, 0, 1)
      const dy = CesiumMath.clamp(py - y0, 0, 1)
      const top = heights[y0 * TILE_PX + x0] * (1 - dx) + heights[y0 * TILE_PX + x1] * dx
      const bottom = heights[y1 * TILE_PX + x0] * (1 - dx) + heights[y1 * TILE_PX + x1] * dx
      return top * (1 - dy) + bottom * dy
    })
  }
}

/** Real terrain with no account or token, decoded from free Terrarium tiles. */
export function terrariumElevation(): Elevation {
  const source = new TerrariumSource()
  const tilingScheme = new GeographicTilingScheme()
  const provider = new CustomHeightmapTerrainProvider({
    width: GRID,
    height: GRID,
    tilingScheme,
    credit: 'Elevation: Mapzen Terrain Tiles (SRTM, GMTED, ETOPO1)',
    callback: (x, y, level) => {
      const rect = tilingScheme.tileXYToRectangle(x, y, level)
      const west = CesiumMath.toDegrees(rect.west)
      const east = CesiumMath.toDegrees(rect.east)
      const north = CesiumMath.toDegrees(rect.north)
      const south = CesiumMath.toDegrees(rect.south)
      const points: Array<[number, number]> = []
      // Heightmap rows run north → south, columns west → east.
      for (let row = 0; row < GRID; row++) {
        const lat = north + ((south - north) * row) / (GRID - 1)
        for (let col = 0; col < GRID; col++) points.push([west + ((east - west) * col) / (GRID - 1), lat])
      }
      return source.sample(points, Math.min(level + 1, TERRARIUM_MAX_ZOOM)).then((h) => new Float32Array(h))
    },
  })
  return { provider, sample: (points) => source.sample(points, TERRARIUM_MAX_ZOOM) }
}

/** Cesium World Terrain — used instead of Terrarium when an ion token is configured. */
export async function worldElevation(): Promise<Elevation> {
  const provider = await createWorldTerrainAsync()
  return {
    provider,
    sample: async (points) => {
      const cartographics = points.map(([lon, lat]) => Cartographic.fromDegrees(lon, lat))
      const sampled = await sampleTerrainMostDetailed(provider, cartographics)
      return sampled.map((c) => c.height ?? 0)
    },
  }
}
