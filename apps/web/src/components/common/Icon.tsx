const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  tiltUp: 'M4 18h16M7 14l5-8 5 8',
  tiltDown: 'M4 6h16M7 10l5 8 5-8',
  topDown: 'M12 3v18M3 12h18M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  compass: 'M12 3l3 9-3 9-3-9z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 20l-4-4',
  close: 'M6 6l12 12M18 6 6 18',
  target: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 2v4M12 18v4M2 12h4M18 12h4',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  layers: 'M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 17.5l10 5 10-5',
  rotateLeft: 'M4 5v5h5M4.6 14a8 8 0 1 0 1.8-8.3L4 10',
  rotateRight: 'M20 5v5h-5M19.4 14a8 8 0 1 1-1.8-8.3L20 10',
  alert: 'M12 4 2.5 20h19L12 4ZM12 10v4M12 17h.01',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21ZM12 9.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
