import { useCallback, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useDebounced } from '../hooks/useDebounced'
import { useResource } from '../hooks/useResource'
import { api } from '../services/api'
import type { Place } from '../types/api'
import { Icon } from './common/Icon'

interface SearchBoxProps {
  onPlace: (place: Place) => void
  onCoordinates: (latitude: number, longitude: number) => void
}

type Result =
  | { kind: 'place'; key: string; place: Place }
  | { kind: 'coordinates'; key: string; latitude: number; longitude: number }

const COORDINATES = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const match = COORDINATES.exec(text)
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null
}

export function SearchBox({ onPlace, onCoordinates }: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const debounced = useDebounced(query.trim(), 350)
  const coords = parseCoordinates(debounced)

  const fetcher = useCallback(
    (signal: AbortSignal) => api.searchPlaces(debounced, signal),
    [debounced],
  )
  const search = useResource(debounced.length >= 3 && !coords ? fetcher : null)

  const results = useMemo<Result[]>(() => {
    if (coords) return [{ kind: 'coordinates', key: 'coords', ...coords }]
    if (debounced.length < 3 || !search.data) return []
    return search.data.map((place) => ({ kind: 'place', key: place.id, place }))
  }, [coords, debounced, search.data])

  const choose = (result: Result) => {
    if (result.kind === 'place') {
      onPlace(result.place)
      setQuery(result.place.name)
    } else {
      onCoordinates(result.latitude, result.longitude)
    }
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault()
      choose(results[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const typing = query.trim() !== debounced || search.loading
  const showList = open && query.trim().length >= 3

  return (
    <div className="search">
      <Icon name="search" size={16} />
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        aria-label="Search any place in India"
        placeholder="Search any city, area, street or landmark in India"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="search__results" id={listId} role="listbox">
          {results.length === 0 && (
            <li className="search__empty">
              {typing ? 'Searching…' : search.error ? search.error.message : 'No places found'}
            </li>
          )}
          {results.map((result, index) => (
            <li
              key={result.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'is-active' : ''}
              onMouseDown={(event) => {
                event.preventDefault() // fires before the input's blur closes the list
                choose(result)
              }}
              onMouseEnter={() => setActive(index)}
            >
              <Icon name="pin" size={15} />
              {result.kind === 'place' ? (
                <span>
                  <strong>{result.place.name}</strong>
                  <small>{[result.place.context, result.place.kind].filter(Boolean).join(' · ')}</small>
                </span>
              ) : (
                <span>
                  <strong>Go to coordinates</strong>
                  <small>
                    {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}
                  </small>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
