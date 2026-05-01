---
name: noise-monitor-dev
description: >
  Development guide for the Classroom Noise Monitor — a vanilla JS/HTML/CSS
  single-page app with no build tooling. Use when adding features, fixing bugs,
  modifying presets, thresholds, UI, or persistence logic in this project.
category: project
---

# Classroom Noise Monitor — Development Skill

## Project at a Glance

| Aspect | Detail |
|--------|--------|
| Stack | Vanilla JS (ES6, no modules), HTML5, CSS3 |
| Build | None — files are served as-is |
| Deploy | GitHub Pages on push to `main` via `.github/workflows/deploy.yml` |
| Entry point | `index.html` → loads `styles.css` and `app.js` |
| Source files | `app.js` (~1950 lines), `styles.css`, `index.html` |
| State | Module-level globals in `app.js` — no framework, no store |
| Persistence | `localStorage` only (keys: `cnm_settings`, `cnm_history`, `cnm_achievements`, `cnm_className`) |
| Audio | Web Audio API (`AudioContext` + `AnalyserNode`) — mic only, nothing is recorded |

---

## Architecture

### State model
All runtime state lives in module-level variables at the top of `app.js`.
Important groups:

```js
// Monitoring lifecycle
let isMonitoring, audioContext, analyser, microphone, dataArray, animationId;

// Session stats
let readings[], maxReading, alertCount, quietReadings, totalReadings;

// Thresholds (read from DOM sliders at runtime — not cached)
// Always use: parseInt(quietThresholdEl.value) etc.

// Persistence targets
let sessionHistory[], unlockedAchievements (Set), className;
```

### Main render loop
`requestAnimationFrame` drives `updateLoop()` while `isMonitoring === true`.
Every frame calls:

```
calculateDB() → updateNoiseDisplay() → updateVisualizer() →
updateStats() → updateHistoryChart() → updateTrend() →
updateThermometer() → updateProjector() → updateEscalatingAlert()
```

### dB scale
The internal dB range is **20–120 dB**, derived from raw `Uint8Array` values
via `calculateDB()`. This is **not** calibrated real-world dB — it's a relative
scale suitable for comparing classroom noise levels.

### CSS custom properties (all colours)
```css
--color-quiet      /* green  — #00ff88 */
--color-moderate   /* yellow — #ffc800 */
--color-loud       /* red    — #ff3232 */
--color-primary    /* cyan   — #00d9ff */
--color-text-muted
--color-bg, --color-surface, --color-border
```
Always use these variables for noise-level colours; never hardcode hex.

---

## Common Patterns

### Add a new noise preset

1. Add an entry to the `presets` object in `app.js`:
   ```js
   const presets = {
     // existing…
     outdoor: { quiet: 55, warning: 70, alert: 85, sensitivity: 1.0 },
   };
   ```
2. Add a `.preset-tab` button in `index.html` inside `.preset-tabs`:
   ```html
   <button class="preset-tab" data-preset="outdoor" onclick="applyPreset('outdoor')">
     <!-- SVG icon -->
     Outdoor
   </button>
   ```
   No JS wiring needed — `applyPreset()` reads `presets[presetName]`.

### Add a new achievement

1. Append to the `ACHIEVEMENTS` array:
   ```js
   { id: 'my_achievement', icon: '🎯', name: 'My Achievement', desc: 'Description shown on hover' },
   ```
2. Call `unlockAchievement('my_achievement')` inside `checkAchievements(sessionData)`
   when the condition is met. `checkAchievements` runs at the end of every session.

### Add a new setting slider

1. Add the slider markup inside `.settings-grid` in `index.html`:
   ```html
   <div class="setting-item">
     <label>My Setting</label>
     <input type="range" id="mySetting" min="1" max="10" step="1" value="5">
     <div class="value-display" id="mySettingValue">5</div>
   </div>
   ```
2. Cache the element at the DOM refs section of `app.js`:
   ```js
   const mySettingEl = document.getElementById('mySetting');
   ```
3. Wire it into `updateSettingsDisplay()`, `saveSettings()`, and `loadSettings()`.
4. Attach an `input` listener:
   ```js
   mySettingEl.addEventListener('input', () => { updateSettingsDisplay(); saveSettings(); });
   ```

### Add a new modal

1. Add modal HTML (use the existing `.modal-overlay` / `.modal` structure):
   ```html
   <div class="modal-overlay" id="myModal">
     <div class="modal">
       <h2>My Modal</h2>
       <div class="modal-btns">
         <button class="modal-btn primary" onclick="closeMyModal()">Done</button>
       </div>
     </div>
   </div>
   ```
2. Add open/close functions in `app.js`:
   ```js
   function showMyModal() { document.getElementById('myModal').classList.add('active'); }
   function closeMyModal() { document.getElementById('myModal').classList.remove('active'); }
   ```
