# Classroom Noise Monitor

A real-time, browser-based noise level monitor designed for teachers to manage classroom volume. No installation or backend required — just open the page and allow microphone access.

## Features

- **Live dB meter** — smoothed noise reading via the Web Audio API
- **Visual feedback** — emoji reactions, animated circle, and colour-coded status
- **History chart** — scrolling noise-level graph with threshold lines
- **Noise thermometer** — vertical gauge for at-a-glance level
- **Projector / Wall Display mode** — full-screen creature display for students to see
- **Quiet streak & stars** — gamified reward for sustained quiet
- **Session challenges** — timed quiet challenges with pass/fail results
- **Countdown timer** — work-period timer with an audible end signal
- **Escalating alerts** — automatic stage escalation (warn → alarm → critical)
- **Calibration wizard** — samples room baseline and sets thresholds automatically
- **Session report** — grades (A–F), stats, and feedback after each session
- **Session history** — last 10 sessions with mini sparklines and a grade chart
- **Achievement badges** — unlock milestones (first session, zero alerts, star collector, …)
- **Attention overlay** — full-screen "Eyes Up Front!" signal, customisable
- **Ambient colour mode** — background hue shifts with noise level
- **CSV export** — download the event log
- **Dark / Light themes** and fullscreen support
- **Presets** — Library, Group Work, Presentation, Testing, Custom

## Usage

1. Open `index.html` in a modern browser (Chrome, Firefox, Edge, Safari 11+).
   - The page must be served over **HTTPS** (or `localhost`) for microphone access to work.
   - The deployed version on **GitHub Pages** already meets this requirement.
2. Click **Start Monitoring** and allow microphone access when prompted.
3. Monitor the noise level in real time. Adjust thresholds in the Settings panel.
4. Click **Stop Monitoring** (or press `Space`) to end a session and view the report.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Start / Stop monitoring |
| `F` | Toggle fullscreen |
| `T` | Toggle dark/light theme |
| `R` | Reset session stats |
| `E` | Export event log as CSV |
| `A` | Trigger attention overlay |
| `P` | Show session report |
| `W` | Open / close projector mode |
| `?` or `/` | Show shortcuts help |
| `Escape` | Dismiss overlays / exit fullscreen |

## Deployment

The project deploys automatically to **GitHub Pages** via the workflow in `.github/workflows/deploy.yml` whenever a push is made to `main`.

To deploy to your own GitHub Pages:

1. Fork this repository.
2. Go to **Settings → Pages** and set the source to **GitHub Actions**.
3. Push to `main` — the action will deploy `index.html`, `app.js`, and `styles.css`.

## Project Structure

```
classroom-noise-monitor/
├── index.html          # Application markup
├── app.js              # All application logic (~1 950 lines, vanilla JS)
├── styles.css          # Styling and theming (~2 600 lines)
└── .github/
    └── workflows/
        └── deploy.yml  # GitHub Pages deployment workflow
```

## Browser Requirements

The app uses the **Web Audio API** (`getUserMedia` + `AnalyserNode`), which requires:

- A secure context (HTTPS or localhost)
- A supported browser: Chrome 47+, Firefox 36+, Edge 79+, Safari 11+
- A working microphone

## Privacy

All audio processing happens locally in the browser. No audio data is ever transmitted or stored. Session statistics are saved only in the browser's `localStorage` and can be cleared via the Reset button.

## License

MIT
