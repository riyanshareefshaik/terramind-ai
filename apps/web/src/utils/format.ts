export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function formatWithUnit(value: number | null | undefined, unit: string | null, digits = 1): string {
  const formatted = formatNumber(value, digits)
  if (formatted === '—' || !unit) return formatted
  return unit === '%' || unit === '°C' ? `${formatted}${unit}` : `${formatted} ${unit}`
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '—'
  return `${Math.round(fraction * 100)}%`
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  })
}

export function formatCoordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(5)}° ${value >= 0 ? positive : negative}`
}

export function formatDistance(metres: number): string {
  return metres >= 10_000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres).toLocaleString()} m`
}

export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
