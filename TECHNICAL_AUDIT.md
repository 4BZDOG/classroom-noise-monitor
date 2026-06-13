# Classroom Noise Monitor — Technical Audit

_Analysis-only audit. No application code was modified. Every claim is grounded in
file/line citations; facts and judgments are labelled where the distinction matters._

---

## Executive Summary

**Overall health grade: B (good for what it is).** This is a polished, single-author,
client-side educational web app — vanilla HTML/CSS/JS, no build, no backend,
deployed to GitHub Pages. Judged against its actual maturity (a classroom tool a
teacher runs in a browser, not a production service or library), it is well above
average: thoughtful UX, genuinely careful microphone-error handling
(`app.js:412-451`), correct audio-resource cleanup (`app.js:585-597`), defensive
`localStorage` usage with quota handling (`app.js:1493-1500`), and an unusually
accurate developer skill doc (`.claude/skills/noise-monitor-dev.md`). The code is
also XSS-safe where it matters — user-supplied class names render via `textContent`,
not `innerHTML` (`app.js:1446`, `1526`). It is not graded A because it has **zero
automated tests, no linting/formatting enforcement, no CI quality gate, and no
README**, and because the entire application is one 1,953-line file of ~40 mutable
globals (`app.js`), which is the single biggest barrier to safe future change.
**Top 3 risks:** (1) no test or CI safety net, so any refactor is blind; (2) the
god-file + global-state architecture makes regressions easy and isolation hard;
(3) a per-frame full-canvas redraw that reallocates the canvas every frame
(`app.js:845-848`) is a real performance/jank liability on weak classroom hardware.
**Top 3 opportunities:** (1) add a minimal test harness around the pure logic
(`calculateDB`, `getGrade`, calibration math) to unlock safe refactoring; (2) split
`app.js` into a few modules behind a tiny build, or at least logical sections; (3)
add a README + a lint/format CI gate — cheap, high-leverage, fits the project's
culture. Security surface is minimal and essentially healthy: no secrets, no
backend, no third-party runtime dependencies, no `innerHTML` sink fed by user input.

---

## Phase 1 — Repo Map

**Purpose.** A gamified classroom noise-level monitor for teachers. It uses the
device microphone to show a live relative "decibel" reading, a reactive creature
character, presets (Library, Group Work, Testing, etc.), a quiet-challenge timer,
achievements, session history, a session report card, a projector/wall-display
mode, and CSV export. Intended user is a teacher (the repo owner's email is an
`education.nsw.gov.au` address). Maturity: **polished hobbyist / educational
prototype**, single-author, shipped as a static site.

**Stack & runtime.**
- Vanilla **HTML5 + CSS3 + ES6 JavaScript**, no modules, no framework, no build step.
- **Web Audio API** (`AudioContext` + `AnalyserNode`) for live mic analysis; nothing is recorded or transmitted.
- **`localStorage`** for all persistence (keys: `cnm_settings`, `cnm_history`, `cnm_achievements`, `cnm_className`).
- **GitHub Pages** deploy via GitHub Actions on push to `main` (`.github/workflows/deploy.yml`).
- Runtime target: modern desktop/mobile browsers over HTTPS (mic requires secure context).

**Architecture sketch.**
`index.html` defines all DOM (controls, modals, overlays) and loads `styles.css`
then `app.js`. `app.js` holds ~40 module-level globals, caches DOM references, wires
event listeners, and runs a `requestAnimationFrame` loop (`updateLoop`,
`app.js:1061`) while monitoring. Each frame: `calculateDB → updateNoiseDisplay →
updateVisualizer → updateStats → updateHistoryChart → updateTrend →
updateThermometer → updateProjector → updateEscalatingAlert`. UI is driven by
inline `onclick="globalFn()"` handlers calling global functions.

**Key files.**
| Path | Lines | Role |
|------|-------|------|
| `index.html` | 718 | All markup: header, presets, main display, settings, modals, overlays. Inline `onclick` handlers throughout. |
| `app.js` | 1953 | Entire application: state, audio, rendering loop, stats, persistence, achievements, calibration, projector. |
| `styles.css` | 2615 | All styling: themes (dark/light), creature animation, projector mode, ambient mode, responsive breakpoints. |
| `.github/workflows/deploy.yml` | 38 | Deploys repo root to GitHub Pages on push to `main`. |
| `.claude/skills/noise-monitor-dev.md` | 265 | Accurate developer guide / extension recipes. |
| `.gitignore` | 3 | Ignores a stray `noise_monitor-*.html`, `*.bak`, `.DS_Store`. |

