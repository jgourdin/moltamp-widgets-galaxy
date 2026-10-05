// @moltamp-visualizer: Cyber Vitals ♪
// A cardiac monitor for your music: every beat draws a heartbeat on the ECG with its BPM, the energy breathes on a second trace, and silence flatlines into NO SIGNAL.
// Music version of the Cyber Vitals widget (Cyberpunk pack) of the MOLTamp Widgets Galaxy.
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
  var last = 0, kickAvg = 0, kickPrev = 0, cool = 0, quietFor = 0, hits = [];

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
    var b = band(data, 1, 8), m = band(data, 8, 40), h = band(data, 40, 110);
    A.raw.bass = b; A.raw.mid = m; A.raw.high = h;
    var k = 1 - Math.exp(-A.dt / 0.12);
    A.bass += (b - A.bass) * k;
    A.mid += (m - A.mid) * k;
    A.high += (h - A.high) * (1 - Math.exp(-A.dt / 0.08));
    A.energy += (b * 0.5 + m * 0.35 + h * 0.15 - A.energy) * k;
    // Kick detector backing up MOLTamp's beat flag: a bass hit clearly above its recent average, rising, ≤ ~5/s.
    kickAvg += (b - kickAvg) * (1 - Math.exp(-A.dt / 0.7));
    cool -= A.dt;
    var onset = b > kickAvg * 1.22 + 0.035 && b - kickPrev > 0.02 && cool <= 0;
    kickPrev = b;
    beat = beat || {};
    // MOLTamp's flag and ours often fire on the same hit: the cooldown counts it once.
    A.hit = (onset || !!beat.isBeat) && cool <= 0;
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

// Cyber Vitals ♪: an ECG sweep where each detected beat draws a PQRST complex, plus an energy trace (respiration)
// and segmented BASS / TREBLE bars. The traces live in ring buffers, so every frame is redrawn from scratch.
var SEGMENTS = 16, GAP = 14, BEAT_LEN = 0.42;
var ecg = null, resp = null, len = 0, cursor = 0, beatT = 1e9, bpmShown = 0, flat = 0;

// PQRST shape over the first ~0.4 s after a beat (R spike ~80 ms in).
function qrs(t) {
  function g(c, w, a) { var d = (t - c) / w; return a * Math.exp(-d * d); }
  return g(0.02, 0.012, 0.12) - g(0.07, 0.006, 0.12) + g(0.08, 0.007, 1) - g(0.095, 0.008, 0.28) + g(0.25, 0.035, 0.22);
}

