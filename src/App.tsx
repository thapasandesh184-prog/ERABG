import { useCallback, useEffect, useRef, useState } from 'react'
import { removeBackground } from '@imgly/background-removal'
import { CompareSlider } from './CompareSlider'

type Status = 'idle' | 'processing' | 'done' | 'error'
type Scale = 2 | 4

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']
const MAX_EDGE = 3840 // 4K UHD long-edge cap

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function projectedSize(w: number, h: number, scale: Scale) {
  const long = Math.max(w, h)
  const target = Math.min(long * scale, MAX_EDGE)
  const ratio = long ? target / long : 1
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) }
}

const DANGER = '#ff453a'
const DANGER_SOFT = 'rgba(255,69,58,0.13)'

/* ----------------------------------------------------------------------------
   Brand mark — gradient squircle with an "AI sparkle"
---------------------------------------------------------------------------- */
function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="erabg-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0A84FF" />
          <stop offset="0.55" stopColor="#5E5CE6" />
          <stop offset="1" stopColor="#BF5AF2" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8.5" fill="url(#erabg-g)" />
      <path
        d="M16 6 L18.3 12.9 L25.2 15.2 L18.3 17.5 L16 24.4 L13.7 17.5 L6.8 15.2 L13.7 12.9 Z"
        fill="#fff"
      />
      <path
        d="M24.6 6 L25.4 8.1 L27.5 8.9 L25.4 9.7 L24.6 11.8 L23.8 9.7 L21.7 8.9 L23.8 8.1 Z"
        fill="#fff"
        opacity="0.92"
      />
    </svg>
  )
}

