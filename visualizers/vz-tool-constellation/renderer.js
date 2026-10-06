// @moltamp-visualizer: Spectrum Constellation ♪
// Your music as a constellation: one star per frequency band, glowing with its level, linked to its neighbours, with a shooting star from the loudest band on every beat.
// Music version of the Tool Constellation widget (Mission Control pack) of the MOLTamp Widgets Galaxy.
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

// Spectrum Constellation: one star per frequency band, chained like a constellation; beats fire shooting stars.
var NB = 20, BG_STARS = 110, MAX_SHOTS = 12;
var lvl = new Float32Array(NB), gain = new Float32Array(NB), flare = new Float32Array(NB);
var pos = [], links = [], shots = [], bg = [], strongest = 0;
// Low bands warm, high bands cool.
var BAND_COL = ['magenta', 'magenta', 'magenta', 'accent', 'accent', 'accent', 'yellow', 'yellow', 'yellow', 'yellow',
  'cyan', 'cyan', 'cyan', 'cyan', 'blue', 'blue', 'blue', 'green', 'green', 'green'];

(function layout() {
  var r = VK.prng(0.4711);
  for (var i = 0; i < BG_STARS; i++) bg.push({ x: r(), y: r(), s: 0.3 + r() * 1.1, p: r() * 6.283 });
  // Bass on the left, highs on the right, with a hashed vertical walk so the chain reads as a figure, not a graph.
  var y = 0.5;
  for (i = 0; i < NB; i++) {
    y = Math.max(0.16, Math.min(0.84, y * 0.45 + (0.16 + 0.68 * VK.hash('y' + i)) * 0.55));
    pos.push({ x: 0.07 + 0.86 * (i + 0.5) / NB + (VK.hash('x' + i) - 0.5) * 0.05, y: y });
  }
  // Nudge stars apart like the widget does with its tool stars.
  for (var it = 0; it < 30; it++) {
    for (i = 0; i < NB; i++) for (var j = i + 1; j < NB; j++) {
      var dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.08 && d > 1e-4) {
        var push = (0.08 - d) / 2;
        pos[i].y = Math.max(0.12, Math.min(0.88, pos[i].y - dy / d * push));
        pos[j].y = Math.max(0.12, Math.min(0.88, pos[j].y + dy / d * push));
      }
    }
  }
  for (i = 0; i < NB - 1; i++) links.push([i, i + 1]);
  for (i = 0; i < NB - 3; i += 2) if (VK.hash('l' + i) > 0.55) links.push([i, i + 3]);
})();

