import type { ReactNode } from 'react'
import type { TwinLayer } from '../../types/twin'
import type { BaseLayerState, BuildingColorMode } from '../../types/workspace'
import { humanize } from '../../utils/format'
import { Panel } from '../common/Panel'
import { ProvenanceBadge } from '../common/ProvenanceBadge'
import { StateMessage } from '../common/StateMessage'

interface LayerManagerProps {
  baseLayers: BaseLayerState[]
  twinLayers: TwinLayer[] | null
  twinError: Error | null
  twinLoading: boolean
  onRetry: () => void
  visibility: Record<string, boolean>
  onToggle: (layerId: string, visible: boolean) => void
  colorMode: BuildingColorMode
  onColorModeChange: (mode: BuildingColorMode) => void
}

const COLOR_MODES: BuildingColorMode[] = ['risk', 'height', 'use']
const BASE_STATUS_LABEL: Record<BaseLayerState['status'], string> = {
  loading: 'Loading…',
  ready: '',
  unavailable: 'Needs token',
  error: 'Failed',
}

function LayerToggle({
  id,
  label,
  checked,
  disabled,
  onToggle,
  children,
}: {
  id: string
  label: string
  checked: boolean
  disabled?: boolean
  onToggle: (id: string, visible: boolean) => void
  children?: ReactNode
}) {
  return (
    <label className={`layer ${disabled ? 'layer--disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(event) => onToggle(id, event.target.checked)}
      />
      <span className="layer__switch" aria-hidden="true" />
      <span className="layer__label">{label}</span>
      {children}
    </label>
  )
}

export function LayerManager(props: LayerManagerProps) {
  const { visibility, onToggle } = props
  const grouped = new Map<string, TwinLayer[]>()
  for (const layer of props.twinLayers ?? []) {
    grouped.set(layer.category, [...(grouped.get(layer.category) ?? []), layer])
  }

  return (
    <Panel title="Layers" className="layers">
      <div className="layers__group">
        <h3>Base map</h3>
        {props.baseLayers.map((layer) => (
          <div key={layer.id} title={layer.message ?? layer.source}>
            <LayerToggle
              id={layer.id}
              label={layer.name}
              checked={visibility[layer.id] ?? true}
              disabled={layer.status !== 'ready'}
              onToggle={onToggle}
            >
              {layer.status !== 'ready' && (
                <span className={`layer__status layer__status--${layer.status}`}>
                  {BASE_STATUS_LABEL[layer.status]}
                </span>
              )}
            </LayerToggle>
            {layer.message && layer.status !== 'ready' && <p className="layer__hint">{layer.message}</p>}
          </div>
        ))}
      </div>

      {props.twinLoading && !props.twinLayers && <StateMessage kind="loading">Loading twin layers…</StateMessage>}
      {props.twinError && (
        <StateMessage kind="error" onRetry={props.onRetry}>
          {props.twinError.message}
        </StateMessage>
      )}

      {[...grouped.entries()].map(([category, layers]) => (
        <div className="layers__group" key={category}>
          <h3>{humanize(category)}</h3>
          {layers.map((layer) => (
            <div key={layer.id} title={layer.description}>
              <LayerToggle
                id={layer.id}
                label={layer.name}
                checked={visibility[layer.id] ?? layer.default_visible}
                disabled={!layer.available}
                onToggle={onToggle}
              >
                {layer.available && <span className="layer__count">{layer.entity_count}</span>}
                <ProvenanceBadge provenance={layer.provenance} />
              </LayerToggle>
              {layer.id === 'demo-buildings' && (visibility[layer.id] ?? true) && (
                <div className="segmented" role="radiogroup" aria-label="Colour buildings by">
                  {COLOR_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={props.colorMode === mode}
                      className={props.colorMode === mode ? 'is-active' : ''}
                      onClick={() => props.onColorModeChange(mode)}
                    >
                      {humanize(mode)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </Panel>
  )
}
