// @moltamp-visualizer: Agent Fleet ♪
// The Agent Fleet flies to your music: the formation breathes with the beat, a new ship launches every four beats and docks a few bars later, engine trails stretch with the bass.
// Music version of the Agent Fleet widget (Starship pack) of the MOLTamp Widgets Galaxy.
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

// Agent Fleet: the widget's mothership and ships, flown by the music. A ship launches every four beats and
// docks a few bars later; the formation breathes with the kick, trails follow the bass, the hull lights the energy.
var MAX_SHIPS = 10, LAUNCH_S = 1.4, RETURN_S = 1.3;
var CLASSES = {
  scout: { col: 'cyan', size: 0.75, hull: [[1.1, 0], [-0.5, 0.5], [-0.2, 0], [-0.5, -0.5]] },
  frigate: { col: 'accent', size: 1, hull: [[1, 0], [0.2, 0.25], [-0.2, 0.7], [-0.6, 0.7], [-0.4, 0.2], [-0.7, 0.15], [-0.7, -0.15], [-0.4, -0.2], [-0.6, -0.7], [-0.2, -0.7], [0.2, -0.25]] },
  cruiser: { col: 'magenta', size: 1.3, hull: [[1.3, 0], [0.9, 0.18], [-0.9, 0.28], [-1.1, 0.12], [-1.1, -0.12], [-0.9, -0.28], [0.9, -0.18]] },
  interceptor: { col: 'green', size: 0.85, hull: [[1, 0], [-0.3, 0.15], [-0.8, 0.6], [-0.6, 0], [-0.8, -0.6], [-0.3, -0.15]] },
  hauler: { col: 'yellow', size: 1.1, hull: [[1, 0.2], [1, -0.2], [0.7, -0.35], [-0.9, -0.4], [-0.9, 0.4], [0.7, 0.35]] },
  corvette: { col: 'blue', size: 0.95, hull: [[1, 0], [0.3, 0.3], [-0.7, 0.35], [-0.5, 0], [-0.7, -0.35], [0.3, -0.3]] }
};
var ORDER = ['scout', 'frigate', 'cruiser', 'interceptor', 'hauler', 'corvette'];
var ships = [], launched = 0, docked = 0, spin = 0, starT = 0, blink = false, recallClock = 0, t = 0;
var stars = (function () {
  var r = VK.prng(0.3141), layers = [];
  [[70, 0.5, 4], [40, 1, 10], [16, 1.6, 22]].forEach(function (L) {
    var list = [];
    for (var i = 0; i < L[0]; i++) list.push({ x: r(), y: r(), p: r() * 6.283 });
    layers.push({ list: list, size: L[1], speed: L[2] });
  });
  return layers;
})();

