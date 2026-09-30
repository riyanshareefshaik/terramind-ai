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
  request: number
  fetcher: unknown
}

/**
 * Loads data with a fetcher, exposing loading/error state, reload and polling.
 * The previous result stays visible while a new fetcher (e.g. a new location)
 * loads. The fetcher must be memoised: a new identity triggers a new fetch.
 */
export function useResource<T>(
  fetcher: ((signal: AbortSignal) => Promise<T>) | null,
  refreshMs?: number,
): Resource<T> {
  const [request, setRequest] = useState(0)
  const [settled, setSettled] = useState<Settled<T>>({ data: null, error: null, request: -1, fetcher: null })
  const reload = useCallback(() => setRequest((n) => n + 1), [])

  useEffect(() => {
    if (!fetcher) return
    const controller = new AbortController()
    fetcher(controller.signal).then(
      (data) => setSettled({ data, error: null, request, fetcher }),
      (err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof Error ? err : new Error(String(err))
        setSettled((previous) => ({ data: previous.data, error, request, fetcher }))
      },
    )
    return () => controller.abort()
  }, [fetcher, request])

  useEffect(() => {
    if (!refreshMs || !fetcher) return
    const timer = window.setInterval(reload, refreshMs)
    return () => window.clearInterval(timer)
  }, [refreshMs, reload, fetcher])

  return {
    data: settled.data,
    error: settled.error,
    loading: fetcher !== null && (settled.request !== request || settled.fetcher !== fetcher),
    reload,
  }
}
