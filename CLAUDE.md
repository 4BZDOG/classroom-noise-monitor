# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running Locally

This is a zero-dependency, pure-frontend application. No build step is required.

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

Any static file server works. There is no npm, no compilation, no bundling.

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) auto-deploys to GitHub Pages on every push to `main`. No manual steps needed.

## Architecture

The app is split across three files:

- **`index.html`** — All markup and DOM structure
- **`styles.css`** — Styling, CSS custom properties, animations (including the animated character via keyframes)
- **`app.js`** — All application logic (~1950 lines, no modules)

### Audio Pipeline

```
getUserMedia() → initAudio() → updateLoop() [requestAnimationFrame]
                                  ├─ getByteFrequencyData() → FFT bins
                                  ├─ calculateDB() → RMS → dB scale (20–120 dB)
                                  ├─ EMA smoothing (asymmetric: fast rise α=0.25, slow fall α=0.12)
                                  └─ updateNoiseDisplay() / updateStats() / updateHistoryChart()
```

The app uses `AnalyserNode` with FFT size 256 and smoothing 0.75. Audio resources (stream tracks, AudioContext) are explicitly closed on monitoring stop.

### State Management

All application state lives in module-scope variables at the top of `app.js` (lines 1–101). There is no framework — state is mutated directly. Persistence uses `localStorage` with the `cnm_` prefix:

| Key | Contents |
|-----|----------|
| `cnm_settings` | Sensitivity, thresholds, toggle states |
| `cnm_className` | Class/room name |
| `cnm_history` | Up to 10 past sessions |
| `cnm_achievements` | Unlocked badge IDs |

All `localStorage` access is wrapped in try/catch.

### Threshold System

Three tiers drive the UI color state and alert escalation:

- **Quiet** (green, `--color-quiet: #00ff88`) — below quiet threshold
- **Moderate** (yellow, `--color-moderate: #ffc800`) — between quiet and warning
- **Loud** (red, `--color-loud: #ff3232`) — above alert threshold

Five built-in presets (library, groupwork, presentation, testing, custom) each define quiet/warning/alert dB values and a sensitivity multiplier.

### Initialization Sequence (`app.js` lines ~1909–1953)

1. `initVisualizer()` — builds 80 equalizer bar elements
2. `initThermometer()` — builds thermometer UI segments
3. `loadSettings()` → `loadSessionHistory()` → `loadAchievements()`
4. `updateSettingsDisplay()` — validates and renders current thresholds
5. Event listeners attached for all interactive elements

### Key Patterns

- **Canvas rendering**: History chart uses Canvas 2D, DPR-aware for sharp rendering on retina displays.
- **Sound synthesis**: Alert tones generated via oscillator chains (no audio files). Alert uses an 880→660→880 Hz sweep; success uses a chord.
- **Event log throttling**: Log entries only added on state change; capped at 200 entries.
- **Browser compatibility**: Explicit Safari/Chrome/Firefox handling in the microphone permission flow (`initAudio()`).
- **Fullscreen / Projector mode**: Separate UI layers toggled via CSS classes; projector mode is designed for classroom wall display.
- **Keyboard shortcuts**: `?`, `Space`, `F`, `T`, `R`, `E`, `A`, `W`, `P` — handled in a single `keydown` listener.

## CSS Conventions

Custom properties are defined in `:root` (`styles.css` lines 7–14). Color states (`--color-quiet`, `--color-moderate`, `--color-loud`) are used throughout for consistent theming. The animated noise-reactive character uses `@keyframes` in `styles.css` around line 456.
