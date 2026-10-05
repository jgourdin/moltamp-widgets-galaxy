// @moltamp-visualizer: Flight Recorder ♪
// The black box of your track: a scrolling spectrogram of the last 45 seconds with every beat ticked on a marker lane, the tempo and how the sound splits between bass, mids and highs.
// Music version of the Flight Recorder widget (Mission Control pack) of the MOLTamp Widgets Galaxy.
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

// Flight Recorder: a scrolling spectrogram (waterfall) of the last 45 s, beat ticks and the bass/mids/highs share.
var WIN = 45, CPS = 8, NCOL = WIN * CPS, NB = 32, LUTN = 64;
// Ring of columns: band levels (the source of truth) plus the bass/mids/highs split and a silence flag.
var levels = new Float32Array(NCOL * NB), split = new Float32Array(NCOL * 3), silentCol = new Uint8Array(NCOL);
var lastCol = -1, written = 0, gainAll = 0.25, beats = [], lut = [], lutKey = '';
// Cached bitmap of the ring (one pixel per column and band), redrawn whole when the palette changes.
var spec = null, sctx = null;
try {
  if (typeof OffscreenCanvas !== 'undefined') { spec = new OffscreenCanvas(NCOL, NB); sctx = spec.getContext('2d'); }
} catch (e) { spec = null; }

function buildLut() {
  var stops = VK.light ? ['bg', 'cyan', 'blue', 'magenta', 'text'] : ['bg', 'blue', 'magenta', 'yellow', 'text'];
  var key = stops.map(function (s) { return VK.c[s]; }).join('|');
  if (key === lutKey) return false;
  lutKey = key;
  lut = [];
  for (var k = 0; k < LUTN; k++) {
    var f = k / (LUTN - 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f));
    lut.push(VK.mix(stops[i], stops[i + 1], f - i));
  }
  return true;
}

function paintColumn(col) {
  if (!sctx) return;
  var x = col % NCOL;
  for (var b = 0; b < NB; b++) {
    var v = levels[x * NB + b];
    sctx.fillStyle = lut[Math.max(0, Math.min(LUTN - 1, Math.round(v * (LUTN - 1))))];
    sctx.fillRect(x, NB - 1 - b, 1, 1);
  }
}

