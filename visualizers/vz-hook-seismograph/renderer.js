// @moltamp-visualizer: Beat Seismograph ♪
// A seismograph listening to your music: the needle trembles with the energy, every beat is a shock coloured by its kick, snare or hat, and a drop after a quiet break sets off an earthquake with its magnitude.
// Music version of the Hook Seismograph widget (Mission Control pack) of the MOLTamp Widgets Galaxy.
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

// Beat Seismograph: the music as a scrolling seismogram; beats are shocks, a drop after a quiet break is an earthquake.
var WIN = 20, RATE = 50, NBUCK = (WIN + 2) * RATE;
// Per time bucket: envelope, colour slot (255 = tremor only) and wiggle seed.
var env = new Float32Array(NBUCK), slot = new Uint8Array(NBUCK).fill(255), head = -1;
var SLOTS = ['magenta', 'yellow', 'cyan', 'red'], KINDS = ['KICK', 'SNARE', 'HAT', 'QUAKE'];
var shocks = [], marks = [], shake = 0, alert = null, quiet = 0;

function addShock(t0, amp, tau, s) { shocks.push({ t0: t0, amp: amp, tau: tau, s: s }); if (shocks.length > 60) shocks.shift(); }

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, t = A.t;

  // A quiet stretch (breakdown, gap between tracks) followed by a heavy hit is an earthquake.
  var wasQuiet = quiet < 0.07;
  quiet += (A.energy - quiet) * (1 - Math.exp(-dt / 2));
  if (A.hit && !A.silent) {
    var r = A.raw, dom = r.bass * 1.0 >= r.mid * 1.3 && r.bass >= r.high * 1.8 ? 0 : r.mid * 1.3 >= r.high * 1.8 ? 1 : 2;
    if (wasQuiet && r.bass > 0.3) {
      var mag = 4 + Math.min(2.6, r.bass * 2 + A.energy * 1.5);
      addShock(t, 1.3, 0.6, 3);
      for (var k = 1; k <= 3; k++) addShock(t + k * (0.3 + k * 0.15), 0.5 / k, 0.35, 3);
      shake = 1;
      alert = { at: t, text: '⚠ 地震 M' + mag.toFixed(1) };
      marks.push({ t: t, text: 'M' + mag.toFixed(1), s: 3 });
    } else {
      var amp = 0.22 + r.bass * 0.6 + (dom ? r.mid * 0.3 : 0);
      addShock(t, amp, 0.22, dom);
      if (amp > 0.55) marks.push({ t: t, text: KINDS[dom], s: dom });
    }
    while (marks.length && marks[0].t < t - WIN) marks.shift();
  }

  // Envelope now: tremor from the overall energy plus every shock still ringing.
  var e = 0.02 + A.energy * 0.16 + A.high * 0.05, bestV = 0, bestS = 255;
  for (var i = shocks.length - 1; i >= 0; i--) {
    var sh = shocks[i], age = t - sh.t0;
    if (age > sh.tau * 6) { shocks.splice(i, 1); continue; }
    if (age < 0) continue;
    var v = sh.amp * Math.exp(-age / sh.tau);
    e += v;
    if (v > bestV) { bestV = v; bestS = sh.s; }
  }
  var bNow = Math.floor(t * RATE);
  if (head < 0 || bNow - head > NBUCK) head = bNow - 1;
  for (var bb = head + 1; bb <= bNow; bb++) { env[bb % NBUCK] = 0; slot[bb % NBUCK] = 255; }
  head = bNow;
  var cur = bNow % NBUCK;
  if (e > env[cur]) { env[cur] = e; slot[cur] = bestV > 0.05 ? bestS : 255; }

  shake *= Math.exp(-dt * 3);
  var sx = shake > 0.02 ? (Math.random() - 0.5) * 8 * shake : 0, sy = shake > 0.02 ? (Math.random() - 0.5) * 6 * shake : 0;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(sx, sy);

  // Paper and grid: a line every second, labelled every five
  var pad = Math.max(10, W * 0.04), x1 = W - pad, mid = H * 0.5, amp0 = H * 0.42;
  ctx.fillStyle = VK.mix('bg', 'text', 0.04);
  ctx.fillRect(0, 0, x1, H);
  var pxPerS = x1 / WIN;
  ctx.lineWidth = 1;
  for (var s = 0; s <= WIN; s++) {
    var gx = x1 - s * pxPerS, major = s % 5 === 0;
    ctx.strokeStyle = VK.rgba('dim', major ? 0.22 : 0.08);
    ctx.beginPath(); ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, H); ctx.stroke();
    if (major && H > 50 && s > 0) {
      ctx.fillStyle = VK.rgba('dim', 0.6);
      ctx.font = VK.font(8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('-' + s + 's', gx, 2);
    }
  }
  [0.25, 0.5, 0.75].forEach(function (f) {
    ctx.strokeStyle = VK.rgba('dim', f === 0.5 ? 0.25 : 0.08);
    ctx.beginPath(); ctx.moveTo(0, H * f + 0.5); ctx.lineTo(x1, H * f + 0.5); ctx.stroke();
  });

  // Trace: per pixel column, the loudest bucket it covers. Columns are batched into one path per colour
  // and opacity step (at most 5 × 3 strokes a frame instead of one per pixel column).
  var bPerPx = WIN * RATE / x1, penY = mid, paths = {};
  for (var x = 0; x <= x1; x++) {
    var b0 = Math.floor(bNow - (x1 - x) * bPerPx), b1 = Math.max(b0, Math.floor(bNow - (x1 - x - 1) * bPerPx) - 1);
    var ev = 0, sl = 255;
    for (var q = b0; q <= b1; q++) {
      if (q < 0 || bNow - q >= NBUCK - RATE) continue;
      var idx = q % NBUCK;
      if (env[idx] > ev) { ev = env[idx]; sl = slot[idx]; }
    }
    if (ev <= 0) continue;
    var ts = q / RATE, wig = Math.sin(ts * 40) * 0.25;
    var top = Math.max(2, mid - Math.min(1.1, ev) * amp0), bot = Math.min(H - 2, mid + Math.min(1.1, ev) * (0.75 + wig) * amp0);
    var step = sl === 255 ? 0 : ev < 0.3 ? 0 : ev < 0.6 ? 1 : 2, pk = sl + ':' + step;
    (paths[pk] || (paths[pk] = [])).push(x + 0.5, top, Math.max(top + 1, bot));
    if (x === x1) penY = mid + Math.sin(t * 37) * Math.min(1.1, ev) * amp0 * 0.8;
  }
  Object.keys(paths).forEach(function (pk) {
    var parts = pk.split(':'), s2 = +parts[0], a = [0.6, 0.8, 1][+parts[1]], seg = paths[pk];
    ctx.strokeStyle = s2 !== 255 ? VK.rgba(SLOTS[s2], a) : VK.rgba('text', 0.5);
    ctx.beginPath();
    for (var j = 0; j < seg.length; j += 3) { ctx.moveTo(seg[j], seg[j + 1]); ctx.lineTo(seg[j], seg[j + 2]); }
    ctx.stroke();
  });

  // Shock names over the big ones, never overlapping
  if (H > 70) {
    var lastX = 1e9;
    ctx.font = VK.font(8, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (i = marks.length - 1; i >= 0; i--) {
      var mx = x1 - (t - marks[i].t) * pxPerS;
      if (mx < 10 || lastX - mx < 46) continue;
      lastX = mx;
      ctx.fillStyle = VK.rgba(SLOTS[marks[i].s], 0.9);
      ctx.fillText(marks[i].text, mx, 13);
    }
  }

  // Recording drum edge and pen
  ctx.fillStyle = VK.mix('bg', 'dim', 0.12);
  ctx.fillRect(x1, 0, W - x1, H);
  ctx.strokeStyle = VK.rgba('dim', 0.5);
  ctx.beginPath(); ctx.moveTo(x1 + 0.5, 0); ctx.lineTo(x1 + 0.5, H); ctx.stroke();
  penY = Math.max(3, Math.min(H - 3, penY));
  ctx.strokeStyle = VK.c.text;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(W, penY - 6); ctx.lineTo(x1 + 2, penY); ctx.lineTo(W, penY + 6); ctx.stroke();
  ctx.fillStyle = VK.c.red;
  ctx.beginPath(); ctx.arc(x1, penY, 2.2, 0, 6.283); ctx.fill();
  ctx.restore();

  if (H > 50) {
    var alerting = alert && t - alert.at < 4;
    ctx.font = VK.font(Math.max(8, Math.min(11, H / 22)), alerting ? 'bold' : 'normal');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = alerting ? VK.c.red : VK.rgba('dim', 0.95);
    ctx.fillText(alerting ? alert.text : '地震計 · ' + (A.silent ? 'no signal' : A.bpm ? A.bpm + ' BPM' : 'listening'), 8, H - 6);
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
