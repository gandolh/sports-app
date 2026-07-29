import { useCallback, useState } from 'react'
import type { ButtonHTMLAttributes, PointerEvent as ReactPointerEvent } from 'react'

/**
 * A button whose press state is driven by `pointerdown`, exposed as
 * `data-pressed` for CSS.
 *
 * `:active` would be the obvious way to do this and it is not enough. On iOS
 * Safari `:active` does not apply to a plain `<button>` unless the document
 * carries a touch listener, so the press feedback silently disappears on the one
 * platform where the app runs as an installed PWA. A `data-` attribute set on
 * `pointerdown` works everywhere and is inspectable in a test.
 *
 * The design system's reason for pointerdown over click: at 96px, on a phone on
 * the floor, the gap between the finger landing and the click event is long
 * enough to feel like the app missed the tap.
 *
 * `pointercancel` and `pointerleave` both clear it, so a tap that turns into a
 * scroll does not leave the key looking held down.
 */
export function PressButton({
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const [pressed, setPressed] = useState(false)

  const press = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      setPressed(true)
      onPointerDown?.(event)
    },
    [onPointerDown],
  )
  const release = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      forward: ((event: ReactPointerEvent<HTMLButtonElement>) => void) | undefined,
    ) => {
      setPressed(false)
      forward?.(event)
    },
    [],
  )

  return (
    <button
      type={type}
      {...(pressed ? { 'data-pressed': '' } : {})}
      onPointerDown={press}
      onPointerUp={(event) => release(event, onPointerUp)}
      onPointerCancel={(event) => release(event, onPointerCancel)}
      onPointerLeave={(event) => release(event, onPointerLeave)}
      {...rest}
    />
  )
}
