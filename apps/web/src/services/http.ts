import { config } from '../config/env'

export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function detailOf(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
      return body.detail
    }
  } catch {
    // Non-JSON error body; fall through to the status text.
  }
  return null
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('TerraMind API is unreachable. Is the backend running on port 8000?', null)
  }
  if (!response.ok) {
    // The Vite dev proxy answers 502/504 with an empty body when the API is down.
    const detail = await detailOf(response)
    throw new ApiError(
      detail ??
        (response.status >= 502
          ? 'TerraMind API is unreachable. Is the backend running on port 8000?'
          : `Request failed (${response.status} ${response.statusText})`),
      response.status,
    )
  }
  return (await response.json()) as T
}
