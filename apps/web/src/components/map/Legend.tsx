import { BUILDING_KIND_COLORS, BUILDING_KIND_LABELS, HEIGHT_RAMP, HEIGHT_RAMP_MAX_M } from '../../config/palette'
import type { BuildingKind } from '../../types/api'
import type { BuildingColorMode } from '../../types/workspace'

export function Legend({ mode }: { mode: BuildingColorMode }) {
  if (mode === 'natural') return null
  return (
    <div className="legend" aria-label="Building colour legend">
      <span className="legend__title">{mode === 'height' ? 'Building height' : 'Building use'}</span>
      {mode === 'height' ? (
        <div className="legend__ramp">
          <i style={{ background: `linear-gradient(90deg, ${HEIGHT_RAMP.join(', ')})` }} />
          <span>0 m</span>
          <span>{HEIGHT_RAMP_MAX_M}+ m</span>
        </div>
      ) : (
        <ul className="legend__list">
          {(Object.keys(BUILDING_KIND_COLORS) as BuildingKind[]).map((kind) => (
            <li key={kind}>
              <i style={{ background: BUILDING_KIND_COLORS[kind] }} />
              {BUILDING_KIND_LABELS[kind]}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
