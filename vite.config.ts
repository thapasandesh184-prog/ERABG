import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works when served from the Electron
  // `app://` protocol (and any static host), not just the domain root.
  base: './',
  plugins: [react(), tailwindcss()],
  // Pre-bundle the heavy ML deps at startup so the first (lazy) "Upscale"
  // click in dev doesn't race Vite's on-demand dependency optimization.
  optimizeDeps: {
    include: [
      'upscaler',
      '@tensorflow/tfjs',
      '@upscalerjs/esrgan-slim/2x',
      '@upscalerjs/esrgan-slim/4x',
    ],
  },
})
