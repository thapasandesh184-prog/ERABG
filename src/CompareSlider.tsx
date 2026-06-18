import { useRef, useState } from 'react'

type Props = {
  /** URL of the original image (shown on the left of the divider) */
  before: string
  /** URL of the background-removed image (shown on the right, over checkerboard) */
  after: string
}

/**
 * Draggable before/after comparison. The "after" (cut-out) image is the base
 * layer over a transparency checkerboard; the original is overlaid and clipped
 * from the left so dragging the handle wipes between the two.
 */
export function CompareSlider({ before, after }: Props) {
  const [pos, setPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const move = (clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    setPos(rect.width ? (x / rect.width) * 100 : 50)
  }

  return (
    <div
      ref={containerRef}
      className="checkerboard relative w-full touch-none select-none overflow-hidden rounded-[14px]"
      style={{ cursor: 'ew-resize' }}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e.clientX)
      }}
      onPointerMove={(e) => dragging.current && move(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
    >
      {/* Base layer: background-removed image */}
      <img src={after} alt="Background removed" draggable={false} className="block h-auto w-full" />

      {/* Overlay: original image, clipped to the left of the handle */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <img src={before} alt="Original" draggable={false} className="block h-auto w-full" />
      </div>

      {/* Divider + handle */}
      <div
        className="pointer-events-none absolute inset-y-0"
        style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.25)]" />
        <div className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black/5 bg-white/85 text-slate-700 shadow-[0_4px_14px_rgba(0,0,0,0.18)] backdrop-blur-md">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18-6-6 6-6" />
            <path d="m15 6 6 6-6 6" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white backdrop-blur-md">
        Original
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white backdrop-blur-md">
        Erased
      </span>
    </div>
  )
}