function bar(ctx, x, y, w, h, level, label) {
  ctx.font = VK.font(Math.max(8, h * 0.95));
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = VK.c.text;
  ctx.fillText(label, x, y + h / 2);
  var lab = Math.max(58, h * 5.2), lx = x + lab, bw = Math.max(20, w - lab), on = Math.round(Math.max(0, Math.min(1, level)) * SEGMENTS);
  var sw = (bw - (SEGMENTS - 1) * 2) / SEGMENTS;
  for (var i = 0; i < SEGMENTS; i++) {
    var r = (i + 1) / SEGMENTS;
    ctx.fillStyle = i < on ? (r > 0.85 ? VK.c.red : r > 0.6 ? VK.c.yellow : VK.c.green) : VK.rgba('dim', 0.25);
    ctx.fillRect(lx + i * (sw + 2), y, sw, h);
  }
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt;
  var wide = W > H * 2.2, pad = 8;
  // Layout: wide banners keep the readouts in a left column; panels stack them like the widget.
  var side = wide ? Math.min(280, W * 0.28) : 0;
  var head = wide ? 0 : Math.max(16, Math.min(22, H * 0.08));
  var barH = Math.max(7, Math.min(12, (wide ? H : W) * 0.04));
  var ex = side + pad, ey = wide ? pad : pad + head + barH * 2 + 14, ew = W - ex - pad, eh = H - ey - (wide ? pad : 22);
  var n = Math.max(20, Math.floor(ew));
  if (n !== len) { len = n; ecg = new Float32Array(n); resp = new Float32Array(n); cursor = 0; }

  if (A.hit && !A.silent) beatT = 0;
  flat = A.silent ? Math.min(1, flat + dt * 2) : Math.max(0, flat - dt * 4);
  var speed = Math.max(40, ew / 3); // px per second, about three seconds per sweep
  var steps = Math.max(1, Math.round(speed * dt)), dx = speed * dt / steps;
  for (var s = 0; s < steps; s++) {
    beatT += dt / steps;
    cursor = (cursor + dx) % n;
    var idx = Math.floor(cursor);
    var v = beatT < BEAT_LEN ? qrs(beatT) : 0;
    ecg[idx] = (1 - flat) * (v + (Math.random() - 0.5) * 0.015);
    resp[idx] = (1 - flat) * A.energy;
    // Erase a band ahead of the cursor, like a hospital monitor.
    for (var e = 1; e <= GAP; e++) { ecg[(idx + e) % n] = NaN; resp[(idx + e) % n] = NaN; }
  }

  ctx.clearRect(0, 0, W, H);
  var bpm = A.bpm || 0;
  bpmShown += (bpm - bpmShown) * (1 - Math.exp(-dt / 0.6));
  var tone = A.silent ? 'dim' : bpm > 150 ? 'red' : bpm > 115 ? 'yellow' : 'green';

  // Monitor frame and grid
  ctx.strokeStyle = VK.rgba('dim', 0.35);
  ctx.lineWidth = 1;
  ctx.strokeRect(ex + 0.5, ey + 0.5, ew - 1, eh - 1);
  ctx.strokeStyle = VK.rgba('dim', 0.12);
  ctx.beginPath();
  for (var gx = ex + 20; gx < ex + ew; gx += 20) { ctx.moveTo(gx + 0.5, ey); ctx.lineTo(gx + 0.5, ey + eh); }
  for (var gy = ey + 20; gy < ey + eh; gy += 20) { ctx.moveTo(ex, gy + 0.5); ctx.lineTo(ex + ew, gy + 0.5); }
  ctx.stroke();

  // Traces: ECG on top, respiration (energy) lower and slower-looking
  function trace(buf, base, amp, col, width) {
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.beginPath();
    var pen = false;
    for (var i = 0; i < len; i++) {
      var val = buf[i];
      if (val !== val) { pen = false; continue; } // NaN = erased gap
      var x = ex + i * ew / len, y = base - val * amp;
      if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
    }
    ctx.stroke();
  }
  trace(resp, ey + eh * 0.92, eh * 0.28, VK.rgba('cyan', 0.6), 1.2);
  trace(ecg, ey + eh * 0.62, eh * 0.5, VK.c[tone], 1.6);
  var cy = ey + eh * 0.62 - (ecg[Math.floor(cursor)] || 0) * eh * 0.5;
  ctx.fillStyle = VK.c[tone];
  ctx.fillRect(ex + Math.floor(cursor) * ew / len - 1.5, cy - 1.5, 3, 3);

  // Readouts
  var big = Math.max(11, Math.min(26, (wide ? H : W) * 0.11));
  if (wide) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = VK.font(Math.max(9, H * 0.09), 'bold');
    ctx.fillStyle = VK.c.accent;
    ctx.fillText('生体監視 VITALS', pad, pad);
    bar(ctx, pad, pad + H * 0.2, side - pad * 2, barH, A.bass * 1.4, '低音 BASS');
    bar(ctx, pad, pad + H * 0.2 + barH + 6, side - pad * 2, barH, A.high * 2.2, '高音 HIGH');
    ctx.font = VK.font(big, 'bold');
    ctx.fillStyle = VK.c[tone];
    ctx.textBaseline = 'bottom';
    ctx.fillText(A.silent ? 'NO SIGNAL' : (bpm ? Math.round(bpmShown) : '--') + ' BPM', pad, H - pad);
  } else {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = VK.font(Math.max(9, head * 0.7), 'bold');
    ctx.fillStyle = VK.c.accent;
    ctx.fillText('生体監視', pad, pad);
    ctx.font = VK.font(Math.max(8, head * 0.55));
    ctx.fillStyle = VK.c.dim;
    ctx.fillText('VITALS', pad + head * 3.2, pad + head * 0.12);
    bar(ctx, pad, pad + head + 4, W - pad * 2, barH, A.bass * 1.4, '低音 BASS');
    bar(ctx, pad, pad + head + barH + 10, W - pad * 2, barH, A.high * 2.2, '高音 HIGH');
    ctx.textBaseline = 'bottom';
    ctx.font = VK.font(Math.max(8, Math.min(11, W / 28)));
    ctx.fillStyle = VK.c.dim;
    ctx.fillText('呼吸 ' + Math.round(A.energy * 100) + '%', pad, H - 5);
    ctx.textAlign = 'right';
    ctx.fillStyle = VK.c[tone];
    ctx.font = VK.font(Math.max(9, Math.min(13, W / 22)), 'bold');
    ctx.fillText(A.silent ? 'NO SIGNAL' : '脈拍 ' + (bpm ? Math.round(bpmShown) : '--') + ' BPM', W - pad, H - 5);
  }
  // A silent monitor blinks its warning.
  if (A.silent && Math.sin(A.t * 5) > 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = VK.font(Math.max(10, Math.min(18, eh * 0.18)), 'bold');
    ctx.fillStyle = VK.rgba('red', 0.85);
    ctx.fillText('— NO SIGNAL —', ex + ew / 2, ey + eh * 0.35);
  }
  // Scanlines, one cheap path
  ctx.strokeStyle = VK.rgba('bg', 0.25);
  ctx.beginPath();
  for (var sy = 0; sy < H; sy += 3) { ctx.moveTo(0, sy + 0.5); ctx.lineTo(W, sy + 0.5); }
  ctx.stroke();
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
