// @moltamp-visualizer: Orbital EQ ♪
// An equalizer in orbit: seven planets, one per frequency band from the bass inside to the air outside, swell with their level and circle in time with the tempo, while the sun pulses on every beat and the loudest band leaves a comet trail.
// Music version of the Session Orbits widget (Mission Control pack) of the MOLTamp Widgets Galaxy.
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

// Orbital EQ: one planet per frequency band orbiting a beat-pulsing sun; orbits are locked to the tempo.
var NP = 7, TRAIL = 30;
var NAMES = ['SUB', 'BASS', 'LOW-MID', 'MID', 'HIGH-MID', 'PRESENCE', 'AIR'];
var COLS = ['magenta', 'red', 'accent', 'yellow', 'cyan', 'blue', 'green'];
var lvl = new Float32Array(NP), gain = new Float32Array(NP), phase = new Float32Array(NP);
var trails = [], loud = 0, sunFlash = 0;
var bg = (function () {
  var r = VK.prng(0.4242), list = [];
  for (var i = 0; i < 120; i++) list.push({ x: r(), y: r(), s: 0.3 + r() * 1.1, p: r() * 6.283 });
  return list;
})();
for (var p0 = 0; p0 < NP; p0++) { phase[p0] = VK.hash('orbit' + p0) * 6.283; trails.push([]); }

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  var raw = VK.bands(NP);
  for (var i = 0; i < NP; i++) {
    gain[i] = Math.max(raw[i], gain[i] * Math.exp(-dt / 6), 0.1);
    var v = A.silent ? 0 : Math.min(1, raw[i] / gain[i]);
    lvl[i] += (v - lvl[i]) * (1 - Math.exp(-dt / (v > lvl[i] ? 0.05 : 0.3)));
  }
  // The comet trail sticks to a band until another one clearly takes over.
  var best = 0;
  for (i = 1; i < NP; i++) if (lvl[i] > lvl[best]) best = i;
  if (best !== loud && (lvl[best] > lvl[loud] + 0.15 || lvl[loud] < 0.3)) loud = best;
  if (A.hit) sunFlash = 1;
  sunFlash *= Math.exp(-dt * 4);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = VK.c.text;
  for (var b = 0; b < bg.length; b++) {
    var s0 = bg[b];
    ctx.globalAlpha = 0.1 + (0.2 + A.high * 0.4) * (0.5 + 0.5 * Math.sin(A.t * 1.1 + s0.p));
    ctx.fillRect(s0.x * W, s0.y * H, s0.s, s0.s);
  }
  ctx.globalAlpha = 1;

  var cx = W / 2, cy = H / 2, unit = Math.min(W, H);
  var sunR = Math.max(5, unit * 0.07) * (1 + sunFlash * 0.35 + A.bass * 0.15);
  var rxMax = W * 0.46, ryMax = H * 0.4, planets = [];
  // Locked to the tempo: the bass planet laps every 4 beats, outer planets take longer (Kepler-ish).
  var spb = A.bpm ? 60 / A.bpm : 0.55 / (0.4 + A.energy);
  for (i = 0; i < NP; i++) {
    var k = (i + 1) / NP, rx = sunR * 2.2 + (rxMax - sunR * 2.2) * k, ry = sunR * 1.4 + (ryMax - sunR * 1.4) * k;
    var beatsPerLap = 4 * Math.pow(i + 1, 0.8);
    phase[i] += dt * 6.283 / (beatsPerLap * spb) * (A.silent ? 0.12 : 1);
    var x = cx + Math.cos(phase[i]) * rx, y = cy + Math.sin(phase[i]) * ry;
    var pr = Math.max(2, (2.2 + 6 * lvl[i]) * unit / 260);
    var tr = trails[i];
    if (i === loud && !A.silent) { tr.push([x, y]); if (tr.length > TRAIL) tr.shift(); } else if (tr.length) tr.shift();
    planets.push({ i: i, x: x, y: y, r: pr, rx: rx, ry: ry, front: Math.sin(phase[i]) > 0 });
  }

  // Orbits light up with their band
  planets.forEach(function (p) {
    ctx.strokeStyle = VK.rgba(lvl[p.i] > 0.5 ? COLS[p.i] : 'dim', 0.1 + lvl[p.i] * 0.3);
    ctx.lineWidth = 0.7 + lvl[p.i];
    ctx.beginPath(); ctx.ellipse(cx, cy, p.rx, p.ry, 0, 0, 6.283); ctx.stroke();
  });

  function drawPlanet(p) {
    var col = COLS[p.i], tr = trails[p.i], L = lvl[p.i];
    if (tr.length > 2) {
      ctx.lineCap = 'round';
      for (var j = 1; j < tr.length; j++) {
        ctx.strokeStyle = VK.rgba(col, 0.5 * j / tr.length);
        ctx.lineWidth = p.r * 1.1 * j / tr.length;
        ctx.beginPath(); ctx.moveTo(tr[j - 1][0], tr[j - 1][1]); ctx.lineTo(tr[j][0], tr[j][1]); ctx.stroke();
      }
    }
    if (L > 0.35) {
      var gr = p.r * (2.5 + L * 3), g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, gr);
      g.addColorStop(0, VK.rgba(col, 0.25 + 0.45 * L));
      g.addColorStop(1, VK.rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, gr, 0, 6.283); ctx.fill();
    }
    // Lit side towards the sun
    var lx = cx - p.x, ly = cy - p.y, ll = Math.hypot(lx, ly) || 1;
    var body = ctx.createRadialGradient(p.x + lx / ll * p.r * 0.4, p.y + ly / ll * p.r * 0.4, p.r * 0.1, p.x, p.y, p.r);
    body.addColorStop(0, VK.rgba(col, 1));
    body.addColorStop(1, VK.mix(col, 'bg', 0.6, 1));
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    // The low-mid planet wears a ring that tilts with its level
    if (p.i === 2) {
      ctx.strokeStyle = VK.rgba('text', 0.35 + L * 0.4);
      ctx.lineWidth = Math.max(1, p.r * 0.22);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.9, p.r * (0.45 + L * 0.3), -0.35, 0, 6.283); ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  planets.filter(function (p) { return !p.front; }).forEach(drawPlanet);
  ctx.globalCompositeOperation = 'source-over';

  // The sun beats with the music
  var corona = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR * (3 + sunFlash * 1.5));
  corona.addColorStop(0, VK.rgba('yellow', 0.35 + sunFlash * 0.45 + A.bass * 0.2));
  corona.addColorStop(1, VK.rgba('accent', 0));
  ctx.fillStyle = corona;
  ctx.beginPath(); ctx.arc(cx, cy, sunR * (3 + sunFlash * 1.5), 0, 6.283); ctx.fill();
  // On light skins the text colour is dark: the sun stays a bright disc mixed with the accent instead.
  ctx.fillStyle = light ? VK.mix('yellow', 'accent', 0.3 + sunFlash * 0.3) : VK.mix('yellow', 'text', 0.35 + sunFlash * 0.3);
  ctx.beginPath(); ctx.arc(cx, cy, sunR, 0, 6.283); ctx.fill();

  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  planets.filter(function (p) { return p.front; }).forEach(drawPlanet);
  ctx.globalCompositeOperation = 'source-over';

  if (W > 260 && H > 100) {
    ctx.font = VK.font(8);
    ctx.textBaseline = 'middle';
    planets.forEach(function (p) {
      if (lvl[p.i] < 0.25 && p.i !== loud) return;
      ctx.textAlign = p.x > cx ? 'left' : 'right';
      ctx.fillStyle = VK.rgba('text', p.i === loud ? 0.95 : 0.55);
      ctx.fillText(NAMES[p.i], p.x + (p.x > cx ? 1 : -1) * (p.r + 5), p.y - p.r - 4);
    });
  }
  if (H > 50) {
    ctx.font = VK.font(Math.max(8, Math.min(11, H / 22)));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = VK.rgba('dim', 0.95);
    ctx.fillText('軌道 · ' + (A.silent ? 'no signal' : (A.bpm ? A.bpm + ' BPM' : 'free orbit') + ' · ◉ ' + NAMES[loud]), 8, H - 6);
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
