// ==================== State ====================
let isMonitoring = false;
let audioContext = null;
let analyser = null;
let microphone = null;
let dataArray = null;
let micPermissionGranted = false;
let animationId = null;
let sessionStartTime = null;
let sessionTimerId = null;

// Stats tracking
let readings = [];
let maxReading = 0;
let alertCount = 0;
let quietReadings = 0;
let totalReadings = 0;

// History
let historyData = [];
const maxHistoryPoints = 120;

// Challenge
let challengeActive = false;
let challengeDuration = 30;
let challengeRemaining = 30;
let challengeTimerId = null;
let challengeSuccess = true;

// Star / quiet streak system
let quietStreakSeconds = 0;
let quietStreakTimer = null;
let starsEarned = 0;
const STAR_INTERVAL = 10; // seconds of quiet per star

// Event log
let eventLog = [];        // { time, db, level, sessionElapsed }
let lastLoggedLevel = null;
let logThrottleTime = 0;

// Target level (set by clicking visualizer)
let targetDb = null;

// Countdown timer
let countdownMins = 10;
let countdownRemaining = 0;
let countdownTotal = 0;
let countdownTimerId = null;
let countdownActive = false;

// Trend tracking
let recentReadings = [];
const TREND_WINDOW = 30;

// Class name
let className = '';

// Ambient colour mode
let ambientMode = false;
let smoothedDb = 40; // exponential moving average for display

// Session history (persisted)
let sessionHistory = [];
const MAX_HISTORY = 10;

// Achievements
const ACHIEVEMENTS = [
  { id: 'first_session',   icon: '🎓', name: 'First Session',   desc: 'Completed your first monitoring session' },
  { id: 'grade_a',         icon: '🌟', name: 'Gold Standard',    desc: 'Achieved an A grade session' },
  { id: 'five_sessions',   icon: '📅', name: '5 Sessions',       desc: 'Completed 5 sessions' },
  { id: 'ten_sessions',    icon: '🔟', name: 'Dedicated',        desc: 'Completed 10 sessions' },
  { id: 'zero_alerts',     icon: '🔕', name: 'Silent Mode',      desc: 'A full session with zero noise alerts' },
  { id: 'all_stars',       icon: '⭐', name: 'Star Collector',   desc: 'Earned all 5 stars in a session' },
  { id: 'quiet_master',    icon: '🤫', name: 'Quiet Master',     desc: '80%+ quiet time in a session' },
  { id: 'consistent',      icon: '📊', name: 'Consistent',       desc: '3 consecutive B+ grade sessions' },
];
let unlockedAchievements = new Set();

// Escalating alert system
let alertStage = 0;           // 0=none, 1=warn, 2=alarm, 3=critical
let alertStageSince = 0;      // timestamp of when current stage started
let loudFrameCount = 0;       // consecutive loud frames

// Calibration
let calActive = false;
let calReadings = [];
let calTimerId = null;
let calResult = null;
let calSecs = 10;

// Projector mode
let projectorOpen = false;

// Presets
const presets = {
  custom: { quiet: 40, warning: 60, alert: 75, sensitivity: 1.5 },
  library: { quiet: 30, warning: 45, alert: 55, sensitivity: 2.0 },
  groupwork: { quiet: 50, warning: 65, alert: 80, sensitivity: 1.2 },
  presentation: { quiet: 35, warning: 50, alert: 65, sensitivity: 1.8 },
  testing: { quiet: 25, warning: 40, alert: 50, sensitivity: 2.5 }
};

// ==================== DOM Elements ====================
const dbValueEl = document.getElementById('dbValue');
const statusTextEl = document.getElementById('statusText');
const characterEl = document.getElementById('character');
const noiseCircleEl = document.getElementById('noiseCircle');
const visualizerEl = document.getElementById('visualizer');
const alertOverlayEl = document.getElementById('alertOverlay');
const startBtn = document.getElementById('startBtn');
const btnText = document.getElementById('btnText');
const btnIcon = document.getElementById('btnIcon');
const progressCircle = document.getElementById('progressCircle');

// Target + average elements
const targetLineEl    = document.getElementById('targetLine');
const targetLabelEl   = document.getElementById('targetLabel');
const avgLineEl       = document.getElementById('avgLine');
const avgLineLabelEl  = document.getElementById('avgLineLabel');
const avgBadgeValueEl = document.getElementById('avgBadgeValue');
const avgBarFillEl    = document.getElementById('avgBarFill');
const avgBadgeSubEl   = document.getElementById('avgBadgeSub');
const avgGapValueEl   = document.getElementById('avgGapValue');

// New feature elements
const trendArrowEl    = document.getElementById('trendArrow');
const countdownBarEl  = document.getElementById('countdownBar');
const countdownClockEl= document.getElementById('countdownClock');
const countdownFillEl = document.getElementById('countdownFill');
const fsAvgValueEl    = document.getElementById('fsAvgValue');
const fsAvgGapEl      = document.getElementById('fsAvgGap');

// Settings elements
const sensitivityEl = document.getElementById('sensitivity');
const quietThresholdEl = document.getElementById('quietThreshold');
const warningThresholdEl = document.getElementById('warningThreshold');
const alertThresholdEl = document.getElementById('alertThreshold');
const soundAlertsEl = document.getElementById('soundAlerts');
const visualAlertsEl = document.getElementById('visualAlerts');

// Stats elements
const avgLevelEl = document.getElementById('avgLevel');
const maxLevelEl = document.getElementById('maxLevel');
const quietTimeEl = document.getElementById('quietTime');
const alertCountEl = document.getElementById('alertCount');
const sessionTimeEl = document.getElementById('sessionTime');

// History canvas
const historyCanvas = document.getElementById('historyCanvas');
const historyCtx = historyCanvas ? historyCanvas.getContext('2d') : null;
let _histCanvasW = 0, _histCanvasH = 0, _histCanvasDpr = 0;

// Alert timing
let lastAlertTime = 0;

// ==================== Settings Persistence ====================
function saveSettings() {
  try {
    localStorage.setItem('cnm_settings', JSON.stringify({
      sensitivity: sensitivityEl.value,
      quietThreshold: quietThresholdEl.value,
      warningThreshold: warningThresholdEl.value,
      alertThreshold: alertThresholdEl.value,
      soundAlerts: soundAlertsEl.checked,
      visualAlerts: visualAlertsEl.checked,
      targetDb: targetDb
    }));
  } catch(e) {
    console.warn('Failed to save settings to localStorage:', e);
  }
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('cnm_settings') || '{}');
    if (s.sensitivity)       sensitivityEl.value       = Math.max(0.5, Math.min(3, parseFloat(s.sensitivity) || 1.5));
    if (s.quietThreshold)    quietThresholdEl.value    = Math.max(20, Math.min(60, parseInt(s.quietThreshold) || 40));
    if (s.warningThreshold)  warningThresholdEl.value  = Math.max(40, Math.min(80, parseInt(s.warningThreshold) || 60));
    if (s.alertThreshold)    alertThresholdEl.value    = Math.max(50, Math.min(100, parseInt(s.alertThreshold) || 75));
    if (s.soundAlerts !== undefined) soundAlertsEl.checked = s.soundAlerts;
    if (s.visualAlerts !== undefined) visualAlertsEl.checked = s.visualAlerts;
    if (s.targetDb !== null && s.targetDb !== undefined) {
      setTimeout(() => setTargetDb(s.targetDb), 50);
    }
  } catch(e) {
    console.warn('Failed to load settings from localStorage:', e);
  }

  // Class name
  try {
    const cn = localStorage.getItem('cnm_className') || '';
    if (cn) {
      className = cn;
      const classNameDisplay = document.getElementById('classNameDisplay');
      const fsClassName = document.getElementById('fsClassName');
      if (classNameDisplay) classNameDisplay.textContent = cn;
      if (fsClassName) fsClassName.textContent = cn;
    }
  } catch(e) {
    console.warn('Failed to load class name from localStorage:', e);
  }

  // Theme preference
  try {
    if (localStorage.getItem('cnm_theme') === 'light') {
      document.body.classList.add('theme-light');
    }
  } catch(e) { console.warn('Failed to load theme preference:', e); }

  // Active preset tab highlight (values already loaded from settings above)
  try {
    const savedPreset = localStorage.getItem('cnm_preset') || 'custom';
    document.querySelectorAll('.preset-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.preset === savedPreset);
    });
  } catch(e) { console.warn('Failed to load preset preference:', e); }
}

// Cached visualizer bar elements — populated by initVisualizer()
let cachedBars = [];

// ==================== Initialize ====================
function initVisualizer() {
  visualizerEl.innerHTML = '';
  const barCount = 80;
  const fragment = document.createDocumentFragment();
  cachedBars = [];
  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = '4px';
    cachedBars.push(bar);
    fragment.appendChild(bar);
  }
  visualizerEl.appendChild(fragment);
  // Re-append overlay elements after clearing (they were wiped by innerHTML='')
  visualizerEl.appendChild(targetLineEl);
  visualizerEl.appendChild(avgLineEl);
}

