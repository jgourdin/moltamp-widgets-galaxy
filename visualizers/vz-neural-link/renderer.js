// @moltamp-visualizer: Neural Link ♪
// The wireframe brain wired to your music: the bass fires the deep neurons, the highs spark the cortex, every beat sends a synaptic wave across and the energy drives the data streams.
// Music version of the Neural Link widget (Cyberpunk pack) of the MOLTamp Widgets Galaxy.
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

// Neural Link ♪: a node network shaped like a brain; frequency bands fire neurons from the core (bass) to the
// cortex (highs), each beat sweeps a synaptic wave across, energy sends data streams left to right.
var NB = 8, MAX_PULSES = 110;
var nodes = [], edges = [], adj = [], pulses = [];
var brain = null, sulci = null, builtW = 0, builtH = 0;
var flowAcc = 0, fireAcc = new Float32Array(NB), waveX = -1, waveCol = 'accent', breathe = 0;

// Side-view brain: cerebrum, cerebellum and brainstem as one path; nodes are sampled inside it.
function silhouette(w, h) {
  // Wide banners stretch the brain sideways (up to 1.6x) so it doesn't sit tiny in the middle.
  var s = Math.min(w / 1.25, h), sx = Math.min(w / 1.25, s * 1.6), ox = (w - sx * 1.25) / 2, oy = (h - s) / 2 + s * 0.02;
  function X(v) { return ox + v * sx * 1.25; }
  function Y(v) { return oy + v * s; }
  var p = new Path2D();
  p.moveTo(X(0.12), Y(0.55));
  p.bezierCurveTo(X(0.02), Y(0.35), X(0.15), Y(0.08), X(0.42), Y(0.08));
  p.bezierCurveTo(X(0.70), Y(0.04), X(0.95), Y(0.22), X(0.92), Y(0.48));
  p.bezierCurveTo(X(0.91), Y(0.60), X(0.84), Y(0.64), X(0.74), Y(0.62));
  p.bezierCurveTo(X(0.62), Y(0.64), X(0.50), Y(0.70), X(0.36), Y(0.70));
  p.bezierCurveTo(X(0.22), Y(0.70), X(0.15), Y(0.64), X(0.12), Y(0.55));
  p.closePath();
  var cb = new Path2D();
  cb.ellipse(X(0.76), Y(0.70), sx * 1.25 * 0.13, s * 0.09, -0.15, 0, 6.283);
  var stem = new Path2D();
  stem.moveTo(X(0.56), Y(0.64)); stem.lineTo(X(0.64), Y(0.64)); stem.lineTo(X(0.63), Y(0.94)); stem.lineTo(X(0.57), Y(0.94)); stem.closePath();
  var all = new Path2D(); all.addPath(p); all.addPath(cb); all.addPath(stem);
  var su = new Path2D();
  su.moveTo(X(0.30), Y(0.52)); su.bezierCurveTo(X(0.42), Y(0.46), X(0.55), Y(0.44), X(0.66), Y(0.50));
  su.moveTo(X(0.47), Y(0.10)); su.bezierCurveTo(X(0.50), Y(0.25), X(0.46), Y(0.35), X(0.50), Y(0.44));
  su.moveTo(X(0.22), Y(0.25)); su.bezierCurveTo(X(0.28), Y(0.30), X(0.26), Y(0.40), X(0.32), Y(0.44));
  su.moveTo(X(0.70), Y(0.16)); su.bezierCurveTo(X(0.68), Y(0.28), X(0.76), Y(0.34), X(0.74), Y(0.46));
  return { all: all, sulci: su, cx: X(0.5), cy: Y(0.42), rx: sx * 1.25 * 0.42, ry: s * 0.36 };
}