function bandName(i) {
  // VK.bands maps band i to FFT bins 1 + (i/n)^1.8 × 120, about 43 Hz per bin in MOLTamp.
  var bin = Math.floor(1 + Math.pow((i + 0.5) / NB, 1.8) * 120);
  return bin < 5 ? 'SUB' : bin < 16 ? 'BASS' : bin < 41 ? 'MID' : bin < 81 ? 'PRESENCE' : 'TREBLE';
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  var raw = VK.bands(NB);
  for (var i = 0; i < NB; i++) {
    // Per-band automatic gain, so quiet passages and thin mixes still light the sky.
    gain[i] = Math.max(raw[i], gain[i] * Math.exp(-dt / 6), 0.12);
    var v = A.silent ? 0 : Math.min(1, raw[i] / gain[i]);
    lvl[i] += (v - lvl[i]) * (1 - Math.exp(-dt / (v > lvl[i] ? 0.04 : 0.25)));
    flare[i] *= Math.exp(-dt * 3);
  }
  var best = 0;
  for (i = 1; i < NB; i++) if (lvl[i] * (0.7 + raw[i]) > lvl[best] * (0.7 + raw[best])) best = i;
  strongest = best;
  if (A.hit && !A.silent) {
    flare[best] = 1;
    var opts = links.filter(function (l) { return l[0] === best || l[1] === best; });
    var l = opts[Math.floor(Math.random() * opts.length)];
    if (l && shots.length < MAX_SHOTS) shots.push({ a: best, b: l[0] === best ? l[1] : l[0], t: 0 });
  }

  ctx.clearRect(0, 0, W, H);
  // Nebula backdrop, breathing with the mids
  var neb = ctx.createRadialGradient(W * 0.3, H * 0.4, 0, W * 0.3, H * 0.4, Math.max(W, H) * 0.6);
  neb.addColorStop(0, VK.rgba('magenta', (light ? 0.05 : 0.08) + A.mid * 0.06));
  neb.addColorStop(1, VK.rgba('magenta', 0));
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = VK.c.text;
  for (var b = 0; b < bg.length; b++) {
    var s0 = bg[b];
    ctx.globalAlpha = 0.1 + (0.25 + A.high * 0.5) * (0.5 + 0.5 * Math.sin(A.t * 1.3 + s0.p));
    ctx.fillRect(s0.x * W, s0.y * H, s0.s, s0.s);
  }
  ctx.globalAlpha = 1;

  function X(k) { return pos[k].x * W; }
  function Y(k) { return pos[k].y * H; }

  // Constellation lines: brighter where both stars and the whole track are loud.
  links.forEach(function (l) {
    var m = Math.min(lvl[l[0]], lvl[l[1]]);
    ctx.strokeStyle = VK.rgba('text', Math.min(0.7, 0.06 + A.energy * 0.25 + m * 0.45));
    ctx.lineWidth = 0.6 + m * 1.6;
    ctx.beginPath(); ctx.moveTo(X(l[0]), Y(l[0])); ctx.lineTo(X(l[1]), Y(l[1])); ctx.stroke();
  });

  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  for (i = shots.length - 1; i >= 0; i--) {
    var sh = shots[i];
    sh.t += dt * 2.2;
    if (sh.t >= 1) { shots.splice(i, 1); continue; }
    var px = X(sh.a) + (X(sh.b) - X(sh.a)) * sh.t, py = Y(sh.a) + (Y(sh.b) - Y(sh.a)) * sh.t;
    var tb = Math.max(0, sh.t - 0.25), tx = X(sh.a) + (X(sh.b) - X(sh.a)) * tb, ty = Y(sh.a) + (Y(sh.b) - Y(sh.a)) * tb;
    ctx.strokeStyle = VK.rgba(BAND_COL[sh.b], 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py); ctx.stroke();
    ctx.fillStyle = VK.c.text;
    ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
  }

  var unit = Math.max(0.6, Math.min(1.6, Math.min(W, H) / 260));
  for (i = 0; i < NB; i++) {
    var x = X(i), y = Y(i), col = BAND_COL[i], size = (1.5 + 5.5 * lvl[i]) * unit, gr = size * (3 + flare[i] * 4);
    var glow = ctx.createRadialGradient(x, y, 0, x, y, gr);
    glow.addColorStop(0, VK.rgba(col, 0.25 + 0.45 * lvl[i] + 0.3 * flare[i]));
    glow.addColorStop(1, VK.rgba(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, gr, 0, 6.283); ctx.fill();
    ctx.fillStyle = VK.mix(col, 'text', 0.55);
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, size * 0.5), 0, 6.283); ctx.fill();
    // Four-point sparkle on the loudest stars
    if (lvl[i] > 0.75) {
      ctx.strokeStyle = VK.rgba(col, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - size * 2.2, y); ctx.lineTo(x + size * 2.2, y);
      ctx.moveTo(x, y - size * 2.2); ctx.lineTo(x, y + size * 2.2);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.textBaseline = 'middle';
  if (W > 240 && H > 90 && !A.silent && lvl[strongest] > 0.3) {
    ctx.font = VK.font(9);
    ctx.textAlign = pos[strongest].x > 0.5 ? 'right' : 'left';
    ctx.fillStyle = VK.rgba('text', 0.9);
    ctx.fillText(bandName(strongest) + ' ' + Math.round(lvl[strongest] * 100) + '%', X(strongest) + (pos[strongest].x > 0.5 ? -10 : 10), Y(strongest) - 10);
  }
  if (H > 50) {
    ctx.font = VK.font(Math.max(8, Math.min(11, H / 22)));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = VK.rgba('dim', 0.95);
    ctx.fillText('星座 · ' + (A.silent ? 'no signal' : (A.bpm ? A.bpm + ' BPM · ' : '') + 'peak ' + bandName(strongest)), 8, H - 6);
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();

// audio-frontend v1 — shared input stage of the MOLTamp Widgets Galaxy visualizers (MIT, j0j0).
// MOLTamp's FFT can arrive far below full scale (quiet output, 0.8 smoothing), which leaves every effect built on
// level thresholds dead and starves MOLTamp's own beat detector. Before the renderer runs, the spectrum is brought
// back to a usable range (peaks tracked over ~4 s, raised to ~200/255, gain 1x-6x, silence left alone), and a kick
// detector on that spectrum backs up the beat flag and decay.
;(function () {
  var inner = module.exports;
  if (typeof inner !== 'function') return;
  var ref = 0, last = 0, out = null, kAvg = 0, kPrev = 0, cool = 0, own = 0;
  module.exports = function (ctx, data, W, H, colors, beat, waveData) {
    var now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    var dt = last ? Math.min(0.2, Math.max(0.001, (now - last) / 1000)) : 1 / 60;
    last = now;
    var src = beat || {}, onset = false;
    if (data && data.length > 9) {
      var n = data.length, peak = 0, i;
      for (i = 1; i < n; i++) if (data[i] > peak) peak = data[i];
      ref = Math.max(peak, ref * Math.exp(-dt / 4));
      var gain = ref > 6 ? Math.max(1, Math.min(6, 200 / Math.max(ref, 24))) : 1;
      if (gain > 1.02) {
        if (!out || out.length !== n) out = new Uint8Array(n);
        for (i = 0; i < n; i++) { var v = data[i] * gain; out[i] = v > 255 ? 255 : v; }
        data = out;
      }
      var b = 0;
      for (i = 1; i < 9; i++) b += data[i];
      b /= 8 * 255;
      kAvg += (b - kAvg) * (1 - Math.exp(-dt / 0.7));
      cool -= dt;
      onset = b > kAvg * 1.18 + 0.03 && b - kPrev > 0.012 && cool <= 0;
      kPrev = b;
      if (onset) { own = 1; cool = 0.22; }
    }
    own *= Math.exp(-dt * 5);
    var merged = { energy: src.energy, peak: src.peak, isBeat: !!src.isBeat || onset, decay: Math.max(src.decay || 0, own) };
    return inner.call(this, ctx, data, W, H, colors, merged, waveData);
  };
})();