// ==================== Target Level (Visualizer Click) ====================
function dbToVisualizerTop(db) {
  // Visualizer maps 20–120 dB range bottom→top within the 140px height (minus 30px padding)
  // Bars grow from bottom; 0% height = bottom, 100% = top
  // The container is 140px total, padding 15px top+bottom leaves 110px usable
  const containerH = visualizerEl.offsetHeight;           // 140
  const pad = 15;
  const usable = containerH - pad * 2;                    // 110
  const minDb = 20, maxDb = 120;
  const frac = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
  // frac=0 → bottom (top = containerH - pad), frac=1 → top (top = pad)
  return containerH - pad - frac * usable;
}

function visualizerTopToDb(topPx) {
  const containerH = visualizerEl.offsetHeight;
  const pad = 15;
  const usable = containerH - pad * 2;
  const minDb = 20, maxDb = 120;
  const frac = 1 - Math.max(0, Math.min(usable, topPx - pad)) / usable;
  return Math.round(minDb + frac * (maxDb - minDb));
}

function setTargetDb(db) {
  targetDb = Math.max(20, Math.min(120, db));
  const topPx = dbToVisualizerTop(targetDb);
  targetLineEl.style.top = topPx + 'px';
  targetLabelEl.textContent = `Target: ${targetDb} dB`;
  targetLineEl.style.display = 'block';
  updateAvgBadge();
}

visualizerEl.addEventListener('click', function(e) {
  // Get Y position relative to the visualizer container
  const rect = visualizerEl.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const db = visualizerTopToDb(offsetY);
  setTargetDb(db);
  showToast(`🎯 Target set to ${db} dB`, 'info', 1800);
});

// ==================== Average Badge Update ====================
function updateAvgBadge(avg) {
  if (avg === undefined) {
    // called without arg — use last known or skip
    if (readings.length === 0) return;
    avg = Math.round(readings.reduce((a, b) => a + b, 0) / readings.length);
  }

  avgBadgeValueEl.textContent = avg;

  // Bar fill: show avg relative to 120 dB max
  const fillPct = Math.min(100, Math.round((avg / 120) * 100));
  avgBarFillEl.style.width = fillPct + '%';

  // Colour the bar based on thresholds
  const qt = parseInt(quietThresholdEl.value);
  const wt = parseInt(warningThresholdEl.value);
  if (avg < qt) {
    avgBarFillEl.style.background = 'linear-gradient(90deg, var(--color-primary), var(--color-quiet))';
    avgBadgeSubEl.textContent = `Below quiet threshold (${qt} dB) — great session!`;
  } else if (avg < wt) {
    avgBarFillEl.style.background = 'linear-gradient(90deg, var(--color-primary), var(--color-moderate))';
    avgBadgeSubEl.textContent = `Moderate — aim below ${qt} dB for a quiet session`;
  } else {
    avgBarFillEl.style.background = 'linear-gradient(90deg, var(--color-moderate), var(--color-loud))';
    avgBadgeSubEl.textContent = `Above warning threshold (${wt} dB) — too noisy`;
  }

  // Update avg overlay line on visualizer
  avgLineEl.style.display = 'block';
  avgLineEl.style.top = dbToVisualizerTop(avg) + 'px';
  avgLineLabelEl.textContent = `Avg: ${avg} dB`;

  // Gap vs target
  if (targetDb !== null) {
    const gap = avg - targetDb;
    const gapAbs = Math.abs(gap);
    const sign = gap > 0 ? '+' : gap < 0 ? '−' : '';
    avgGapValueEl.textContent = `${sign}${gapAbs} dB`;
    if (gapAbs <= 2) {
      avgGapValueEl.className = 'avg-target-gap-value gap-on';
    } else if (gap < 0) {
      avgGapValueEl.className = 'avg-target-gap-value gap-under';
    } else {
      avgGapValueEl.className = 'avg-target-gap-value gap-over';
    }
    // Fullscreen overlay
    fsAvgValueEl.textContent = avg;
    fsAvgGapEl.textContent = `${sign}${gapAbs} dB vs target`;
    fsAvgGapEl.style.color = gapAbs <= 2 ? 'var(--color-moderate)' : gap < 0 ? 'var(--color-quiet)' : 'var(--color-loud)';
  } else {
    avgGapValueEl.textContent = 'No target';
    avgGapValueEl.className = 'avg-target-gap-value';
    fsAvgValueEl.textContent = avg;
    fsAvgGapEl.textContent = 'No target set';
    fsAvgGapEl.style.color = 'var(--color-text-muted)';
  }
}

function updateSettingsDisplay() {
  document.getElementById('sensitivityValue').textContent = parseFloat(sensitivityEl.value).toFixed(1) + 'x';
  document.getElementById('quietValue').textContent = quietThresholdEl.value + ' dB';
  document.getElementById('warningValue').textContent = warningThresholdEl.value + ' dB';
  document.getElementById('alertValue').textContent = alertThresholdEl.value + ' dB';

  updateSliderTrack(sensitivityEl);
  updateSliderTrack(quietThresholdEl);
  updateSliderTrack(warningThresholdEl);
  updateSliderTrack(alertThresholdEl);

  // Ensure thresholds are logical
  const quiet = parseInt(quietThresholdEl.value);
  const warning = parseInt(warningThresholdEl.value);
  const alert = parseInt(alertThresholdEl.value);

  if (warning <= quiet) {
    warningThresholdEl.value = quiet + 5;
    document.getElementById('warningValue').textContent = warningThresholdEl.value + ' dB';
  }
  if (alert <= warning) {
    alertThresholdEl.value = parseInt(warningThresholdEl.value) + 5;
    document.getElementById('alertValue').textContent = alertThresholdEl.value + ' dB';
  }
}

// Slider fill-track: shows filled portion as a tinted gradient on the track
function updateSliderTrack(el) {
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 100;
  const pct = Math.round(((parseFloat(el.value) - min) / (max - min)) * 100);
  el.style.setProperty('--slider-fill', pct + '%');
}

// Switches preset tab highlight to "Custom" when a slider is touched manually
function onSliderChange() {
  updateSettingsDisplay();
  saveSettings();
  document.querySelectorAll('.preset-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.preset === 'custom');
  });
  try { localStorage.setItem('cnm_preset', 'custom'); } catch(e) { console.warn('Failed to save preset:', e); }
}

sensitivityEl.addEventListener('input', onSliderChange);
quietThresholdEl.addEventListener('input', onSliderChange);
warningThresholdEl.addEventListener('input', onSliderChange);
alertThresholdEl.addEventListener('input', onSliderChange);
soundAlertsEl.addEventListener('change', saveSettings);
visualAlertsEl.addEventListener('change', saveSettings);

// Challenge duration buttons
document.querySelectorAll('.duration-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.duration-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    challengeDuration = parseInt(btn.dataset.duration) || challengeDuration;
    challengeRemaining = challengeDuration;
    updateChallengeDisplay();
  });
});

// Countdown chip buttons
document.querySelectorAll('.countdown-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.countdown-chip').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const parsedMins = parseInt(btn.dataset.mins);
    countdownMins = parsedMins > 0 ? parsedMins : countdownMins;
  });
});

// ==================== Modal ====================
function showPermissionModal() {
  document.getElementById('permissionModal').classList.add('active');
}

function closeModal() {
  document.getElementById('permissionModal').classList.remove('active');
}

function showErrorModal(title, message) {
  document.getElementById('errorModalTitle').textContent = title;
  document.getElementById('errorModalMessage').textContent = message;
  document.getElementById('errorModal').classList.add('active');
}

function closeErrorModal() {
  document.getElementById('errorModal').classList.remove('active');
}

async function requestMicrophoneAccess() {
  closeModal();

  // Check if getUserMedia is supported
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showErrorModal(
      'Browser Not Supported',
      'Your browser does not support microphone access. Please try using Chrome, Firefox, Edge, or Safari 11+.'
    );
    return;
  }

  try {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    await initAudio(stream);
    micPermissionGranted = true;
    startMonitoring();

  } catch (err) {
    console.error('Microphone access error:', err);

    let title = 'Microphone Access Denied';
    let message = '';

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      // Check if Safari
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

      if (isSafari) {
        title = 'Safari Permission Required';
        message = 'To enable microphone access in Safari:\n\n' +
          '1. Click Safari menu → Settings (or Preferences)\n' +
          '2. Go to "Websites" tab\n' +
          '3. Click "Microphone" in the left sidebar\n' +
          '4. Find this website and select "Allow"\n' +
          '5. Refresh this page and try again\n\n' +
          'Also check: System Preferences → Security & Privacy → Privacy → Microphone → Enable Safari';
      } else {
        message = 'Microphone permission was denied. Please click the camera/microphone icon in your browser\'s address bar and allow access, then try again.';
      }
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      title = 'No Microphone Found';
      message = 'No microphone was detected on your device. Please connect a microphone and try again.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      title = 'Microphone In Use';
      message = 'Your microphone may be in use by another application. Please close other apps using the microphone and try again.';
    } else if (err.name === 'OverconstrainedError') {
      title = 'Microphone Error';
      message = 'Could not access microphone with required settings. Please try again.';
    } else if (err.name === 'SecurityError') {
      title = 'Security Error';
      message = 'Microphone access was blocked due to security restrictions. Make sure you are accessing this page via HTTPS.';
    } else {
      message = 'An unexpected error occurred while accessing the microphone: ' + err.message;
    }

    showErrorModal(title, message);
  }
}

