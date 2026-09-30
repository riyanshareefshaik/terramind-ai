import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  badge?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function Panel({ title, badge, actions, children, className }: PanelProps) {
  return (
    <section className={`panel ${className ?? ''}`} aria-label={title}>
      <header className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {badge}
        {actions && <div className="panel__actions">{actions}</div>}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  )
}
