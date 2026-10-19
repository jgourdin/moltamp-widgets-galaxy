// @moltamp-visualizer: Reactor Core ♪
// The Context Core reactor running on your music: the gauge fills with the loudness from green to orange to red, the core throbs on every beat and a sudden drop after a loud passage triggers a SCRAM flash.
// Music version of the Context Core widget (Cyberpunk pack) of the MOLTamp Widgets Galaxy.
// Author: j0j0 · License: MIT

// vis-kit — shared runtime of the music versions of the MOLTamp Widgets Galaxy (MIT, j0j0). Canvas 2D, no DOM.
// Call VK.frame(...) first in every render: it resolves the skin palette and analyses the audio.
var VK = (function () {
  var FALLBACK = { accent: '#ff71ce', dim: '#8579b5', magenta: '#b967ff', cyan: '#01cdfe', green: '#05ffa1', red: '#ff5c7a',
    yellow: '#fffb96', blue: '#7b8cff', bg: '#0c0926', text: '#e6e1ff' };
  // A colour missing from the skin borrows another skin colour before the neutral fallback.
  var BORROW = { accent: ['cyan', 'magenta'], dim: ['border', 'text'], magenta: ['red', 'accent'], cyan: ['blue', 'accent'],
    green: ['cyan', 'accent'], red: ['magenta', 'accent'], yellow: ['accent', 'red'], blue: ['cyan', 'accent'],
    bg: ['termBg'], text: ['termFg', 'accent'] };
  var NAMES = ['accent', 'dim', 'magenta', 'cyan', 'green', 'red', 'yellow', 'blue', 'bg', 'text'];
  var c = {}, rgb = {}, key = '', light = false;

  // Canvas rejects var(), color-mix() and empty strings: only hex and rgb()/rgba() are trusted.
  function parse(v) {
    if (typeof v !== 'string') return null;
    v = v.trim();
    var m = /^#([0-9a-f]{3,8})$/i.exec(v);
    if (m) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      if (h.length !== 6 && h.length !== 8) return null;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
    return m ? [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])] : null;
  }

  function palette(colors) {
    colors = colors || {};
    var k = NAMES.map(function (n) { return colors[n]; }).join('|') + '|' + colors.border + '|' + colors.termBg + '|' + colors.termFg;
    if (k === key) return;
    key = k;
    NAMES.forEach(function (n) {
      var v = parse(colors[n]), chain = BORROW[n] || [];
      for (var i = 0; !v && i < chain.length; i++) v = parse(colors[chain[i]]);
      rgb[n] = v || parse(FALLBACK[n]);
      c[n] = 'rgb(' + rgb[n][0] + ',' + rgb[n][1] + ',' + rgb[n][2] + ')';
    });
    light = lum('bg') > 0.55;
  }

  function rgba(n, a) { var v = rgb[n] || rgb.text; return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + Math.max(0, Math.min(1, a)) + ')'; }
  function mix(a, b, t, alpha) {
    var x = rgb[a] || rgb.text, y = rgb[b] || rgb.text;
    var r = Math.round(x[0] + (y[0] - x[0]) * t), g = Math.round(x[1] + (y[1] - x[1]) * t), bl = Math.round(x[2] + (y[2] - x[2]) * t);
    return alpha === undefined ? 'rgb(' + r + ',' + g + ',' + bl + ')' : 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha + ')';
  }
  function lum(n) { var v = rgb[n] || rgb.text; return (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255; }

  // ---- audio analysis
  var A = { t: 0, dt: 1 / 60, bass: 0, mid: 0, high: 0, energy: 0, kick: 0, hit: false, beats: 0, bpm: 0, silent: true,
    raw: { bass: 0, mid: 0, high: 0 }, data: null, wave: null };
  var last = 0, cool = 0, quietFor = 0, hits = [];

  function band(data, from, to) {
    var n = Math.min(to, data.length) - from;
    if (n <= 0) return 0;
    var s = 0;
    for (var i = from; i < from + n; i++) s += data[i];
    return s / (n * 255);
  }

  function audio(data, beat) {
    var now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    A.dt = last ? Math.min(0.1, Math.max(0.001, (now - last) / 1000)) : 1 / 60;
    last = now;
    A.t += A.dt;
    data = data && data.length ? data : new Uint8Array(128);
    A.data = data;
    // Bins are ~187 Hz wide: the kick and the bass fundamentals live in bins 0-2, bins 3+ are already mids.
    var b = band(data, 0, 3), m = band(data, 3, 40), h = band(data, 40, 110);
    A.raw.bass = b; A.raw.mid = m; A.raw.high = h;
    var k = 1 - Math.exp(-A.dt / 0.12);
    A.bass += (b - A.bass) * k;
    A.mid += (m - A.mid) * k;
    A.high += (h - A.high) * (1 - Math.exp(-A.dt / 0.08));
    A.energy += (b * 0.5 + m * 0.35 + h * 0.15 - A.energy) * k;
    // Beats come from the shared audio front-end (beat tracker, appended to every renderer at install):
    // a level-based detector here would add hits off the beat.
    cool -= A.dt;
    beat = beat || {};
    A.hit = !!beat.isBeat && cool <= 0;
    if (A.hit) {
      A.kick = 1;
      cool = 0.2;
      A.beats++;
      hits.push(A.t);
      if (hits.length > 9) hits.shift();
      if (hits.length >= 5) {
        var gaps = [];
        for (var i = 1; i < hits.length; i++) gaps.push(hits[i] - hits[i - 1]);
        gaps.sort(function (x, y) { return x - y; });
        var g = gaps[gaps.length >> 1];
        if (g > 0.25 && g < 1.5) A.bpm = Math.round(60 / g);
      }
    }
    A.kick = Math.max(A.kick * Math.exp(-A.dt * 5.2), beat.decay || 0);
    quietFor = A.energy < 0.025 ? quietFor + A.dt : 0;
    A.quietFor = quietFor;
    A.silent = quietFor > 1.5;
    if (A.silent) A.bpm = 0;
    return A;
  }

  // n log-spaced levels (0..1) from the 128 bins, low to high.
  function bands(n) {
    var out = [], d = A.data || [];
    for (var i = 0; i < n; i++) {
      var a = Math.floor(1 + Math.pow(i / n, 1.8) * 120), b = Math.max(a + 1, Math.floor(1 + Math.pow((i + 1) / n, 1.8) * 120));
      out.push(band(d, a, b));
    }
    return out;
  }

  function frame(data, beat, colors, wave) {
    palette(colors);
    audio(data, beat);
    A.wave = wave || null;
    return A;
  }

  function clear(ctx, W, H, fill) {
    ctx.clearRect(0, 0, W, H);
    if (fill) { ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H); }
  }

  function reset(ctx) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    if (ctx.setLineDash) ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // After a few seconds of silence, a discreet note in the corner: a muted audio capture is then easy to spot.
  function hint(ctx, W, H) {
    var q = A.quietFor || 0;
    if (q < 6 || W < 90 || H < 40) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (q - 6) / 2) * 0.6;
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = font(Math.max(8, Math.min(10, H / 14)));
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = c.dim;
    ctx.fillText('♪ no audio signal', W - 6, H - 4);
    ctx.restore();
  }

  function hash(str) {
    var h = 2166136261;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
  function prng(seed) {
    var a = (seed * 4294967296) >>> 0 || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function font(size, weight) { return (weight || 'normal') + ' ' + Math.max(7, size).toFixed(1) + 'px "SF Mono", Menlo, "Hiragino Sans", monospace'; }

  return {
    frame: frame, A: A, c: c, rgb: rgb, rgba: rgba, mix: mix, lum: lum, bands: bands, band: band,
    clear: clear, reset: reset, hint: hint, hash: hash, prng: prng, font: font,
    get light() { return light; }
  };
})();

