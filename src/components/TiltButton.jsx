import { useTilt } from '../hooks/useTilt'

// Keeps the tilt hook wiring consistent for clickable buttons.
function TiltButton({ maxTilt = 6, scale = 1.015, className = '', children, ...rest }) {
  const tilt = useTilt({ maxTilt, scale })

  return (
    <button
      type="button"
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className={`group tilt-element relative w-full h-full cursor-pointer ${className}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
      {...rest}
    >
      <div className="tilt-glare opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      {children}
    </button>
  )
}

export default TiltButton