// ==================== Audio ====================
async function initAudio(stream) {
  // Create AudioContext (Safari uses webkitAudioContext)
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContextClass();

  // Safari and some browsers start AudioContext in suspended state
  // We need to resume it after a user gesture
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (e) {
      console.warn('Could not resume AudioContext:', e);
    }
  }

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;

  microphone = audioContext.createMediaStreamSource(stream);
  microphone.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  // Store stream reference for cleanup
  audioContext._stream = stream;
}

// ==================== Monitoring ====================
async function toggleMonitoring() {
  if (!isMonitoring) {
    if (!audioContext) {
      // Skip modal if permission already granted in this page session
      if (micPermissionGranted) {
        await requestMicrophoneAccess();
      } else {
        showPermissionModal();
      }
    } else {
      await startMonitoring();
    }
  } else {
    stopMonitoring();
  }
}

async function startMonitoring() {
  // Ensure AudioContext is running (Safari requirement)
  if (audioContext && audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (e) {
      console.warn('Could not resume AudioContext:', e);
    }
  }

  // Reset per-session transient state
  smoothedDb = 40;
  recentReadings = [];
  trendFrameCount = 0;

  isMonitoring = true;
  startBtn.classList.remove('inactive');
  startBtn.classList.add('active');
  btnText.textContent = 'Stop Monitoring';
  startBtn.setAttribute('aria-label', 'Stop monitoring');
  btnIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" fill="currentColor"></rect><rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>';
  noiseCircleEl.classList.add('monitoring');

  // Show challenge section
  document.getElementById('challengeSection').classList.add('active');

  // Start session timer
  sessionStartTime = Date.now();
  sessionTimerId = setInterval(updateSessionTime, 1000);

  updateLoop();
}

function stopMonitoring() {
  isMonitoring = false;

  // Reset escalating alert state
  clearAlertStage();

  // Save session to history if we have meaningful data
  if (readings.length > 10) {
    const quietPct = totalReadings > 0 ? Math.round((quietReadings / totalReadings) * 100) : 0;
    const avgDb = Math.round(readings.reduce((a,b)=>a+b,0) / readings.length);
    const grade = getGrade(quietPct, avgDb, alertCount);
    const elapsed = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
    const durMins = Math.floor(elapsed/60), durSecs = elapsed%60;

    // Downsample historyData for sparkline (max 20 points)
    let sparkData = historyData;
    if (sparkData.length > 20) {
      const step = Math.floor(sparkData.length / 20);
      sparkData = sparkData.filter((_, i) => i % step === 0).slice(0, 20);
    }

    const sessionData = {
      date: new Date().toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }),
      grade, avgDb, quietPct,
      duration: `${durMins}:${durSecs.toString().padStart(2,'0')}`,
      alerts: alertCount,
      className,
      sparkData,
      quietThreshold: parseInt(quietThresholdEl.value),
      warningThreshold: parseInt(warningThresholdEl.value)
    };
    saveSessionToHistory(sessionData);
    checkAchievements(sessionData);
  }
  startBtn.classList.remove('active');
  startBtn.classList.add('inactive');
  btnText.textContent = 'Start Monitoring';
  startBtn.setAttribute('aria-label', 'Start monitoring');
  btnIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
  noiseCircleEl.classList.remove('monitoring');

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (sessionTimerId) {
    clearInterval(sessionTimerId);
    sessionTimerId = null;
  }

  // Release microphone and audio resources
  if (audioContext) {
    if (audioContext._stream) {
      audioContext._stream.getTracks().forEach(track => track.stop());
    }
    if (audioContext.state !== 'closed') {
      audioContext.close().catch(e => console.warn('Error closing AudioContext:', e));
    }
    audioContext = null;
    analyser = null;
    microphone = null;
    dataArray = null;
  }

  // Stop any active challenge and countdown
  if (challengeActive) {
    stopChallenge();
  }
  if (countdownActive) {
    endCountdown(false);
  }

  // Reset display
  dbValueEl.textContent = '--';
  statusTextEl.textContent = 'Stopped';
  statusTextEl.className = 'status-text';
  characterEl.textContent = '😊';
  noiseCircleEl.className = 'noise-circle';
  alertOverlayEl.classList.remove('active');
  updateProgressRing(0);
  resetQuietStreak();

  // Reset visualizer
  cachedBars.forEach(bar => bar.style.height = '4px');
}

function resetStats() {
  if (isMonitoring) {
    showToast('Stop monitoring before resetting stats.', 'info', 2500);
    return;
  }
  if (readings.length > 0 && !confirm('Clear all session data? This cannot be undone.')) return;

  readings = [];
  maxReading = 0;
  alertCount = 0;
  quietReadings = 0;
  totalReadings = 0;
  historyData = [];
  sessionStartTime = null;

  // Reset log & streak
  eventLog = [];
  lastLoggedLevel = null;
  logThrottleTime = 0;
  resetQuietStreak();
  renderLog();

  avgLevelEl.textContent = '--';
  maxLevelEl.textContent = '--';
  quietTimeEl.textContent = '--';
  alertCountEl.textContent = '0';
  sessionTimeEl.textContent = '0:00';

  // Reset avg badge
  avgBadgeValueEl.textContent = '--';
  avgBarFillEl.style.width = '0%';
  avgBadgeSubEl.textContent = 'Start monitoring to see your average';
  avgGapValueEl.textContent = '--';
  avgGapValueEl.className = 'avg-target-gap-value';
  avgLineEl.style.display = 'none';

  // Clear history chart
  if (historyCtx && historyCanvas) {
    historyCtx.clearRect(0, 0, historyCanvas.width, historyCanvas.height);
  }
}

// ==================== Calculations ====================
function calculateDB() {
  analyser.getByteFrequencyData(dataArray);

  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i] * dataArray[i];
  }
  const rms = Math.sqrt(sum / dataArray.length);

  const sensitivity = parseFloat(sensitivityEl.value);
  const rawDb = Math.min(120, Math.max(20, (rms * sensitivity * 0.4) + 20));

  // Exponential moving average — faster rise, slower fall for natural feel
  const alpha = rawDb > smoothedDb ? 0.25 : 0.12;
  smoothedDb = smoothedDb + alpha * (rawDb - smoothedDb);

  return Math.round(smoothedDb);
}

function updateProgressRing(db) {
  const maxDb = 100;
  const percentage = Math.min(db / maxDb, 1);
  const circumference = 2 * Math.PI * 150;
  const offset = circumference * (1 - percentage);

  progressCircle.style.strokeDashoffset = offset;

  const quietThreshold = parseInt(quietThresholdEl.value);
  const warningThreshold = parseInt(warningThresholdEl.value);
  const alertThreshold = parseInt(alertThresholdEl.value);

  if (db < quietThreshold) {
    progressCircle.style.stroke = 'var(--color-quiet)';
  } else if (db < warningThreshold) {
    progressCircle.style.stroke = 'var(--color-moderate)';
  } else {
    progressCircle.style.stroke = 'var(--color-loud)';
  }
}

function updateVisualizer() {
  analyser.getByteFrequencyData(dataArray);
  const step = Math.floor(dataArray.length / cachedBars.length);

  for (let i = 0; i < cachedBars.length; i++) {
    const value = dataArray[i * step] || 0;
    cachedBars[i].style.height = Math.max(4, (value / 255) * 120) + 'px';
  }
}