// Reactor Core ♪: loudness as a reactor gauge; beats throb the core, a sharp drop after a loud passage is a SCRAM.
var SEG = 36, START = Math.PI * 0.75, SPAN = Math.PI * 1.5;
var shown = 0, hist = [], scram = 0, scramCool = 0, flick = 0, ref = 0.3;

function toneFor(p) {
  if (p >= 80) return VK.c.red;
  if (p >= 60) return VK.mix('yellow', 'red', 0.45);
  return VK.c.green;
}
function toneA(p, a) {
  if (p >= 80) return VK.rgba('red', a);
  if (p >= 60) return VK.mix('yellow', 'red', 0.45, Math.max(0, Math.min(1, a)));
  return VK.rgba('green', a);
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt;
  // Auto-gain: the level is read against a slowly decaying peak, so any track reaches red on its loud parts.
  ref = Math.max(A.energy, ref * Math.exp(-dt / 25), 0.12);
  var target = A.silent ? 0 : Math.min(100, A.energy / ref * 92);
  shown += (target - shown) * (1 - Math.exp(-dt / 0.25));

  // SCRAM: the level falls more than 45 points within a second after peaking above 70.
  hist.push([A.t, shown]);
  while (hist.length && A.t - hist[0][0] > 1.2) hist.shift();
  var peak = 0;
  for (var h0 = 0; h0 < hist.length; h0++) peak = Math.max(peak, hist[h0][1]);
  scramCool -= dt;
  if (peak > 70 && peak - shown > 45 && scramCool <= 0) { scram = 1.3; scramCool = 4; }
  scram = Math.max(0, scram - dt);
  flick += dt;

  var cx = W / 2, cy = H * 0.5, R = Math.min(W * 0.42, H * 0.42);
  var crit = shown >= 90, tone = toneFor(shown);
  var flicker = crit ? 0.6 + 0.4 * Math.sin(flick * 16) : 0.85 + 0.15 * Math.sin(flick * 3.1) * Math.sin(flick * 1.7);

  ctx.clearRect(0, 0, W, H);
  // Wide slots: control rods on both sides, one per band, segmented like the gauge.
  if (W > H * 2.2) {
    var RODS = 24, lv = VK.bands(RODS), span = W / 2 - R * 1.35, rw = span / RODS, seg = Math.max(3, H / 14);
    for (var r0 = 0; r0 < RODS; r0++) {
      var n = Math.round(lv[r0] * 1.4 * (H * 0.8) / seg);
      for (var g0 = 0; g0 < Math.min(n, Math.floor(H * 0.8 / seg)); g0++) {
        var pv = g0 / (H * 0.8 / seg) * 100;
        ctx.fillStyle = toneA(pv, 0.75);
        var yy = cy + H * 0.4 - (g0 + 1) * seg;
        ctx.fillRect(cx - R * 1.35 - (r0 + 1) * rw + 1, yy + 1, Math.max(1, rw - 3), seg - 2);
        ctx.fillRect(cx + R * 1.35 + r0 * rw + 1, yy + 1, Math.max(1, rw - 3), seg - 2);
      }
    }
  }
  if (crit) { ctx.fillStyle = VK.rgba('red', 0.07 * (0.5 + 0.5 * Math.sin(flick * 8))); ctx.fillRect(0, 0, W, H); }

  // Core glow: bigger as it gets loud, throbbing on every beat.
  var coreR = R * (0.75 + A.kick * 0.18);
  var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  var a = (0.15 + 0.5 * shown / 100) * flicker + A.kick * 0.25;
  core.addColorStop(0, toneA(shown, Math.min(0.92, a + 0.25)));
  core.addColorStop(0.45, toneA(shown, a * 0.5));
  core.addColorStop(1, toneA(shown, 0));
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, 6.283); ctx.fill();

  // Segmented ring
  var gap = 0.025, segA = SPAN / SEG;
  ctx.lineWidth = Math.max(3, R * 0.13);
  for (var i = 0; i < SEG; i++) {
    var s0 = START + i * segA + gap, s1 = START + (i + 1) * segA - gap;
    var p = (i + 1) / SEG * 100, on = p <= shown + 0.001;
    ctx.strokeStyle = on ? toneFor(p) : VK.rgba('dim', 0.18);
    ctx.beginPath(); ctx.arc(cx, cy, R, s0, s1); ctx.stroke();
  }
  ctx.lineWidth = 1 + A.kick * 1.5;
  ctx.strokeStyle = VK.rgba('dim', 0.35 + A.kick * 0.4);
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, START, START + SPAN); ctx.stroke();

  // SCRAM flash
  if (scram > 0) {
    var k = scram / 1.3;
    ctx.fillStyle = VK.rgba(Math.sin(scram * 30) > 0 ? 'red' : 'text', 0.18 * k);
    ctx.fillRect(0, 0, W, H);
  }

  // Readout
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = A.silent ? VK.c.dim : VK.c.text;
  ctx.font = VK.font(Math.max(12, R * 0.38), 'bold');
  ctx.fillText(A.silent ? '--' : Math.round(shown) + '%', cx, cy - R * 0.04);
  if (R > 30) {
    ctx.font = VK.font(Math.max(7, R * 0.11));
    ctx.fillStyle = scram > 0 ? VK.c.red : crit ? VK.c.red : VK.c.dim;
    ctx.fillText(scram > 0 ? '緊急停止 SCRAM' : crit ? '臨界 CRITICAL' : A.silent ? '停止 IDLE' : '炉心 LOUDNESS', cx, cy + R * 0.3);
  }
  if (R > 50 && A.bpm) {
    ctx.fillStyle = VK.rgba('text', 0.8);
    ctx.font = VK.font(Math.max(8, R * 0.09));
    ctx.fillText(A.bpm + ' BPM', cx, cy + R * 0.82);
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();

// audio-frontend v3 — shared input stage of the MOLTamp Widgets Galaxy visualizers (MIT, j0j0).
// MOLTamp hands over a 128-bin analyser spectrum (fftSize 256, smoothing 0.8, dB bytes): each bin spans ~187 Hz, so
// the kick lives in bins 0-2 only, bins 3-12 follow the bass line and off-beats, and loud masters pin bins 0-1 at 255.
// Measured on real music, a kick barely lifts those bins frame by frame, so beats are tracked rather than detected:
// tempo and phase are folded out of the last 8 s of low-end flux, every predicted beat is checked afterwards against
// the flux between beats, and flashes follow the predicted grid only while it holds (lock above 1.9, release below
// 1.4 or as soon as the low end goes quiet). Without a steady beat, only clear low-end hits flash. The spectrum itself
// is brought back to a usable range for the renderer (peaks tracked over ~4 s, raised to ~200/255, gain 1x-6x).
;(function () {
  var inner = module.exports;
  if (typeof inner !== 'function') return;
  var LOW = [1, 1, 1], HIST = 8, LOCK_ON = 1.9, LOCK_OFF = 1.4;
  var ref = 0, last = 0, out = null, prev = null, own = 0, sat = [0, 0, 0];
  var ts = [], os = [], wt = [], head = 0, nextEval = 0, slots = new Float64Array(24);
  var period = 0, phase = 0, lastPred = -1e9, pend = [], scored = [], lock = 0, locked = false;
  var fMean = 0, fVar = 0, cool = 0, act = 0, actSlow = 0;

  // Folds the weighted flux history over one beat period: returns the contrast of the strongest slot and its phase.
  function fold(P) {
    var S = slots.length, i, total = 0;
    for (i = 0; i < S; i++) slots[i] = 0;
    for (i = head; i < ts.length; i++) {
      var x = ts[i] / P;
      slots[Math.floor((x - Math.floor(x)) * S) % S] += wt[i];
      total += wt[i];
    }
    if (total <= 0) return null;
    var best = -1, at = 0, mean = total / S;
    for (i = 0; i < S; i++) {
      var v = slots[(i + S - 1) % S] + 2 * slots[i] + slots[(i + 1) % S];
      if (v > best) { best = v; at = i; }
    }
    var a = slots[(at + S - 1) % S], b = slots[at], c = slots[(at + 1) % S], den = a - 2 * b + c;
    var off = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
    return { score: (best / 4 - mean) / mean, phase: ((at + off + 0.5) / S + 1) % 1 };
  }

  // Best tempo between 80 and 170 BPM (1 BPM steps, then 0.1 around the winner), with a mild pull toward 125 BPM
  // so that half and double tempos lose ties. Recent frames weigh more (3 s time constant) to follow tempo drifts.
  function evaluate(now) {
    while (head < ts.length && now - ts[head] > HIST) head++;
    if (head > 600) { ts = ts.slice(head); os = os.slice(head); wt = wt.slice(head); head = 0; }
    if (ts.length - head < 90) { period = 0; return; }
    for (var i = head; i < ts.length; i++) wt[i] = os[i] * Math.exp(-(now - ts[i]) / 3);
    var best = null, bpm;
    function consider(b) {
      var r = fold(60 / b);
      if (!r) return;
      var l = Math.log(b / 125) / Math.LN2;
      r.score *= Math.exp(-0.5 * l * l / 0.36);
      r.bpm = b;
      if (!best || r.score > best.score) best = r;
    }
    for (bpm = 80; bpm <= 170; bpm += 1) consider(bpm);
    if (!best) { period = 0; return; }
    var c0 = best.bpm;
    for (bpm = c0 - 1; bpm <= c0 + 1; bpm += 0.1) consider(bpm);
    period = 60 / best.bpm;
    phase = best.phase;
  }

  function meanIn(a, b) {
    var s = 0, c = 0;
    for (var i = ts.length - 1; i >= head && ts[i] > a; i--) if (ts[i] <= b) { s += os[i]; c++; }
    return c ? s / c : 0;
  }

  module.exports = function (ctx, data, W, H, colors, beat, waveData) {
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    var dt = last ? Math.min(0.2, Math.max(0.001, now - last)) : 1 / 60;
    last = now;
    var src = beat || {}, hit = false, measured = false;
    if (data && data.length > 12) {
      var n = data.length, peak = 0, i, raw = data;
      if (!prev || prev.length !== n) prev = new Uint8Array(n);
      // Low-end flux (bins 0-2); a bin pinned at 255 most of the last ~4 s carries no information and is left out.
      var o = 0, wsum = 0, ks = 1 - Math.exp(-dt / 4);
      for (i = 0; i < LOW.length; i++) {
        sat[i] += ((raw[i] >= 254 ? 1 : 0) - sat[i]) * ks;
        if (sat[i] > 0.4) continue;
        wsum += LOW[i];
        var d = raw[i] - prev[i];
        if (d > 0) o += LOW[i] * d;
      }
      prev.set(raw);
      o = wsum ? o / (255 * wsum) : 0;
      ts.push(now); os.push(o); wt.push(0);
      if (now >= nextEval) { evaluate(now); nextEval = now + 0.25; }

      // Every predicted beat is checked once it has passed: flux on the beat against flux between beats.
      while (pend.length && now > pend[0][0] + pend[0][1] * 0.8 + 0.02) {
        var pb = pend.shift();
        scored.push([meanIn(pb[0] - 0.035, pb[0] + 0.05), meanIn(pb[0] + pb[1] * 0.2, pb[0] + pb[1] * 0.8)]);
        if (scored.length > 12) scored.shift();
        var on = 0, offb = 0;
        for (i = 0; i < scored.length; i++) { on += scored[i][0]; offb += scored[i][1]; }
        lock = scored.length < 4 ? 0 : offb > 0 ? on / offb : on > 0 ? 9 : 0;
      }
      var predicted = false;
      if (period > 0) {
        var tb = (Math.floor(now / period - phase) + phase) * period;
        if (tb > lastPred + 0.6 * period && now - tb < 0.1) {
          lastPred = tb;
          pend.push([tb, period]);
          predicted = true;
        }
      }
      // The low end going quiet (silence, a breakdown) drops the lock at once instead of after a dozen empty beats.
      act += (o - act) * (1 - Math.exp(-dt / 0.6));
      actSlow += (o - actSlow) * (1 - Math.exp(-dt / 6));
      if (act < actSlow * 0.2) { scored.length = 0; lock = 0; }
      locked = locked ? lock > LOCK_OFF : lock > LOCK_ON;

      var k = 1 - Math.exp(-dt / 1.0), diff = o - fMean;
      fMean += diff * k;
      fVar += (diff * diff - fVar) * k;
      cool -= dt;
      if (locked) hit = predicted;
      else if (o > fMean + 2.5 * Math.sqrt(fVar) + 0.01 && cool <= 0) { hit = true; cool = 0.3; }
      if (hit) own = 1;

      for (i = 1; i < n; i++) if (raw[i] > peak) peak = raw[i];
      ref = Math.max(peak, ref * Math.exp(-dt / 4));
      var gain = ref > 6 ? Math.max(1, Math.min(6, 200 / Math.max(ref, 24))) : 1;
      if (gain > 1.02) {
        if (!out || out.length !== n) out = new Uint8Array(n);
        for (i = 0; i < n; i++) { var v = raw[i] * gain; out[i] = v > 255 ? 255 : v; }
        data = out;
      }
      measured = true;
    }
    own *= Math.exp(-dt * 5);
    // MOLTamp's own flag fires off the beat on smoothed or compressed audio: with a spectrum to measure, only ours
    // counts; without one, MOLTamp's beat state passes through.
    var merged = measured
      ? { energy: src.energy, peak: src.peak, isBeat: hit, decay: own, tempo: locked ? 60 / period : 0, locked: locked }
      : src;
    return inner.call(this, ctx, data, W, H, colors, merged, waveData);
  };
})();
