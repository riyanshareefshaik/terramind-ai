import type { CSSProperties, ReactNode } from 'react'
import { palette } from '../../config/palette'
import type { BuildingEntity, RiskLevel, RiskZoneEntity, RoadEntity, SensorEntity, TwinEntity } from '../../types/twin'
import { formatCoordinate, formatNumber, formatPercent, formatTime, formatWithUnit, humanize } from '../../utils/format'
import { Icon } from '../common/Icon'
import { ProvenanceBadge } from '../common/ProvenanceBadge'

interface EntityInspectorProps {
  entity: TwinEntity | null
  layerName: string | null
  onFlyTo: (entityId: string) => void
  onClear: () => void
}

const TYPE_LABEL: Record<TwinEntity['type'], string> = {
  building: 'Building',
  road: 'Road segment',
  sensor: 'Sensor',
  risk_zone: 'Hazard zone',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inspector__section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Fields({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="fields">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function RiskChip({ level }: { level: RiskLevel }) {
  return (
    <span className="risk-chip" style={{ '--chip': palette.risk[level] } as CSSProperties}>
      {level}
    </span>
  )
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="meter">
      <span>{label}</span>
      <span className="meter__track">
        <span className="meter__fill" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
      </span>
      <span className="meter__value">{value.toFixed(2)}</span>
    </div>
  )
}

function riskColor(value: number): string {
  if (value >= 0.75) return palette.risk.critical
  if (value >= 0.5) return palette.risk.high
  if (value >= 0.25) return palette.risk.moderate
  return palette.risk.low
}

function BuildingDetails({ building }: { building: BuildingEntity }) {
  return (
    <>
      <Section title="Structure">
        <Fields
          rows={[
            ['Use', humanize(building.use)],
            ['Height', `${formatNumber(building.height_m)} m`],
            ['Floors', building.floors],
            ['Year built', building.year_built ?? '—'],
          ]}
        />
      </Section>
      <Section title="Condition & energy">
        <Fields
          rows={[
            ['Indoor temperature', formatWithUnit(building.temperature_c, '°C')],
            ['Current load', formatWithUnit(building.energy?.current_kw, 'kW')],
            ['Daily consumption', formatWithUnit(building.energy?.daily_kwh, 'kWh', 0)],
          ]}
        />
      </Section>
      {building.risk && (
        <Section title="Risk">
          <div className="inspector__risk-overall">
            Overall <RiskChip level={building.risk.overall} />
          </div>
          <Meter label="Flood" value={building.risk.flood} color={riskColor(building.risk.flood)} />
          <Meter label="Heat" value={building.risk.heat} color={riskColor(building.risk.heat)} />
          <Meter label="Fire" value={building.risk.fire} color={riskColor(building.risk.fire)} />
        </Section>
      )}
    </>
  )
}

function RoadDetails({ road }: { road: RoadEntity }) {
  return (
    <Section title="Road">
      <Fields
        rows={[
          ['Class', humanize(road.road_class)],
          ['Lanes', road.lanes],
          ['Speed limit', `${road.speed_limit_kmh} km/h`],
          ['Congestion', formatPercent(road.congestion)],
          ['Vertices', road.path.length],
        ]}
      />
    </Section>
  )
}

function SensorDetails({ sensor }: { sensor: SensorEntity }) {
  return (
    <>
      <Section title="Device">
        <Fields
          rows={[
            ['Kind', humanize(sensor.sensor_kind)],
            [
              'Status',
              <span key="status" className="status-dot" style={{ '--dot': palette.sensorStatus[sensor.status] } as CSSProperties}>
                {humanize(sensor.status)}
              </span>,
            ],
          ]}
        />
      </Section>
      <Section title="Readings">
        {sensor.readings.length === 0 ? (
          <p className="muted">No readings — the sensor is not reporting.</p>
        ) : (
          <table className="readings">
            <tbody>
              {sensor.readings.map((reading) => (
                <tr key={reading.metric}>
                  <th scope="row">{reading.label}</th>
                  <td>{formatWithUnit(reading.value, reading.unit)}</td>
                  <td className="muted">{formatTime(reading.observed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  )
}

function ZoneDetails({ zone }: { zone: RiskZoneEntity }) {
  return (
    <Section title="Hazard">
      <Fields
        rows={[
          ['Hazard', humanize(zone.hazard)],
          ['Severity', <RiskChip key="severity" level={zone.severity} />],
          ['Score', zone.score.toFixed(2)],
          ['Boundary vertices', zone.polygon.length],
        ]}
      />
    </Section>
  )
}

export function EntityInspector({ entity, layerName, onFlyTo, onClear }: EntityInspectorProps) {
  if (!entity) {
    return (
      <div className="inspector inspector--empty">
        <Icon name="target" size={28} />
        <p>Select a building, road, sensor or hazard zone in the 3D view, or search for one above.</p>
        <p className="muted">Double-click an object to fly to it.</p>
      </div>
    )
  }

  return (
    <div className="inspector">
      <header className="inspector__header">
        <div>
          <span className="inspector__type">{TYPE_LABEL[entity.type]}</span>
          <h2>{entity.name}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClear} aria-label="Clear selection" title="Clear selection">
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="inspector__meta">
        <ProvenanceBadge provenance={entity.data_source.provenance} source={entity.data_source.source} />
        <span className="muted">{entity.data_source.source}</span>
      </div>

      <Section title="Identity & location">
        <Fields
          rows={[
            ['ID', <code key="id">{entity.id}</code>],
            ['Layer', layerName ?? entity.layer_id],
            ['Latitude', formatCoordinate(entity.location.latitude, 'N', 'S')],
            ['Longitude', formatCoordinate(entity.location.longitude, 'E', 'W')],
          ]}
        />
      </Section>

      {entity.type === 'building' && <BuildingDetails building={entity} />}
      {entity.type === 'road' && <RoadDetails road={entity} />}
      {entity.type === 'sensor' && <SensorDetails sensor={entity} />}
      {entity.type === 'risk_zone' && <ZoneDetails zone={entity} />}

      <Section title="History">
        <p className="muted inspector__history">
          <ProvenanceBadge provenance="UNAVAILABLE" /> No time-series store is connected yet.
        </p>
      </Section>

      <div className="inspector__actions">
        <button type="button" className="button" onClick={() => onFlyTo(entity.id)}>
          <Icon name="target" size={15} /> Fly to
        </button>
      </div>
    </div>
  )
}
