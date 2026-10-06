// @moltamp-visualizer: Light Trails ♪
// Neon bike streaks racing to your music: the bass sets the speed, every beat sends a new rider, the dominant band paints it, and the highs throw sparks off the road.
// Music version of the Light Trails widget (Cyberpunk pack) of the MOLTamp Widgets Galaxy.
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

// Light Trails ♪: neon streaks on a night road; the bass sets the pace, beats send riders, highs throw sparks.
var MAX = 40, MAX_SPARKS = 90;
var trails = [], sparks = [], pulse = 0, roadT = 0;

function dominant(A) { return A.bass >= A.mid && A.bass >= A.high * 1.2 ? 'red' : A.high > A.mid ? 'cyan' : 'magenta'; }

function spawn(W, H, A, col) {
  if (trails.length >= MAX) return;
  var dir = Math.random() < 0.7 ? 1 : -1, lane = 0.18 + Math.random() * 0.74;
  trails.push({
    x: dir > 0 ? -Math.random() * W * 0.2 : W * (1 + Math.random() * 0.2),
    y: lane * H, dir: dir,
    v: 0.45 + Math.random() * 0.6,
    len: (0.18 + Math.random() * 0.35) * W,
    width: 1 + Math.random() * 2.2 * (0.5 + lane),
    wob: Math.random() * 6.28,
    col: col
  });
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  // Global pace: the bass pushes every rider; silence slows the road to a crawl.
  var pace = A.silent ? 0.25 : 0.55 + A.bass * 2.2 + A.kick * 0.6;
  roadT += dt * pace;
  pulse = Math.max(pulse * Math.exp(-dt * 4), A.kick);
  if (A.hit && !A.silent) { spawn(W, H, A, dominant(A)); if (A.kick > 0.8 && Math.random() < 0.4) spawn(W, H, A, dominant(A)); }
  var ambient = A.silent ? 2 : 3 + A.energy * 14;
  if (trails.length < ambient && Math.random() < dt * (1 + A.energy * 6)) spawn(W, H, A, ['red', 'red', 'magenta', 'accent'][(Math.random() * 4) | 0]);

  ctx.clearRect(0, 0, W, H);
  // Horizon glow breathing with the kick, faint lane lines scrolling with the pace
  var glow = ctx.createLinearGradient(0, 0, 0, H);
  glow.addColorStop(0, VK.rgba('red', 0));
  glow.addColorStop(0.15, VK.rgba('red', 0.05 + A.energy * 0.06 + pulse * 0.08));
  glow.addColorStop(1, VK.rgba('red', 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = VK.rgba('dim', light ? 0.25 : 0.14);
  ctx.lineWidth = 1;
  ctx.setLineDash([14, 22]);
  ctx.lineDashOffset = -roadT * 300;
  ctx.beginPath();
  for (var l = 1; l < 5; l++) { var yl = H * (0.12 + l * 0.2); ctx.moveTo(0, yl); ctx.lineTo(W, yl); }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  ctx.lineCap = 'round';
  for (var i = trails.length - 1; i >= 0; i--) {
    var p = trails[i];
    p.x += p.dir * p.v * W * pace * dt;
    var y = p.y + Math.sin(A.t * 2.3 + p.wob) * 2.5;
    var tail = p.x - p.dir * p.len;
    if ((p.dir > 0 && tail > W) || (p.dir < 0 && tail < 0)) { trails.splice(i, 1); continue; }
    var g = ctx.createLinearGradient(tail, 0, p.x, 0);
    g.addColorStop(0, VK.rgba(p.col, 0));
    g.addColorStop(0.75, VK.rgba(p.col, 0.35));
    g.addColorStop(1, VK.rgba(p.col, 0.9));
    ctx.strokeStyle = g;
    ctx.lineWidth = p.width * (3.2 + pulse * 1.5); // halo
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(tail, y); ctx.lineTo(p.x, y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = p.width;
    ctx.beginPath(); ctx.moveTo(tail, y); ctx.lineTo(p.x, y); ctx.stroke();
    ctx.fillStyle = VK.mix(p.col, 'text', 0.6);
    ctx.beginPath(); ctx.arc(p.x, y, p.width * 1.1, 0, 6.283); ctx.fill();
    // Wet-road reflection
    ctx.strokeStyle = VK.rgba(p.col, 0.12);
    ctx.lineWidth = p.width * 0.8;
    ctx.beginPath(); ctx.moveTo(tail, y + p.width * 4); ctx.lineTo(p.x, y + p.width * 4); ctx.stroke();
    // The highs throw sparks off the front wheel.
    if (!A.silent && sparks.length < MAX_SPARKS && Math.random() < A.high * 3 * dt * 10) {
      sparks.push({ x: p.x, y: y + p.width, vx: -p.dir * (40 + Math.random() * 120), vy: -20 - Math.random() * 60, life: 1, col: p.col });
    }
  }
  for (i = sparks.length - 1; i >= 0; i--) {
    var s = sparks[i];
    s.life -= dt * 2.2;
    if (s.life <= 0) { sparks.splice(i, 1); continue; }
    s.vy += 160 * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    ctx.fillStyle = VK.rgba(i % 3 ? 'yellow' : s.col, s.life);
    ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  if (H > 60) {
    ctx.font = VK.font(Math.max(8, Math.min(11, H / 18)));
    ctx.fillStyle = VK.rgba(A.silent ? 'dim' : 'red', 0.9);
    ctx.textBaseline = 'bottom';
    ctx.fillText('走行 ' + trails.length + '  ·  ' + (A.silent ? 'IDLE' : A.bpm ? A.bpm + ' BPM' : 'CRUISE'), 8, H - 6);
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
