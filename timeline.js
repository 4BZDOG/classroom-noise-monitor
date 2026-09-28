// ==================== Lesson Timeline ====================
// A retro LED graphic-equaliser / heat map with time on the horizontal axis.
// It records one sample per second while monitoring (levels and 16 pitch
// bands only — never audio) and fits the whole lesson across the screen.
// Drawn from the gauge's render loop via Gauge.addRenderer().

const TL_BANDS = 16;
const TL_CAP = 4 * 3600;            // up to 4 hours at 1 sample/s
const TL_MAX_COLS = 1024;
const TL_LO = 30, TL_HI = 100;      // dB range of the level view
const TL_SPANS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240]; // minutes
const TL_TICKS = [1, 2, 5, 10, 15, 30, 60];

// Single-hue amber "phosphor" ramp for the heat map: dark = quiet, bright = loud
const TL_RAMP = (() => {
  const stops = [[24, 16, 8], [120, 60, 6], [255, 150, 20], [255, 214, 120], [255, 246, 222]];
  const out = [];
  for (let i = 0; i < 12; i++) {
    const f = i / 11 * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(f)), u = f - k;
    const c = stops[k].map((v, j) => Math.round(v + (stops[k + 1][j] - v) * u));
    out.push(`rgb(${c[0]},${c[1]},${c[2]})`);
  }
  return out;
})();

function tlFrac(db) { return Math.max(0, Math.min(1, (db - TL_LO) / (TL_HI - TL_LO))); }
function tlClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

class LessonTimeline {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tooltip = tooltip;
    this.mode = 'levels';

    // Recording
    this.level = new Float32Array(TL_CAP);
    this.peak = new Float32Array(TL_CAP);
    this.bands = new Float32Array(TL_CAP * TL_BANDS);
    this.count = 0;
    this.accB = new Float32Array(TL_BANDS);
    this.accN = 0; this.accL = 0; this.accP = 0; this.accT = 0;
    this.wasLive = false;

    // Column cache (rebuilt only when data or size changes)
    this.colL = new Float32Array(TL_MAX_COLS);
    this.colP = new Float32Array(TL_MAX_COLS);
    this.colB = new Float32Array(TL_MAX_COLS * TL_BANDS);
    this.colN = new Int32Array(TL_MAX_COLS);
    this.colBreak = new Uint8Array(TL_MAX_COLS);
    this.dirty = true;
    this.layerKey = '';

    this.layer = document.createElement('canvas');
    this.lctx = this.layer.getContext('2d');
    this.crt = document.createElement('canvas');
    this.face = new NoiseGauge(canvas); // borrowed only for drawCreature()
    this.w = 0; this.h = 0;
    this.hoverCol = -1;
    this.lastAria = -1;

