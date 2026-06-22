# 🔊 Classroom Noise Monitor

A privacy-first, browser-based noise monitor for classrooms. It turns your
device's microphone into a friendly, real-time volume meter so a class can *see*
how loud the room is and self-regulate — no shouting required.

**Everything runs on-device.** Audio is analysed live in the browser via the Web
Audio API; nothing is ever recorded, uploaded, or stored. Only your settings and
session summaries are saved (in `localStorage`, on your own machine).

> The decibel scale is **relative** (≈20–120), tuned for comparing classroom
> noise levels — it is not a calibrated sound-pressure meter.

## ✨ Features

- **Live level display** — animated dB readout, colour-coded creature, progress
  ring, thermometer and frequency visualizer.
- **Presets** — Custom, Library, Group Work, Presentation and Testing, each with
  sensible thresholds and mic sensitivity.
- **Adjustable thresholds** — set Quiet / Warning / Alert levels, or use
  **Auto-Calibrate** to measure your room's baseline and set them for you.
- **Quiet Challenge** — countdown challenges (30 s – 5 min) to build quiet habits.
- **Work Period Timer** — a visible countdown for focused work, with an
  end-of-period session report.
- **Attention Signals** — flash a full-screen "Eyes Up Front!", "Too Loud" or
  custom message to get attention without raising your voice.
- **Wall / Projector Display** — a large, glanceable mode for the class screen.
- **Session Report, History & Achievements** — graded summaries, recent-session
  history with sparklines, a grade trend chart, and unlockable badges.
- **CSV export** — download the event log for your records.
- **Themes, fullscreen & keyboard shortcuts** — light/dark themes (remembered),
  plus shortcuts for everything (press `?` to see them).

## 🚀 Usage

1. Open the app (the live GitHub Pages deployment, or your local copy).
2. Click **Start Monitoring** and allow microphone access when prompted.
3. Pick a preset or adjust the thresholds, and you're monitoring.

**Microphone access requires a secure context.** `getUserMedia` only works over
**HTTPS** or on **`localhost`** — it is blocked on plain `http://` sites.

### Keyboard shortcuts

`Space` start/stop · `F` fullscreen · `T` theme · `A` attention · `W` wall
display · `R` reset · `P` report · `E` export CSV · `?` help · `Esc` close
overlays.

## 🛠️ Local development

There is **no build step** — the files are served as-is. Serve the repo root over
a local web server (opening `index.html` via `file://` will block the
microphone):

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (e.g. `npx serve`).

## 📁 Project structure

| File | Purpose |
|------|---------|
| `index.html` | Markup and DOM structure |
| `styles.css` | All styling, themes and CSS custom properties |
| `app.js` | All logic — audio, rendering loop, persistence (vanilla ES6, no modules) |
| `.github/workflows/deploy.yml` | GitHub Pages deployment |
| `.claude/skills/noise-monitor-dev.md` | Developer guide for working on this project |

For architecture, conventions and common how-tos, see the developer guide:
[`.claude/skills/noise-monitor-dev.md`](.claude/skills/noise-monitor-dev.md).

## 🌐 Deployment

The app is a static site deployed to **GitHub Pages**. Pushing to `main` triggers
the workflow in `.github/workflows/deploy.yml`, which publishes the repository
root. The live site updates within about a minute of the push.

## 🔒 Privacy

No audio is recorded or transmitted. The microphone stream is analysed in memory
and released when monitoring stops. Settings, session history and achievements
are stored only in your browser's `localStorage` and never leave your device.
