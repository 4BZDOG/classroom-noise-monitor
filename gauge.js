// ==================== Creature Gauge ====================
// A single canvas instrument: 270° level arc, 72-bar spectrum ring, a reactive
// creature, a big dB number, a thermometer and a 10 s history sparkline.
// NoiseGauge.draw() is a pure function of the state passed in (plus the
// creature's own blink timer); it never touches the microphone.

const GAUGE_BARS = 72;
const GAUGE_HIST = 160; // 10 s at 16 Hz
const GAUGE_MIN_DB = 20;
const GAUGE_MAX_DB = 120;
const ARC_START = Math.PI * 0.75;   // 135°
const ARC_SWEEP = Math.PI * 1.5;    // 270°

const ZONES = [
  { rgb: [123, 228, 149], status: 'NICE AND CALM' },
  { rgb: [255, 200, 87],  status: 'GETTING LOUD' },
  { rgb: [255, 107, 107], status: 'TOO LOUD!' }
];
// Pre-built colour strings so the render loop allocates nothing per frame.
for (const z of ZONES) {
  const [r, g, b] = z.rgb;
  const c = (k, a) => `rgba(${Math.min(255, Math.round(k(r)))},${Math.min(255, Math.round(k(g)))},${Math.min(255, Math.round(k(b)))},${a})`;
  z.solid = c(v => v, 1);
  z.glow = c(v => v, 0.6);
  z.soft = c(v => v, 0.25);
  z.light = c(v => v + 60, 1);
  z.dark = c(v => v * 0.7, 1);
}

function gaugeZone(db, quiet, alert) {
  return db >= alert ? 2 : db >= quiet ? 1 : 0;
}
function dbFrac(db) {
  return Math.max(0, Math.min(1, (db - GAUGE_MIN_DB) / (GAUGE_MAX_DB - GAUGE_MIN_DB)));
}