function build(ctx, w, h) {
  var rnd = VK.prng(0.4242);
  var target = Math.round(Math.min(150, Math.max(45, (w * h) / 950)));
  var tries = 0, shape = silhouette(w, h);
  brain = shape.all; sulci = shape.sulci;
  nodes = []; edges = []; adj = []; pulses = [];
  // isPointInPath tests device pixels against the transformed path: test with the identity transform.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  while (nodes.length < target && tries++ < target * 80) {
    var x = rnd() * w, y = rnd() * h;
    if (!ctx.isPointInPath(brain, x, y)) continue;
    // Depth: 0 in the core, 1 at the cortex; the band a neuron listens to follows it.
    var dx = (x - shape.cx) / shape.rx, dy = (y - shape.cy) / shape.ry;
    var depth = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    nodes.push({ x: x, y: y, glow: 0, phase: rnd() * 6.283, band: Math.min(NB - 1, Math.floor(depth * NB)) });
    adj.push([]);
  }
  ctx.restore();
  var seen = {};
  function link(a, b) {
    var lo = Math.min(a, b), hi = Math.max(a, b), key = lo + ':' + hi;
    if (lo === hi || seen[key]) return;
    seen[key] = true;
    edges.push([lo, hi]);
    adj[lo].push(edges.length - 1);
    adj[hi].push(edges.length - 1);
  }
  for (var i = 0; i < nodes.length; i++) {
    var near = [];
    for (var j = 0; j < nodes.length; j++) {
      if (j === i) continue;
      var ex = nodes[i].x - nodes[j].x, ey = nodes[i].y - nodes[j].y;
      near.push([ex * ex + ey * ey, j]);
    }
    near.sort(function (a, b) { return a[0] - b[0]; });
    for (var k = 0; k < 3 && k < near.length; k++) link(i, near[k][1]);
  }
  builtW = w; builtH = h;
}

function other(e, from) { return edges[e][0] === from ? edges[e][1] : edges[e][0]; }

function spawn(from, kind, hops, speed, col) {
  if (pulses.length >= MAX_PULSES || !adj[from] || !adj[from].length) return;
  var list = adj[from], e = list[(Math.random() * list.length) | 0];
  if (kind === 'flow') {
    // Data flows left to right: prefer the edge that moves furthest along x.
    var bestX = -1e9;
    for (var i = 0; i < list.length; i++) {
      var nx = nodes[other(list[i], from)].x;
      if (nx > bestX) { bestX = nx; e = list[i]; }
    }
  }
  pulses.push({ e: e, from: from, t: 0, kind: kind, hops: hops, speed: speed, col: col });
}

function nodeOfBand(b, leftOnly, w) {
  for (var i = 0; i < 16; i++) {
    var n = (Math.random() * nodes.length) | 0;
    if ((b < 0 || nodes[n].band === b) && (!leftOnly || nodes[n].x < w * 0.3)) return n;
  }
  return (Math.random() * nodes.length) | 0;
}

