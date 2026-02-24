# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MultiView Any Video is a Chrome browser extension (Manifest V3) that lets users watch multiple videos from different browser tabs simultaneously in a unified dashboard. It uses WebRTC for peer-to-peer video streaming between content scripts and the dashboard.

## Commands

```bash
npm run dev         # Start dev server (port 5173) with HMR
npm run build       # Production build
npm run typecheck   # TypeScript type checking (no emit)
npm run preview     # Preview production build
```

## Architecture

Three-layer message-driven architecture with Chrome runtime messages for all inter-component communication:

**Background Service Worker** (`src/background/index.ts`) — Central message relay hub. Routes WebRTC signals between content scripts and dashboard. Manages dashboard registration and handles content script injection.

**Content Scripts** (`src/content/index.ts`) — Runs on all web pages/frames. Detects videos by scanning DOM, Shadow DOM, and same-origin iframes. Scores videos by size/quality metrics (min area 4096px). Captures via `captureStream()` with canvas-based fallback for protected videos. Creates RTCPeerConnection offers to dashboard.

**UI (React):**
- **Popup** (`src/popup/Popup.tsx`) — Tab selector with drag-to-reorder. Persists selection to Chrome storage. Max 12 tabs.
- **Dashboard** (`src/dashboard/Dashboard.tsx`) — Responsive grid (1x1 to 4x3). Receives WebRTC streams. Mute/fullscreen controls, drag-to-reorder, connection retry every 8s. Handles multiple offers per tab, prioritizing best quality.

**WebRTC Flow:** Content script finds video → creates offer → background relays to dashboard → dashboard answers → ICE candidates exchanged → stream displayed.

## Tech Stack

- TypeScript, React 19, Tailwind CSS 4
- Vite 7 with `@crxjs/vite-plugin` for Chrome extension bundling
- Two HTML entry points: `popup.html` and `dashboard.html`
- `lucide-react` for icons

## Key Constants

- `MAX_TABS = 12` / `MAX_STREAMS = 12`
- Video detection: min area 4096px, quality score = (w×h) + playing bonus (500k) + ready bonus (100k)
- Video scan retries every 1000ms for up to 90 seconds
