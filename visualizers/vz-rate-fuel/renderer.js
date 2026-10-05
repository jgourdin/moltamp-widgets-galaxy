// @moltamp-visualizer: Fuel VU ♪
// The twin fuel gauges turned into VU meters: the left needle swings with the bass, the right one with the highs, with real VU ballistics and peak lamps.
// Music version of the Rate Limit Fuel widget (Mission Control pack) of the MOLTamp Widgets Galaxy.
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

// Fuel VU ♪: the E–F fuel gauges as two VU meters (lows, highs) with spring-damped needles and peak lamps.
var GAUGES = [
  { label: 'LOW', kanji: '低音', src: 'bass', pos: 0, vel: 0, ref: 0.25, env: 0, peak: 0, db: -20 },
  { label: 'HIGH', kanji: '高音', src: 'high', pos: 0, vel: 0, ref: 0.1, env: 0, peak: 0, db: -20 }
];
// VU scale: -20 dB at the left stop, +3 dB at the right stop, 0 VU at 87% of the arc.
var DB_MIN = -20, DB_MAX = 3;
var TICKS = [-20, -10, -7, -5, -3, -1, 0, 1, 2, 3];
function dbToPos(db) { return Math.max(0, Math.min(1, (db - DB_MIN) / (DB_MAX - DB_MIN))); }

function updateGauge(g, A) {
  var raw = A.silent ? 0 : A.raw[g.src];
  // Envelope like a VU's rectifier: instant attack, ~300 ms release, so short hits keep the needle up.
  g.env = raw > g.env ? raw : g.env * Math.exp(-A.dt / 0.3);
  var level = g.env;
  // Automatic gain on the recent average, like a calibrated VU: the program level sits around -3 VU and
  // transients swing into the red. The floor keeps near-silence near the left stop.
  if (level > 0.004) g.ref += (level - g.ref) * (1 - Math.exp(-A.dt / 3));
  var ref = Math.max(g.ref, g.src === 'bass' ? 0.08 : 0.03);
  var db = level > 0.004 ? 20 * Math.log(level / ref) / Math.LN10 - 3 : DB_MIN - 5;
  var target = dbToPos(db);
  // VU ballistics: a damped spring, ~300 ms to settle with a slight overshoot.
  var w0 = 2 * Math.PI * 1.7, zeta = 0.72, steps = Math.max(1, Math.ceil(A.dt / 0.008)), h = A.dt / steps;
  for (var i = 0; i < steps; i++) {
    g.vel += (w0 * w0 * (target - g.pos) - 2 * zeta * w0 * g.vel) * h;
    g.pos += g.vel * h;
  }
  g.pos = Math.max(-0.02, Math.min(1.03, g.pos));
  g.db += (Math.max(DB_MIN, Math.min(DB_MAX, db)) - g.db) * (1 - Math.exp(-A.dt / 0.25));
  if (db > 1) g.peak = 0.5;
  g.peak = Math.max(0, g.peak - A.dt);
}