function ease(x) { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

function drawHull(ctx, cls, x, y, ang, size, col, light) {
  var hull = CLASSES[cls].hull, ca = Math.cos(ang), sa = Math.sin(ang);
  ctx.beginPath();
  for (var i = 0; i < hull.length; i++) {
    var hx = hull[i][0] * size, hy = hull[i][1] * size, px = x + hx * ca - hy * sa, py = y + hx * sa + hy * ca;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = VK.mix(col, light ? 'text' : 'bg', 0.45, 0.92);
  ctx.fill();
  ctx.strokeStyle = VK.rgba(col, 0.95);
  ctx.lineWidth = Math.max(1, size * 0.12);
  ctx.stroke();
}

function drawMothership(ctx, x, y, M, A, launching, light) {
  var e = Math.min(1, A.energy * 2.2 + A.kick * 0.4);
  var glow = ctx.createRadialGradient(x, y, 0, x, y, M * (1.4 + e * 0.6));
  glow.addColorStop(0, VK.rgba('accent', (light ? 0.1 : 0.16) + e * (light ? 0.12 : 0.22)));
  glow.addColorStop(1, VK.rgba('accent', 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x - M * 2, y - M * 2, M * 4, M * 4);
  var hull = [[1, 0], [0.7, 0.17], [-0.55, 0.24], [-0.85, 0.13], [-0.85, -0.13], [-0.55, -0.24], [0.7, -0.17]], k = 0.55;
  ctx.beginPath();
  hull.forEach(function (p, i) { var px = x + p[0] * M, py = y + p[1] * M * k * 2; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
  ctx.closePath();
  var g = ctx.createLinearGradient(0, y - M * 0.25, 0, y + M * 0.25);
  g.addColorStop(0, VK.mix('bg', 'text', light ? 0.25 : 0.32));
  g.addColorStop(1, VK.mix('bg', 'dim', 0.12));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = VK.rgba('accent', 0.6 + 0.4 * e);
  ctx.lineWidth = Math.max(1, M * 0.02);
  ctx.stroke();
  ctx.fillStyle = VK.mix('bg', 'text', light ? 0.35 : 0.45);
  ctx.fillRect(x - M * 0.32, y - M * 0.2, M * 0.22, M * 0.1);
  // Hull windows light up with the energy, a strip that runs along the hull on the beat
  var wins = 9;
  for (var i = 0; i < wins; i++) {
    var lit = (i / wins) < e + 0.15 || Math.abs(i - (A.beats % wins)) < 1;
    ctx.fillStyle = lit ? VK.rgba('yellow', 0.55 + 0.4 * A.kick) : VK.rgba('dim', 0.25);
    ctx.fillRect(x - M * 0.62 + i * M * 0.14, y - M * 0.02, M * 0.06, M * 0.045);
  }
  ctx.fillStyle = VK.rgba('yellow', launching ? 0.6 + 0.4 * Math.sin(t * 10) : 0.25 + e * 0.3);
  ctx.fillRect(x + M * 0.62, y - M * 0.05, M * 0.14, M * 0.1);
  // Running lights swap sides on every beat
  ctx.fillStyle = blink ? VK.c.red : VK.rgba('red', 0.25);
  ctx.fillRect(x - M * 0.86, y - M * 0.14, 2, 2);
  ctx.fillStyle = !blink ? VK.c.green : VK.rgba('green', 0.25);
  ctx.fillRect(x - M * 0.86, y + M * 0.12, 2, 2);
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  t += dt;
  ctx.clearRect(0, 0, W, H);

  // ---- fleet logic driven by the beat counter
  if (A.hit && !A.silent) {
    blink = !blink;
    if (A.beats % 4 === 0 && ships.filter(function (s) { return s.state !== 'return'; }).length < MAX_SHIPS) {
      ships.push({ cls: ORDER[launched % ORDER.length], born: A.beats, life: 12 + ((launched * 7) % 4) * 4, state: 'launch', st: 0, cur: null, trail: [], ang: 0 });
      launched++;
    }
  }
  ships.forEach(function (s) { if (s.state === 'flight' && A.beats - s.born >= s.life) { s.state = 'return'; s.st = 0; s.from = s.cur; } });
  // Silence recalls the fleet, one ship at a time.
  if (A.silent) {
    recallClock -= dt;
    if (recallClock <= 0) {
      recallClock = 0.5;
      var out = ships.filter(function (s) { return s.state !== 'return'; })[0];
      if (out) { out.state = 'return'; out.st = 0; out.from = out.cur || [0.8, 0, 0.3]; }
    }
  }

  // Parallax star field, faster with the energy
  starT += dt * (1 + A.energy * 3 + A.kick);
  stars.forEach(function (L) {
    ctx.fillStyle = VK.rgba('text', light ? 0.25 : 0.55);
    L.list.forEach(function (s) {
      var x = ((s.x * W - starT * L.speed * (W / 500)) % W + W) % W;
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.4 + s.p)) * (0.6 + A.high);
      ctx.fillRect(x, s.y * H, L.size, L.size);
    });
  });
  ctx.globalAlpha = 1;

  var cx = W / 2, cy = H * 0.47, sx = Math.min(W * 0.42, H * 1.9), sy = Math.min(H * 0.68, sx * 1.25);
  var pitch = 0.4, cp = Math.cos(pitch), sp = Math.sin(pitch), D = 3.2;
  function proj(p) { var y2 = p[1] * cp - p[2] * sp, z2 = p[1] * sp + p[2] * cp, f = D / (D - z2); return [cx + p[0] * f * sx, cy - y2 * f * sy, z2, f]; }

  var flyingShips = ships.filter(function (s) { return s.state !== 'return'; }), n = flyingShips.length;
  spin += dt * (0.12 + A.energy * 0.7);
  var breathe = 1 + A.kick * 0.16;
  function slot(i) {
    var two = n > 6, inner = two && i % 2 === 1, per = two ? Math.ceil(n / 2) : Math.max(1, n), j = two ? Math.floor(i / 2) : i;
    var a = spin * (inner ? -1.3 : 1) + j * 6.283 / per + (inner ? 0.4 : 0), r = (inner ? 0.62 : 1) * breathe;
    return [Math.cos(a) * r, 0.07 * Math.sin(t * 1.3 + i * 1.7) + A.kick * 0.05, Math.sin(a) * r];
  }
  var hangar = [0.2, -0.02, 0.32], dock = [0, 0, 0], base = Math.max(4, Math.min(H * 0.075, W * 0.03));
  var M = Math.max(16, Math.min(H * 0.3, W * 0.2)), trailLen = Math.round(5 + A.bass * 20);
  var items = [];
  for (var k = ships.length - 1; k >= 0; k--) {
    var s = ships[k], p, idx = flyingShips.indexOf(s);
    s.st += dt;
    if (s.state === 'launch') {
      var e1 = ease(s.st / LAUNCH_S), tg = slot(idx);
      p = [hangar[0] + (tg[0] - hangar[0]) * e1, hangar[1] + (tg[1] - hangar[1]) * e1, hangar[2] + (tg[2] - hangar[2]) * e1];
      s.cur = p;
      if (s.st >= LAUNCH_S) s.state = 'flight';
    } else if (s.state === 'flight') {
      var goal = slot(idx), ee = 1 - Math.exp(-dt * 3), c = s.cur || goal;
      p = s.cur = [c[0] + (goal[0] - c[0]) * ee, c[1] + (goal[1] - c[1]) * ee, c[2] + (goal[2] - c[2]) * ee];
    } else {
      var from = s.from || [0.8, 0, 0.3], q = ease(s.st / RETURN_S);
      p = [from[0] + (dock[0] - from[0]) * q, from[1] + (dock[1] - from[1]) * q, from[2] + (dock[2] - from[2]) * q];
      if (s.st >= RETURN_S) { ships.splice(k, 1); docked++; continue; }
    }
    var sc = proj(p), prev = s.trail.length ? s.trail[s.trail.length - 1] : null;
    if (prev && Math.hypot(sc[0] - prev[0], sc[1] - prev[1]) > 60) s.trail = [];
    if (!prev || Math.hypot(sc[0] - prev[0], sc[1] - prev[1]) > 0.6) { s.ang = prev ? Math.atan2(sc[1] - prev[1], sc[0] - prev[0]) : 0; s.trail.push([sc[0], sc[1]]); }
    while (s.trail.length > trailLen) s.trail.shift();
    var shrink = s.state === 'return' ? 1 - 0.6 * ease(s.st / RETURN_S) : s.state === 'launch' ? 0.4 + 0.6 * ease(s.st / LAUNCH_S) : 1;
    items.push({ s: s, x: sc[0], y: sc[1], z: sc[2], size: base * CLASSES[s.cls].size * sc[3] * shrink });
  }
  items.sort(function (a, b) { return a.z - b.z; });

  function drawShip(it) {
    var s = it.s, col = CLASSES[s.cls].col;
    ctx.lineCap = 'round';
    for (var j = 1; j < s.trail.length; j++) {
      ctx.strokeStyle = VK.rgba(col, (0.3 + A.bass * 0.4) * j / s.trail.length);
      ctx.lineWidth = Math.max(0.8, it.size * (0.3 + A.bass * 0.3) * j / s.trail.length);
      ctx.beginPath(); ctx.moveTo(s.trail[j - 1][0], s.trail[j - 1][1]); ctx.lineTo(s.trail[j][0], s.trail[j][1]); ctx.stroke();
    }
    var ang = s.ang || 0, ex = it.x - Math.cos(ang) * it.size * 0.8, ey = it.y - Math.sin(ang) * it.size * 0.8;
    var er = it.size * (1 + A.bass * 0.8 + A.kick * 0.4);
    var eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
    eg.addColorStop(0, VK.rgba(col, 0.75));
    eg.addColorStop(1, VK.rgba(col, 0));
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.283); ctx.fill();
    drawHull(ctx, s.cls, it.x, it.y, ang, it.size, col, light);
  }
  var mother = proj([0, 0, 0]);
  var launching = ships.some(function (s) { return s.state === 'launch'; });
  items.filter(function (it) { return it.z < 0; }).forEach(drawShip);
  drawMothership(ctx, mother[0], mother[1], M, A, launching, light);
  items.filter(function (it) { return it.z >= 0; }).forEach(drawShip);

  // HUD
  if (H > 60) {
    var fs = Math.max(8, Math.min(11, H / 22, W / 34));
    ctx.font = VK.font(fs);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = VK.rgba('dim', 0.9);
    var line = A.silent ? '艦隊 · hangar ready · waiting for music'
      : '艦隊 · ' + n + ' in flight · ' + docked + ' docked' + (A.bpm ? ' · ' + A.bpm + ' BPM' : '');
    ctx.fillText(line, 8, H - 6);
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
