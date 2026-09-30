export function fmt(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function time(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone ?? undefined,
  })
}

export function hour(iso: string, timeZone?: string | null): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', timeZone: timeZone ?? undefined })
}

export function coordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(5)}° ${value >= 0 ? positive : negative}`
}

export function distance(metres: number): string {
  return metres >= 10_000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres).toLocaleString('en-IN')} m`
}

export function humanize(value: string): string {
  const text = value.replace(/[_:-]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export function compass(deg: number | null): string {
  return deg === null ? '' : COMPASS[Math.round(deg / 45) % 8]
}
