import type { Provenance } from '../../types/provenance'

const DESCRIPTIONS: Record<Provenance, string> = {
  LIVE: 'Fetched from a live external data provider.',
  SIMULATED: 'Synthetic demo data. Not a real-world measurement.',
  ESTIMATED: 'Derived or modelled from other data.',
  HISTORICAL: 'Past records, not current conditions.',
  UNAVAILABLE: 'No data provider is connected or it failed to respond.',
}

export function ProvenanceBadge({ provenance, source }: { provenance: Provenance; source?: string }) {
  const title = source ? `${DESCRIPTIONS[provenance]} Source: ${source}` : DESCRIPTIONS[provenance]
  return (
    <span className={`provenance provenance--${provenance.toLowerCase()}`} title={title}>
      {provenance}
    </span>
  )
}