function updateNoiseDisplay(db) {
  const quietThreshold = parseInt(quietThresholdEl.value);
  const warningThreshold = parseInt(warningThresholdEl.value);
  const alertThreshold = parseInt(alertThresholdEl.value);

  dbValueEl.textContent = db;
  updateProgressRing(db);

  noiseCircleEl.classList.remove('quiet', 'moderate', 'loud');
  statusTextEl.classList.remove('status-quiet', 'status-moderate', 'status-loud');

  if (db < quietThreshold) {
    noiseCircleEl.classList.add('quiet');
    statusTextEl.classList.add('status-quiet');
    statusTextEl.textContent = 'Perfect!';
    characterEl.textContent = '😊';
    quietReadings++;
    startQuietStreak();
    addLogEntry(db, 'quiet');
    updateAmbient('quiet');
  } else if (db < warningThreshold) {
    noiseCircleEl.classList.add('moderate');
    statusTextEl.classList.add('status-moderate');
    statusTextEl.textContent = 'Getting Louder';
    characterEl.textContent = '😐';
    resetQuietStreak();
    addLogEntry(db, 'moderate');
    updateAmbient('moderate');
  } else if (db < alertThreshold) {
    noiseCircleEl.classList.add('moderate');
    statusTextEl.classList.add('status-moderate');
    statusTextEl.textContent = 'Too Loud!';
    characterEl.textContent = '😬';
    resetQuietStreak();
    addLogEntry(db, 'moderate');
    updateAmbient('moderate');

    // Challenge failure if above quiet threshold
    if (challengeActive) {
      if (challengeSuccess !== false) showToast('Challenge broken — noise too high!', 'warn');
      challengeSuccess = false;
    }
  } else {
    noiseCircleEl.classList.add('loud');
    statusTextEl.classList.add('status-loud');
    statusTextEl.textContent = 'WAY TOO LOUD!';
    characterEl.textContent = '🤯';
    resetQuietStreak();
    addLogEntry(db, 'loud');
    triggerAlert();
    updateAmbient('loud');

    if (challengeActive) {
      if (challengeSuccess !== false) showToast('Challenge broken — noise too high!', 'warn');
      challengeSuccess = false;
    }
  }

  totalReadings++;
}

function triggerAlert() {
  const now = Date.now();
  if (now - lastAlertTime < 1500) return;
  lastAlertTime = now;
  alertCount++;
  alertCountEl.textContent = alertCount;

  if (visualAlertsEl.checked) {
    alertOverlayEl.classList.add('active');
    setTimeout(() => alertOverlayEl.classList.remove('active'), 800);
  }

  if (soundAlertsEl.checked && audioContext) {
    playAlertSound();
  }
}

function playAlertSound() {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
  oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.1);
  oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2);

  gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.35);
}

function updateStats(db) {
  readings.push(db);
  if (readings.length > 200) readings.shift();

  const avg = Math.round(readings.reduce((a, b) => a + b, 0) / readings.length);
  avgLevelEl.textContent = avg;

  if (db > maxReading) {
    maxReading = db;
    maxLevelEl.textContent = maxReading;
  }

  const quietPercent = totalReadings > 0 ? Math.round((quietReadings / totalReadings) * 100) : 0;
  quietTimeEl.textContent = quietPercent + '%';

  // Update prominent average badge and avg line on visualizer
  updateAvgBadge(avg);
}

function updateSessionTime() {
  if (!sessionStartTime) return;
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  sessionTimeEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateHistoryChart(db) {
  if (!historyCtx || !historyCanvas) return;

  historyData.push(db);
  if (historyData.length > maxHistoryPoints) {
    historyData.shift();
  }

  const dpr = window.devicePixelRatio || 1;
  const cssW = historyCanvas.offsetWidth;
  const cssH = historyCanvas.offsetHeight;

  if (cssW === 0 || cssH === 0) return;

  if (cssW !== _histCanvasW || cssH !== _histCanvasH || dpr !== _histCanvasDpr) {
    _histCanvasW = cssW;
    _histCanvasH = cssH;
    _histCanvasDpr = dpr;
    historyCanvas.width = cssW * dpr;
    historyCanvas.height = cssH * dpr;
    historyCtx.scale(dpr, dpr);
  }

  const width = cssW;
  const height = cssH;

  historyCtx.clearRect(0, 0, width, height);

  const quietThreshold = parseInt(quietThresholdEl.value);
  const warningThreshold = parseInt(warningThresholdEl.value);

  // Draw threshold lines
  historyCtx.setLineDash([5, 5]);

  const quietY = height - (quietThreshold / 100) * height;
  historyCtx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
  historyCtx.beginPath();
  historyCtx.moveTo(0, quietY);
  historyCtx.lineTo(width, quietY);
  historyCtx.stroke();

  const warningY = height - (warningThreshold / 100) * height;
  historyCtx.strokeStyle = 'rgba(255, 200, 0, 0.4)';
  historyCtx.beginPath();
  historyCtx.moveTo(0, warningY);
  historyCtx.lineTo(width, warningY);
  historyCtx.stroke();

  historyCtx.setLineDash([]);

  if (historyData.length < 2) return;

  // Draw gradient fill
  const gradient = historyCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(255, 50, 50, 0.3)');
  gradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.2)');
  gradient.addColorStop(1, 'rgba(0, 255, 136, 0.1)');

  const stepX = width / (maxHistoryPoints - 1);

  historyCtx.beginPath();
  historyCtx.moveTo(0, height);

  historyData.forEach((value, index) => {
    const x = index * stepX;
    const y = height - (value / 100) * height;
    historyCtx.lineTo(x, y);
  });

  historyCtx.lineTo((historyData.length - 1) * stepX, height);
  historyCtx.closePath();
  historyCtx.fillStyle = gradient;
  historyCtx.fill();

  // Draw line
  const lineGradient = historyCtx.createLinearGradient(0, 0, 0, height);
  lineGradient.addColorStop(0, '#ff3232');
  lineGradient.addColorStop(0.5, '#ffc800');
  lineGradient.addColorStop(1, '#00ff88');

  historyCtx.strokeStyle = lineGradient;
  historyCtx.lineWidth = 2.5;
  historyCtx.lineCap = 'round';
  historyCtx.lineJoin = 'round';

  historyCtx.beginPath();
  historyData.forEach((value, index) => {
    const x = index * stepX;
    const y = height - (value / 100) * height;

    if (index === 0) {
      historyCtx.moveTo(x, y);
    } else {
      historyCtx.lineTo(x, y);
    }
  });
  historyCtx.stroke();
}

// ==================== Presets ====================
function applyPreset(presetName) {
  document.querySelectorAll('.preset-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.preset === presetName);
  });

  const preset = presets[presetName];
  if (preset) {
    sensitivityEl.value = preset.sensitivity;
    quietThresholdEl.value = preset.quiet;
    warningThresholdEl.value = preset.warning;
    alertThresholdEl.value = preset.alert;
    updateSettingsDisplay();
    saveSettings();
    try { localStorage.setItem('cnm_preset', presetName); } catch(e) { console.warn('Failed to save preset:', e); }
  }
}

// ==================== Theme ====================
function toggleTheme() {
  document.body.classList.toggle('theme-light');
  try {
    localStorage.setItem('cnm_theme', document.body.classList.contains('theme-light') ? 'light' : 'dark');
  } catch(e) { console.warn('Failed to save theme preference:', e); }
}

// ==================== Fullscreen ====================
function toggleFullscreen() {
  document.body.classList.toggle('fullscreen');

  const icon = document.querySelector('#fullscreenBtn svg');
  if (document.body.classList.contains('fullscreen')) {
    icon.innerHTML = `
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
            `;
  } else {
    icon.innerHTML = `
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
            `;
  }
}

// ==================== Challenge ====================
function updateChallengeDisplay() {
  const mins = Math.floor(challengeRemaining / 60);
  const secs = challengeRemaining % 60;
  document.getElementById('challengeTimer').textContent =
    mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `0:${secs.toString().padStart(2, '0')}`;

  const progress = ((challengeDuration - challengeRemaining) / challengeDuration) * 100;
  document.getElementById('challengeProgressBar').style.width = progress + '%';
}

function toggleChallenge() {
  if (challengeActive) {
    stopChallenge();
  } else {
    startChallenge();
  }
}

function startChallenge() {
  challengeActive = true;
  challengeSuccess = true;
  challengeRemaining = challengeDuration;

  document.getElementById('challengeStartBtn').textContent = 'Cancel';
  document.getElementById('challengeStartBtn').classList.remove('start');
  document.getElementById('challengeStartBtn').classList.add('cancel');

  challengeTimerId = setInterval(() => {
    challengeRemaining--;
    updateChallengeDisplay();

    if (challengeRemaining <= 0) {
      endChallenge();
    }
  }, 1000);

  updateChallengeDisplay();
}

function stopChallenge() {
  challengeActive = false;
  if (challengeTimerId) {
    clearInterval(challengeTimerId);
  }

  document.getElementById('challengeStartBtn').textContent = 'Start Challenge';
  document.getElementById('challengeStartBtn').classList.add('start');
  document.getElementById('challengeStartBtn').classList.remove('cancel');

  challengeRemaining = challengeDuration;
  updateChallengeDisplay();
  document.getElementById('challengeProgressBar').style.width = '0%';
}

function endChallenge() {
  const succeeded = challengeSuccess;
  stopChallenge();

  const resultEl = document.getElementById('challengeResult');
  if (succeeded) {
    playSuccessSound();
    showToast('🎉 Challenge Complete! Amazing work!', 'success', 3500);
    resultEl.textContent = '✓ Completed successfully!';
    resultEl.className = 'challenge-result success';
  } else {
    showToast('😬 Challenge failed — noise too high. Try again!', 'fail', 3000);
    resultEl.textContent = '✗ Noise level exceeded the limit.';
    resultEl.className = 'challenge-result fail';
  }
  // Clear result after 6 seconds
  setTimeout(() => { resultEl.textContent = ''; resultEl.className = 'challenge-result'; }, 6000);
}

