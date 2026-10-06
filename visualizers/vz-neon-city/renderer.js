// @moltamp-visualizer: Neon City ♪
// The neon megacity seen from above, partying to your music: windows light up with the mids, traffic speeds up with the energy, a beacon pops on every beat and the avenues breathe with the bass.
// Music version of the Neon City widget (Cyberpunk pack) of the MOLTamp Widgets Galaxy.
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

// Neon City ♪: an endless procedural city seen from above; music drives windows, traffic, beacons and avenue glow.
var BLOCK = 34, STREET = 6, MAX_CARS = 70, MAX_BEACONS = 8;
var cam = { x: 0, y: 0 }, cars = [], beacons = [], t = 0, lit = 0;
var rnd = VK.prng(0.1357);
var NEON = ['accent', 'cyan', 'magenta'];

// Deterministic block contents from the block coordinates (no allocation beyond the small result).
function cell(i, j) {
  var r = VK.prng(VK.hash(i + ',' + j));
  return { avenue: i % 5 === 0 || j % 5 === 0, parts: 1 + ((r() * 3) | 0), h: r(), r1: r(), r2: r(), neon: r(), windows: r() };
}

function spawnCar(W, H) {
  var horiz = rnd() < 0.5, lanes = horiz ? H : W;
  var line = Math.floor((rnd() * lanes + (horiz ? cam.y : cam.x)) / BLOCK) * BLOCK - STREET / 2;
  cars.push({ horiz: horiz, line: line, pos: (horiz ? cam.x : cam.y) + (rnd() < 0.5 ? -20 : (horiz ? W : H) + 20),
    dir: rnd() < 0.5 ? 1 : -1, v: 30 + rnd() * 70, life: 0 });
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  t += dt;
  var level = A.silent ? 0 : Math.min(1, A.energy * 1.8);
  cam.x += dt * (6 + level * 30);
  cam.y += dt * (3 + level * 15);
  // Windows follow the mids (smoothed so the city doesn't strobe).
  lit += (Math.min(1, A.mid * 2.2) - lit) * (1 - Math.exp(-dt / 0.3));

  if (A.hit && !A.silent) {
    if (beacons.length >= MAX_BEACONS) beacons.shift();
    beacons.push({ wx: cam.x + (0.12 + rnd() * 0.76) * W, wy: cam.y + (0.15 + rnd() * 0.7) * H, age: 0, col: NEON[A.beats % 3] });
  }

  ctx.clearRect(0, 0, W, H);
  var i0 = Math.floor(cam.x / BLOCK) - 1, j0 = Math.floor(cam.y / BLOCK) - 1;
  var i1 = i0 + Math.ceil(W / BLOCK) + 2, j1 = j0 + Math.ceil(H / BLOCK) + 2;
  var hum = 0.5 + A.high * 1.4;

  for (var i = i0; i < i1; i++) {
    for (var j = j0; j < j1; j++) {
      var c = cell(i, j), x = i * BLOCK - cam.x, y = j * BLOCK - cam.y, size = BLOCK - STREET;
      if (c.avenue && c.r1 < 0.25) continue; // plazas
      for (var p = 0; p < c.parts; p++) {
        var bw = c.parts === 1 ? size : size / c.parts, bx = x + p * bw + 1, by = y + 1, bh = size - 2;
        var height = (c.h + p * 0.31) % 1;
        ctx.fillStyle = VK.mix('bg', 'dim', light ? 0.1 + height * 0.14 : 0.07 + height * 0.14);
        ctx.fillRect(bx, by, bw - 2, bh);
        var neon = NEON[(((c.neon * 3) | 0) + p) % 3];
        var flicker = 0.25 + 0.2 * Math.sin(t * 2 + c.r2 * 20);
        if (c.neon >= 0.74 || p === 0) {
          ctx.strokeStyle = VK.rgba(neon, (c.neon >= 0.74 ? 0.55 : 0.1) * (0.6 + flicker) * hum);
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, by + 0.5, bw - 3, bh - 1);
        }
        if (c.windows < lit) {
          ctx.fillStyle = VK.rgba('yellow', 0.45 + 0.35 * A.kick);
          for (var q = 0; q < 3; q++) ctx.fillRect(bx + 3 + q * 4, by + 3 + ((c.r2 * 10 + q) % 3) * 4, 2, 2);
        }
      }
    }
  }

  // Avenue glow breathes with the bass.
  ctx.strokeStyle = VK.rgba('accent', 0.1 + A.bass * 0.45);
  ctx.lineWidth = 1.5 + A.bass * 2;
  ctx.beginPath();
  for (i = i0; i < i1; i++) if (i % 5 === 0) { var ax = i * BLOCK - cam.x - STREET / 2; ctx.moveTo(ax, 0); ctx.lineTo(ax, H); }
  for (j = j0; j < j1; j++) if (j % 5 === 0) { var ay = j * BLOCK - cam.y - STREET / 2; ctx.moveTo(0, ay); ctx.lineTo(W, ay); }
  ctx.stroke();

  // Traffic: denser and faster with the energy.
  var target = Math.min(MAX_CARS, Math.round(6 + level * 60));
  if (cars.length < target && rnd() < dt * 12) spawnCar(W, H);
  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  for (var k = cars.length - 1; k >= 0; k--) {
    var car = cars[k];
    car.pos += car.dir * car.v * (0.5 + level * 1.6) * dt;
    car.life += dt;
    var cxp = car.horiz ? car.pos - cam.x : car.line - cam.x, cyp = car.horiz ? car.line - cam.y : car.pos - cam.y;
    if (car.life > 30 || cxp < -40 || cxp > W + 40 || cyp < -40 || cyp > H + 40 || (cars.length > target + 10 && rnd() < 0.02)) { cars.splice(k, 1); continue; }
    var cc = car.dir > 0 ? 'cyan' : 'red';
    ctx.fillStyle = VK.rgba(cc, 0.9);
    ctx.fillRect(cxp - 1, cyp - 1, 2.2, 2.2);
    ctx.fillStyle = VK.rgba(cc, 0.25);
    if (car.horiz) ctx.fillRect(cxp - car.dir * 8, cyp - 0.5, car.dir * 8, 1);
    else ctx.fillRect(cxp - 0.5, cyp - car.dir * 8, 1, car.dir * 8);
  }

  // Beat beacons
  for (k = beacons.length - 1; k >= 0; k--) {
    var b = beacons[k];
    b.age += dt;
    if (b.age > 2.4) { beacons.splice(k, 1); continue; }
    var bx2 = b.wx - cam.x, by2 = b.wy - cam.y, fade = 1 - b.age / 2.4, ring = Math.min(1, b.age / 0.9);
    ctx.strokeStyle = VK.rgba(b.col, fade * (1 - ring * 0.7));
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx2, by2, 4 + ring * 28, 0, 6.283); ctx.stroke();
    ctx.fillStyle = VK.rgba(b.col, fade);
    ctx.fillRect(bx2 - 2, by2 - 2, 4, 4);
    ctx.fillRect(bx2 - 0.5, by2 - 18 * fade, 1, 18 * fade);
  }
  ctx.globalCompositeOperation = 'source-over';

  if (H > 60) {
    ctx.font = VK.font(Math.max(8, Math.min(10, H / 14)));
    ctx.fillStyle = VK.rgba('dim', 0.85);
    ctx.textBaseline = 'bottom';
    ctx.fillText(A.silent ? '地区 · 静寂' : '地区 · ' + (A.bpm ? A.bpm + ' BPM' : 'live'), 8, H - 6);
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