**What surprised me (facts).**
- The `.claude` skill doc references a README and CONTRIBUTING, but **no README exists** anywhere in the repo (verified by search). The skill doc is effectively the only prose documentation, and it is more accurate than most READMEs.
- The "Fullscreen" feature does **not** use the browser Fullscreen API — it toggles a CSS class `body.fullscreen` (`app.js:948-967`). Functionally a layout mode, not true fullscreen.
- The `.gitignore` ignores `noise_monitor-*.html`, hinting the project began life as a single monolithic HTML file (confirmed by commit `19d2409` "split monolithic HTML").

---

## Phase 2 — Audit Report

### Architecture & design

- **[High][Judgment] God file + global mutable state.** `app.js` is 1,953 lines with ~40 module-level mutable globals (`app.js:1-101`) and no module boundaries. Every function reads/writes shared state directly. _Consequence:_ change isolation is hard, accidental coupling is easy (e.g. timers, `smoothedDb`, `alertStage` are all global and reset in multiple places), and the file is near the limit of what one person can hold in their head. This is the project's central structural issue.
- **[Medium][Fact] HTML↔JS coupling via inline handlers.** ~50 inline `onclick="globalFn(...)"` handlers in `index.html` (e.g. `index.html:20`, `62-63`, `116-117`, `177`) hard-bind markup to global function names. _Consequence:_ functions can't be renamed or modularized without editing HTML; a strict Content-Security-Policy (no `unsafe-inline`) cannot be adopted without rewriting the event wiring.
- **[Low][Fact] Behavior split inconsistently between HTML and JS.** Some logic lives in inline attributes (e.g. `onkeydown="if(event.key==='Enter') saveClassName()"`, `index.html:249`) while equivalent logic elsewhere lives in JS listeners (`app.js:1921`). Inconsistent locus of behavior.

### Code quality

- **[High][Fact] Duplicated RMS→dB formula.** The core measurement formula `(rms * sensitivity * 0.4) + 20`, clamped to 20–120, exists in two places: `calculateDB` (`app.js:673-674`) and the calibration sampler (`app.js:1794`). _Consequence:_ the most important number in the app can drift between the two paths if one is edited; calibration could measure on a different scale than live monitoring.
- **[Medium][Fact] Inconsistent level→colour mapping between main display and projector.** In `updateNoiseDisplay` the warning..alert band renders **moderate/yellow** (`app.js:742-749`), but in `updateProjector` the same band renders **loud/red** (`app.js:1657-1658`). _Consequence:_ the wall display shows red while the main screen shows yellow for the identical noise level — confusing in a classroom where both may be visible.
- **[Medium][Fact] `getGrade` accepts `avgDb` but never uses it.** `getGrade(quietPct, avgDb, alerts)` computes purely from `quietPct` and `alerts` (`app.js:1305-1315`); `avgDb` is dead. _Consequence:_ misleading signature; grading ignores average loudness entirely, so a session that is borderline-loud the whole time but never crosses the alert threshold can still grade "A".
- **[Medium][Fact] History chart uses a 0–100 scale while readings are 20–120.** `updateHistoryChart` maps `value / 100 * height` (`app.js:892`, `915`) and threshold lines `threshold / 100` (`app.js:861`, `868`), but `calculateDB` returns 20–120. _Consequence:_ readings above 100 clip off the top of the chart; the chart's vertical scale silently disagrees with the thermometer/visualizer (which use 20–120).
- **[Low][Fact] Swallowed exceptions.** Multiple empty `catch(e) {}` blocks discard errors silently (`app.js:167`, `182`, `192`, `1450`). _Consequence:_ a corrupted `localStorage` value or unexpected failure vanishes with no console trace, making field debugging harder. (Note: this is a deliberate, documented pattern in the skill doc — acceptable for non-critical persistence, but at least a `console.warn` would help.)
- **[Low][Fact] Keyboard-shortcut guard is too narrow.** `keydown` returns only when `e.target.tagName === 'INPUT'` (`app.js:1889`). _Consequence:_ a future `<textarea>` or `contenteditable` would have single-key shortcuts (`f`, `r`, `t`, …) fire mid-typing. Currently only `<input>` elements exist, so this is latent, not active.

