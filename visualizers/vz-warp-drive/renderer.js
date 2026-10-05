// @moltamp-visualizer: Warp Drive ♪
// The Viewscreen, flown by your music: the bass pushes the warp factor, every beat punches a hyperspace jump and the highs light up the star streaks.
// Music version of the Viewscreen widget (Starship pack) of the MOLTamp Widgets Galaxy.
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

// Warp Drive: a forward-looking star field; warp speed follows the bass, each beat is a jump, silence is a drift.
var N = 420, DEPTH = 1;
var stars = [], speed = 0.08, jump = 0, heading = 0;
var rnd = VK.prng(0.917);
var COLS = ['text', 'text', 'text', 'cyan', 'accent', 'magenta'];
function spawn(s, far) {
  s.x = (rnd() - 0.5) * 2; s.y = (rnd() - 0.5) * 2; s.z = far ? DEPTH : 0.05 + rnd() * DEPTH; s.pz = s.z;
  s.c = COLS[Math.floor(rnd() * COLS.length)];
  return s;
}
for (var i0 = 0; i0 < N; i0++) stars.push(spawn({}, false));

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  // Bass sets the cruise; a beat kicks the drive for a moment; silence drifts at impulse.
  var target = A.silent ? 0.04 : 0.12 + A.bass * 0.9 + A.energy * 0.3;
  speed += (target - speed) * (1 - Math.exp(-dt / (target > speed ? 0.35 : 0.8)));
  if (A.hit) jump = 1;
  jump *= Math.exp(-dt * 4);
  var v = speed + jump * 0.9;
  heading = (heading + dt * v * 3) % 360;

  ctx.clearRect(0, 0, W, H);
  var cx = W / 2, cy = H / 2, f = Math.max(W, H) * 0.55, warp = v > 0.4;
  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  ctx.lineCap = 'round';
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    s.pz = s.z;
    s.z -= dt * (0.04 + v * 1.6);
    if (s.z <= 0.02) { spawn(s, true); continue; }
    var sx = cx + s.x / s.z * f, sy = cy + s.y / s.z * f;
    if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) { spawn(s, true); continue; }
    var px = cx + s.x / s.pz * f, py = cy + s.y / s.pz * f, near = 1 - s.z / DEPTH;
    var k = warp ? 1 + v * 7 : 1, tx = sx - (sx - px) * k, ty = sy - (sy - py) * k;
    // The highs make the streaks sparkle.
    var alpha = Math.min(1, 0.2 + near * (0.9 + A.high * 1.2));
    ctx.strokeStyle = VK.rgba(s.c, alpha);
    ctx.lineWidth = Math.max(0.6, near * (2.2 + jump * 1.6));
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sx + 0.01, sy); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Jump flash
  if (jump > 0.05) {
    var fl = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
    fl.addColorStop(0, VK.rgba('text', 0.35 * jump));
    fl.addColorStop(1, VK.rgba('accent', 0));
    ctx.fillStyle = fl;
    ctx.fillRect(0, 0, W, H);
  }

  // HUD: reticle pulsing on the beat, frame corners, warp factor and tempo
  ctx.strokeStyle = VK.rgba('accent', 0.5 + A.kick * 0.4);
  ctx.lineWidth = 1 + A.kick * 1.5;
  var r = Math.min(W, H) * (0.12 + A.kick * 0.03);
  ctx.beginPath();
  for (var q = 0; q < 4; q++) {
    var a0 = 0.2 + q * Math.PI / 2;
    ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    ctx.arc(cx, cy, r, a0, a0 + 1.17);
  }
  ctx.stroke();
  var m = Math.min(14, Math.min(W, H) * 0.08), L = m * 1.6;
  ctx.lineWidth = 1;
  ctx.strokeStyle = VK.rgba('accent', 0.55);
  ctx.beginPath();
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(function (c) {
    ctx.moveTo(c[0], c[1] + c[3] * L); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0] + c[2] * L, c[1]);
  });
  ctx.stroke();
  var label = A.silent ? 'IMPULSE · NO SIGNAL' : 'WARP ' + (1 + v * 8).toFixed(1) + (A.bpm ? ' · ' + A.bpm + ' BPM' : '');
  ctx.font = VK.font(Math.max(9, Math.min(13, H / 12)), 'bold');
  ctx.fillStyle = VK.rgba('accent', 0.9);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(label, W - m - 4, m + 4);
  if (H > 90) {
    ctx.font = VK.font(Math.max(8, Math.min(10, H / 16)));
    ctx.fillStyle = VK.rgba('dim', 0.9);
    ctx.fillText('HDG ' + ('00' + Math.floor(heading)).slice(-3), W - m - 4, m + 8 + Math.min(13, H / 12));
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