function Sparkles({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2.5 L13.7 8.3 L19.5 10 L13.7 11.7 L12 17.5 L10.3 11.7 L4.5 10 L10.3 8.3 Z" />
      <path d="M19 14 L19.8 16.4 L22.2 17.2 L19.8 18 L19 20.4 L18.2 18 L15.8 17.2 L18.2 16.4 Z" opacity="0.85" />
    </svg>
  )
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('image')
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [resultSize, setResultSize] = useState(0)

  // Upscaling
  const [scale, setScale] = useState<Scale>(4)
  const [upscaling, setUpscaling] = useState(false)
  const [upProgress, setUpProgress] = useState(0)
  const [upStage, setUpStage] = useState('')
  const [upscaledUrl, setUpscaledUrl] = useState<string | null>(null)
  const [upscaledDims, setUpscaledDims] = useState<{ w: number; h: number } | null>(null)
  const [upscaledSize, setUpscaledSize] = useState(0)
  const [upError, setUpError] = useState('')

  const [isDesktop, setIsDesktop] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const urlsRef = useRef<string[]>([])

  useEffect(() => {
    const w = window as unknown as { desktop?: { isElectron?: boolean } }
    setIsDesktop(Boolean(w.desktop?.isElectron))
  }, [])

  const track = (url: string) => {
    urlsRef.current.push(url)
    return url
  }
  const revokeAll = () => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
  }

  useEffect(() => () => revokeAll(), [])

  const clearUpscale = () => {
    setUpscaling(false)
    setUpProgress(0)
    setUpStage('')
    setUpscaledUrl(null)
    setUpscaledDims(null)
    setUpscaledSize(0)
    setUpError('')
  }

  const reset = () => {
    revokeAll()
    setStatus('idle')
    setOriginalUrl(null)
    setResultUrl(null)
    setError('')
    setProgress(0)
    setStage('')
    setDims(null)
    setResultSize(0)
    setFileName('image')
    setScale(4)
    clearUpscale()
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFile = useCallback(async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      revokeAll()
      setOriginalUrl(null)
      setResultUrl(null)
      setError('Unsupported file. Please choose a PNG, JPG, or WebP image.')
      setStatus('error')
      return
    }

    revokeAll()
    setError('')
    setResultUrl(null)
    setResultSize(0)
    setDims(null)
    clearUpscale()

    const origUrl = track(URL.createObjectURL(file))
    setOriginalUrl(origUrl)
    setFileName(file.name.replace(/\.[^.]+$/, '') || 'image')

    const probe = new Image()
    probe.onload = () => setDims({ w: probe.naturalWidth, h: probe.naturalHeight })
    probe.src = origUrl

    setStatus('processing')
    setProgress(0)
    setStage('Preparing…')

    try {
      const blob = await removeBackground(file, {
        output: { format: 'image/png', quality: 1 },
        progress: (key, current, total) => {
          setProgress(total ? Math.round((current / total) * 100) : 0)
          setStage(
            key.startsWith('fetch')
              ? 'Loading AI model (one-time download)…'
              : 'Erasing background…',
          )
        },
      })
      setResultUrl(track(URL.createObjectURL(blob)))
      setResultSize(blob.size)
      setStatus('done')
    } catch (e) {
      console.error(e)
      setError('Something went wrong while processing the image. Please try again.')
      setStatus('error')
    }
  }, [])

  // Paste an image straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (file) handleFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFile])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const runUpscale = async () => {
    if (!resultUrl) return
    setUpError('')
    setUpscaling(true)
    setUpProgress(0)
    setUpStage('Loading AI upscaler (one-time download)…')
    try {
      const { upscaleCutout } = await import('./upscale')
      const { blob, width, height } = await upscaleCutout(resultUrl, scale, (pct) => {
        setUpStage('Enhancing details…')
        setUpProgress(pct)
      })
      if (upscaledUrl) URL.revokeObjectURL(upscaledUrl)
      setUpscaledUrl(track(URL.createObjectURL(blob)))
      setUpscaledDims({ w: width, h: height })
      setUpscaledSize(blob.size)
    } catch (e) {
      console.error(e)
      setUpError('Upscaling failed. Try a smaller scale or a different image.')
    } finally {
      setUpscaling(false)
    }
  }

  const undoUpscale = () => {
    if (upscaledUrl) URL.revokeObjectURL(upscaledUrl)
    setUpscaledUrl(null)
    setUpscaledDims(null)
    setUpscaledSize(0)
    setUpError('')
  }

  const displayUrl = upscaledUrl ?? resultUrl
  const shownDims = upscaledDims ?? dims
  const shownSize = upscaledSize || resultSize
  const proj = dims ? projectedSize(dims.w, dims.h, scale) : null

  const download = () => {
    if (!displayUrl) return
    const a = document.createElement('a')
    a.href = displayUrl
    const suffix = upscaledDims ? `-${upscaledDims.w}x${upscaledDims.h}` : ''
    a.download = `${fileName}-erabg${suffix}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Top bar */}
      <header
        className={`app-drag glass sticky top-0 z-30 flex h-14 items-center justify-between pr-4 ${
          isDesktop ? 'pl-[88px]' : 'pl-4'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7 rounded-[8px] shadow-sm" />
          <span className="text-[15px] font-semibold tracking-tight">ERABG</span>
          <span className="hidden text-[13px] text-[var(--text-3)] sm:inline">
            Erase Background
          </span>
        </div>
        <span className="no-drag pill border border-[var(--border)] text-[var(--text-2)]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--success)' }} />
          On-device · Private
        </span>
      </header>

      <main className="relative flex flex-1 flex-col items-center px-5 py-10 sm:py-16">
        {/* Decorative ambient glow */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center overflow-hidden">
          <div
            className="h-72 w-[44rem] max-w-full opacity-[0.16] blur-[90px]"
            style={{
              background:
                'radial-gradient(closest-side, #0A84FF, transparent), radial-gradient(closest-side, #BF5AF2, transparent)',
              backgroundPosition: '30% 0, 75% 20%',
              backgroundSize: '60% 100%, 55% 90%',
              backgroundRepeat: 'no-repeat',
            }}
          />
        </div>

        <div className="w-full max-w-2xl">
          {status === 'idle' || status === 'error' ? (
            <>
              <div className="animate-rise text-center">
                <h1 className="mx-auto max-w-xl text-4xl font-semibold leading-[1.07] tracking-[-0.02em] sm:text-[44px]">
                  Erase any background.
                  <br />
                  <span className="text-[var(--text-2)]">Keep every pixel.</span>
                </h1>
                <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-[var(--text-2)]">
                  Drop an image and ERABG removes the background instantly — on your
                  device, in original quality, with AI upscaling to 4K.
                </p>
              </div>

              <div className="animate-rise mt-9" style={{ animationDelay: '70ms' }}>
                <Dropzone
                  isDragging={isDragging}
                  error={error}
                  onPick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                />
              </div>

              <div className="animate-rise mt-5 grid grid-cols-3 gap-3" style={{ animationDelay: '140ms' }}>
                <Feature title="Instant" body="On-device AI" icon={<BoltIcon />} />
                <Feature title="Private" body="Never uploaded" icon={<LockIcon />} />
                <Feature title="Up to 4K" body="AI upscaling" icon={<Sparkles />} />
              </div>
            </>
          ) : status === 'processing' ? (
            <Processing originalUrl={originalUrl} progress={progress} stage={stage} />
          ) : (
            resultUrl &&
            originalUrl &&
            displayUrl && (
              <div className="animate-rise space-y-4">
                <div className="surface overflow-hidden rounded-[22px] p-3 sm:p-4">
                  <CompareSlider before={originalUrl} after={displayUrl} />
                </div>

                {/* Action bar */}
                <div className="surface flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-4 py-3">
                  <div className="flex items-center gap-2 text-[13px] text-[var(--text-2)]">
                    {shownDims && (
                      <span className="font-semibold text-[var(--text)]">
                        {shownDims.w} × {shownDims.h}
                      </span>
                    )}
                    {shownSize > 0 && <span>· PNG {formatBytes(shownSize)}</span>}
                    {upscaledUrl && (
                      <span
                        className="pill"
                        style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
                      >
                        Upscaled
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={reset} className="btn btn-ghost focus-ring">
                      New
                    </button>
                    <button onClick={download} className="btn btn-primary focus-ring">
                      <DownloadIcon />
                      Download
                    </button>
                  </div>
                </div>

                {/* Upscale panel */}
                <div className="surface rounded-[18px] p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      <Sparkles />
                    </div>
                    <div className="mr-auto">
                      <p className="text-[15px] font-semibold">Upscale with AI</p>
                      <p className="text-[13px] text-[var(--text-2)]">
                        Enlarge &amp; sharpen up to 4K — runs on your device.
                      </p>
                    </div>
                    {upscaledUrl && !upscaling && (
                      <button onClick={undoUpscale} className="btn btn-ghost focus-ring !px-3.5 !py-2 text-[13px]">
                        Revert
                      </button>
                    )}
                  </div>

                  {upscaling ? (
                    <div className="mt-4">
                      <p className="text-[13px] font-medium text-[var(--text-2)]">{upStage}</p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${upProgress}%`, background: 'var(--accent)' }}
                        />
                      </div>
                      <p className="mt-1.5 text-[12px] text-[var(--text-3)]">{upProgress}%</p>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="inline-flex rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-1">
                        {([2, 4] as Scale[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => setScale(s)}
                            className={`rounded-[9px] px-4 py-1.5 text-[13px] font-semibold transition ${
                              scale === s
                                ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                                : 'text-[var(--text-2)] hover:text-[var(--text)]'
                            }`}
                          >
                            {s}×
                          </button>
                        ))}
                      </div>
                      {proj && (
                        <span className="text-[13px] text-[var(--text-3)]">
                          → {proj.w} × {proj.h}px
                        </span>
                      )}
                      <button onClick={runUpscale} className="btn btn-tinted focus-ring ml-auto">
                        <Sparkles />
                        Upscale
                      </button>
                    </div>
                  )}

                  {upError && (
                    <p
                      className="mt-3 rounded-xl px-3 py-2 text-[13px] font-medium"
                      style={{ background: DANGER_SOFT, color: DANGER }}
                    >
                      {upError}
                    </p>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onInputChange}
        />
      </main>

      <footer className="px-5 pb-7 pt-4 text-center text-[12px] text-[var(--text-3)]">
        ERABG · Free &amp; private · Drag, paste, or browse · PNG · JPG · WebP
      </footer>
    </div>
  )
}

/* ----------------------------------------------------------------------------
   Sub-components
---------------------------------------------------------------------------- */
function Dropzone(props: {
  isDragging: boolean
  error: string
  onPick: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}) {
  const { isDragging, error, onPick, onDragOver, onDragLeave, onDrop } = props
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick())}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`focus-ring group relative flex cursor-pointer flex-col items-center justify-center rounded-[24px] border px-6 py-16 text-center transition-all duration-200 ${
        isDragging
          ? 'scale-[1.01] border-[var(--accent)]'
          : 'border-[var(--border-strong)] hover:border-[var(--accent)]'
      }`}
      style={{
        background: isDragging ? 'var(--accent-soft)' : 'var(--surface)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] text-white shadow-lg transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105"
        style={{ background: 'linear-gradient(135deg, #0A84FF, #5E5CE6 55%, #BF5AF2)' }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
      </div>
      <p className="text-[19px] font-semibold tracking-tight">Drop an image to start</p>
      <p className="mt-1.5 text-[15px] text-[var(--text-2)]">
        Click to browse — or paste from your clipboard
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
        {['PNG', 'JPG', 'WEBP'].map((f) => (
          <span
            key={f}
            className="pill border border-[var(--border)] text-[var(--text-3)]"
            style={{ background: 'var(--bg)' }}
          >
            {f}
          </span>
        ))}
      </div>
      {error && (
        <p
          className="mt-5 rounded-xl px-3 py-2 text-[13px] font-medium"
          style={{ background: DANGER_SOFT, color: DANGER }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

function Processing(props: {
  originalUrl: string | null
  progress: number
  stage: string
}) {
  const { originalUrl, progress, stage } = props
  return (
    <div className="surface animate-fade mx-auto max-w-md rounded-[24px] p-6 sm:p-8">
      <div className="relative mx-auto overflow-hidden rounded-2xl">
        {originalUrl && (
          <img src={originalUrl} alt="Processing" className="block w-full opacity-60" />
        )}
        <div className="absolute inset-0 grid place-items-center bg-black/10 backdrop-blur-[2px]">
          <span
            className="h-11 w-11 animate-spin rounded-full border-[3px] border-white/40"
            style={{ borderTopColor: 'var(--accent)' }}
          />
        </div>
      </div>
      <p className="mt-6 text-center text-[15px] font-medium">{stage}</p>
      <div className="mx-auto mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%`, background: 'var(--accent)' }}
        />
      </div>
      <p className="mt-2 text-center text-[12px] text-[var(--text-3)]">{progress}%</p>
    </div>
  )
}

function Feature({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <div className="surface rounded-2xl p-4">
      <div
        className="mb-2.5 grid h-8 w-8 place-items-center rounded-[10px]"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        {icon}
      </div>
      <p className="text-[14px] font-semibold tracking-tight">{title}</p>
      <p className="text-[13px] text-[var(--text-2)]">{body}</p>
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2 L4 14 h6 l-1 8 9-12 h-6 z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2.5" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}