### Security

Healthy overall for a static, backend-less, dependency-free client app.
- **[Low][Fact] Deploy uploads the entire repo root.** `deploy.yml:33` sets `path: .`, publishing `.github/` and `.claude/` to the public site. _Consequence:_ minor information exposure (the skill doc and workflow become publicly fetchable). No secrets are present, so impact is low, but narrowing the artifact is cheap.
- **[Low][Fact] No Content-Security-Policy / security headers.** No CSP meta tag; inline handlers and inline `<style>`-equivalent attributes would require `unsafe-inline` anyway. _Consequence:_ low risk given no external resources are loaded, but a CSP can't currently be tightened without refactoring inline handlers.
- **[Low][Judgment] Unvalidated `localStorage` settings on load.** `loadSettings` (`app.js:170-182`) applies stored values straight to range inputs without validation. Browser range inputs clamp out-of-range values, so exploit risk is negligible; flagged only for completeness.
- **No hardcoded secrets, no injection sinks, no unsafe deserialization, no auth surface, no third-party runtime dependencies.** `innerHTML` is used only with static/internal data (`app.js:1595` achievements, `app.js:522` SVG strings), never with user input. **This dimension is essentially clean.**

### Testing

- **[High][Fact] No tests of any kind.** No `package.json`, no test files, no test runner (verified by search). _Consequence:_ there is no safety net; the pure, testable logic (`calculateDB`, `getGrade`, calibration median math `app.js:1811-1817`, `dbToVisualizerTop`/`visualizerTopToDb`) is unverified, and any refactor of the god file risks silent regressions. This is the highest-leverage gap to close before structural work.

### Performance

- **[High][Fact] Canvas is reallocated and re-scaled every animation frame.** `updateHistoryChart` sets `historyCanvas.width`/`.height` and calls `ctx.scale(dpr,dpr)` on every frame (`app.js:845-848`), then redraws the full gradient fill + stroke path over up to 120 points (`app.js:880-923`) ~60×/sec. _Consequence:_ unnecessary GC churn and layout cost; on low-end classroom devices this is the most likely source of jank. The canvas only needs resizing on actual resize events.
- **[Medium][Fact] `getByteFrequencyData` is called twice per frame.** Once in `calculateDB` (`app.js:665`) and again in `updateVisualizer` (`app.js:705`). _Consequence:_ redundant work each frame; one shared read would suffice.
- **[Low][Judgment] Full DOM rebuild of the event log on each entry.** `renderLog` clears and rebuilds up to 60 rows via `innerHTML='' ` + element creation (`app.js:1170-1191`) whenever a (throttled) entry is added. Throttling (3s, `app.js:1136`) keeps this from being per-frame, so impact is modest, but it's avoidable churn.

### Dependencies

- **[Strength] Zero runtime dependencies, zero dev dependencies, no lockfile to rot.** Nothing to patch for CVEs, no supply-chain surface, no license-compatibility risk. For a project of this scope this is a feature, not a gap. The only "dependencies" are pinned GitHub Actions (`actions/checkout@v4`, `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4`), all current.

### DevEx & operations

- **[High][Fact] No linting, formatting, or CI quality gate.** The only workflow is deploy (`deploy.yml`); nothing validates HTML/JS/CSS before it ships to `main`. _Consequence:_ style drift and trivial errors (typos, unused vars, broken references) can reach production unchecked.
- **[Medium][Fact] No local dev tooling documented as runnable.** There's no `package.json` script or documented one-liner to serve locally; the skill doc explains the HTTPS/localhost mic constraint (`noise-monitor-dev.md:215`) but onboarding relies on tribal knowledge.
- **[Low][Judgment] Observability is console-only.** Errors go to `console.error`/`warn` at best (and are sometimes swallowed). Acceptable for a client tool, but there's no way to know if real users hit mic errors.

### Documentation

- **[High][Fact] No README.** A first-time visitor to the repo gets no project description, no setup/run instructions, no feature list, no live URL. _Consequence:_ poor onboarding and discoverability for a project clearly intended to be used and possibly shared with other teachers.
- **[Low][Fact] Skill doc references nonexistent docs.** `noise-monitor-dev.md` is excellent and accurate, but the audit task's expectation of README/CONTRIBUTING/ADRs finds none. The skill doc's line-count reference ("~1950 lines") is accurate to the current `app.js`.

