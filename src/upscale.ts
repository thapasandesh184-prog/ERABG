import Upscaler from 'upscaler'
import x2 from '@upscalerjs/esrgan-slim/2x'
import x4 from '@upscalerjs/esrgan-slim/4x'
import * as tf from '@tensorflow/tfjs'

/** 4K UHD long-edge cap for upscaled output. */
export const MAX_EDGE = 3840

export type Scale = 2 | 4

/** Output dimensions for a source size at `scale`, capped to 4K on the long edge. */
export function projectedSize(w: number, h: number, scale: Scale) {
  const long = Math.max(w, h)
  const target = Math.min(long * scale, MAX_EDGE)
  const ratio = long ? target / long : 1
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) }
}

// One Upscaler per scale; each lazily loads its model weights on first use.
type UpscalerInstance = InstanceType<typeof Upscaler>
const cache = new Map<Scale, UpscalerInstance>()
function getUpscaler(scale: Scale): UpscalerInstance {
  let u = cache.get(scale)
  if (!u) {
    u = new Upscaler({ model: scale === 4 ? x4 : x2 })
    cache.set(scale, u)
  }
  return u
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = url
  })
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0)

/**
 * Propagate edge colors of the opaque region into transparent pixels so the
 * super-resolution model has no hard black borders to hallucinate halos from.
 * Only RGB of fully-transparent pixels is touched; alpha is never modified.
 */
function bleedEdges(data: Uint8ClampedArray, w: number, h: number, passes: number) {
  const known = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) known[i] = data[i * 4 + 3] > 0 ? 1 : 0

  for (let p = 0; p < passes; p++) {
    const newly: number[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x
        if (known[idx]) continue
        let r = 0, g = 0, b = 0, n = 0
        if (x > 0 && known[idx - 1]) { const j = idx - 1; r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++ }
        if (x < w - 1 && known[idx + 1]) { const j = idx + 1; r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++ }
        if (y > 0 && known[idx - w]) { const j = idx - w; r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++ }
        if (y < h - 1 && known[idx + w]) { const j = idx + w; r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++ }
        if (n > 0) {
          data[idx * 4] = (r / n) | 0
          data[idx * 4 + 1] = (g / n) | 0
          data[idx * 4 + 2] = (b / n) | 0
          newly.push(idx)
        }
      }
    }
    if (newly.length === 0) break
    for (const idx of newly) known[idx] = 1
  }
}

/** High-quality resample of just the alpha channel to (outW, outH). */
function scaleAlpha(img: HTMLImageElement, outW: number, outH: number): Uint8ClampedArray {
  const c = document.createElement('canvas')
  c.width = outW
  c.height = outH
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, outW, outH)
  const data = ctx.getImageData(0, 0, outW, outH).data
  const a = new Uint8ClampedArray(outW * outH)
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3]
  return a
}

type Progress = (pct: number) => void

/**
 * AI-upscale a transparent cut-out PNG up to 4K. The RGB is super-resolved with
 * ESRGAN while the alpha is resampled separately, then recombined — preserving
 * full transparency at the higher resolution.
 */
export async function upscaleCutout(
  srcUrl: string,
  scale: Scale,
  onProgress?: Progress,
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(srcUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight

  // Pick an input size so that input * scale lands at (or below) the 4K cap,
  // keeping the model's output — and memory use — bounded.
  const out = projectedSize(w, h, scale)
  const inW = Math.max(1, Math.round(out.w / scale))
  const inH = Math.max(1, Math.round(out.h / scale))

  // Draw the source at input size and read its pixels.
  const src = document.createElement('canvas')
  src.width = inW
  src.height = inH
  const sctx = src.getContext('2d')!
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(img, 0, 0, inW, inH)
  const srcData = sctx.getImageData(0, 0, inW, inH)

  // Clean transparent-region colors so the model doesn't produce edge halos.
  bleedEdges(srcData.data, inW, inH, 6)

  const rgbCanvas = document.createElement('canvas')
  rgbCanvas.width = inW
  rgbCanvas.height = inH
  rgbCanvas.getContext('2d')!.putImageData(srcData, 0, 0)

  // Super-resolve the RGB. Patch-based to keep GPU memory in check.
  const upscaler = getUpscaler(scale)
  const input = tf.browser.fromPixels(rgbCanvas)
  const upTensor = (await upscaler.upscale(input, {
    output: 'tensor',
    patchSize: 128,
    padding: 6,
    progress: (rate: number) => onProgress?.(Math.round(rate * 100)),
  })) as unknown as tf.Tensor3D
  input.dispose()

  const [outH, outW] = upTensor.shape
  const flat = await upTensor.data()
  upTensor.dispose()

  // Recombine super-resolved RGB with separately-scaled alpha.
  const alpha = scaleAlpha(img, outW, outH)
  const merged = new ImageData(outW, outH)
  const px = outW * outH
  for (let i = 0; i < px; i++) {
    merged.data[i * 4] = clamp(flat[i * 3])
    merged.data[i * 4 + 1] = clamp(flat[i * 3 + 1])
    merged.data[i * 4 + 2] = clamp(flat[i * 3 + 2])
    merged.data[i * 4 + 3] = alpha[i]
  }

  const outCanvas = document.createElement('canvas')
  outCanvas.width = outW
  outCanvas.height = outH
  outCanvas.getContext('2d')!.putImageData(merged, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) =>
    outCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG'))),
      'image/png',
    ),
  )
  return { blob, width: outW, height: outH }
}