function playSuccessSound() {
  if (!audioContext) return;

  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((freq, i) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, audioContext.currentTime + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.15 + 0.3);
    osc.start(audioContext.currentTime + i * 0.15);
    osc.stop(audioContext.currentTime + i * 0.15 + 0.3);
  });
}

// ==================== Main Loop ====================
function updateLoop() {
  if (!isMonitoring) return;

  const db = calculateDB();
  updateNoiseDisplay(db);
  updateVisualizer();
  updateStats(db);
  updateHistoryChart(db);
  updateTrend(db);
  updateThermometer(db);
  updateProjector(db);
  updateEscalatingAlert(db);

  animationId = requestAnimationFrame(updateLoop);
}

// ==================== Toast ====================
function showToast(message, type = 'info', duration = 2800) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message.length > 120 ? message.slice(0, 117) + '…' : message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fadeout');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ==================== Star / Quiet Streak System ====================
function startQuietStreak() {
  if (quietStreakTimer) return;
  quietStreakTimer = setInterval(() => {
    quietStreakSeconds++;
    const newStars = Math.min(5, Math.floor(quietStreakSeconds / STAR_INTERVAL));
    if (newStars > starsEarned) {
      starsEarned = newStars;
      updateStarDisplay(starsEarned, true);
      showToast(`⭐ ${starsEarned} star${starsEarned > 1 ? 's' : ''}! Keep it quiet!`, 'info', 2000);
    } else {
      updateStarDisplay(starsEarned, false);
    }
  }, 1000);
}

function resetQuietStreak() {
  clearInterval(quietStreakTimer);
  quietStreakTimer = null;
  quietStreakSeconds = 0;
  starsEarned = 0;
  updateStarDisplay(0, false);
}

function updateStarDisplay(count, pop) {
  const stars = document.querySelectorAll('.star');
  stars.forEach((star, i) => {
    const shouldBeEarned = i < count;
    const wasEarned = star.classList.contains('earned');
    if (shouldBeEarned) {
      star.classList.add('earned');
      if (!wasEarned && pop) {
        star.classList.remove('pop');
        void star.offsetWidth; // force reflow
        star.classList.add('pop');
      }
    } else {
      star.classList.remove('earned', 'pop');
    }
  });
}

// ==================== Event Log ====================
function addLogEntry(db, level) {
  const now = Date.now();
  if (now - logThrottleTime < 3000 && level === lastLoggedLevel) return;
  logThrottleTime = now;
  lastLoggedLevel = level;

  const elapsed = sessionStartTime ? Math.floor((now - sessionStartTime) / 1000) : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  const labels = {
    quiet:    'Quiet ✓',
    moderate: 'Getting Loud',
    loud:     '🚨 Alert!'
  };

  eventLog.push({ time: new Date(), db, level, timeStr });
  if (eventLog.length > 200) eventLog.shift();

  renderLog();
}

function renderLog() {
  const list = document.getElementById('logList');
  const empty = document.getElementById('logEmpty');

  if (eventLog.length === 0) {
    empty.style.display = 'block';
    list.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  list.style.display = 'flex';

  // Build from newest first
  list.innerHTML = '';
  const recent = [...eventLog].reverse().slice(0, 60);
  recent.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'log-entry';

    const dot = document.createElement('div');
    dot.className = `log-dot ${entry.level}`;

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = entry.timeStr;

    const label = document.createElement('span');
    const map = { quiet: 'Quiet ✓', moderate: 'Getting Loud', loud: '🚨 Alert!' };
    label.textContent = `${map[entry.level] || entry.level}  —  ${entry.db} dB`;

    row.appendChild(dot);
    row.appendChild(time);
    row.appendChild(label);
    list.appendChild(row);
  });
}

