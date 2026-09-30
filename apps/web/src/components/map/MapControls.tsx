import { Icon, type IconName } from '../common/Icon'

interface MapControlsProps {
  disabled: boolean
  fullscreen: boolean
  fullscreenSupported: boolean
  onHome: () => void
  onZoom: (direction: 'in' | 'out') => void
  onTilt: (deltaDeg: number) => void
  onRotate: (deltaDeg: number) => void
  onNorth: () => void
  onToggleFullscreen: () => void
}

export function MapControls(props: MapControlsProps) {
  const button = (icon: IconName, label: string, onClick: () => void) => (
    <button
      type="button"
      className="map-controls__button"
      onClick={onClick}
      disabled={props.disabled}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} size={17} />
    </button>
  )

  return (
    <div className="map-controls" role="toolbar" aria-label="Map controls">
      <div className="map-controls__group">
        {button('plus', 'Zoom in', () => props.onZoom('in'))}
        {button('minus', 'Zoom out', () => props.onZoom('out'))}
      </div>
      <div className="map-controls__group">
        {button('tiltUp', 'Tilt towards horizon', () => props.onTilt(15))}
        {button('tiltDown', 'Tilt towards top-down', () => props.onTilt(-15))}
        {button('rotateLeft', 'Rotate left', () => props.onRotate(-30))}
        {button('rotateRight', 'Rotate right', () => props.onRotate(30))}
        {button('compass', 'Face north', props.onNorth)}
      </div>
      <div className="map-controls__group">
        {button('home', 'Back to home view', props.onHome)}
        {props.fullscreenSupported &&
          button(
            props.fullscreen ? 'collapse' : 'expand',
            props.fullscreen ? 'Exit full screen' : 'Full screen',
            props.onToggleFullscreen,
          )}
      </div>
    </div>
  )
}
