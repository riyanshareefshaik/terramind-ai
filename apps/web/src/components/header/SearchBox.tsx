import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { TwinEntity } from '../../types/twin'
import { humanize } from '../../utils/format'
import { Icon } from '../common/Icon'

interface SearchBoxProps {
  entities: TwinEntity[]
  onSelectEntity: (entityId: string) => void
  onFlyToLocation: (latitude: number, longitude: number) => void
}

type Result =
  | { kind: 'entity'; key: string; entity: TwinEntity }
  | { kind: 'coordinates'; key: string; latitude: number; longitude: number }

const MAX_RESULTS = 8
const COORDINATES = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const match = COORDINATES.exec(text)
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { latitude, longitude }
}

export function SearchBox({ entities, onSelectEntity, onFlyToLocation }: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()

  const results = useMemo<Result[]>(() => {
    const text = query.trim().toLowerCase()
    if (!text) return []
    const coords = parseCoordinates(text)
    const found: Result[] = coords ? [{ kind: 'coordinates', key: 'coords', ...coords }] : []
    for (const entity of entities) {
      if (found.length >= MAX_RESULTS) break
      if (
        entity.name.toLowerCase().includes(text) ||
        entity.id.toLowerCase().includes(text) ||
        entity.type.replace('_', ' ').includes(text)
      ) {
        found.push({ kind: 'entity', key: entity.id, entity })
      }
    }
    return found
  }, [entities, query])

  const choose = (result: Result) => {
    if (result.kind === 'entity') {
      onSelectEntity(result.entity.id)
      setQuery(result.entity.name)
    } else {
      onFlyToLocation(result.latitude, result.longitude)
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

  const showList = open && query.trim().length > 0

  return (
    <div className="search">
      <Icon name="search" size={16} />
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        aria-label="Search entities or enter coordinates"
        placeholder="Search buildings, sensors, roads… or “17.38, 78.48”"
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
          {results.length === 0 && <li className="search__empty">No matching entities</li>}
          {results.map((result, index) => (
            <li
              key={result.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'is-active' : ''}
              // mousedown fires before the input's blur closes the list
              onMouseDown={(event) => {
                event.preventDefault()
                choose(result)
              }}
              onMouseEnter={() => setActive(index)}
            >
              {result.kind === 'entity' ? (
                <>
                  <span>{result.entity.name}</span>
                  <small>
                    {humanize(result.entity.type)} · {result.entity.id}
                  </small>
                </>
              ) : (
                <>
                  <span>Fly to coordinates</span>
                  <small>
                    {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}
                  </small>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
