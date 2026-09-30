import type { CameraState } from '../../types/workspace'
import { formatCoordinate, formatDistance } from '../../utils/format'

export function TelemetryBar({ camera }: { camera: CameraState | null }) {
  if (!camera) return null
  const heading = ((camera.headingDeg % 360) + 360) % 360
  return (
    <div className="telemetry" aria-label="Camera telemetry">
      <span>
        <em>Lat</em> {formatCoordinate(camera.latitude, 'N', 'S')}
      </span>
      <span>
        <em>Lon</em> {formatCoordinate(camera.longitude, 'E', 'W')}
      </span>
      <span>
        <em>Alt</em> {formatDistance(camera.height)}
      </span>
      <span>
        <em>Hdg</em> {heading.toFixed(0)}°
      </span>
      <span>
        <em>Pitch</em> {camera.pitchDeg.toFixed(0)}°
      </span>
    </div>
  )
}