// Bass in the core, mids around it, highs on the cortex.
function bandColor(b) { return b < 3 ? 'magenta' : b < 6 ? 'accent' : 'cyan'; }

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt;
  if (W !== builtW || H !== builtH || !nodes.length) build(ctx, W, H);
  var lv = VK.bands(NB);
  breathe = 0.5 + 0.5 * Math.sin(A.t * (A.silent ? 1.1 : 2.2));
  var dom = A.bass > A.mid * 1.1 && A.bass > A.high ? 'magenta' : A.high > A.mid ? 'cyan' : 'accent';

  // Each band fires its own neurons, harder the louder it is.
  if (!A.silent && nodes.length) {
    for (var b = 0; b < NB; b++) {
      fireAcc[b] += Math.pow(lv[b], 1.5) * 13 * dt;
      while (fireAcc[b] >= 1) {
        fireAcc[b] -= 1;
        var n0 = nodeOfBand(b, false, W);
        nodes[n0].glow = Math.min(1, nodes[n0].glow + 0.6);
        spawn(n0, 'impulse', 3, 2.2 + lv[b] * 2, bandColor(b));
      }
    }
    flowAcc += A.energy * 22 * dt;
    while (flowAcc >= 1) { flowAcc -= 1; spawn(nodeOfBand(-1, true, W), 'flow', 12, 1.4 + A.energy * 2, 'cyan'); }
  } else if (nodes.length && Math.random() < dt * 0.6) {
    spawn(nodeOfBand(-1, false, W), 'drift', 1, 0.7, 'accent');
  }
  // A beat launches a synaptic wave sweeping front to back.
  if (A.hit && waveX < 0) { waveX = 0; waveCol = dom; }

  ctx.clearRect(0, 0, W, H);
  var light = VK.light;

  // Wireframe silhouette
  ctx.strokeStyle = VK.mix('dim', dom, 0.4, 0.35 + 0.15 * breathe + A.kick * 0.25);
  ctx.lineWidth = 1.2 + A.kick * 0.8;
  ctx.stroke(brain);
  ctx.strokeStyle = VK.rgba('dim', 0.18);
  ctx.lineWidth = 1;
  ctx.stroke(sulci);

  // Edges, one batched path
  ctx.beginPath();
  for (var i = 0; i < edges.length; i++) {
    var a = nodes[edges[i][0]], c = nodes[edges[i][1]];
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
  }
  ctx.strokeStyle = VK.mix('dim', dom, 0.35 + 0.4 * A.kick, 0.2 + 0.1 * breathe + A.energy * 0.15);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Pulses
  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  for (i = pulses.length - 1; i >= 0; i--) {
    var p = pulses[i], e = edges[p.e];
    if (!e) { pulses.splice(i, 1); continue; }
    p.t += p.speed * dt;
    var from = nodes[p.from], to = nodes[other(p.e, p.from)];
    if (p.t >= 1) {
      var arrived = other(p.e, p.from);
      nodes[arrived].glow = Math.min(1, nodes[arrived].glow + (p.kind === 'drift' ? 0.3 : 0.6));
      pulses.splice(i, 1);
      if (p.hops > 1 && (p.kind === 'flow' || Math.random() < 0.7)) spawn(arrived, p.kind, p.hops - 1, p.speed, p.col);
      continue;
    }
    var x = from.x + (to.x - from.x) * p.t, y = from.y + (to.y - from.y) * p.t;
    var tx = from.x + (to.x - from.x) * Math.max(0, p.t - 0.25), ty = from.y + (to.y - from.y) * Math.max(0, p.t - 0.25);
    ctx.strokeStyle = VK.rgba(p.col, p.kind === 'drift' ? 0.35 : 0.85);
    ctx.lineWidth = p.kind === 'drift' ? 1 : 1.8;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = VK.rgba(p.kind === 'flow' ? 'text' : p.col, 0.95);
    ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
  }

  // Synaptic wave
  if (waveX >= 0) {
    waveX += dt * 1.6;
    var wx = -W * 0.1 + waveX * W * 1.2;
    var g = ctx.createLinearGradient(wx - 40, 0, wx + 10, 0);
    g.addColorStop(0, VK.rgba(waveCol, 0));
    g.addColorStop(0.8, VK.rgba(waveCol, light ? 0.18 : 0.25));
    g.addColorStop(1, VK.rgba(waveCol, 0));
    // The wave only travels inside the brain.
    ctx.save();
    ctx.clip(brain);
    ctx.fillStyle = g;
    ctx.fillRect(wx - 40, 0, 50, H);
    ctx.restore();
    for (i = 0; i < nodes.length; i++) if (Math.abs(nodes[i].x - wx) < 7) nodes[i].glow = 1;
    if (waveX > 1) waveX = -1;
  }

  // Nodes: each glows with its own band; silence breathes.
  for (i = 0; i < nodes.length; i++) {
    var nd = nodes[i];
    nd.glow *= Math.exp(-dt * 2.5);
    var level = A.silent ? 0.15 * (0.5 + 0.5 * Math.sin(A.t * 1.3 + nd.phase)) : lv[nd.band] * 0.85;
    var gl = Math.max(nd.glow, level);
    var col = bandColor(nd.band);
    if (gl > 0.05) {
      ctx.fillStyle = VK.rgba(col, 0.25 * gl);
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, 2 + gl * 5, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = VK.mix('dim', col, Math.min(1, 0.3 + gl));
    ctx.fillRect(nd.x - 1.1, nd.y - 1.1, 2.2, 2.2);
  }
  ctx.globalCompositeOperation = 'source-over';

  if (H > 60) {
    ctx.font = VK.font(Math.max(8, Math.min(11, H / 18)));
    ctx.fillStyle = VK.rgba(A.silent ? 'dim' : dom, 0.9);
    ctx.textBaseline = 'bottom';
    ctx.fillText(A.silent ? '待機 · IDLE' : '同期 · ' + (A.bpm ? A.bpm + ' BPM' : 'SYNC'), 8, H - 6);
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
