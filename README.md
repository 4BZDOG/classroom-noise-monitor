# Classroom Noise Monitor

A gamified, browser-based noise-level monitor for teachers. It uses the device
microphone to show a live noise reading, a reactive character, and classroom-friendly
feedback — quiet challenges, achievements, a projector/wall-display mode, session
reports, and CSV export. **Nothing is recorded or sent anywhere; all audio analysis
happens on-device and the only data stored is in your browser's `localStorage`.**

## Features

- **Live noise meter** — circular gauge, thermometer, and equalizer driven by the mic.
- **Reactive creature** — a CSS character that reacts as the room gets louder.
- **Presets** — Library, Group Work, Presentation, Testing, and Custom threshold sets.
- **Auto-calibration** — measures your room's baseline and sets thresholds for you.
- **Quiet Challenge** — timed quiet-streak game with star rewards.
- **Work-period timer** — countdown with an end-of-period report.
- **Attention signals** — full-screen "Eyes Up Front!" / custom messages.
- **Projector / Wall Display** — large-format view for the front of the room.
- **Session report & history** — grade card, recent sessions, grade trend, achievements.
- **Export** — download the event log as CSV.
- **Themes & fullscreen layout**, keyboard shortcuts, and light/dark modes.

## Running locally

The app is **buildless** — plain HTML, CSS, and JavaScript served as static files.
The microphone requires a secure context, so open it over `http://localhost`
(allowed) rather than via `file://`:

```bash
# from the repo root, pick any static server, e.g.:
python3 -m http.server 8000
# then visit http://localhost:8000
```

Allow microphone access when prompted. (Plain `http://` on a non-localhost host is
blocked by browsers for `getUserMedia`; the deployed site is served over HTTPS.)

## Keyboard shortcuts

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `Space` | Start / Stop | `W` | Wall display |
| `F` | Fullscreen layout | `R` | Reset stats |
| `T` | Toggle theme | `P` | Session report |
| `A` | Attention signal | `E` | Export CSV |
| `?` | Shortcuts help | `Esc` | Close overlays |

## Tech & layout

| | |
|---|---|
| Stack | Vanilla JS (ES6, no modules), HTML5, CSS3 — no build step |
| Audio | Web Audio API (`AudioContext` + `AnalyserNode`), mic only |
| Persistence | `localStorage` (`cnm_settings`, `cnm_history`, `cnm_achievements`, `cnm_className`) |
| Deploy | GitHub Pages on push to `main` (`.github/workflows/deploy.yml`) |
| CI | `node --check` syntax gate (`.github/workflows/ci.yml`) |

| File | Role |
|------|------|
| `index.html` | All markup: controls, settings, modals, overlays |
| `app.js` | Application logic: audio, render loop, stats, persistence, calibration |
| `styles.css` | All styling: themes, animations, projector/ambient modes, responsive |

> **Note on the dB scale:** the readings are an internal **relative** scale
> (`DB_MIN`–`DB_MAX`, currently 20–120), not calibrated real-world decibels. It's
> meant for comparing noise levels within a session, not measuring true SPL.

## Development

See [`.claude/skills/noise-monitor-dev.md`](.claude/skills/noise-monitor-dev.md) for
an architecture overview and step-by-step recipes (adding presets, achievements,
settings, modals, etc.).

The render loop in `app.js` runs via `requestAnimationFrame` while monitoring:

```
calculateDB → updateNoiseDisplay → updateVisualizer → updateStats →
updateHistoryChart → updateTrend → updateThermometer →
updateProjector → updateEscalatingAlert
```

Before pushing, run the same check CI does:

```bash
node --check app.js
```

## Deployment

Push to `main` and GitHub Actions publishes the static site (`index.html`,
`styles.css`, `app.js`) to GitHub Pages. Feature branches do not deploy.

## Privacy

The microphone stream is analysed in real time and never recorded, uploaded, or
persisted. Settings and session history live only in your browser's `localStorage`
and can be cleared at any time via the Reset button or your browser settings.
