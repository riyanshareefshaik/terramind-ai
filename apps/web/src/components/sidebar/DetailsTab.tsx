import type { ReactNode } from 'react'
import { BUILDING_KIND_LABELS, PLACE_COLORS, PLACE_LABELS } from '../../config/palette'
import type { Selection } from '../../types/workspace'
import { coordinate, fmt, humanize } from '../../utils/format'
import { Icon } from '../common/Icon'

interface DetailsTabProps {
  selection: Selection | null
  onFlyTo: () => void
  onClear: () => void
}

function address(tags: Record<string, string>): string | null {
  const line = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:suburb'] ?? tags['addr:place'],
    tags['addr:city'],
    tags['addr:postcode'],
  ]
    .filter(Boolean)
    .join(', ')
  return line || tags['addr:full'] || null
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const HEIGHT_NOTE = {
  tagged: 'recorded',
  levels: 'from floor count',
  estimated: 'estimated',
} as const

export function DetailsTab({ selection, onFlyTo, onClear }: DetailsTabProps) {
  if (!selection) {
    return (
      <div className="empty">
        <Icon name="target" size={26} />
        <p>Click any building or place on the map to see its details.</p>
        <p className="muted">Double-click to fly to it.</p>
      </div>
    )
  }

  const { tags } = selection.feature.properties
  const [lon, lat] =
    selection.kind === 'place'
      ? selection.feature.geometry.coordinates
      : selection.feature.geometry.coordinates[0][0][0]
  const addr = address(tags)
  const name = selection.feature.properties.name

  let title: string
  let subtitle: string
  if (selection.kind === 'building') {
    const props = selection.feature.properties
    title = name ?? `${humanize(props.tags.building === 'yes' ? BUILDING_KIND_LABELS[props.kind] : props.tags.building)} building`
    subtitle = BUILDING_KIND_LABELS[props.kind]
  } else {
    title = name ?? humanize(tags.amenity ?? tags.railway ?? tags.tourism ?? 'Place')
    subtitle = PLACE_LABELS[selection.feature.properties.category]
  }

  const extra: Array<[string, string]> = [
    ['Category', tags.amenity ? humanize(tags.amenity) : ''],
    ['Religion', tags.religion ? humanize(tags.religion) : ''],
    ['Operator', tags.operator ?? ''],
    ['Opening hours', tags.opening_hours ?? ''],
    ['Phone', tags.phone ?? tags['contact:phone'] ?? ''],
    ['Website', tags.website ?? tags['contact:website'] ?? ''],
    ['Built', tags.start_date ?? ''],
    ['Roof', tags['roof:shape'] ? humanize(tags['roof:shape']) : ''],
    ['Material', tags['building:material'] ? humanize(tags['building:material']) : ''],
  ].filter(([, value]) => value) as Array<[string, string]>

  return (
    <article className="details">
      <header className="details__header">
        <div>
          <span className="details__kind">
            {selection.kind === 'place' && (
              <i style={{ background: PLACE_COLORS[selection.feature.properties.category] }} aria-hidden="true" />
            )}
            {subtitle}
          </span>
          <h2>{title}</h2>
          {addr && <p className="details__address">{addr}</p>}
        </div>
        <button type="button" className="icon-button" onClick={onClear} aria-label="Clear selection" title="Clear selection">
          <Icon name="close" size={16} />
        </button>
      </header>

      <dl className="rows">
        {selection.kind === 'building' && (
          <>
            <Row label="Height">
              {fmt(selection.feature.properties.height, 1)} m{' '}
              <small className="muted">({HEIGHT_NOTE[selection.feature.properties.height_source]})</small>
            </Row>
            <Row label="Floors">{selection.feature.properties.levels ?? '—'}</Row>
            <Row label="Footprint">{fmt(selection.feature.properties.area_m2)} m²</Row>
            <Row label="Ground elevation">
              {selection.groundElevation !== null ? `${fmt(selection.groundElevation)} m` : '—'}
            </Row>
          </>
        )}
        {extra.map(([label, value]) => (
          <Row key={label} label={label}>
            {label === 'Website' ? (
              <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noreferrer">
                {value.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              value
            )}
          </Row>
        ))}
        <Row label="Location">
          {coordinate(lat, 'N', 'S')}, {coordinate(lon, 'E', 'W')}
        </Row>
      </dl>

      <button type="button" className="button" onClick={onFlyTo}>
        <Icon name="target" size={15} /> Fly to
      </button>
    </article>
  )
}