### Strengths (preserve these)

- **Microphone error handling is genuinely good** — per-error-name messaging, Safari-specific step-by-step guidance, browser-support check (`app.js:386-451`).
- **Correct teardown of audio resources** — stops all tracks and closes the `AudioContext` on stop (`app.js:585-597`), avoiding the common "mic stays hot" bug.
- **Defensive persistence** — every `localStorage` access is wrapped, with explicit `QuotaExceededError` recovery that halves and retries (`app.js:1493-1500`).
- **XSS-safe user-data rendering** — class name and session history use `textContent`/`createElement`, never `innerHTML` (`app.js:1446`, `1526-1540`).
- **Sensible DOM performance hygiene** in places — cached visualizer bars + `DocumentFragment` on init (`app.js:196-215`), cached element references at top.
- **Accessibility basics present** — `aria-label`s on controls, `aria-live="polite"` on status (`index.html:346`), `role="dialog"`/`aria-modal` on the shortcuts modal (`index.html:149`).
- **The skill doc is a real asset** — accurate architecture summary, extension recipes, and gotchas that match the code.

---

## Phase 3 — Improvement Strategy

**Theme 1 — There is no safety net.** _(explains the testing, CI, and lint findings.)_
Target state: pure logic is unit-tested and CI fails on lint/format/test errors before
anything reaches `main`. Principle: _make change safe before making change easy._ This
must come first because every other improvement (especially splitting the god file)
is risky without it.

**Theme 2 — One file, one global namespace.** _(explains the god-file, coupling, and
inline-handler findings.)_ Target state: `app.js` is decomposed into cohesive units
(audio, rendering, stats/grading, persistence, UI wiring), ideally behind a tiny
zero-config build or native ES modules, with event listeners replacing inline
`onclick`s. Principle: _bounded contexts and explicit dependencies over shared global
state._ Trade-off note below.

**Theme 3 — Duplicated/derived numbers can drift.** _(explains the duplicated dB
formula, the dual colour mappings, the 0–100 vs 20–120 scale mismatch.)_ Target state:
one source of truth for the dB formula, the dB range constants, and the
level→colour/label mapping, consumed by every display. Principle: _single source of
truth for domain math._

**Theme 4 — Invisible to newcomers.** _(explains the README/onboarding/observability
findings.)_ Target state: a README with purpose, live URL, run instructions, and
feature list; the deploy artifact scoped to only the files the site needs. Principle:
_a project meant to be used should be runnable and understandable in five minutes._

**Explicitly NOT recommending (and why):**
- **A heavyweight framework (React/Vue/Svelte) or bundler toolchain.** Effort/payoff is poor for a single-screen app with no routing or shared component reuse; it would fight the project's "no build, serve-as-is" culture. A _tiny_ optional build (esbuild) is the ceiling I'd suggest, and only if Theme 2 is pursued.
- **A backend, accounts, or telemetry service.** The privacy story ("nothing leaves the device") is a feature for a classroom tool; adding a server would create real security/compliance obligations under an education context for near-zero user benefit.
- **Exhaustive E2E browser-matrix testing.** Disproportionate for a hobby/edu tool; smoke-level manual testing + unit tests on pure logic is the right altitude.
- **Calibrating to real-world SPL dB.** The skill doc is explicit that the scale is relative, not true dB. Pursuing true calibration is a research project with low payoff for the stated use.

**Definition of done (measurable signals):**
- CI runs on every PR and **fails** on lint, format, or test errors.
- Unit tests exist and pass for `calculateDB`, `getGrade`, calibration median math, and the dB↔pixel conversions; these core functions have ≥80% line coverage.
- Zero Critical findings; the two High-severity correctness/perf items (canvas-per-frame, duplicated dB formula) are resolved.
- A README exists and a new contributor can serve and run the app locally from its instructions alone.
- The dB formula, dB range, and level→colour mapping each exist in exactly one place.

---

## Phase 4 — Task Plan

### Quick wins (high impact, S effort — do immediately)

