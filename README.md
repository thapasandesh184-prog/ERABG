# ERABG — Erase Background

A free, private, in-browser background eraser with an Apple-grade UI. Drop any
image and get back a transparent PNG at **full original resolution** — no
accounts, no watermarks, no server, and no API keys. Optionally **AI-upscale up
to 4K** before downloading.

Everything runs entirely on the user's device:

- Background removal via [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) (an ISNet/U²-Net model compiled to WebAssembly).
- AI upscaling via [UpscalerJS](https://upscalerjs.com/) (ESRGAN on TensorFlow.js).

Images never leave the browser.

## Features

- 🪄 One-click background removal (drag & drop, browse, or paste)
- 🔭 AI upscaling up to 4K — RGB super-resolved, alpha preserved
- 🔒 100% on-device — nothing is uploaded
- 🖼️ Original-quality, full-resolution transparent PNG download
- ↔️ Interactive before/after comparison slider
- 🌗 Polished light **and** dark themes (follows the system)
- 🆓 Free forever — no API fees, no limits

## Tech stack

- [Vite](https://vite.dev/) + [React](https://react.dev/) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/) with a custom Apple-style token system
- [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) · [UpscalerJS](https://upscalerjs.com/)
- [Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/) for the macOS app

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

> **Note:** The first time a background is removed (or an image is upscaled), the
> AI model is downloaded from a CDN, then cached — subsequent runs are fast.

## Deploying (web)

`npm run build` produces a static site in `dist/` that you can host for free on
Netlify, Vercel, Cloudflare Pages, GitHub Pages, etc. No backend required.

## Desktop app (macOS)

ERABG is also packaged as a native macOS app via Electron, with a hidden-inset
title bar and system-following dark mode. The production build is served inside
Electron from a secure custom `app://` protocol (not `file://`), so Web Workers,
`fetch`, and WASM behave exactly like on the web.

```bash
npm run electron:dev      # run the app in Electron against the Vite dev server
npm run electron:preview  # build, then run the production bundle in Electron
npm run electron:build    # build + package a .app, .dmg, and .zip into release/
```

Artifacts land in `release/`:

- `ERABG.app` — the app bundle (Apple Silicon / arm64)
- `ERABG-<version>-arm64.dmg` — distributable disk image
- `ERABG-<version>-arm64-mac.zip`

> **Unsigned build:** there's no Apple Developer certificate, so the first launch
> may be blocked by Gatekeeper. Right-click the app → **Open** (once), or strip
> the quarantine flag: `xattr -dr com.apple.quarantine "ERABG.app"`.

> **First run needs internet:** the AI models (background removal + upscaler) are
> downloaded from a CDN on first use, then cached locally for offline use.

The app icon lives in `build/icon.icns` (regenerate from `build/icon.png` with
`sips` + `iconutil`). Packaging config is in `electron-builder.yml`; the Electron
main process is `electron/main.cjs`.