function writeColumn(col, A, bands) {
  var x = col % NCOL, peak = 0;
  for (var b = 0; b < NB; b++) peak = Math.max(peak, bands[b]);
  // One gain for the whole spectrum keeps the bands' relative loudness readable.
  gainAll = Math.max(peak, gainAll * Math.exp(-1 / CPS / 8), 0.2);
  for (b = 0; b < NB; b++) levels[x * NB + b] = A.silent ? 0 : Math.sqrt(Math.min(1, bands[b] / gainAll));
  split[x * 3] = A.raw.bass; split[x * 3 + 1] = A.raw.mid; split[x * 3 + 2] = A.raw.high;
  silentCol[x] = A.silent ? 1 : 0;
  paintColumn(col);
  written = Math.min(NCOL, written + 1);
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), t = A.t;
  if (buildLut() && sctx) {
    sctx.clearRect(0, 0, NCOL, NB);
    if (lastCol >= 0) for (var c0 = Math.max(0, lastCol - written + 1); c0 <= lastCol; c0++) paintColumn(c0);
  }
  var col = Math.floor(t * CPS);
  if (col > lastCol) {
    var bands = VK.bands(NB);
    for (var c = Math.max(lastCol + 1, col - NCOL + 1); c <= col; c++) writeColumn(c, A, bands);
    lastCol = col;
  }
  if (A.hit && !A.silent) beats.push(t);
  while (beats.length && beats[0] < t - WIN) beats.shift();

  ctx.clearRect(0, 0, W, H);
  var compact = H < 150, x0 = 6, x1 = W - 6, span = x1 - x0;
  var y0 = compact ? 6 : Math.max(8, H * 0.06), sh = compact ? H * 0.58 : H * 0.5;
  function X(ts) { return x1 - (t - ts) / WIN * span; }

  // No recording yet on the left: hatched, like the widget
  var known = Math.max(t - WIN, t - written / CPS), kx = X(known);
  if (kx > x0 + 1) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, kx - x0, sh); ctx.clip();
    ctx.strokeStyle = VK.rgba('dim', 0.18);
    for (var hx = x0 - sh; hx < kx; hx += 6) { ctx.beginPath(); ctx.moveTo(hx, y0 + sh); ctx.lineTo(hx + sh, y0); ctx.stroke(); }
    ctx.restore();
  }

  // Waterfall: the ring bitmap drawn in two slices, oldest column on the left
  if (spec && written) {
    var newest = lastCol % NCOL, oldest = (newest + 1) % NCOL, cw = span / NCOL;
    ctx.imageSmoothingEnabled = true;
    var firstLen = NCOL - oldest;
    ctx.drawImage(spec, oldest, 0, firstLen, NB, x0, y0, firstLen * cw, sh);
    if (oldest > 0) ctx.drawImage(spec, 0, 0, oldest, NB, x0 + firstLen * cw, y0, oldest * cw, sh);
  } else if (written) {
    // No OffscreenCanvas: paint the recent columns straight from the ring.
    var cols = Math.min(written, Math.floor(span / 2)), cw2 = span / NCOL;
    for (var i = 0; i < cols; i++) {
      var cc = lastCol - i, xx = cc % NCOL;
      for (var b = 0; b < NB; b += 2) {
        ctx.fillStyle = lut[Math.round(levels[xx * NB + b] * (LUTN - 1))];
        ctx.fillRect(x1 - (i + 1) * cw2, y0 + (NB - 2 - b) / NB * sh, cw2 + 0.5, sh / NB * 2 + 0.5);
      }
    }
  }
  ctx.strokeStyle = VK.rgba('dim', 0.35);
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, span - 1, sh - 1);

  // Marker lane: one tick per beat, the latest one brighter
  var ly = y0 + sh + 3, lh = compact ? 5 : 8;
  ctx.fillStyle = VK.rgba('dim', 0.12);
  ctx.fillRect(x0, ly, span, lh);
  beats.forEach(function (bt, k) {
    ctx.fillStyle = k === beats.length - 1 ? VK.rgba('accent', 0.5 + A.kick * 0.5) : VK.rgba('accent', 0.55);
    ctx.fillRect(X(bt) - 0.5, ly, 1.2, lh);
  });

  // Time axis
  var axisY = ly + lh + 3;
  ctx.font = VK.font(8);
  ctx.textBaseline = 'top';
  ctx.fillStyle = VK.rgba('dim', 0.75);
  [0, 15, 30, 45].forEach(function (s) {
    if (compact && s !== 0 && s !== 45) return;
    var tx = x1 - s / WIN * span;
    ctx.textAlign = s === 0 ? 'right' : s === 45 ? 'left' : 'center';
    ctx.fillText(s === 0 ? 'now' : '-' + s + 's', tx, axisY);
  });

  // Where the sound went: bass / mids / highs over the recorded window
  var sb = 0, sm = 0, shh = 0, n = Math.min(written, NCOL);
  for (i = 0; i < n; i++) {
    var xi = (lastCol - i) % NCOL;
    if (xi < 0 || silentCol[xi]) continue;
    sb += split[xi * 3]; sm += split[xi * 3 + 1]; shh += split[xi * 3 + 2];
  }
  var tot = sb + sm + shh, parts = tot > 0 ? [['bass', sb / tot, 'magenta'], ['mids', sm / tot, 'yellow'], ['highs', shh / tot, 'cyan']] : [];
  var tempo = A.silent ? 'no signal' : A.bpm ? A.bpm + ' BPM' : 'no tempo yet';
  if (!compact && parts.length) {
    var gy = axisY + 16, gx = x0;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = VK.font(9);
    parts.forEach(function (p) {
      var txt = p[0] + ' ' + Math.round(p[1] * 100) + '%', tw = ctx.measureText(txt).width;
      if (gx + tw + 14 > x1) { gx = x0; gy += 14; }
      if (gy > H - 22) return;
      ctx.fillStyle = VK.c[p[2]];
      ctx.fillRect(gx, gy - 4, 8, 8);
      ctx.fillStyle = VK.c.text;
      ctx.fillText(txt, gx + 11, gy);
      gx += tw + 22;
    });
    if (gy + 14 < H - 22) {
      ctx.fillStyle = VK.rgba('dim', 0.9);
      ctx.fillText(beats.length + ' beats · ' + tempo, x0, gy + 14);
    }
  }
  if (H > 50) {
    ctx.font = VK.font(Math.max(8, Math.min(11, H / 22)));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = VK.rgba('dim', 0.95);
    var line = '記録 · 45 s · ' + tempo;
    if (compact && parts.length) line += ' · ' + parts.map(function (p) { return p[0] + ' ' + Math.round(p[1] * 100) + '%'; }).join(' · ');
    ctx.fillText(line, 8, H - 4);
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