    canvas.addEventListener('mousemove', e => this.onHover(e));
    canvas.addEventListener('mouseleave', () => { this.hoverCol = -1; this.tooltip.hidden = true; });
  }

  // ---------- recording ----------
  record(s, dt) {
    if (!s.live) {
      if (this.wasLive) this.commit();
      this.wasLive = false;
      return;
    }
    if (!this.wasLive && this.count > 0 && this.count < TL_CAP) {
      this.level[this.count++] = NaN; // a pause in monitoring
      this.dirty = true;
    }
    this.wasLive = true;
    this.accL += s.level;
    if (s.level > this.accP) this.accP = s.level;
    const per = s.bars.length / TL_BANDS;
    for (let b = 0; b < TL_BANDS; b++) {
      let sum = 0;
      const a = Math.floor(b * per), e = Math.floor((b + 1) * per);
      for (let i = a; i < e; i++) sum += s.bars[i];
      this.accB[b] += sum / (e - a);
    }
    this.accN++;
    this.accT += dt;
    if (this.accT >= 1) { this.accT -= 1; this.commit(); }
  }

  commit() {
    if (!this.accN || this.count >= TL_CAP) { this.resetAcc(); return; }
    const i = this.count++;
    this.level[i] = this.accL / this.accN;
    this.peak[i] = this.accP;
    for (let b = 0; b < TL_BANDS; b++) this.bands[i * TL_BANDS + b] = Math.min(1, this.accB[b] / this.accN);
    this.resetAcc();
    this.dirty = true;
    if (this.count - this.lastAria >= 30) this.updateAria();
  }

  resetAcc() { this.accN = 0; this.accL = 0; this.accP = 0; this.accT = 0; this.accB.fill(0); }

  clear() {
    this.count = 0; this.resetAcc(); this.wasLive = false; this.dirty = true; this.lastAria = -1;
    this.canvas.setAttribute('aria-label', 'Lesson timeline: nothing recorded yet');
  }

  stats() {
    let n = 0, sum = 0;
    for (let i = 0; i < this.count; i++) if (this.level[i] === this.level[i]) { n++; sum += this.level[i]; }
    return { n, avg: n ? sum / n : 0 };
  }

  updateAria() {
    this.lastAria = this.count;
    const { n, avg } = this.stats();
    this.canvas.setAttribute('aria-label',
      `Lesson timeline: ${Math.round(n / 60)} minutes recorded, average ${Math.round(avg)} dB`);
  }

  // ---------- layout ----------
  resize() {
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
    for (const c of [this.canvas, this.layer, this.crt]) {
      if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    }
    this.w = cw; this.h = ch; this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.lctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const L = this.L = {};
    L.hh = Math.max(56, Math.min(110, ch * 0.14));
    L.fh = 30;
    L.x0 = Math.max(44, cw * 0.045);
    L.y0 = L.hh;
    L.pw = cw - L.x0 - Math.max(16, cw * 0.02);
    L.ph = ch - L.hh - L.fh;
    L.cols = Math.max(12, Math.min(TL_MAX_COLS, Math.floor(L.pw / 10)));
    L.cw = L.pw / L.cols;
    L.rows = Math.max(12, Math.min(36, Math.round(L.ph / 12)));
    L.rh = L.ph / L.rows;
    L.gap = L.cw >= 7 ? 2 : 1;
    L.lane = Math.max(10, L.ph * 0.07);

    const retro = "'VT323', ui-monospace, monospace";
    const mono = "'JetBrains Mono', ui-monospace, monospace";
    this.fTitle = `${Math.round(L.hh * 0.36)}px ${retro}`;
    this.fBig = `600 ${Math.round(L.hh * 0.42)}px ${mono}`;
    this.fSmall = `${Math.max(14, Math.round(L.hh * 0.22))}px ${retro}`;
    this.fAxis = `${Math.max(13, Math.round(Math.min(18, ch * 0.028)))}px ${retro}`;
    this.fAttract = `${Math.max(20, Math.round(Math.min(cw, ch) * 0.06))}px ${retro}`;

    // CRT overlay: scanlines + vignette, drawn once per resize
    const c = this.crt.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    c.fillStyle = 'rgba(0,0,0,.16)';
    for (let y = 0; y < ch; y += 3) c.fillRect(0, y, cw, 1);
    const v = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.5)');
    c.fillStyle = v;
    c.fillRect(0, 0, cw, ch);

    this.bg = this.ctx.createLinearGradient(0, 0, 0, ch);
    this.bg.addColorStop(0, '#0d1220');
    this.bg.addColorStop(1, '#06080f');
    this.dirty = true;
    this.layerKey = '';
  }

  span() {
    const need = this.count + 30;
    for (const m of TL_SPANS) if (m * 60 >= need) return m * 60;
    return TL_SPANS[TL_SPANS.length - 1] * 60;
  }

  // ---------- aggregation ----------
  aggregate() {
    const L = this.L, S = this.span(), spc = S / L.cols;
    this.S = S; this.spc = spc;
    for (let c = 0; c < L.cols; c++) {
      const a = Math.floor(c * spc), e = Math.min(this.count, Math.max(a + 1, Math.floor((c + 1) * spc)));
      let n = 0, sum = 0, pk = 0, br = 0;
      const ob = c * TL_BANDS;
      for (let b = 0; b < TL_BANDS; b++) this.colB[ob + b] = 0;
      for (let i = a; i < e; i++) {
        const l = this.level[i];
        if (l !== l) { br = 1; continue; }
        n++; sum += l;
        if (this.peak[i] > pk) pk = this.peak[i];
        for (let b = 0; b < TL_BANDS; b++) this.colB[ob + b] += this.bands[i * TL_BANDS + b];
      }
      this.colN[c] = n;
      this.colBreak[c] = br;
      this.colL[c] = n ? sum / n : 0;
      this.colP[c] = pk;
      if (n) for (let b = 0; b < TL_BANDS; b++) this.colB[ob + b] /= n;
    }
    this.dirty = false;
  }

  // The recorded columns are rendered to an offscreen layer (with glow) once
  // per new sample, so each frame is a single drawImage plus the live column.
  renderLayer(s) {
    const key = `${this.mode}|${this.count}|${this.S}|${s.quiet}|${s.alert}|${this.w}x${this.h}`;
    if (key === this.layerKey) return;
    this.layerKey = key;
    const ctx = this.lctx, L = this.L;
    ctx.clearRect(0, 0, this.w, this.h);
    const unlit = new Path2D();
    const lit = [new Path2D(), new Path2D(), new Path2D()];
    const pk = [new Path2D(), new Path2D(), new Path2D()];

    if (this.mode === 'levels') {
      for (let c = 0; c < L.cols; c++) {
        const x = L.x0 + c * L.cw + L.gap / 2;
        const n = this.colN[c];
        const on = n ? Math.round(tlFrac(this.colL[c]) * L.rows) : 0;
        const pr = n ? Math.min(L.rows - 1, Math.floor(tlFrac(this.colP[c]) * L.rows)) : -1;
        for (let r = 0; r < L.rows; r++) {
          const y = L.y0 + L.ph - (r + 1) * L.rh + L.gap / 2;
          const z = this.rowZone(r, s);
          if (r < on) lit[z].rect(x, y, L.cw - L.gap, L.rh - L.gap);
          else if (r === pr) pk[z].rect(x, y, L.cw - L.gap, L.rh - L.gap);
          else unlit.rect(x, y, L.cw - L.gap, L.rh - L.gap);
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,.045)';
      ctx.fill(unlit);
      ctx.shadowBlur = 8;
      for (let z = 0; z < 3; z++) {
        ctx.fillStyle = ctx.shadowColor = ZONES[z].solid;
        ctx.fill(lit[z]);
        ctx.fillStyle = ZONES[z].light;
        ctx.fill(pk[z]);
      }
      ctx.shadowBlur = 0;
    } else {
      const heat = TL_RAMP.map(() => new Path2D());
      const hh = L.ph - L.lane - 6, bh = hh / TL_BANDS;
      for (let c = 0; c < L.cols; c++) {
        const x = L.x0 + c * L.cw + L.gap / 2;
        const n = this.colN[c];
        for (let b = 0; b < TL_BANDS; b++) {
          const y = L.y0 + hh - (b + 1) * bh + L.gap / 2;
          if (!n) { unlit.rect(x, y, L.cw - L.gap, bh - L.gap); continue; }
          const v = Math.pow(this.colB[c * TL_BANDS + b], 0.7);
          heat[Math.min(TL_RAMP.length - 1, Math.floor(v * TL_RAMP.length))].rect(x, y, L.cw - L.gap, bh - L.gap);
        }
        const ly = L.y0 + L.ph - L.lane;
        if (n) lit[gaugeZone(this.colL[c], s.quiet, s.alert)].rect(x, ly, L.cw - L.gap, L.lane);
        else unlit.rect(x, ly, L.cw - L.gap, L.lane);
      }
      ctx.fillStyle = 'rgba(255,255,255,.045)';
      ctx.fill(unlit);
      for (let i = 0; i < heat.length; i++) { ctx.fillStyle = TL_RAMP[i]; ctx.fill(heat[i]); }
      for (let z = 0; z < 3; z++) { ctx.fillStyle = ZONES[z].solid; ctx.fill(lit[z]); }
    }

    // Pauses in monitoring
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    for (let c = 0; c < L.cols; c++) {
      if (!this.colBreak[c]) continue;
      const x = Math.round(L.x0 + c * L.cw) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, L.y0); ctx.lineTo(x, L.y0 + L.ph); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  rowZone(r, s) {
    const db = TL_LO + ((r + 0.5) / this.L.rows) * (TL_HI - TL_LO);
    return gaugeZone(db, s.quiet, s.alert);
  }

  // ---------- per frame ----------
  frame(s, dt) {
    this.record(s, dt);
    if (this.canvas.clientWidth === 0 || this.onScreen === false) return; // not on screen
    if (this.shouldDraw && !this.shouldDraw()) return;
    if (this.w !== this.canvas.clientWidth || this.h !== this.canvas.clientHeight) this.resize();
    if (this.dirty) this.aggregate();
    this.renderLayer(s);

    const ctx = this.ctx, L = this.L, w = this.w, h = this.h, t = s.t;
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);

    this.drawHeader(s);
    this.drawAxes(s);
    ctx.drawImage(this.layer, 0, 0, w, h);
    this.drawThresholds(s);
    this.q = s.quiet; this.a = s.alert;

    const liveCol = Math.min(L.cols - 1, Math.floor(this.count / this.spc));
    if (s.live) this.drawLiveColumn(s, liveCol);

    if (this.hoverCol >= 0 && this.colN[this.hoverCol]) {
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(L.x0 + this.hoverCol * L.cw + 0.5, L.y0 - 2, L.cw - 1, L.ph + 4);
    }

    if (!s.live) {
      const blink = s.reduced || Math.sin(t * 3.2) > -0.2;
      if (blink) {
        ctx.font = this.fAttract;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ZONES[1].solid;
        ctx.shadowColor = ZONES[1].solid;
        ctx.shadowBlur = 12;
        const msg = this.count ? '❚❚ PAUSED — PRESS START TO CONTINUE' : '▶ PRESS START TO RECORD THE LESSON';
        const k = Math.min(1, (L.pw * 0.92) / ctx.measureText(msg).width);
        ctx.save();
        ctx.translate(L.x0 + L.pw / 2, L.y0 + L.ph / 2);
        ctx.scale(k, k);
        ctx.fillText(msg, 0, 0);
        ctx.restore();
        ctx.shadowBlur = 0;
      }
    }

    ctx.drawImage(this.crt, 0, 0, w, h);
  }

  drawLiveColumn(s, col) {
    const ctx = this.ctx, L = this.L;
    const x = L.x0 + col * L.cw + L.gap / 2;
    // playhead
    const a = s.reduced ? 0.5 : 0.35 + 0.25 * Math.sin(s.t * 6);
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    ctx.fillRect(x + L.cw - L.gap / 2, L.y0, 2, L.ph);
    ctx.shadowBlur = 10;
    if (this.mode === 'levels') {
      const on = Math.round(tlFrac(s.level) * L.rows);
      for (let r = 0; r < on; r++) {
        const z = this.rowZone(r, s);
        ctx.fillStyle = ctx.shadowColor = ZONES[z].light;
        ctx.fillRect(x, L.y0 + L.ph - (r + 1) * L.rh + L.gap / 2, L.cw - L.gap, L.rh - L.gap);
      }
    } else {
      const hh = L.ph - L.lane - 6, bh = hh / TL_BANDS, per = s.bars.length / TL_BANDS;
      ctx.shadowBlur = 0;
      for (let b = 0; b < TL_BANDS; b++) {
        let sum = 0;
        const i0 = Math.floor(b * per), i1 = Math.floor((b + 1) * per);
        for (let i = i0; i < i1; i++) sum += s.bars[i];
        const v = Math.pow(sum / (i1 - i0), 0.7);
        ctx.fillStyle = TL_RAMP[Math.min(TL_RAMP.length - 1, Math.floor(v * TL_RAMP.length))];
        ctx.fillRect(x, L.y0 + hh - (b + 1) * bh + L.gap / 2, L.cw - L.gap, bh - L.gap);
      }
      const z = gaugeZone(s.level, s.quiet, s.alert);
      ctx.fillStyle = ctx.shadowColor = ZONES[z].solid;
      ctx.shadowBlur = 10;
      ctx.fillRect(x, L.y0 + L.ph - L.lane, L.cw - L.gap, L.lane);
    }
    ctx.shadowBlur = 0;
  }

  drawHeader(s) {
    const ctx = this.ctx, L = this.L, w = this.w, t = s.t;
    const cy = L.hh * 0.42;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = this.fTitle;
    ctx.fillStyle = '#e8edf7';
    let title = this.getTitle ? this.getTitle() : 'LESSON TIMELINE';
    if (w < 560 && title === 'LESSON TIMELINE') title = 'TIMELINE';
    const maxTitle = w * (w < 560 ? 0.6 : 0.45);
    while (title.length > 8 && ctx.measureText(title).width > maxTitle) title = title.slice(0, -2) + '…';
    ctx.fillText(title, L.x0, cy);
    let x = L.x0 + ctx.measureText(title).width + 18;

    // REC / PAUSED indicator + elapsed
    ctx.font = this.fSmall;
    if (s.live) {
      if (s.reduced || Math.sin(t * 4) > 0) {
        ctx.fillStyle = ZONES[2].solid;
        ctx.beginPath(); ctx.arc(x + 6, cy, 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = ZONES[2].solid;
      ctx.fillText('REC', x + 18, cy);
      x += 18 + ctx.measureText('REC ').width;
    }
    ctx.fillStyle = 'rgba(232,237,247,.7)';
    ctx.fillText(tlClock(this.count), x, cy);

    // Legend (second line)
    const ly = L.hh * 0.78;
    ctx.font = this.fSmall;
    let lx = L.x0;
    if (this.mode === 'levels') {
      const names = ['CALM', 'GETTING LOUD', 'TOO LOUD'];
      for (let z = 0; z < 3; z++) {
        ctx.fillStyle = ZONES[z].solid;
        ctx.fillRect(lx, ly - 5, 10, 10);
        ctx.fillStyle = 'rgba(232,237,247,.65)';
        ctx.fillText(names[z], lx + 15, ly);
        lx += 15 + ctx.measureText(names[z]).width + 18;
      }
    } else {
      ctx.fillStyle = 'rgba(232,237,247,.65)';
      ctx.fillText('QUIET', lx, ly);
      lx += ctx.measureText('QUIET ').width;
      for (let i = 0; i < TL_RAMP.length; i++) { ctx.fillStyle = TL_RAMP[i]; ctx.fillRect(lx + i * 9, ly - 5, 8, 10); }
      lx += TL_RAMP.length * 9 + 6;
      ctx.fillStyle = 'rgba(232,237,247,.65)';
      ctx.fillText(w < 640 ? 'LOUD' : 'LOUD  ·  LOW PITCH AT THE BOTTOM', lx, ly);
    }

    // Right side: live number + optional mini creature
    const zi = gaugeZone(s.level, s.quiet, s.alert);
    let rx = w - Math.max(16, w * 0.02);
    if (s.faces && w > 520) {
      const r = L.hh * 0.26;
      this.face.drawCreature(rx - r * 1.1, L.hh * 0.6, r, zi, s.level, t, s.reduced);
      rx -= r * 2.6;
    }
    if (s.live) {
      ctx.textAlign = 'right';
      ctx.font = this.fBig;
      ctx.fillStyle = ZONES[zi].solid;
      ctx.fillText(Math.round(s.level) + ' dB', rx, L.hh * 0.5);
    }
  }

  drawAxes(s) {
    const ctx = this.ctx, L = this.L;
    ctx.font = this.fAxis;
    ctx.fillStyle = 'rgba(232,237,247,.5)';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    if (this.mode === 'levels') {
      for (let db = 40; db <= 90; db += 10) {
        ctx.fillText(db, L.x0 - 8, L.y0 + L.ph * (1 - tlFrac(db)));
      }
    } else {
      const hh = L.ph - L.lane - 6;
      ctx.fillText('HI', L.x0 - 8, L.y0 + 8);
      ctx.fillText('LO', L.x0 - 8, L.y0 + hh - 8);
      ctx.fillText('dB', L.x0 - 8, L.y0 + L.ph - L.lane / 2);
    }

    // Time axis
    const mins = this.S / 60;
    let step = TL_TICKS[TL_TICKS.length - 1];
    for (const k of TL_TICKS) if (mins / k <= 8) { step = k; break; }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let m = 0; m <= mins; m += step) {
      const x = L.x0 + (m * 60 / this.S) * L.pw;
      ctx.fillStyle = 'rgba(232,237,247,.5)';
      ctx.fillText(m === 0 ? '0' : m + 'm', Math.min(x, L.x0 + L.pw - 10), L.y0 + L.ph + 8);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fillRect(Math.round(x), L.y0 + L.ph + 1, 1, 5);
    }
  }

  // Drawn over the LED layer so the thresholds read against lit segments
  drawThresholds(s) {
    if (this.mode !== 'levels') return;
    const ctx = this.ctx, L = this.L;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.font = this.fAxis;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const lines = [[s.quiet, 1, 'QUIET'], [s.alert, 2, 'ALERT']];
    for (const [db, z, name] of lines) {
      const y = Math.round(L.y0 + L.ph * (1 - tlFrac(db))) + 0.5;
      ctx.strokeStyle = ZONES[z].solid;
      ctx.beginPath(); ctx.moveTo(L.x0, y); ctx.lineTo(L.x0 + L.pw, y); ctx.stroke();
      ctx.fillStyle = ZONES[z].solid;
      ctx.fillText(`${name} ${db}`, L.x0 + L.pw - 4, y - 3);
    }
    ctx.setLineDash([]);
  }

  // ---------- interaction & export ----------
  onHover(e) {
    if (!this.L) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top, L = this.L;
    const c = Math.floor((x - L.x0) / L.cw);
    if (c < 0 || c >= L.cols || y < L.y0 || y > L.y0 + L.ph || !this.colN[c]) {
      this.hoverCol = -1; this.tooltip.hidden = true; return;
    }
    this.hoverCol = c;
    const z = ZONES[gaugeZone(this.colL[c], this.q || 0, this.a || 999)];
    const t0 = c * this.spc, t1 = (c + 1) * this.spc;
    this.tooltip.innerHTML =
      `<strong>${tlClock(t0)}–${tlClock(Math.min(t1, this.count))}</strong><br>` +
      `Average ${Math.round(this.colL[c])} dB · Peak ${Math.round(this.colP[c])} dB<br>` +
      `<span class="tl-tip-zone" style="--z:${z.solid}">${z.status}</span>`;
    this.tooltip.hidden = false;
    const tw = this.tooltip.offsetWidth;
    this.tooltip.style.left = Math.min(rect.width - tw - 8, Math.max(8, x + 14)) + 'px';
    this.tooltip.style.top = Math.max(8, y - 70) + 'px';
  }

  savePNG(filename) {
    this.canvas.toBlob(b => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  toCSV(quiet, alert) {
    const lines = ['elapsed_seconds,elapsed,average_db,peak_db,zone'];
    let sec = 0;
    for (let i = 0; i < this.count; i++) {
      const l = this.level[i];
      if (l !== l) { lines.push(`,,,,paused`); continue; }
      const z = gaugeZone(l, quiet, alert);
      lines.push(`${sec},${tlClock(sec)},${l.toFixed(1)},${this.peak[i].toFixed(1)},${['calm', 'getting loud', 'too loud'][z]}`);
      sec++;
    }
    return lines.join('\n');
  }
}
