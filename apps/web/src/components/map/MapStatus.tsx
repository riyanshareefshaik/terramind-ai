import type { CameraState, TileStats } from '../../types/workspace'
import { coordinate, distance, fmt } from '../../utils/format'

export function MapStatus({ stats, camera, buildingsOn }: { stats: TileStats | null; camera: CameraState | null; buildingsOn: boolean }) {
  let message: string | null = null
  if (buildingsOn && stats) {
    if (stats.tooFar) message = 'Zoom in to see 3D buildings'
    else if (stats.loading > 0) message = `Loading buildings… ${fmt(stats.buildings)} shown`
    else if (stats.failed > 0) message = 'Some areas couldn’t load. Retrying shortly.'
    else if (stats.tiles > 0 && stats.buildings === 0) message = 'No buildings mapped in this area yet'
  }

  return (
    <div className="map-status">
      {message && (
        <span className="map-status__message" role="status">
          {stats?.loading ? <span className="spinner spinner--small" aria-hidden="true" /> : null}
          {message}
        </span>
      )}
      {camera && (
        <span className="map-status__coords" aria-label="Camera position">
          {coordinate(camera.latitude, 'N', 'S')} · {coordinate(camera.longitude, 'E', 'W')} · {distance(camera.height)}
        </span>
      )}
    </div>
  )
}
