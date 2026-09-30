import type { ReactNode } from 'react'

interface StateMessageProps {
  kind: 'loading' | 'error' | 'empty'
  children: ReactNode
  onRetry?: () => void
}

export function StateMessage({ kind, children, onRetry }: StateMessageProps) {
  return (
    <div className={`state state--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'loading' && <span className="spinner" aria-hidden="true" />}
      <span>{children}</span>
      {onRetry && (
        <button type="button" className="button button--ghost" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
