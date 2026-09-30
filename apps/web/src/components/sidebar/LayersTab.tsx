import { PLACE_COLORS, PLACE_LABELS } from '../../config/palette'
import type { PlaceCategory } from '../../types/api'
import type { BasemapId, BuildingColorMode, LayerSettings } from '../../types/workspace'

interface LayersTabProps {
  layers: LayerSettings
  onChange: (patch: Partial<LayerSettings>) => void
}

const BASEMAPS: Array<{ id: BasemapId; label: string }> = [
  { id: 'satellite', label: 'Satellite' },
  { id: 'streets', label: 'Streets' },
  { id: 'dark', label: 'Dark' },
]

const COLOR_MODES: Array<{ id: BuildingColorMode; label: string }> = [
  { id: 'natural', label: 'Natural' },
  { id: 'height', label: 'Height' },
  { id: 'use', label: 'Use' },
]

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="toggle">
      <span className="toggle__text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle__switch" aria-hidden="true" />
    </label>
  )
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ id: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={value === option.id ? 'is-active' : ''}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function LayersTab({ layers, onChange }: LayersTabProps) {
  return (
    <div className="layers-tab">
      <section className="section">
        <h3 className="section__title">Base map</h3>
        <Segmented label="Base map" options={BASEMAPS} value={layers.basemap} onChange={(basemap) => onChange({ basemap })} />
      </section>

      <section className="section">
        <h3 className="section__title">3D</h3>
        <Toggle
          label="Terrain"
          hint="Real ground elevation"
          checked={layers.terrain}
          onChange={(terrain) => onChange({ terrain })}
        />
        <Toggle
          label="Buildings"
          hint="Loads as you move around"
          checked={layers.buildings}
          onChange={(buildings) => onChange({ buildings })}
        />
        {layers.buildings && (
          <div className="indent">
            <span className="field-label">Colour by</span>
            <Segmented
              label="Colour buildings by"
              options={COLOR_MODES}
              value={layers.colorMode}
              onChange={(colorMode) => onChange({ colorMode })}
            />
          </div>
        )}
      </section>

      <section className="section">
        <h3 className="section__title">Places</h3>
        <Toggle
          label="Key places"
          hint="Hospitals, schools, police, transport and more"
          checked={layers.places}
          onChange={(places) => onChange({ places })}
        />
        {layers.places && (
          <ul className="swatch-list">
            {(Object.keys(PLACE_COLORS) as PlaceCategory[]).map((category) => (
              <li key={category}>
                <i style={{ background: PLACE_COLORS[category] }} />
                {PLACE_LABELS[category]}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="caption">
        Buildings come from community mapping, so coverage varies by area. Where a height isn’t recorded,
        it’s estimated from the building type.
      </p>
    </div>
  )
}
