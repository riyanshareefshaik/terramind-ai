import { useState } from 'react'
import { HEIGHT_RAMP_MAX_M, palette } from '../../config/palette'
import type { BuildingColorMode } from '../../types/workspace'
import { humanize } from '../../utils/format'

interface MapLegendProps {
  colorMode: BuildingColorMode
  visibility: Record<string, boolean>
}

function Swatches({ entries }: { entries: Record<string, string> }) {
  return (
    <ul className="legend__swatches">
      {Object.entries(entries).map(([label, color]) => (
        <li key={label}>
          <i style={{ background: color }} />
          {humanize(label)}
        </li>
      ))}
    </ul>
  )
}

export function MapLegend({ colorMode, visibility }: MapLegendProps) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches)
  const show = (id: string) => visibility[id] ?? false

  return (
    <div className={`legend ${open ? '' : 'legend--closed'}`}>
      <button type="button" className="legend__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Legend
      </button>
      {open && (
        <div className="legend__body">
          {show('demo-buildings') && (
            <div>
              <h3>Buildings · {colorMode}</h3>
              {colorMode === 'risk' && <Swatches entries={palette.risk} />}
              {colorMode === 'use' && <Swatches entries={palette.use} />}
              {colorMode === 'height' && (
                <div className="legend__ramp">
                  <i style={{ background: `linear-gradient(90deg, ${palette.heightRamp[0]}, ${palette.heightRamp[1]})` }} />
                  <span>0 m</span>
                  <span>{HEIGHT_RAMP_MAX_M}+ m</span>
                </div>
              )}
            </div>
          )}
          {show('demo-roads') && (
            <div>
              <h3>Road congestion</h3>
              <div className="legend__ramp">
                <i style={{ background: `linear-gradient(90deg, ${palette.congestion.join(', ')})` }} />
                <span>Free</span>
                <span>Jammed</span>
              </div>
            </div>
          )}
          {show('demo-sensors') && (
            <div>
              <h3>Sensors</h3>
              <Swatches entries={palette.sensorStatus} />
            </div>
          )}
          {(show('flood-risk') || show('heat-risk')) && (
            <div>
              <h3>Hazard zones</h3>
              <Swatches entries={palette.hazard} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
