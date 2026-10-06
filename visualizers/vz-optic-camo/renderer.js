// @moltamp-visualizer: Optic Camo ♪
// The thermoptic camouflage, cloaking to your music: the highs make the air shimmer, every beat tears it into glitch slices with an RGB split, and silence leaves it almost invisible.
// Music version of the Optic Camo widget (Cyberpunk pack) of the MOLTamp Widgets Galaxy.
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

// Optic Camo ♪: a refracting hex mesh; the highs drive the shimmer, each beat is a short glitch burst.
var glitch = 0, glitchLen = 0.3, big = false, t = 0;
var off = null, offCtx = null;
var rnd = VK.prng(0.2468);

function drawCamo(c, W, H, strength, shimmer, colA, colB) {
  // Hex mesh bent by a sine field: reads like air refracting around a cloaked shape.
  var s = Math.max(10, Math.min(W, H) / 9), hgt = s * Math.sqrt(3) / 2, amp = s * (0.25 + shimmer * 0.55);
  c.strokeStyle = VK.rgba(colA, Math.min(0.85, 0.11 * strength));
  c.lineWidth = 1;
  c.beginPath();
  for (var row = -1; row * hgt < H + hgt; row++) {
    for (var col = -1; col * s * 1.5 < W + s; col++) {
      var x = col * s * 1.5, y = row * hgt * 2 + (col % 2 ? hgt : 0);
      var bend = Math.sin(x * 0.02 + t * (0.9 + shimmer * 2)) * Math.cos(y * 0.025 - t * 0.7) * amp;
      for (var k = 0; k <= 6; k++) {
        var a = k * Math.PI / 3, px = x + Math.cos(a) * s * 0.5 + bend, py = y + Math.sin(a) * s * 0.5 + bend * 0.6;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
    }
  }
  c.stroke();
  // Moving caustic band, faster with the energy
  var bx = ((t * (0.12 + shimmer * 0.25)) % 1.4 - 0.2) * W;
  var g = c.createLinearGradient(bx - W * 0.15, 0, bx + W * 0.15, H);
  g.addColorStop(0, VK.rgba(colB, 0));
  g.addColorStop(0.5, VK.rgba(colB, Math.min(0.5, 0.05 * strength)));
  g.addColorStop(1, VK.rgba(colB, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  t += dt;
  // Silence keeps the cloak almost invisible; the highs make it shimmer.
  // A beat heats the cloak for a moment (brighter mesh) before it settles back.
  var strength = A.silent ? 0.35 : 1 + A.high * 5 + A.energy * 2 + A.kick * 1.5, shimmer = Math.min(1, A.high * 2.2 + A.mid * 0.4);
  if (A.hit && !A.silent) {
    // Every beat tears the cloak briefly; a heavy kick on a bar start breaks it with the warning.
    big = A.raw.bass > 0.6 && A.beats % 8 === 0;
    glitch = glitchLen = big ? 0.55 : 0.22;
  }

  ctx.clearRect(0, 0, W, H);
  if (glitch <= 0 || typeof OffscreenCanvas === 'undefined') {
    drawCamo(ctx, W, H, strength, shimmer, 'accent', 'text');
    glitch = Math.max(0, glitch - dt);
    VK.reset(ctx);
    return;
  }

  // Compose the frame off-screen at the real buffer scale, then tear it apart in horizontal slices.
  var sc = ctx.canvas && ctx.canvas.width ? ctx.canvas.width / W : 2;
  var bw = Math.max(1, Math.round(W * sc)), bh = Math.max(1, Math.round(H * sc));
  if (!off || off.width !== bw || off.height !== bh) { off = new OffscreenCanvas(bw, bh); offCtx = off.getContext('2d'); }
  var k = glitch / glitchLen;
  offCtx.setTransform(sc, 0, 0, sc, 0, 0);
  offCtx.clearRect(0, 0, W, H);
  offCtx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  // RGB split: the mesh drawn twice, shifted apart.
  var split = (2 + 6 * k) * (big ? 1.6 : 1);
  offCtx.save(); offCtx.translate(-split, 0); drawCamo(offCtx, W, H, strength * 2, shimmer, 'red', 'magenta'); offCtx.restore();
  offCtx.save(); offCtx.translate(split, 0); drawCamo(offCtx, W, H, strength * 2, shimmer, 'cyan', 'blue'); offCtx.restore();
  if (big) {
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    offCtx.font = VK.font(Math.max(11, Math.min(W / 11, H / 4)), 'bold');
    var jx = (rnd() - 0.5) * 6 * k;
    offCtx.fillStyle = VK.c.red; offCtx.fillText('光学迷彩 破損', W / 2 + jx - 2, H / 2 - 4);
    offCtx.fillStyle = VK.c.cyan; offCtx.fillText('光学迷彩 破損', W / 2 + jx + 2, H / 2 - 4);
  }
  offCtx.globalCompositeOperation = 'source-over';

  var slices = 5 + ((rnd() * (big ? 9 : 5)) | 0);
  for (var i = 0; i < slices; i++) {
    var sy = rnd() * H, sh = 2 + rnd() * H * 0.12, dx = (rnd() - 0.5) * W * (big ? 0.25 : 0.12) * k;
    ctx.drawImage(off, 0, sy * sc, bw, sh * sc, dx, sy, W, sh);
  }
  ctx.globalAlpha = 0.85;
  ctx.drawImage(off, 0, 0, bw, bh, (rnd() - 0.5) * 4 * k, 0, W, H);
  ctx.globalAlpha = 1;
  // Noise blocks and a tint wash
  for (i = 0; i < (big ? 10 : 4) * k; i++) {
    ctx.fillStyle = VK.rgba(rnd() < 0.5 ? 'red' : 'accent', 0.35 * rnd() * k);
    ctx.fillRect(rnd() * W, rnd() * H, rnd() * W * 0.3, 1 + rnd() * 5);
  }
  if (big) { ctx.fillStyle = VK.rgba('red', 0.1 * k); ctx.fillRect(0, 0, W, H); }
  glitch -= dt;
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