- **QW1 — Add a README.** Purpose, live URL, run-locally instructions, feature list, privacy note. _(addresses High doc gap; S)_
- **QW2 — Scope the deploy artifact.** Stop publishing `.github/` and `.claude/`. _(addresses Low security; S)_
- **QW3 — De-duplicate the dB formula.** Extract `rmsToDb(rms, sensitivity)` and call it from both `calculateDB` and the calibration sampler. _(addresses High code-quality; S)_
- **QW4 — Fix the history-chart scale.** Use the shared 20–120 range constants instead of `/100`. _(addresses Medium correctness; S)_
- **QW5 — Unify the projector colour mapping** with `updateNoiseDisplay` so warning..alert renders the same level on both screens. _(addresses Medium correctness; S)_

### Milestone 0 — Safety net (do before any refactor)

| # | Title | Files/areas | Acceptance criteria | Effort | Change risk | Depends on |
|---|-------|-------------|---------------------|--------|-------------|------------|
| T0.1 | Introduce minimal tooling (`package.json` + ESLint + Prettier, dev-only) | new `package.json`, config files | `npm run lint` and `npm run format:check` work; no runtime deps added | M | Low | — |
| T0.2 | Extract pure logic to a testable surface | `app.js` (no behavior change) | `calculateDB`/`rmsToDb`, `getGrade`, calibration median, dB↔px are importable/callable in isolation | M | Medium | T0.1 |
| T0.3 | Add unit tests for pure logic | new `*.test.js` | Tests cover the functions in T0.2; ≥80% line coverage on them; all pass | M | Low | T0.2 |
| T0.4 | Add CI workflow (lint + format + test) | new `.github/workflows/ci.yml` | CI runs on PRs and **fails** on any lint/format/test error | S | Low | T0.1, T0.3 |

### Milestone 1 — Critical/correctness fixes

| # | Title | Files/areas | Acceptance criteria | Effort | Change risk | Depends on |
|---|-------|-------------|---------------------|--------|-------------|------------|
| T1.1 | De-duplicate dB formula (QW3) | `app.js:673-674`, `1794` | One `rmsToDb` used in both paths; calibration & live agree; covered by test | S | Low | T0.2 |
| T1.2 | Fix history-chart vertical scale (QW4) | `app.js:861,868,892,915` | Chart uses 20–120 range; 100–120 readings no longer clip | S | Low | — |
| T1.3 | Unify projector colour/label mapping (QW5) | `app.js:714-770`, `1654-1662` | Identical level → identical colour/label on both displays; one shared mapping fn | S | Low | T0.2 |
| T1.4 | Make `getGrade` honest about `avgDb` | `app.js:1305-1315` | Either incorporate `avgDb` into scoring (documented) or remove the unused param; covered by test | S | Medium | T0.3 |

### Milestone 2 — High-leverage improvements

| # | Title | Files/areas | Acceptance criteria | Effort | Change risk | Depends on |
|---|-------|-------------|---------------------|--------|-------------|------------|
| T2.1 | Stop reallocating the canvas every frame | `app.js:845-848` | Canvas resized only on resize event; per-frame path only clears+draws; visible jank reduced | M | Medium | T0.3 |
| T2.2 | Single `getByteFrequencyData` read per frame | `app.js:665,705` | One read shared by dB calc + visualizer; output unchanged | S | Low | T0.3 |
| T2.3 | Split `app.js` into cohesive sections/modules | `app.js`, `index.html` | Logical modules (audio/render/stats/persistence/ui); behavior unchanged; tests still green | L | High | T0.3, T2.* |
| T2.4 | Replace inline `onclick`s with delegated listeners | `index.html`, `app.js` | No inline handlers remain; all controls work; enables future CSP | L | High | T2.3 |

### Milestone 3 — Quality & polish