3. Register background-click dismiss at the bottom of `app.js`:
   ```js
   // In the existing forEach loop:
   ['reportModal', 'shortcutsModal', 'permissionModal', 'errorModal', 'myModal'].forEach(id => { … });
   ```
4. Add `Escape` key handling inside the existing `keydown` listener if needed.

### Trigger an attention signal

```js
triggerAttention('🎯', 'Custom message here');  // full-screen overlay
// Dismissed by user click or Escape
```

### Add per-loop work (runs every animation frame)

Add a call inside `updateLoop()` in `app.js` and write the function:
```js
function updateLoop() {
  if (!isMonitoring) return;
  const db = calculateDB();
  // …existing calls…
  updateMyNewFeature(db);       // ← add here
  animationId = requestAnimationFrame(updateLoop);
}
```

### Persist new data to localStorage

Always wrap in try/catch — `QuotaExceededError` is real on some devices:
```js
function saveMyData() {
  try {
    localStorage.setItem('cnm_mykey', JSON.stringify(myData));
  } catch(e) {
    if (e.name === 'QuotaExceededError') { /* trim data and retry */ }
  }
}
function loadMyData() {
  try { myData = JSON.parse(localStorage.getItem('cnm_mykey') || 'null'); }
  catch(e) { myData = null; }
}
```
Call `loadMyData()` in the init block at the bottom of `app.js`.

---

## Gotchas

### Safari / WebKit audio
- `AudioContext` must be `window.AudioContext || window.webkitAudioContext`.
- Safari starts `AudioContext` in `suspended` state — always `await audioContext.resume()` after a user gesture before processing audio.
- Both are already handled in `initAudio()` and `startMonitoring()`.

### Visualizer innerHTML wipe
`initVisualizer()` sets `visualizerEl.innerHTML = ''`, which removes `targetLineEl`
and `avgLineEl` from the DOM. The function re-appends them at the end.
If you clear the visualizer's HTML manually anywhere else, you must do the same.

### Timer cleanup
Every `setInterval` / `setTimeout` assigned to a module-level `*TimerId` variable
**must** be cleared in `stopMonitoring()` (or the relevant stop function).
Leaked timers continue running and corrupt state after the session ends.

### Reading thresholds
Threshold values are read fresh from DOM sliders each frame — do not cache them
across frames. Always use:
```js
const qt = parseInt(quietThresholdEl.value);
const wt = parseInt(warningThresholdEl.value);
const at = parseInt(alertThresholdEl.value);
```

### Microphone requires HTTPS (or localhost)
`navigator.mediaDevices.getUserMedia` is blocked on plain HTTP in all modern
browsers. The GitHub Pages deployment is HTTPS. For local testing, use
`localhost` (http://localhost works) or `127.0.0.1`.

### No module system
`app.js` uses no `import`/`export`. All functions and variables are global.
Do not add `type="module"` to the `<script>` tag — it would break all
`onclick="…"` handlers in `index.html`.

### Grading formula
`getGrade(quietPct, avgDb, alerts)` scores as: `quietPct - min(40, alerts * 5)`.
A ≥ 80, B ≥ 65, C ≥ 45, D ≥ 25, F otherwise. Adjust thresholds here if the
grading feels off for a particular classroom context.

---

## Deployment

```
push to main  →  GitHub Actions  →  GitHub Pages
```

- Workflow: `.github/workflows/deploy.yml`
- No build step — the whole repo root is deployed as a static site
- Feature branches do **not** trigger deploy; push to `main` when ready to ship
- After merging, check the Pages URL within ~1 min for the live update

---

## Example Task Instructions

**"Add a new preset called Exam Mode"**
> 1. Add `exam: { quiet: 20, warning: 35, alert: 45, sensitivity: 2.5 }` to `presets` in `app.js`.
> 2. Add a `.preset-tab` button with `data-preset="exam"` and label "Exam Mode" in `index.html`.

**"Show the session grade live during monitoring"**
> 1. Add a DOM element (e.g. a `.stat-card`) in `index.html`.
> 2. In `updateStats()` (called every frame), compute `getGrade(quietPct, avgDb, alertCount)` and update the element.

**"Make the quiet-streak stars persist across sessions"**
> 1. In `saveSessionToHistory()`, include `starsEarned` in the `sessionData` object.
> 2. Render it in `renderSessionHistory()` alongside the existing stats.

**"Add a new keyboard shortcut"**
> In the `keydown` listener near the bottom of `app.js`, add:
> ```js
> if (e.key === 'c' || e.key === 'C') showCalibration();
> ```
> Then add the shortcut to the `.shortcuts-grid` in `index.html`.
