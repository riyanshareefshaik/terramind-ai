import { useCallback, useEffect, useState } from 'react'

export interface Resource<T> {
  data: T | null
  error: Error | null
  loading: boolean
  reload: () => void
}

interface Settled<T> {
  data: T | null
  error: Error | null
  /** The request number this result belongs to. */
  request: number
}

/**
 * Loads data with a fetcher, exposing loading/error state, manual reload and
 * optional polling. Stale data stays visible while a refresh is in flight.
 * The fetcher must be referentially stable (module-level or memoised).
 */
export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  refreshMs?: number,
): Resource<T> {
  const [request, setRequest] = useState(0)
  const [settled, setSettled] = useState<Settled<T>>({ data: null, error: null, request: -1 })

  const reload = useCallback(() => setRequest((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    fetcher(controller.signal).then(
      (data) => setSettled({ data, error: null, request }),
      (err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof Error ? err : new Error(String(err))
        setSettled((previous) => ({ data: previous.data, error, request }))
      },
    )
    return () => controller.abort()
  }, [fetcher, request])

  useEffect(() => {
    if (!refreshMs) return
    const timer = window.setInterval(reload, refreshMs)
    return () => window.clearInterval(timer)
  }, [refreshMs, reload])

  return { data: settled.data, error: settled.error, loading: settled.request !== request, reload }
}
