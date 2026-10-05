// @moltamp-visualizer: Agent Radar ♪
// The Agent Radar, tuned to your music: every beat drops a blip at the angle of the loudest band, the range rings pulse with the bass and the sweep turns to the tempo.
// Music version of the Agent Radar widget (Cyberpunk pack) of the MOLTamp Widgets Galaxy.
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

// Agent Radar ♪: a sweeping radar; beats become blips placed by the loudest band, ghosts fade out, rings breathe with the bass.
var BANDS = 12, MAX_BLIPS = 40, GHOST_S = 6;
var blips = [], sweep = 0, sweepSpeed = Math.PI * 2 / 3.2, avg = [];
for (var a0i = 0; a0i < BANDS; a0i++) avg.push(0.1);
var rnd = VK.prng(0.4711);

// Low bands sit on the warm side of the palette, highs on the cool side.
function bandColor(i) { return i < 3 ? 'magenta' : i < 6 ? 'green' : i < 9 ? 'cyan' : 'blue'; }

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  var lv = VK.bands(BANDS);

  // One revolution every four beats when the tempo is known.
  var target = A.bpm ? Math.PI * 2 / (240 / A.bpm) : Math.PI * 2 / 3.2;
  if (A.silent) target *= 0.5;
  sweepSpeed += (target - sweepSpeed) * (1 - Math.exp(-dt / 1.5));
  sweep = (sweep + dt * sweepSpeed) % (Math.PI * 2);

  // Each band's level against its own recent average: the band that jumped most places the blip,
  // so contacts spread around the scope instead of piling up on the bass.
  var ka = 1 - Math.exp(-dt / 2), best = 0, bestScore = -1;
  for (var b = 0; b < BANDS; b++) {
    var score = lv[b] / (avg[b] + 0.04);
    if (score > bestScore) { bestScore = score; best = b; }
    avg[b] += (lv[b] - avg[b]) * ka;
  }
  if (A.hit) {
    if (blips.length >= MAX_BLIPS) blips.shift();
    blips.push({
      ang: (best + 0.5) / BANDS * Math.PI * 2 + (rnd() - 0.5) * 0.35,
      rad: 0.28 + Math.min(1, lv[best] * 1.4) * 0.62 + (rnd() - 0.5) * 0.06,
      born: A.t, lit: 1, col: bandColor(best), size: 3 + A.raw.bass * 4
    });
  }

  ctx.clearRect(0, 0, W, H);
  var wide = W > H * 2.2, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.44;
  var tone = A.energy > 0.72 ? 'red' : 'green';

  // Side scopes in wide slots: the bands as radar-style bars, mirrored.
  if (wide) {
    var SC = 36, sl = VK.bands(SC), span = (W / 2 - R * 1.3), bw = span / SC, bar = Math.max(1.5, Math.min(5, bw * 0.45));
    for (var k = 0; k < SC; k++) {
      var hgt = Math.max(1, sl[k] * H * 0.85), a = 0.3 + sl[k] * 0.65, col = bandColor(Math.floor(k / SC * BANDS));
      ctx.fillStyle = VK.rgba(col, a);
      var xl = cx - R * 1.3 - (k + 0.5) * bw - bar / 2, xr = cx + R * 1.3 + (k + 0.5) * bw - bar / 2;
      ctx.fillRect(xl, cy - hgt / 2, bar, hgt);
      ctx.fillRect(xr, cy - hgt / 2, bar, hgt);
    }
    ctx.strokeStyle = VK.rgba('dim', 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(cx - R * 1.2, cy);
    ctx.moveTo(cx + R * 1.2, cy); ctx.lineTo(W, cy);
    ctx.stroke();
  }

  // Range rings pulse with the bass; the outer one flashes on the beat.
  ctx.lineWidth = 1;
  for (var r = 1; r <= 4; r++) {
    var rr = R * r / 4 * (1 + A.bass * 0.05 * r / 4);
    ctx.strokeStyle = VK.rgba(r === 4 ? tone : 'dim', r === 4 ? 0.25 + A.kick * 0.6 : 0.22 + A.bass * 0.35);
    ctx.lineWidth = r === 4 ? 1 + A.kick * 1.5 : 1;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283); ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = VK.rgba('dim', 0.25);
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  for (var t0 = 0; t0 < 36; t0++) {
    var a0 = t0 * Math.PI / 18, l = t0 % 3 === 0 ? 7 : 3;
    ctx.moveTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    ctx.lineTo(cx + Math.cos(a0) * (R - l), cy + Math.sin(a0) * (R - l));
  }
  ctx.stroke();

  // Sweep wedge with a fading tail
  if (ctx.createConicGradient) {
    var cg = ctx.createConicGradient(sweep - Math.PI * 0.5, cx, cy);
    cg.addColorStop(0, VK.rgba(tone, 0));
    cg.addColorStop(0.24, VK.rgba(tone, 0.18 + A.energy * 0.2));
    cg.addColorStop(0.25, VK.rgba(tone, 0));
    cg.addColorStop(1, VK.rgba(tone, 0));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sweep - Math.PI * 0.5, sweep); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = VK.rgba(tone, 0.85);
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); ctx.stroke();

  // Blips: lit by the sweep, fading to ghosts.
  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  for (var i = blips.length - 1; i >= 0; i--) {
    var p = blips[i], age = A.t - p.born;
    if (age > GHOST_S) { blips.splice(i, 1); continue; }
    var diff = (sweep - p.ang + Math.PI * 4) % (Math.PI * 2);
    if (diff < 0.14) p.lit = 1;
    p.lit *= Math.exp(-dt * 0.9);
    var fade = 1 - age / GHOST_S, x = cx + Math.cos(p.ang) * p.rad * R, y = cy + Math.sin(p.ang) * p.rad * R;
    var ghost = age > GHOST_S * 0.5, col = ghost ? 'dim' : p.col;
    ctx.fillStyle = VK.rgba(col, (0.25 + 0.75 * Math.max(p.lit, 0.3)) * fade);
    ctx.beginPath(); ctx.arc(x, y, p.size * (0.7 + 0.3 * fade), 0, 6.283); ctx.fill();
    if (age < 0.8) {
      ctx.strokeStyle = VK.rgba(p.col, 0.7 * (1 - age / 0.8));
      ctx.beginPath(); ctx.arc(x, y, p.size + age * 22, 0, 6.283); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // Centre readout: the tempo, or no contact in silence.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (R > 28) {
    ctx.fillStyle = A.silent ? VK.rgba('dim', 0.8) : VK.c.accent;
    ctx.font = VK.font(Math.max(10, R * 0.17), 'bold');
    ctx.fillText(A.silent ? '無接触' : A.bpm ? String(A.bpm) : String(blips.length), cx, cy - R * 0.06);
    ctx.font = VK.font(Math.max(7, R * 0.07));
    ctx.fillStyle = VK.c.dim;
    ctx.fillText(A.silent ? 'NO CONTACT' : A.bpm ? 'BPM · 索敵' : 'CONTACTS', cx, cy + R * 0.11);
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