class NoiseGauge {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0; this.h = 0;
    this.nextBlink = 1.5;
    this.blinkEnd = 0;
    this.barPaths = [0, 0, 0]; // scratch counts, reused
  }

  resize() {
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw; this.canvas.height = ph;
    }
    this.w = cw; this.h = ch;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Size-dependent resources are built here, not per frame
    const ctx = this.ctx, cx = cw / 2, cy = ch / 2, R = Math.min(cw, ch) * 0.33;
    const far = Math.max(cw, ch) * 0.75;
    this.bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, far);
    this.bg.addColorStop(0, '#1a2233');
    this.bg.addColorStop(1, '#0c111c');
    this.wash = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, far);
    this.wash.addColorStop(0, 'rgba(255,107,107,0)');
    this.wash.addColorStop(1, 'rgba(255,107,107,1)');
    const mono = "'JetBrains Mono', ui-monospace, monospace";
    this.fontNum = `600 ${0.26 * R}px ${mono}`;
    this.fontSuf = `600 ${0.104 * R}px ${mono}`;
    this.fontStatus = `600 ${Math.max(11, 0.1 * R)}px ${mono}`;
    this.fontLabel = `600 ${Math.max(10, 0.055 * R)}px ${mono}`;
    this.fontSmall = `600 10px ${mono}`;
    this.fontZ = `600 ${0.16 * R}px ${mono}`;
    this.fontNumBig = `600 ${0.46 * R}px ${mono}`;
    this.fontSufBig = `600 ${0.18 * R}px ${mono}`;
  }

  // s = { level, bars, history, histHead, quiet, alert, t, alertFor, reduced, label }
  draw(s) {
    const ctx = this.ctx, w = this.w, h = this.h;
    if (w < 10 || h < 10) return;
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.33;
    const zi = gaugeZone(s.level, s.quiet, s.alert);
    const zone = ZONES[zi];
    const t = s.t;

    // Background
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);

    // Alert wash
    if (s.alertFor > 0.3) {
      const a = s.reduced ? 0.2 : 0.18 + 0.1 * Math.sin(t * 10);
      ctx.globalAlpha = a;
      ctx.fillStyle = this.wash;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Spectrum ring — batched into one path per zone colour
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, 0.028 * R);
    const r0 = 1.12 * R;
    for (let z = 0; z < 3; z++) {
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < GAUGE_BARS; i++) {
        const amp = s.bars[i];
        // Each bar takes the zone of its own amplitude
        const barDb = GAUGE_MIN_DB + amp * (GAUGE_MAX_DB - GAUGE_MIN_DB);
        if (gaugeZone(barDb, s.quiet, s.alert) !== z) continue;
        const ang = (i / GAUGE_BARS) * Math.PI * 2 - Math.PI / 2;
        const len = 0.06 * R + amp * 0.42 * R;
        const c = Math.cos(ang), sn = Math.sin(ang);
        ctx.moveTo(cx + c * r0, cy + sn * r0);
        ctx.lineTo(cx + c * (r0 + len), cy + sn * (r0 + len));
        any = true;
      }
      if (any) {
        ctx.strokeStyle = ZONES[z].solid;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Gauge track
    ctx.lineWidth = 0.075 * R;
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, ARC_START, ARC_START + ARC_SWEEP);
    ctx.stroke();

    // Level arc
    const frac = dbFrac(s.level);
    if (frac > 0.002) {
      ctx.strokeStyle = zone.solid;
      ctx.shadowColor = zone.solid;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(cx, cy, R, ARC_START, ARC_START + ARC_SWEEP * frac);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Threshold ticks
    ctx.lineWidth = Math.max(2, 0.02 * R);
    this.tick(cx, cy, R, s.quiet, ZONES[1].solid);
    this.tick(cx, cy, R, s.alert, ZONES[2].solid);

    if (s.faces) {
      // Very calm room: the creature gets drowsy and little z's drift up
      if (s.level < s.quiet - 8) this.drawZzz(cx + 0.4 * R, cy - 0.5 * R, R, t, s.reduced);
      this.drawCreature(cx, cy - 0.14 * R, 0.44 * R, zi, s.level, t, s.reduced);
    }

    // dB number (fills the centre when the creature is switched off)
    const num = Math.round(s.level);
    const numSize = (s.faces ? 0.26 : 0.46) * R;
    const numY = cy + (s.faces ? 0.68 : 0.12) * R;
    const fNum = s.faces ? this.fontNum : this.fontNumBig;
    const fSuf = s.faces ? this.fontSuf : this.fontSufBig;
    ctx.textBaseline = 'middle';
    ctx.font = fNum;
    const numW = ctx.measureText(num).width;
    ctx.font = fSuf;
    const sufW = ctx.measureText(' dB').width;
    const x0 = cx - (numW + sufW) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4f7fb';
    ctx.font = fNum;
    ctx.fillText(num, x0, numY);
    ctx.globalAlpha = 0.6;
    ctx.font = fSuf;
    ctx.fillText(' dB', x0 + numW, numY + numSize * 0.16);
    ctx.globalAlpha = 1;

    // Status
    ctx.textAlign = 'center';
    ctx.fillStyle = zone.solid;
    ctx.font = this.fontStatus;
    ctx.fillText(zone.status, cx, cy + 1.0 * R);

    if (s.label) {
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.font = this.fontLabel;
      ctx.fillText(s.label, cx, Math.max(14, cy - 1.62 * R));
    }

    if (w > 380) this.drawThermometer(w, h, R, s, zone);
    if (w > 480) this.drawSparkline(w, R, s);
  }

  drawZzz(x, y, R, t, reduced) {
    const ctx = this.ctx;
    ctx.font = this.fontZ;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ZONES[0].light;
    for (let i = 0; i < 3; i++) {
      const p = reduced ? i / 3 : (t * 0.35 + i / 3) % 1;
      ctx.globalAlpha = reduced ? 0.5 : Math.sin(p * Math.PI) * 0.8;
      const sc = 0.6 + p * 0.6;
      ctx.save();
      ctx.translate(x + p * 0.18 * R + (reduced ? 0 : Math.sin(t * 2 + i) * 0.04 * R), y - p * 0.28 * R);
      ctx.scale(sc, sc);
      ctx.fillText('z', 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  tick(cx, cy, R, db, color) {
    const ctx = this.ctx;
    const ang = ARC_START + ARC_SWEEP * dbFrac(db);
    const c = Math.cos(ang), sn = Math.sin(ang);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx + c * 0.86 * R, cy + sn * 0.86 * R);
    ctx.lineTo(cx + c * 0.93 * R, cy + sn * 0.93 * R);
    ctx.stroke();
  }

  drawCreature(x, y, r, zi, level, t, reduced) {
    const ctx = this.ctx;
    const lv = dbFrac(level);
    const zone = ZONES[zi];
    if (!reduced) {
      y += Math.sin(t * 2.4) * 0.04 * r;
      if (zi === 2) x += Math.sin(t * 40) * 0.03 * r;
    }

    // Blink timer
    if (t >= this.nextBlink) {
      this.blinkEnd = t + 0.14;
      this.nextBlink = t + 2.2 + Math.random() * 2.8;
    }
    const blinking = t < this.blinkEnd;

    // Antennae
    ctx.lineWidth = Math.max(2, 0.06 * r);
    ctx.lineCap = 'round';
    ctx.strokeStyle = zone.dark;
    ctx.fillStyle = zone.light;
    for (let side = -1; side <= 1; side += 2) {
      const sway = reduced ? 0 : Math.sin(t * 3 + side) * 0.08 * r * (1 + lv * 2);
      const bx = x + side * 0.35 * r, by = y - 0.85 * r;
      const tx = x + side * 0.55 * r + sway, ty = y - 1.35 * r;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(x + side * 0.3 * r, y - 1.25 * r, tx, ty);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tx, ty, 0.1 * r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body
    const g = ctx.createRadialGradient(x - 0.35 * r, y - 0.4 * r, 0.05 * r, x, y, r);
    g.addColorStop(0, zone.light);
    g.addColorStop(1, zone.dark);
    ctx.fillStyle = g;
    ctx.shadowColor = zone.glow;
    ctx.shadowBlur = 0.5 * r;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Eyes
    const look = reduced ? 0 : 0.8 * Math.sin(0.7 * t) + 0.2 * Math.sin(1.9 * t);
    const eyeScale = zi === 2 ? 1.2 : 1;
    const ew = 0.17 * r * eyeScale, eh = (blinking ? 0.02 : 0.22) * r * eyeScale;
    const pr = (zi === 2 ? 0.055 : 0.09) * r;
    for (let side = -1; side <= 1; side += 2) {
      const ex = x + side * 0.33 * r, ey = y - 0.15 * r;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, ey, ew, eh, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!blinking) {
        ctx.fillStyle = '#1b2233';
        ctx.beginPath();
        ctx.arc(ex + look * 0.07 * r, ey + 0.03 * r, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex + look * 0.07 * r + pr * 0.35, ey - pr * 0.3, pr * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mouth
    const my = y + 0.3 * r;
    ctx.strokeStyle = '#1b2233';
    ctx.fillStyle = '#1b2233';
    ctx.lineWidth = Math.max(2, 0.06 * r);
    ctx.beginPath();
    if (zi === 0) {
      ctx.arc(x, my - 0.1 * r, 0.22 * r, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,160,.45)';
      ctx.beginPath();
      ctx.ellipse(x - 0.58 * r, y + 0.12 * r, 0.12 * r, 0.07 * r, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 0.58 * r, y + 0.12 * r, 0.12 * r, 0.07 * r, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (zi === 1) {
      ctx.moveTo(x - 0.18 * r, my);
      ctx.lineTo(x + 0.18 * r, my);
      ctx.stroke();
    } else {
      const o = 0.1 * r + lv * 0.14 * r;
      ctx.ellipse(x, my + 0.04 * r, o * 0.8, o, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawThermometer(w, h, R, s, zone) {
    const ctx = this.ctx;
    const tw = Math.max(10, 0.07 * R);
    const th = Math.min(h * 0.55, 1.6 * R);
    const x = Math.max(24, w * 0.06);
    const top = h / 2 - th / 2;
    const bulbR = tw * 0.9;
    // Tube
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    this.roundRect(x - tw / 2, top, tw, th, tw / 2);
    ctx.fill();
    // Fill
    const fh = th * dbFrac(s.level);
    ctx.fillStyle = zone.solid;
    this.roundRect(x - tw / 2, top + th - fh, tw, fh + bulbR, tw / 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, top + th + bulbR * 0.8, bulbR, 0, Math.PI * 2);
    ctx.fill();
    // Threshold marks
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ZONES[1].solid;
    let ty = top + th * (1 - dbFrac(s.quiet));
    ctx.beginPath(); ctx.moveTo(x + tw * 0.8, ty); ctx.lineTo(x + tw * 1.5, ty); ctx.stroke();
    ctx.strokeStyle = ZONES[2].solid;
    ty = top + th * (1 - dbFrac(s.alert));
    ctx.beginPath(); ctx.moveTo(x + tw * 0.8, ty); ctx.lineTo(x + tw * 1.5, ty); ctx.stroke();
  }

  drawSparkline(w, R, s) {
    const ctx = this.ctx;
    const sw = Math.min(220, w * 0.24), sh = Math.max(36, sw * 0.32);
    const x = w - sw - Math.max(16, w * 0.03), y = Math.max(16, w * 0.02);
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    this.roundRect(x - 8, y - 8, sw + 16, sh + 16, 10);
    ctx.fill();
    // Alert line
    const ay = y + sh * (1 - dbFrac(s.alert));
    ctx.strokeStyle = ZONES[2].soft;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, ay); ctx.lineTo(x + sw, ay); ctx.stroke();
    ctx.setLineDash([]);
    // Trace
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < GAUGE_HIST; i++) {
      const v = s.history[(s.histHead + i) % GAUGE_HIST];
      const px = x + (i / (GAUGE_HIST - 1)) * sw;
      const py = y + sh * (1 - dbFrac(v));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.font = this.fontSmall;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('LAST 10s', x + sw, y + sh + 20);
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

// ==================== Gauge driver ====================
// Owns the signal state (smoothing, demo, history) and the single render loop.
// Audio comes from the app via getAnalyser(); the driver never opens the mic.
const Gauge = (() => {
  const bars = new Float32Array(GAUGE_BARS);
  const barTarget = new Float32Array(GAUGE_BARS);
  const history = new Float32Array(GAUGE_HIST).fill(40);
  let histHead = 0, histAcc = 0;
  let level = 40, t = 0, last = 0, rafId = null, alertFor = 0;
  let burstStart = 6, burstEnd = 0;
  let timeBuf = null, freqBuf = null;
  let lastZone = -1;
  const gauges = [];
  const state = { level: 40, bars, history, histHead: 0, quiet: 40, alert: 75, t: 0, alertFor: 0, reduced: false, label: '', faces: true, live: false };
  const renderers = [];
  const rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let opts = null;

  function demoTarget() {
    let db = 47 + 7 * Math.sin(0.23 * t) + 4 * Math.sin(0.71 * t + 1.3) + 3 * Math.sin(2.3 * t);
    if (t >= burstStart && burstEnd === 0) burstEnd = burstStart + 1.2 + Math.random() * 1.4;
    if (burstEnd && t < burstEnd) db += 30;
    else if (burstEnd && t >= burstEnd) { burstStart = t + 5 + Math.random() * 5; burstEnd = 0; }
    const lf = dbFrac(db);
    for (let i = 0; i < GAUGE_BARS; i++) {
      const f = i / GAUGE_BARS;
      const shape = Math.exp(-Math.pow((f - 0.3) * 3, 2));
      barTarget[i] = Math.max(0, Math.min(1, lf * (0.35 + 0.65 * shape) * (0.7 + 0.3 * Math.sin(t * 7 + i * 1.7))));
    }
    return db;
  }

  function micTarget(an) {
    if (!timeBuf || timeBuf.length !== an.fftSize) timeBuf = new Float32Array(an.fftSize);
    if (!freqBuf || freqBuf.length !== an.frequencyBinCount) freqBuf = new Uint8Array(an.frequencyBinCount);
    an.getFloatTimeDomainData(timeBuf);
    an.getByteFrequencyData(freqBuf);
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i];
    const rms = Math.sqrt(sum / timeBuf.length) * opts.getGain();
    const bins = freqBuf.length;
    for (let i = 0; i < GAUGE_BARS; i++) {
      barTarget[i] = freqBuf[Math.floor(Math.pow(i / GAUGE_BARS, 1.6) * bins * 0.7)] / 255;
    }
    return Math.max(20, Math.min(120, 100 + 20 * Math.log10(rms || 1e-6)));
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
    last = now;
    t += dt;

    const an = opts.getAnalyser();
    const target = an ? micTarget(an) : demoTarget();
    const k = Math.min(1, dt * (target > level ? 7 : 2.5));
    level += (target - level) * k;
    const kb = Math.min(1, dt * 12);
    for (let i = 0; i < GAUGE_BARS; i++) bars[i] += (barTarget[i] - bars[i]) * kb;

    histAcc += dt;
    while (histAcc >= 1 / 16) {
      histAcc -= 1 / 16;
      history[histHead] = level;
      histHead = (histHead + 1) % GAUGE_HIST;
    }

    const th = opts.getThresholds();
    alertFor = level >= th.alert ? alertFor + dt : 0;

    state.level = level; state.histHead = histHead;
    state.quiet = th.quiet; state.alert = th.alert;
    state.t = t; state.alertFor = alertFor;
    state.reduced = !!(rmq && rmq.matches);
    state.label = an ? '' : 'PREVIEW · PRESS START TO LISTEN';
    state.faces = opts.getFaces ? opts.getFaces() : true;
    state.live = !!an;

    for (let i = 0; i < gauges.length; i++) {
      const g = gauges[i];
      if (g.canvas.clientWidth === 0) continue; // hidden view
      if (g.w !== g.canvas.clientWidth || g.h !== g.canvas.clientHeight) g.resize();
      g.draw(state);
    }

    for (let i = 0; i < renderers.length; i++) renderers[i].frame(state, dt);

    const zi = gaugeZone(level, th.quiet, th.alert);
    if (!an) lastZone = -1;
    else if (zi !== lastZone) {
      lastZone = zi;
      if (opts.liveRegion) opts.liveRegion.textContent = ZONES[zi].status;
    }

    if (an && opts.onLevel) opts.onLevel(Math.round(level));
  }

  function start() {
    if (rafId === null && !document.hidden) { last = 0; rafId = requestAnimationFrame(frame); }
  }
  function stop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  return {
    init(o) {
      opts = o;
      for (const c of o.canvases) if (c) gauges.push(new NoiseGauge(c));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { stop(); if (o.onHidden) o.onHidden(); } else start();
      });
      window.addEventListener('resize', () => gauges.forEach(g => g.resize()));
      start();
    },
    // Extra views (e.g. the lesson timeline) drawn in the same loop: r.frame(state, dt)
    addRenderer(r) { renderers.push(r); },
    reset() { level = 40; alertFor = 0; history.fill(40); },
    get level() { return level; }
  };
})();
