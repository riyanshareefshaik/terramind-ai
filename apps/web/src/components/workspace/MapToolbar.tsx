import { Icon, type IconName } from '../common/Icon'

interface MapToolbarProps {
  disabled: boolean
  fullscreen: boolean
  fullscreenSupported: boolean
  onHome: () => void
  onZoom: (direction: 'in' | 'out') => void
  onTilt: (deltaDeg: number) => void
  onTopDown: () => void
  onNorth: () => void
  onToggleFullscreen: () => void
}

const TILT_STEP_DEG = 15

export function MapToolbar(props: MapToolbarProps) {
  const button = (icon: IconName, label: string, onClick: () => void) => (
    <button
      type="button"
      className="toolbar__button"
      onClick={onClick}
      disabled={props.disabled}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} />
    </button>
  )

  return (
    <div className="toolbar" role="toolbar" aria-label="Camera controls">
      <div className="toolbar__group">
        {button('home', 'Reset view to home', props.onHome)}
        {button('plus', 'Zoom in', () => props.onZoom('in'))}
        {button('minus', 'Zoom out', () => props.onZoom('out'))}
      </div>
      <div className="toolbar__group">
        {button('tiltUp', 'Tilt toward horizon', () => props.onTilt(TILT_STEP_DEG))}
        {button('tiltDown', 'Tilt toward top-down', () => props.onTilt(-TILT_STEP_DEG))}
        {button('topDown', 'Top-down view', props.onTopDown)}
        {button('compass', 'Reset heading to north', props.onNorth)}
      </div>
      {props.fullscreenSupported && (
        <div className="toolbar__group">
          {button(
            props.fullscreen ? 'collapse' : 'expand',
            props.fullscreen ? 'Exit fullscreen' : 'Fullscreen',
            props.onToggleFullscreen,
          )}
        </div>
      )}
    </div>
  )
}