function drawGauge(ctx, g, cx, cy, R, A) {
  var A0 = Math.PI, A1 = Math.PI * 2, span = A1 - A0;
  ctx.lineCap = 'butt';
  // Scale: green, then yellow, then the red zone past 0 VU
  var zones = [[0, dbToPos(-3), 'green'], [dbToPos(-3), dbToPos(0), 'yellow'], [dbToPos(0), 1, 'red']];
  ctx.lineWidth = Math.max(4, R * 0.12);
  ctx.strokeStyle = VK.rgba('dim', 0.18);
  ctx.beginPath(); ctx.arc(cx, cy, R, A0, A1); ctx.stroke();
  zones.forEach(function (z) {
    // The zone glows up to where the needle is.
    var lit = Math.max(0, Math.min(z[1], g.pos) - z[0]);
    ctx.strokeStyle = VK.rgba(z[2], 0.28);
    ctx.beginPath(); ctx.arc(cx, cy, R, A0 + span * z[0], A0 + span * z[1]); ctx.stroke();
    if (lit > 0) {
      ctx.strokeStyle = VK.c[z[2]];
      ctx.beginPath(); ctx.arc(cx, cy, R, A0 + span * z[0], A0 + span * (z[0] + lit)); ctx.stroke();
    }
  });
  // Ticks, with dB labels when there is room
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = VK.rgba('text', 0.6);
  ctx.fillStyle = VK.rgba('text', 0.75);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = VK.font(Math.max(7, R * 0.1));
  TICKS.forEach(function (d) {
    var a = A0 + span * dbToPos(d), major = d % 5 === 0 || d === -3 || d === 3;
    var r1 = R * 0.7, r2 = R * (major ? 0.82 : 0.77);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
    if (R > 60 && major) ctx.fillText((d > 0 ? '+' : '') + d, cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6);
  });
  // The fuel gauge's E and F stay at the stops.
  ctx.font = VK.font(Math.max(8, R * 0.16), 'bold');
  ctx.fillStyle = VK.c.text;
  ctx.fillText('E', cx - R * 1.12, cy - R * 0.02);
  ctx.fillText('F', cx + R * 1.12, cy - R * 0.02);
  // Needle with its counterweight
  var na = A0 + span * Math.max(0, Math.min(1, g.pos));
  ctx.strokeStyle = VK.c.text;
  ctx.lineWidth = Math.max(1.5, R * 0.03);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(na) * R * 0.12, cy - Math.sin(na) * R * 0.12);
  ctx.lineTo(cx + Math.cos(na) * R * 0.9, cy + Math.sin(na) * R * 0.9);
  ctx.stroke();
  ctx.fillStyle = VK.c.accent;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.07, 0, 6.283); ctx.fill();
  // Peak lamp
  var lx = cx + R * 0.62, ly = cy - R * 0.72, lr = Math.max(2.5, R * 0.05);
  ctx.fillStyle = g.peak > 0 ? VK.c.red : VK.rgba('red', 0.18);
  ctx.beginPath(); ctx.arc(lx, ly, lr, 0, 6.283); ctx.fill();
  if (g.peak > 0) {
    var pg = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr * 4);
    pg.addColorStop(0, VK.rgba('red', 0.5 * g.peak / 0.5));
    pg.addColorStop(1, VK.rgba('red', 0));
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(lx, ly, lr * 4, 0, 6.283); ctx.fill();
  }
  // Readouts
  ctx.textAlign = 'center';
  ctx.fillStyle = VK.c.dim;
  ctx.font = VK.font(Math.max(8, R * 0.13));
  ctx.fillText(g.label + ' ' + g.kanji, cx, cy - R * 0.38);
  ctx.font = VK.font(Math.max(11, R * 0.24), 'bold');
  ctx.fillStyle = A.silent ? VK.c.dim : g.db > 0 ? VK.c.red : VK.c.text;
  var dbTxt = A.silent ? '--' : (g.db >= 0 ? '+' : '') + g.db.toFixed(1) + ' VU';
  ctx.fillText(dbTxt, cx, cy + R * 0.28);
  if (A.silent && Math.sin(A.t * 6) > 0) {
    ctx.fillStyle = VK.c.red;
    ctx.font = VK.font(Math.max(9, R * 0.15), 'bold');
    ctx.fillText('LOW FUEL', cx, cy - R * 0.6);
  }
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors);
  GAUGES.forEach(function (g) { updateGauge(g, A); });
  ctx.fillStyle = VK.c.bg;
  ctx.fillRect(0, 0, W, H);
  var wide = W > H * 1.3, R;
  if (wide) {
    // The arc top and the readout under the hub both have to fit in a short banner.
    R = Math.min(W / 5.6, (H - 14) / 1.42);
    var cyw = 8 + R * 1.06;
    drawGauge(ctx, GAUGES[0], W * 0.27, cyw, R, A);
    drawGauge(ctx, GAUGES[1], W * 0.73, cyw, R, A);
  } else {
    R = Math.min(W / 2.8, H / 3.6);
    drawGauge(ctx, GAUGES[0], W / 2, H * 0.32, R, A);
    drawGauge(ctx, GAUGES[1], W / 2, H * 0.8, R, A);
  }
  // Tempo between the gauges
  if (A.bpm && !A.silent) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = VK.font(Math.max(8, Math.min(12, R * 0.14)));
    ctx.fillStyle = VK.rgba('accent', 0.6 + A.kick * 0.4);
    // Between the gauges when the gap allows it, otherwise under them.
    var txt = '燃料計 · ' + A.bpm + ' BPM', tw = ctx.measureText(txt).width, gap = W * 0.46 - R * 2.5;
    var ty = !wide ? H - 9 : gap > tw + 10 ? 8 + R * 1.06 : Math.min(H - 9, 8 + R * 1.06 + R * 0.5 + 10);
    ctx.fillText(txt, W / 2, ty);
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