| # | Title | Files/areas | Acceptance criteria | Effort | Change risk | Depends on |
|---|-------|-------------|---------------------|--------|-------------|------------|
| T3.1 | Broaden keyboard-shortcut guard | `app.js:1889` | Shortcuts suppressed for `<textarea>`/`contenteditable` too | S | Low | — |
| T3.2 | Log (don't swallow) caught errors | `app.js:167,182,192,1450` | Non-fatal `catch` blocks `console.warn` instead of being empty | S | Low | — |
| T3.3 | Add a CSP meta tag | `index.html` | CSP present and app fully functional (after T2.4 if `unsafe-inline` is to be dropped) | S | Medium | T2.4 |
| T3.4 | Modal focus management | `index.html`, `app.js` | Open modals trap focus and restore it on close; `role="dialog"` on all modals | M | Low | — |

### Implementation sketches — top 3 tasks

**T0.2 — Extract pure logic to a testable surface.**
_Approach:_ Identify the genuinely pure functions — `rmsToDb` (new, factored from
`calculateDB`), `getGrade`, the calibration median/threshold derivation
(`app.js:1811-1817`), and `dbToVisualizerTop`/`visualizerTopToDb`
(`app.js:218-238`). Move them into a section (or a `logic.js` if you adopt modules)
that has no DOM dependency. _Key steps:_ (1) pass thresholds/sensitivity as
arguments instead of reading the DOM inside the function; (2) keep the DOM-reading
wrappers in place calling the pure core, so existing callers don't change; (3)
expose them for tests. _Gotchas:_ several of these currently read `*El.value` from
the DOM directly — that coupling is exactly what blocks testing, so the refactor's
whole point is to lift those reads to the call site. Do this with tests written
immediately after (T0.3) so the extraction is verified, not assumed.

**T2.1 — Stop reallocating the canvas every frame.**
_Approach:_ Separate sizing from drawing. _Key steps:_ (1) create a
`resizeHistoryCanvas()` that sets `canvas.width/height` and applies the DPR scale,
called once on init and on `window` resize (a resize handler already exists at
`app.js:1949`); (2) in the per-frame `updateHistoryChart`, only `clearRect` + draw —
do not touch `canvas.width` or call `ctx.scale`. _Gotchas:_ setting `canvas.width`
resets the context transform, which is currently the (accidental) reason the
repeated `scale(dpr,dpr)` doesn't compound; once you stop resizing per frame, apply
the DPR scale once in the resize function and `clearRect` in device-independent
units. Verify on a HiDPI display that lines stay crisp and don't blur or double-scale.

**T2.3 — Split `app.js` into cohesive sections/modules.**
_Approach:_ Incremental, behavior-preserving. _Key steps:_ (1) first introduce clear
section banners and group globals by concern (the file already has `====` banners —
formalize them); (2) then, if adopting ES modules, add a minimal esbuild step and an
explicit init module, converting inline `onclick`s (T2.4) since `type="module"`
breaks global handlers (the skill doc warns about this at
`noise-monitor-dev.md:220-223`); (3) keep tests green at every step. _Gotchas:_ the
biggest hazard is the ~40 shared globals and the many functions that mutate them
across module boundaries — extract leaf concerns first (persistence, grading), leave
the tightly-coupled monitoring lifecycle for last, and never do this without the
Milestone-0 tests in place. This is High-risk; treat it as XL if module conversion
+ handler rewiring are bundled — split it.

---

## Open Questions (need a human decision)

1. **Build step — yes or no?** The project's identity is "no build, serve as-is." Splitting `app.js` into ES modules and dropping inline handlers (T2.3/T2.4) is far cleaner _with_ a tiny build (esbuild). Is introducing a minimal build acceptable, or must the repo stay buildless? This gates the ceiling of Theme 2.
2. **Should `getGrade` factor in average loudness?** Today it ignores `avgDb` entirely (T1.4). Is grading purely on quiet-% + alerts the intended pedagogy, or should sustained-moderate sessions be penalized?
3. **Projector vs main-display colour mismatch — which is correct?** Should the warning..alert band read yellow (main) or red (projector)? Need the intended classroom semantics before unifying (T1.3).
4. **Is sharing/onboarding a goal?** If other teachers are meant to use or fork this, the README (QW1) and possibly a short demo become higher priority. If it's purely personal, docs can stay lightweight.
5. **Performance target / device floor.** What's the weakest device this must run smoothly on (old classroom Chromebooks, interactive whiteboards)? This sets how aggressively to pursue T2.1/T2.2.

---

### Review coverage note
The repo is small enough that **all source files were read in full** — `index.html`,
`app.js`, `styles.css`, the deploy workflow, `.gitignore`, and the skill doc. No area
received only light review. CSS was reviewed for structure and the class references
used by JS (ambient/projector/history classes confirmed present); it was not audited
line-by-line for unused selectors, which would be a low-value Milestone-3 cleanup at most.