// ==================== Export CSV ====================
function exportLog() {
  if (eventLog.length === 0) {
    showToast('No data to export yet. Start monitoring first!', 'info', 2500);
    return;
  }
  const lines = ['Time,Session Elapsed,dB,Level'];
  eventLog.forEach(e => {
    lines.push(`"${e.time.toLocaleTimeString()}","${e.timeStr}",${e.db},"${e.level}"`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `noise-log-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 CSV downloaded!', 'success', 2000);
}

// ==================== Trend Arrow ====================
let trendFrameCount = 0;
function updateTrend(db) {
  recentReadings.push(db);
  if (recentReadings.length > TREND_WINDOW) recentReadings.shift();
  trendFrameCount++;
  if (trendFrameCount % 8 !== 0) return; // update every ~8 frames

  if (recentReadings.length < 10) return;
  const half = Math.floor(recentReadings.length / 2);
  const oldAvg = recentReadings.slice(0, half).reduce((a,b) => a+b,0) / half;
  const newAvg = recentReadings.slice(half).reduce((a,b) => a+b,0) / (recentReadings.length - half);
  const delta = newAvg - oldAvg;

  trendArrowEl.classList.add('visible');
  if (delta > 2) {
    trendArrowEl.textContent = '↑';
    trendArrowEl.className = 'trend-arrow visible trend-up';
  } else if (delta < -2) {
    trendArrowEl.textContent = '↓';
    trendArrowEl.className = 'trend-arrow visible trend-down';
  } else {
    trendArrowEl.textContent = '→';
    trendArrowEl.className = 'trend-arrow visible trend-flat';
  }
}

// ==================== Countdown Timer ====================
function startCountdown() {
  if (countdownActive) { endCountdown(); return; }
  if (!isMonitoring) {
    showToast('Start monitoring first, then use the timer', 'info', 2500);
    return;
  }
  countdownTotal = countdownMins * 60;
  countdownRemaining = countdownTotal;
  countdownActive = true;
  countdownBarEl.classList.add('active');
  document.getElementById('countdownLabel').textContent = `Work Period — ${countdownMins} min`;
  updateCountdownDisplay();

  countdownTimerId = setInterval(() => {
    countdownRemaining--;
    updateCountdownDisplay();
    if (countdownRemaining <= 0) {
      endCountdown(true);
    }
  }, 1000);
}

function updateCountdownDisplay() {
  const remaining = countdownRemaining || 0;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  countdownClockEl.textContent = `${mins}:${secs.toString().padStart(2,'0')}`;
  const pct = countdownTotal > 0 ? (remaining / countdownTotal) * 100 : 0;
  countdownFillEl.style.width = pct + '%';
  if (remaining <= 60) {
    countdownClockEl.classList.add('urgent');
    countdownFillEl.style.background = 'linear-gradient(90deg, var(--color-loud), var(--color-moderate))';
  } else {
    countdownClockEl.classList.remove('urgent');
    countdownFillEl.style.background = 'linear-gradient(90deg, var(--color-primary), var(--color-quiet))';
  }
}

function endCountdown(natural = false) {
  countdownActive = false;
  clearInterval(countdownTimerId);
  countdownBarEl.classList.remove('active');
  countdownClockEl.classList.remove('urgent');
  if (natural) {
    showToast('⏱️ Time\'s up! Work period complete.', 'success', 4000);
    if (audioContext) playSuccessSound();
    showReportModal();
  }
}

// ==================== Attention Signal ====================
function triggerAttention(emoji = '🙋', text = 'Eyes Up Front!') {
  const overlay = document.getElementById('attentionOverlay');
  document.getElementById('attentionEmoji').textContent = emoji;
  overlay.querySelector('.attention-text').textContent = text;
  overlay.classList.add('active');
}

function dismissAttention() {
  document.getElementById('attentionOverlay').classList.remove('active');
}

// ==================== Session Report ====================
function getGrade(quietPct, avgDb, alerts) {
  // Simple weighted scoring
  const quietScore = quietPct;  // 0–100
  const alertPenalty = Math.min(40, alerts * 5);
  const score = quietScore - alertPenalty;
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 45) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

function gradeMessage(grade, quietPct, avgDb) {
  const msgs = {
    A: `Outstanding session! The class maintained excellent noise discipline with ${quietPct}% quiet time. Keep it up!`,
    B: `Good session! ${quietPct}% quiet time is solid. A little more focus would push this to an A.`,
    C: `Decent effort. ${quietPct}% quiet time shows room for improvement — aim for 70%+ next time.`,
    D: `Challenging session. The class struggled to stay quiet. Try the 30-second challenge to build the habit.`,
    F: `Very noisy session. Consider using the Library or Testing preset for stricter thresholds.`
  };
  return msgs[grade] || '';
}

function showReportModal() {
  const modal = document.getElementById('reportModal');
  const quietPct = totalReadings > 0 ? Math.round((quietReadings / totalReadings) * 100) : 0;
  const avgDb = readings.length > 0 ? Math.round(readings.reduce((a,b) => a+b,0) / readings.length) : 0;
  const grade = readings.length > 0 ? getGrade(quietPct, avgDb, alertCount) : '?';

  // Grade badge
  const gradeEl = document.getElementById('reportGrade');
  gradeEl.textContent = grade;
  gradeEl.className = `report-grade grade-${grade.toLowerCase()}`;

  // Subtitle
  const subtitles = { A:'Excellent work!', B:'Good session!', C:'Decent effort', D:'Needs improvement', F:'Very challenging', '?':'No data yet' };
  document.getElementById('reportSubtitle').textContent = subtitles[grade] || '';

  // Stats
  const qt = parseInt(quietThresholdEl.value);
  const colorClass = (val, good, ok) => val <= good ? 'good' : val <= ok ? 'ok' : 'bad';

  document.getElementById('rAvg').textContent = avgDb ? `${avgDb} dB` : '--';
  document.getElementById('rAvg').className = `report-stat-value ${avgDb ? colorClass(avgDb, qt, qt+15) : ''}`;

  document.getElementById('rPeak').textContent = maxReading ? `${maxReading} dB` : '--';
  document.getElementById('rPeak').className = `report-stat-value ${maxReading ? colorClass(maxReading, qt+10, qt+25) : ''}`;

  document.getElementById('rQuiet').textContent = totalReadings ? `${quietPct}%` : '--';
  document.getElementById('rQuiet').className = `report-stat-value ${totalReadings ? (quietPct>=70?'good':quietPct>=40?'ok':'bad') : ''}`;

  document.getElementById('rAlerts').textContent = readings.length ? alertCount : '--';
  document.getElementById('rAlerts').className = `report-stat-value ${readings.length ? (alertCount===0?'good':alertCount<=3?'ok':'bad') : ''}`;

  // Duration
  const elapsed = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
  const durMins = Math.floor(elapsed/60), durSecs = elapsed%60;
  document.getElementById('rDuration').textContent = elapsed ? `${durMins}:${durSecs.toString().padStart(2,'0')}` : '--';
  document.getElementById('rDuration').className = 'report-stat-value';

  // vs target
  if (targetDb !== null && avgDb) {
    const gap = avgDb - targetDb;
    const gapStr = gap === 0 ? 'On target!' : `${gap > 0 ? '+' : ''}${gap} dB`;
    document.getElementById('rTarget').textContent = gapStr;
    document.getElementById('rTarget').className = `report-stat-value ${gap <= 0 ? 'good' : gap <= 5 ? 'ok' : 'bad'}`;
  } else {
    document.getElementById('rTarget').textContent = 'No target';
    document.getElementById('rTarget').className = 'report-stat-value';
  }

  document.getElementById('reportMessage').textContent = readings.length > 0
    ? gradeMessage(grade, quietPct, avgDb)
    : 'Complete a monitoring session to see your full report.';

  modal.classList.add('active');
}

function closeReportModal() {
  document.getElementById('reportModal').classList.remove('active');
}

// ==================== Noise Thermometer ====================
function initThermometer() {
  const tube = document.getElementById('thermoTube');
  const ticks = document.getElementById('thermoTicks');
  ticks.innerHTML = '';
  // Draw tick marks at 20, 40, 60, 80, 100 dB
  const minDb = 20, maxDb = 120, tubeH = 240;
  [20, 40, 60, 80, 100, 120].forEach(db => {
    const frac = (db - minDb) / (maxDb - minDb);
    const topPx = tubeH * (1 - frac);
    const tick = document.createElement('div');
    tick.className = 'thermo-tick';
    tick.style.top = topPx + 'px';
    const lbl = document.createElement('span');
    lbl.className = 'thermo-tick-label';
    lbl.style.top = topPx + 'px';
    lbl.textContent = db;
    ticks.appendChild(tick);
    ticks.appendChild(lbl);
  });
}

function updateThermometer(db) {
  const minDb = 20, maxDb = 120;
  const pct = Math.max(0, Math.min(100, ((db - minDb) / (maxDb - minDb)) * 100));
  document.getElementById('thermoFill').style.height = pct + '%';
  document.getElementById('thermoDb').textContent = db + ' dB';

  // Colour bulb
  const bulb = document.getElementById('thermoBulb');
  const qt = parseInt(quietThresholdEl.value);
  const wt = parseInt(warningThresholdEl.value);
  if (db < qt) {
    bulb.style.background = 'var(--color-quiet)';
    bulb.style.boxShadow = '0 0 14px rgba(0,255,136,0.6)';
  } else if (db < wt) {
    bulb.style.background = 'var(--color-moderate)';
    bulb.style.boxShadow = '0 0 14px rgba(255,200,0,0.6)';
  } else {
    bulb.style.background = 'var(--color-loud)';
    bulb.style.boxShadow = '0 0 14px rgba(255,50,50,0.7)';
  }
}

// ==================== Class Name ====================
function editClassName() {
  const input = document.getElementById('classNameInput');
  const display = document.getElementById('classNameDisplay');
  input.value = className;
  input.style.display = 'block';
  display.style.display = 'none';
  input.focus();
  input.select();
}

function saveClassName() {
  const input = document.getElementById('classNameInput');
  const display = document.getElementById('classNameDisplay');
  className = input.value.trim() || '';
  display.textContent = className || 'Click to set class name';
  document.getElementById('fsClassName').textContent = className || 'Classroom Noise Monitor';
  input.style.display = 'none';
  display.style.display = '';
  try { localStorage.setItem('cnm_className', className); } catch(e) { console.warn('Failed to save class name:', e); }
}

// ==================== Ambient Colour Mode ====================
function toggleAmbient() {
  ambientMode = !ambientMode;
  const btn = document.getElementById('ambientBtn');
  if (ambientMode) {
    document.body.classList.add('ambient');
    btn.classList.add('on');
    btn.textContent = '🌈 Ambient ON';
  } else {
    document.body.classList.remove('ambient', 'ambient-quiet', 'ambient-moderate', 'ambient-loud');
    btn.classList.remove('on');
    btn.textContent = '🌈 Ambient';
    // Clear projector ambient classes
    const proj = document.getElementById('projectorOverlay');
    if (proj) proj.classList.remove('ambient-quiet', 'ambient-moderate', 'ambient-loud');
  }
}

function updateAmbient(level) {
  if (!ambientMode) return;
  document.body.classList.remove('ambient-quiet', 'ambient-moderate', 'ambient-loud');
  document.body.classList.add('ambient-' + level);
  // Also apply ambient colour to projector/wall display overlay
  const proj = document.getElementById('projectorOverlay');
  if (proj) {
    proj.classList.remove('ambient-quiet', 'ambient-moderate', 'ambient-loud');
    proj.classList.add('ambient-' + level);
  }
}

// ==================== Session History ====================
function loadSessionHistory() {
  try { sessionHistory = JSON.parse(localStorage.getItem('cnm_history') || '[]'); } catch(e) { sessionHistory = []; }
  renderSessionHistory();
  renderGradeChart();
}

function saveSessionToHistory(data) {
  sessionHistory.unshift(data);
  if (sessionHistory.length > MAX_HISTORY) sessionHistory = sessionHistory.slice(0, MAX_HISTORY);
  try {
    localStorage.setItem('cnm_history', JSON.stringify(sessionHistory));
  } catch(e) {
    if (e.name === 'QuotaExceededError') {
      sessionHistory = sessionHistory.slice(0, Math.floor(sessionHistory.length / 2));
      try { localStorage.setItem('cnm_history', JSON.stringify(sessionHistory)); } catch(e2) {
        console.warn('Failed to save session history after truncation:', e2);
      }
    } else {
      console.warn('Failed to save session history:', e);
    }
  }
  renderSessionHistory();
  renderGradeChart();
}

function renderSessionHistory() {
  const list = document.getElementById('sessionHistoryList');
  if (sessionHistory.length === 0) {
    list.innerHTML = '<div class="no-history">No sessions recorded yet. Complete a monitoring session to see history here.</div>';
    return;
  }
  list.innerHTML = '';
  sessionHistory.forEach(s => {
    const item = document.createElement('div');
    item.className = 'session-history-item';

    const gradeBadge = document.createElement('div');
    gradeBadge.className = `shi-grade grade-${(s.grade||'?').toLowerCase()}`;
    gradeBadge.textContent = s.grade || '?';

    const info = document.createElement('div');
    info.className = 'shi-info';

    const infoTop = document.createElement('div');
    if (s.className) {
      const cnStrong = document.createElement('strong');
      cnStrong.textContent = s.className;
      infoTop.appendChild(cnStrong);
      infoTop.appendChild(document.createTextNode(' · '));
    }
    const dateSpan = document.createElement('span');
    dateSpan.className = 'shi-date';
    dateSpan.textContent = s.date;
    infoTop.appendChild(dateSpan);

    const statsDiv = document.createElement('div');
    statsDiv.className = 'shi-stats';
    [`Avg ${s.avgDb} dB`, `Quiet ${s.quietPct}%`, s.duration, `${s.alerts} alerts`].forEach(txt => {
      const sp = document.createElement('span');
      sp.textContent = txt;
      statsDiv.appendChild(sp);
    });

    info.appendChild(infoTop);
    info.appendChild(statsDiv);

    // Mini sparkline
    const sparkline = document.createElement('div');
    sparkline.className = 'shi-sparkline';
    if (s.sparkData) {
      const maxV = Math.max(...s.sparkData, 1);
      s.sparkData.forEach(v => {
        const bar = document.createElement('div');
        bar.className = 'shi-bar';
        bar.style.height = Math.max(4, (v / maxV) * 28) + 'px';
        bar.style.background = v < s.quietThreshold ? 'var(--color-quiet)' : v < s.warningThreshold ? 'var(--color-moderate)' : 'var(--color-loud)';
        sparkline.appendChild(bar);
      });
    }

    item.appendChild(gradeBadge);
    item.appendChild(info);
    item.appendChild(sparkline);
    list.appendChild(item);
  });
}

// ==================== Achievement Badges ====================
function loadAchievements() {
  try {
    const saved = JSON.parse(localStorage.getItem('cnm_achievements') || '[]');
    unlockedAchievements = new Set(saved);
  } catch(e) { unlockedAchievements = new Set(); }
  renderBadges();
}

function unlockAchievement(id) {
  if (unlockedAchievements.has(id)) return;
  unlockedAchievements.add(id);
  try { localStorage.setItem('cnm_achievements', JSON.stringify([...unlockedAchievements])); } catch(e) { console.warn('Failed to save achievements:', e); }
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (a) {
    showToast(`🏆 Achievement unlocked: ${a.name}!`, 'badge', 4000);
  }
  renderBadges();
}

function renderBadges() {
  const grid = document.getElementById('badgesGrid');
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const badge = document.createElement('div');
    const unlocked = unlockedAchievements.has(a.id);
    badge.className = `badge ${unlocked ? 'unlocked' : 'locked'}`;
    badge.title = a.desc;
    badge.innerHTML = `<div class="badge-icon">${a.icon}</div><div class="badge-name">${a.name}</div>`;
    grid.appendChild(badge);
  });
}

function checkAchievements(sessionData) {
  unlockAchievement('first_session');
  if (sessionData.grade === 'A') unlockAchievement('grade_a');
  if (sessionHistory.length >= 5) unlockAchievement('five_sessions');
  if (sessionHistory.length >= 10) unlockAchievement('ten_sessions');
  if (sessionData.alerts === 0 && sessionData.duration !== '0:00') unlockAchievement('zero_alerts');
  if (sessionData.quietPct >= 80) unlockAchievement('quiet_master');
  if (starsEarned >= 5) unlockAchievement('all_stars');
  // consistent: 3 consecutive B+ — sessionHistory already has sessionData at [0] after unshift
  if (sessionHistory.length >= 3) {
    const recent3 = sessionHistory.slice(0, 3);
    if (recent3.every(s => ['A','B'].includes(s.grade))) unlockAchievement('consistent');
  }
}

// ==================== Custom Attention ====================
function sendCustomAttention() {
  const input = document.getElementById('customAttentionMsg');
  const msg = input.value.trim();
  if (!msg) return;
  triggerAttention('📢', msg);
  input.value = '';
  const countEl = document.getElementById('customAttentionCount');
  if (countEl) { countEl.textContent = '0 / 40'; countEl.className = 'custom-attention-count'; }
}

// ==================== Projector / Wall Display ====================
function openProjector() {
  projectorOpen = true;
  document.getElementById('projectorOverlay').classList.add('active');
  document.getElementById('projClass').textContent = className || '';
  updateProjector(null); // initial render
  document.body.style.overflow = 'hidden';
}

function closeProjector() {
  projectorOpen = false;
  document.getElementById('projectorOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

function updateProjector(db) {
  if (!projectorOpen) return;
  const creature = document.getElementById('projCreature');
  const dbEl     = document.getElementById('projDb');
  const statEl   = document.getElementById('projStatus');
  const timerEl  = document.getElementById('projTimer');

  const qt = parseInt(quietThresholdEl.value);
  const wt = parseInt(warningThresholdEl.value);

  // Level class
  let levelClass = 'quiet';
  let statusText = isMonitoring ? 'Perfect! 🟢' : 'Ready';
  if (db !== null && isMonitoring) {
    if (db >= parseInt(alertThresholdEl.value)) {
      levelClass = 'loud'; statusText = 'WAY TOO LOUD! 🔴';
    } else if (db >= wt) {
      levelClass = 'loud'; statusText = 'Too Loud! 🔴';
    } else if (db >= qt) {
      levelClass = 'moderate'; statusText = 'Getting Louder 🟡';
    }
  }

  creature.className = `proj-creature-body ${levelClass}`;
  dbEl.className = `proj-db ${levelClass}`;
  dbEl.innerHTML = `${db !== null && isMonitoring ? db : '--'}<span>dB</span>`;
  statEl.className = `proj-status ${levelClass}`;
  statEl.textContent = statusText;

  // Score bar = quiet %
  const quietPct = totalReadings > 0 ? Math.round((quietReadings / totalReadings) * 100) : 0;
  document.getElementById('projScoreFill').style.width = quietPct + '%';
  document.getElementById('projScorePct').textContent = quietPct + '% quiet';
  if (quietPct >= 80) document.getElementById('projScoreFill').style.background = 'linear-gradient(90deg,var(--color-primary),var(--color-quiet))';
  else if (quietPct >= 50) document.getElementById('projScoreFill').style.background = 'linear-gradient(90deg,var(--color-primary),var(--color-moderate))';
  else document.getElementById('projScoreFill').style.background = 'linear-gradient(90deg,var(--color-moderate),var(--color-loud))';

  // Stars
  const filled = Math.min(5, starsEarned);
  document.getElementById('projStars').textContent = '⭐'.repeat(filled) + '☆'.repeat(5 - filled);

  // Countdown
  if (countdownActive) {
    const m = Math.floor(countdownRemaining / 60), s = countdownRemaining % 60;
    timerEl.textContent = `⏱ ${m}:${s.toString().padStart(2,'0')} remaining`;
    timerEl.classList.add('show');
  } else {
    timerEl.classList.remove('show');
  }
}

// ==================== Escalating Alerts ====================
function updateEscalatingAlert(db) {
  if (!isMonitoring) { clearAlertStage(); return; }
  const at = parseInt(alertThresholdEl.value);
  if (db < at) {
    loudFrameCount = Math.max(0, loudFrameCount - 2);
    if (loudFrameCount === 0) clearAlertStage();
    return;
  }
  loudFrameCount++;

  // Stage thresholds (frames at ~30fps sample rate effectively):
  // Stage 1 warn   after ~2s  (60 frames)
  // Stage 2 alarm  after ~8s  (240 frames)
  // Stage 3 critical after ~20s (600 frames)
  let newStage = 0;
  if (loudFrameCount > 600) newStage = 3;
  else if (loudFrameCount > 240) newStage = 2;
  else if (loudFrameCount > 60)  newStage = 1;

  if (newStage !== alertStage) {
    alertStage = newStage;
    applyAlertStage(newStage);
  }
}

function applyAlertStage(stage) {
  const bar   = document.getElementById('alertBar');
  const badge = document.getElementById('alertStageBadge');
  bar.className   = 'alert-bar';
  badge.className = 'alert-stage-badge';
  badge.textContent = '';

  if (stage === 0) { badge.classList.remove('show'); return; }

  const stages = {
    1: { cls:'warn',     label:'⚠️ Getting Loud — Watch Volume' },
    2: { cls:'alarm',    label:'🔊 Too Loud! Please Quiet Down' },
    3: { cls:'critical', label:'🚨 CRITICAL NOISE — Immediate Action Needed' },
  };
  const s = stages[stage];
  bar.classList.add(s.cls);
  badge.classList.add(s.cls, 'show');
  badge.textContent = s.label;

  // Auto-trigger attention on critical
  if (stage === 3 && Date.now() - alertStageSince > 5000) {
    alertStageSince = Date.now();
    triggerAttention('🚨', 'Please Quiet Down Now!');
  }
}

function clearAlertStage() {
  alertStage = 0; loudFrameCount = 0;
  document.getElementById('alertBar').className = 'alert-bar';
  const badge = document.getElementById('alertStageBadge');
  badge.className = 'alert-stage-badge';
}

// ==================== Calibration Wizard ====================
function showCalibration() {
  if (!isMonitoring) {
    showToast('Start monitoring first, then calibrate', 'info', 2500);
    return;
  }
  // Reset to step 1
  ['calStep1','calStep2','calStep3'].forEach(id => document.getElementById(id).classList.remove('active'));
  document.getElementById('calStep1').classList.add('active');
  document.getElementById('calibrationModal').classList.add('active');
}

function closeCalibration() {
  clearInterval(calTimerId);
  calActive = false;
  document.getElementById('calibrationModal').classList.remove('active');
}

function startCalibration() {
  calReadings = [];
  calSecs = 10;
  calActive = true;
  document.getElementById('calStep1').classList.remove('active');
  document.getElementById('calStep2').classList.add('active');

  const circumference = 2 * Math.PI * 30; // 188.5
  const ring = document.getElementById('calRingCircle');
  const numEl = document.getElementById('calRingNum');
  const barFill = document.getElementById('calBarFill');
  const liveEl = document.getElementById('calLiveDb');

  calTimerId = setInterval(() => {
    calSecs--;
    numEl.textContent = calSecs;
    const progress = ((10 - calSecs) / 10) * circumference;
    ring.style.strokeDashoffset = circumference - progress;

    // Sample current dB
    if (isMonitoring && analyser && dataArray) {
      analyser.getByteFrequencyData(dataArray);
      let calSum = 0;
      for (let i = 0; i < dataArray.length; i++) calSum += dataArray[i] * dataArray[i];
      const calRms = Math.sqrt(calSum / dataArray.length);
      const db = Math.round(Math.max(20, Math.min(120, (calRms * parseFloat(sensitivityEl.value) * 0.4) + 20)));
      calReadings.push(db);
      liveEl.textContent = db + ' dB';
      barFill.style.width = ((10 - calSecs) / 10 * 100) + '%';
    }

    if (calSecs <= 0) {
      clearInterval(calTimerId);
      finishCalibration();
    }
  }, 1000);
}

function finishCalibration() {
  calActive = false;
  if (calReadings.length === 0) { closeCalibration(); return; }

  const sorted = [...calReadings].sort((a,b)=>a-b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const quiet  = Math.min(60, Math.round(median + 8));
  const warn   = Math.min(80, Math.round(median + 18));
  const alert  = Math.min(100, Math.round(median + 30));

  calResult = { baseline: median, quiet, warn, alert };

  document.getElementById('calResBaseline').textContent = median + ' dB';
  document.getElementById('calResQuiet').textContent   = quiet  + ' dB';
  document.getElementById('calResWarn').textContent    = warn   + ' dB';
  document.getElementById('calResAlert').textContent   = alert  + ' dB';

  const tipText = median < 35
    ? '✅ Very quiet room detected — thresholds set tightly. Great for testing or library mode.'
    : median < 50
    ? '✅ Normal room baseline. Thresholds calibrated for typical classroom use.'
    : '⚠️ Higher baseline detected. This room has significant background noise — thresholds adjusted accordingly.';
  document.getElementById('calResultTip').textContent = tipText;

  document.getElementById('calStep2').classList.remove('active');
  document.getElementById('calStep3').classList.add('active');
}

function applyCalibration() {
  if (!calResult) return;
  quietThresholdEl.value   = calResult.quiet;
  warningThresholdEl.value = calResult.warn;
  alertThresholdEl.value   = calResult.alert;
  updateSettingsDisplay();
  saveSettings();
  closeCalibration();
  showToast(`🎚️ Calibrated! Thresholds set for your room (baseline ${calResult.baseline} dB)`, 'success', 3500);
}

// ==================== Grade Chart ====================
function renderGradeChart() {
  const section = document.getElementById('gradeChartSection');
  const chart   = document.getElementById('gradeChart');
  if (sessionHistory.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  chart.innerHTML = '';

  const gradeScore = { A:100, B:80, C:55, D:30, F:10 };
  const gradeClass = { A:'ga', B:'gb', C:'gc', D:'gd', F:'gf' };

  // Show last 8 sessions, oldest first
  const sessions = [...sessionHistory].reverse().slice(-8);
  // Pad to 8 with empty slots
  while (sessions.length < 8) sessions.unshift(null);

  sessions.forEach(s => {
    const col = document.createElement('div');
    col.className = 'grade-col';
    const bar = document.createElement('div');
    bar.className = `grade-col-bar ${s ? gradeClass[s.grade] || 'ge' : 'ge'}`;
    const h = s ? Math.max(8, (gradeScore[s.grade] || 10) * 0.72) : 4;
    bar.style.height = h + 'px';
    const lbl = document.createElement('div');
    lbl.className = 'grade-col-lbl';
    lbl.textContent = s ? s.grade : '·';
    col.appendChild(bar);
    col.appendChild(lbl);
    chart.appendChild(col);
  });
}

// ==================== Keyboard Shortcuts Modal ====================
function showShortcutsModal() {
  document.getElementById('shortcutsModal').classList.add('active');
}

function closeShortcutsModal() {
  document.getElementById('shortcutsModal').classList.remove('active');
}

// ==================== Keyboard Shortcuts ====================
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;

  if (e.key === ' ' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) { e.preventDefault(); toggleMonitoring(); }
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  if (e.key === 'r' || e.key === 'R') resetStats();
  if (e.key === 't' || e.key === 'T') toggleTheme();
  if (e.key === 'e' || e.key === 'E') exportLog();
  if (e.key === 'a' || e.key === 'A') triggerAttention();
  if (e.key === 'p' || e.key === 'P') showReportModal();
  if (e.key === 'w' || e.key === 'W') projectorOpen ? closeProjector() : openProjector();
  if (e.key === '?' || e.key === '/') showShortcutsModal();
  if (e.key === 'Escape') {
    dismissAttention();
    closeReportModal();
    closeProjector();
    closeShortcutsModal();
    if (document.body.classList.contains('fullscreen')) toggleFullscreen();
  }
});

// ==================== Initialize ====================
initVisualizer();
initThermometer();
loadSettings();
loadSessionHistory();
loadAchievements();
updateSettingsDisplay();
updateChallengeDisplay();

// Custom attention: Enter key sends, input shows character counter
const customMsgEl = document.getElementById('customAttentionMsg');
const customCountEl = document.getElementById('customAttentionCount');
customMsgEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendCustomAttention();
});
customMsgEl.addEventListener('input', () => {
  const len = customMsgEl.value.length;
  customCountEl.textContent = `${len} / 40`;
  customCountEl.className = 'custom-attention-count' +
    (len >= 40 ? ' at-limit' : len >= 30 ? ' near-limit' : '');
});

// Background-click closes all dismissible modals
['reportModal', 'shortcutsModal', 'permissionModal', 'errorModal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('active');
  });
});

// Dismiss attention overlay on background click
document.getElementById('attentionOverlay').addEventListener('click', function(e) {
  if (e.target === this) dismissAttention();
});

// Sync challenge duration button selection with JS state on load
document.querySelectorAll('.duration-option').forEach(btn => {
  btn.classList.toggle('selected', parseInt(btn.dataset.duration) === challengeDuration);
});

window.addEventListener('resize', () => {
  if (historyData.length > 0) {
    updateHistoryChart(historyData[historyData.length - 1]);
  }
});

// ==================== Tooltip Engine ====================
(function initTooltips() {
  const tip = document.createElement('div');
  tip.id = 'tooltip';
  document.body.appendChild(tip);

  let showTimer = null;
  let currentTarget = null;

  function position(anchor) {
    const r   = anchor.getBoundingClientRect();
    const tw  = tip.offsetWidth;
    const th  = tip.offsetHeight;
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const gap = 9;
    const pad = 10;

    // Prefer above; fall back to below when there is not enough room
    let top, cls;
    if (r.top - th - gap >= pad) {
      top = r.top - th - gap;
      cls = 'tip-above';
    } else {
      top = r.bottom + gap;
      cls = 'tip-below';
    }

    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(pad, Math.min(left, vw - tw - pad));
    top  = Math.min(top, vh - th - pad);

    tip.style.top  = top + 'px';
    tip.style.left = left + 'px';
    tip.className  = cls + ' visible';
  }

  function show(anchor) {
    const text = anchor.dataset.tip;
    if (!text) return;
    tip.textContent = text;
    // Render off-screen first so we can measure actual dimensions
    tip.style.left = '-9999px';
    tip.style.top  = '0';
    tip.className  = '';
    requestAnimationFrame(() => position(anchor));
  }

  function hide() {
    clearTimeout(showTimer);
    showTimer = null;
    tip.className = '';
    currentTarget = null;
  }

  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (el === currentTarget) return;
    hide();
    currentTarget = el;
    if (el) showTimer = setTimeout(() => show(el), 320);
  });

  // Hide when the pointer leaves the document entirely
  document.addEventListener('mouseleave', hide);

  // Keyboard: show on focus, hide on blur
  document.addEventListener('focusin', e => {
    const el = e.target.closest('[data-tip]');
    if (el) { hide(); currentTarget = el; show(el); }
  });
  document.addEventListener('focusout', hide);

  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide, { passive: true });
})();
