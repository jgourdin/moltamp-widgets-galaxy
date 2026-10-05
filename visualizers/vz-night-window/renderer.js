// @moltamp-visualizer: Night Window ♪
// The rainy neon window, soaked by your music: the rain follows the energy, drops hit the glass on every beat, the city lights flicker with the mids and lightning strikes on the big drops; silence brings back a clear starry night.
// Music version of the Night Window widget (Night Lounge pack) of the MOLTamp Widgets Galaxy.
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

// Night Window ♪: the neon city behind a rainy pane, with the weather played by the music.
var DPR = 2; // MOLTamp pre-scales the visualizer canvas 2x
var layers = [], layerKey = '', antennas = [], neons = [], liveWins = [];
var drops = [], runners = [], rain = [], cars = [], stars = [], clouds = [];
var amt = { rain: 0, cloud: 0.05 }, flash = 0, bolt = null, sinceBolt = 9, slowBass = 0, seededFor = '';
var rndCar = VK.prng(0.777);

// Buildings and windows as draw ops, cached on an OffscreenCanvas when the worker has one.
function genCity(w, h, light) {
  layers = []; antennas = []; neons = []; liveWins = [];
  var r = VK.prng(0.4242);
  var specs = [
    { top: 0.28, low: 0.62, wMin: 0.05, wMax: 0.11, shade: light ? 0.32 : 0.1, lit: 0.12, haze: 0.55 },
    { top: 0.4, low: 0.78, wMin: 0.07, wMax: 0.16, shade: light ? 0.46 : 0.06, lit: 0.22, haze: 0.25 },
    { top: 0.62, low: 0.9, wMin: 0.1, wMax: 0.24, shade: light ? 0.6 : 0.03, lit: 0.3, haze: 0 }
  ];
  var winCols = ['yellow', 'yellow', 'yellow', 'cyan', 'accent', 'magenta'];
  for (var L = 0; L < specs.length; L++) {
    var sp = specs[L], ops = [];
    var unit = Math.max(h, w * 0.35), x = -unit * 0.02;
    while (x < w) {
      var bw = unit * (sp.wMin + r() * (sp.wMax - sp.wMin)) * (0.7 + 0.6 * (L === 2 ? 1 : r()));
      var top = h * (sp.top + r() * (sp.low - sp.top) * 0.6);
      var body = VK.mix('bg', 'text', sp.shade + r() * 0.04);
      ops.push([x, top, bw, h - top, body]);
      if (r() < 0.35) {
        var cw = bw * (0.3 + r() * 0.4), chh = (h - top) * (0.06 + r() * 0.1);
        ops.push([x + (bw - cw) / 2, top - chh, cw, chh, body]);
        if (r() < 0.6) antennas.push({ layer: L, x: x + bw / 2, y: top - chh - h * 0.04, p: r() * 6.28 });
        ops.push([x + bw / 2 - 0.5, top - chh - h * 0.04, 1, h * 0.04, body]);
      }
      var cell = Math.max(2.2, h * (0.014 + L * 0.004)), gap = cell * 0.8;
      for (var wy = top + gap; wy < h - gap; wy += cell + gap) {
        for (var wxp = x + gap; wxp < x + bw - cell; wxp += cell + gap) {
          if (r() > sp.lit) continue;
          var tone = winCols[(r() * winCols.length) | 0];
          // A few windows stay live and flicker with the mids; the rest are baked into the layer.
          if (L > 0 && liveWins.length < 60 && r() < 0.12) liveWins.push({ layer: L, x: wxp, y: wy, w: cell, h: cell * 0.9, tone: tone, band: (r() * 8) | 0 });
          else ops.push([wxp, wy, cell, cell * 0.9, VK.rgba(tone, 0.35 + r() * 0.45)]);
        }
      }
      if (L > 0 && r() < 0.28 && bw > unit * 0.06) {
        neons.push({ layer: L, x: x + bw * (0.1 + r() * 0.6), y: top + (h - top) * (0.1 + r() * 0.3),
          w: Math.max(3, bw * 0.12), h: (h - top) * (0.25 + r() * 0.3), col: ['magenta', 'cyan', 'accent', 'red'][(r() * 4) | 0], p: r() * 10 });
      }
      x += bw + unit * (L === 2 ? 0.004 : 0.01) * r();
    }
    var cv = null;
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        cv = new OffscreenCanvas(Math.max(1, Math.round(w * DPR)), Math.max(1, Math.round(h * DPR)));
        var g = cv.getContext('2d');
        g.setTransform(DPR, 0, 0, DPR, 0, 0);
        ops.forEach(function (o) { g.fillStyle = o[4]; g.fillRect(o[0], o[1], o[2], o[3]); });
      } catch (e) { cv = null; }
    }
    layers.push({ cv: cv, ops: cv ? null : ops, haze: sp.haze });
  }
}

function seed(w, h) {
  var r = VK.prng(0.1717);
  stars = [];
  for (var i = 0; i < 90; i++) stars.push({ x: r() * w, y: r() * h * 0.55, s: 0.5 + r() * 1.2, p: r() * 6.28 });
  clouds = [];
  for (i = 0; i < 7; i++) clouds.push({ x: r() * w * 1.3, y: h * (0.05 + r() * 0.35), rx: w * (0.12 + r() * 0.2), ry: h * (0.05 + r() * 0.08), v: 4 + r() * 8 });
  drops = []; runners = []; rain = [];
}

// A bead on the glass: dark lens, bright lower rim, a glint on top.
function bead(ctx, x, y, r, a) {
  ctx.fillStyle = VK.rgba('bg', 0.35 * a);
  ctx.beginPath(); ctx.arc(x, y + r * 0.15, r, 0, 6.283); ctx.fill();
  ctx.strokeStyle = VK.rgba('text', 0.45 * a);
  ctx.lineWidth = Math.max(0.7, r * 0.3);
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0.5, 2.6); ctx.stroke();
  ctx.fillStyle = VK.rgba('text', 0.8 * a);
  ctx.fillRect(x - r * 0.45, y - r * 0.55, Math.max(0.9, r * 0.32), Math.max(0.9, r * 0.32));
}

function frame(ctx, w, h) {
  var f = Math.max(3, Math.min(w, h) * 0.035);
  ctx.fillStyle = VK.mix('bg', 'dim', 0.18);
  ctx.fillRect(0, 0, w, f); ctx.fillRect(0, h - f * 1.6, w, f * 1.6);
  ctx.fillRect(0, 0, f, h); ctx.fillRect(w - f, 0, f, h);
  var panes = w > h * 2.6 ? 3 : w > h * 1.2 ? 2 : 1;
  for (var i = 1; i < panes; i++) ctx.fillRect(w * i / panes - f * 0.35, 0, f * 0.7, h);
  if (h > 160 && panes < 3) ctx.fillRect(0, h * 0.42 - f * 0.3, w, f * 0.6);
  ctx.fillStyle = VK.mix('bg', 'dim', 0.32);
  ctx.fillRect(f, h - f * 1.6, w - 2 * f, 1);
  var refl = ctx.createLinearGradient(0, 0, w, h);
  refl.addColorStop(0, VK.rgba('text', 0.05));
  refl.addColorStop(0.35, VK.rgba('text', 0));
  refl.addColorStop(0.6, VK.rgba('text', 0.025));
  refl.addColorStop(1, VK.rgba('text', 0));
  ctx.fillStyle = refl;
  ctx.fillRect(f, f, w - 2 * f, h - f * 2.6);
}

function sign(ctx, w, h, A) {
  var size = Math.max(9, Math.min(22, h * 0.085, w * 0.05));
  var txt = A.silent ? 'QUIET NIGHT' : '♪ ' + (A.bpm ? A.bpm + ' BPM' : 'ON AIR');
  ctx.font = VK.font(size, 'bold');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  var tw = ctx.measureText(txt).width, pad = size * 0.55, f = Math.max(3, Math.min(w, h) * 0.035);
  var bx = f + size * 0.6, by = f + size * 0.5, bw = tw + pad * 2, bh = size * 1.7;
  var col = A.silent ? 'cyan' : 'magenta';
  // The tube flares on the beat and stutters now and then.
  var on = Math.sin(A.t * 0.9) > -0.97 || Math.sin(A.t * 31) > 0, k = A.silent ? 0 : A.kick;
  ctx.fillStyle = VK.rgba('bg', 0.55);
  ctx.fillRect(bx, by, bw, bh);
  ctx.shadowColor = VK.c[col];
  ctx.shadowBlur = on ? size * (0.6 + k * 0.8) : 0;
  ctx.strokeStyle = VK.rgba(col, on ? 0.7 + k * 0.3 : 0.3);
  ctx.lineWidth = Math.max(1, size * 0.09);
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.fillStyle = on ? VK.mix(col, 'text', 0.25 + k * 0.4) : VK.rgba(col, 0.35);
  ctx.fillText(txt, bx + pad, by + bh / 2 + 0.5);
  ctx.shadowBlur = 0;
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light, t = A.t;
  var key = [W, H, VK.c.bg, VK.c.text, VK.c.accent, VK.c.yellow, VK.c.cyan, VK.c.magenta].join('|');
  if (W + 'x' + H !== seededFor) { seededFor = W + 'x' + H; seed(W, H); }
  if (key !== layerKey) { layerKey = key; genCity(W, H, light); }

  // Weather from the music: rain with the energy, clouds with the rain, a clear sky in silence.
  var rainT = A.silent ? 0 : Math.max(0, Math.min(1, (A.energy - 0.06) * 2.4));
  amt.rain += (rainT - amt.rain) * (1 - Math.exp(-dt / 1.2));
  amt.cloud += ((A.silent ? 0.04 : 0.25 + amt.rain * 0.65) - amt.cloud) * (1 - Math.exp(-dt / 2));

  var d = new Date(), hr = d.getHours() + d.getMinutes() / 60;
  var dayness = hr < 6 || hr > 21 ? 0 : hr < 8 ? (hr - 6) / 2 : hr > 19 ? (21 - hr) / 2 : 1;
  var warm = Math.max(0, 1 - Math.abs(hr - 20) / 1.5) + Math.max(0, 1 - Math.abs(hr - 7) / 1.5);
  var sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, VK.mix('bg', 'blue', (light ? 0.25 : 0.14) + dayness * 0.12 - amt.cloud * 0.06));
  sky.addColorStop(0.65, VK.mix('bg', warm > 0.05 ? 'yellow' : 'magenta', Math.min(0.4, 0.14 + warm * 0.18 + dayness * 0.05)));
  sky.addColorStop(1, VK.mix('bg', 'accent', 0.22));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  if (amt.cloud > 0.02) { ctx.fillStyle = VK.mix('bg', 'dim', 0.12, amt.cloud * 0.6); ctx.fillRect(0, 0, W, H); }

  var i, clearSky = Math.max(0, 1 - amt.cloud * 1.3) * (1 - dayness * 0.8);
  if (clearSky > 0.02) {
    ctx.fillStyle = VK.c.text;
    for (i = 0; i < stars.length; i++) {
      var st = stars[i];
      ctx.globalAlpha = clearSky * (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.7 + st.p)));
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }
    var mr = Math.max(6, Math.min(W, H) * 0.08), mx = W * 0.82, my = H * 0.2;
    ctx.globalAlpha = clearSky;
    var halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
    halo.addColorStop(0, VK.rgba('yellow', 0.25));
    halo.addColorStop(1, VK.rgba('yellow', 0));
    ctx.fillStyle = halo;
    ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    ctx.save();
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.283); ctx.clip();
    ctx.fillStyle = VK.mix('yellow', 'text', 0.6);
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.283); ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.9, 0, 6.283); ctx.fill('evenodd');
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  if (amt.cloud > 0.05) {
    for (i = 0; i < clouds.length; i++) {
      var cl = clouds[i];
      cl.x += cl.v * dt * (1 + A.energy);
      if (cl.x - cl.rx > W) cl.x = -cl.rx;
      var cg = ctx.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.rx);
      cg.addColorStop(0, VK.mix('dim', 'bg', 0.45, amt.cloud * 0.45));
      cg.addColorStop(1, VK.mix('dim', 'bg', 0.45, 0));
      ctx.fillStyle = cg;
      ctx.save(); ctx.translate(cl.x, cl.y); ctx.scale(1, cl.ry / cl.rx); ctx.translate(-cl.x, -cl.y);
      ctx.beginPath(); ctx.arc(cl.x, cl.y, cl.rx, 0, 6.283); ctx.fill();
      ctx.restore();
    }
  }

  // Lightning on a big hit that stands out from the last few seconds (the drop after a break).
  slowBass += (A.raw.bass - slowBass) * (1 - Math.exp(-dt / 3));
  sinceBolt += dt;
  if (A.hit && !A.silent && sinceBolt > 2.5 && A.raw.bass > slowBass * 1.45 + 0.06) {
    sinceBolt = 0;
    flash = 1;
    var bx = W * (0.15 + Math.random() * 0.7), pts = [[bx, 0]], y = 0;
    while (y < H * 0.55) { y += H * (0.05 + Math.random() * 0.08); bx += (Math.random() - 0.5) * W * 0.06; pts.push([bx, y]); }
    bolt = { pts: pts, life: 0.2 };
  }
  if (flash > 0.01) { ctx.fillStyle = VK.rgba('text', flash * 0.35); ctx.fillRect(0, 0, W, H); flash *= Math.exp(-dt * 6); }
  if (bolt) {
    bolt.life -= dt;
    ctx.strokeStyle = VK.rgba('text', Math.max(0, bolt.life / 0.2));
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (i = 0; i < bolt.pts.length; i++) { if (i) ctx.lineTo(bolt.pts[i][0], bolt.pts[i][1]); else ctx.moveTo(bolt.pts[i][0], bolt.pts[i][1]); }
    ctx.stroke();
    if (bolt.life <= 0) bolt = null;
  }

  // City, far to near; live windows and neon tubes flicker with the mids.
  var lv = VK.bands(8), mids = A.silent ? 0.25 : Math.min(1, A.mid * 1.8);
  for (var L = 0; L < layers.length; L++) {
    var layer = layers[L];
    if (layer.cv) ctx.drawImage(layer.cv, 0, 0, W, H);
    else layer.ops.forEach(function (o) { ctx.fillStyle = o[4]; ctx.fillRect(o[0], o[1], o[2], o[3]); });
    for (i = 0; i < liveWins.length; i++) {
      var lw = liveWins[i];
      if (lw.layer !== L) continue;
      var a = A.silent ? 0.5 : Math.min(0.95, 0.15 + lv[lw.band] * 1.6);
      ctx.fillStyle = VK.rgba(lw.tone, a);
      ctx.fillRect(lw.x, lw.y, lw.w, lw.h);
    }
    for (i = 0; i < antennas.length; i++) {
      var an = antennas[i];
      if (an.layer !== L || Math.sin(t * 2.4 + an.p) < 0.6) continue;
      ctx.fillStyle = VK.rgba('red', 0.9);
      ctx.fillRect(an.x - 1, an.y - 1, 2, 2);
    }
    for (i = 0; i < neons.length; i++) {
      var ne = neons[i];
      if (ne.layer !== L) continue;
      var glowA = (light ? 0.45 : 0.55) + mids * 0.4;
      if (ne.p > 8 && Math.sin(t * 23 + ne.p) < -0.6 && !A.silent) continue;
      ctx.fillStyle = VK.rgba(ne.col, glowA);
      ctx.fillRect(ne.x, ne.y, ne.w, ne.h);
      ctx.fillStyle = VK.rgba(ne.col, 0.1 + mids * 0.12);
      ctx.fillRect(ne.x - ne.w, ne.y - ne.w * 0.5, ne.w * 3, ne.h + ne.w);
    }
    var fogA = amt.rain * (L === 0 ? 0.18 : 0.06);
    if (fogA > 0.01) {
      var fg = ctx.createLinearGradient(0, H * 0.3, 0, H);
      fg.addColorStop(0, VK.mix('bg', 'dim', 0.35, 0));
      fg.addColorStop(1, VK.mix('bg', 'dim', 0.35, Math.min(0.8, fogA)));
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, W, H);
    }
    if (L === 0) {
      if (cars.length < 5 && rndCar() < dt * (0.4 + A.energy)) {
        var dir = rndCar() < 0.5 ? 1 : -1;
        cars.push({ x: dir > 0 ? -20 : W + 20, y: H * (0.12 + rndCar() * 0.45), v: dir * (25 + rndCar() * 45), col: rndCar() < 0.5 ? 'cyan' : 'red' });
      }
      for (i = cars.length - 1; i >= 0; i--) {
        var car = cars[i];
        car.x += car.v * dt * (1 + A.bass);
        if (car.x < -40 || car.x > W + 40) { cars.splice(i, 1); continue; }
        ctx.fillStyle = VK.rgba(car.col, 0.25);
        ctx.fillRect(car.x - Math.sign(car.v) * 14, car.y, Math.sign(car.v) * 14, 1);
        ctx.fillStyle = VK.rgba(car.col, 0.95);
        ctx.fillRect(car.x - 1, car.y - 1, 2.4, 2);
      }
    }
  }

  // Rain outside: slanted streaks, denser and faster with the energy
  var slant = 0.08 + A.bass * 0.25;
  var want = amt.rain > 0.03 ? Math.round(Math.min(340, W * H / 520) * (0.3 + 0.7 * amt.rain)) : 0;
  while (rain.length < want) rain.push({ x: Math.random() * (W + H * slant), y: Math.random() * H, l: 8 + Math.random() * 16, v: 420 + Math.random() * 280 });
  if (rain.length > want) rain.length = want;
  if (rain.length) {
    ctx.strokeStyle = VK.rgba(light ? 'dim' : 'text', (light ? 0.5 : 0.28) + A.high * 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i < rain.length; i++) {
      var rd = rain[i], sp = rd.v * (0.8 + A.energy * 0.8);
      rd.y += sp * dt; rd.x -= sp * slant * dt;
      if (rd.y > H || rd.x < -10) { rd.y = -rd.l; rd.x = Math.random() * (W + H * slant); }
      ctx.moveTo(rd.x, rd.y); ctx.lineTo(rd.x + rd.l * slant, rd.y - rd.l);
    }
    ctx.stroke();
  }

  // Glass: every beat throws drops on the pane; big ones run down. They dry off in silence.
  if (A.hit && !A.silent) {
    var n = 2 + Math.round(A.kick * 4 * (0.4 + amt.rain));
    for (i = 0; i < n && drops.length < 170; i++) drops.push({ x: Math.random() * W, y: Math.random() * H * 0.9, r: 0.8 + Math.random() * (1.4 + A.kick * 2.2), a: 1 });
  }
  for (i = drops.length - 1; i >= 0; i--) {
    var dr = drops[i];
    dr.a -= dt * (A.silent ? 0.25 : 0.03);
    if (dr.a <= 0) { drops.splice(i, 1); continue; }
    if (dr.r > 2.6 && runners.length < 6 && Math.random() < dt * 0.5) {
      runners.push({ x: dr.x, y: dr.y, r: dr.r, v: 10, p: Math.random() * 6.28, a: dr.a });
      drops.splice(i, 1);
      continue;
    }
    bead(ctx, dr.x, dr.y, dr.r, dr.a);
  }
  for (i = runners.length - 1; i >= 0; i--) {
    var ru = runners[i];
    ru.v = Math.min(120, ru.v + 90 * dt);
    ru.y += ru.v * dt;
    ru.x += Math.sin(ru.y * 0.12 + ru.p) * 0.4;
    ctx.strokeStyle = VK.rgba('text', 0.12 * ru.a);
    ctx.lineWidth = ru.r * 0.7;
    ctx.beginPath(); ctx.moveTo(ru.x, ru.y - Math.min(ru.y, H * 0.25)); ctx.lineTo(ru.x, ru.y); ctx.stroke();
    bead(ctx, ru.x, ru.y, ru.r, ru.a);
    if (ru.y > H + 6) runners.splice(i, 1);
  }

  var cond = ctx.createLinearGradient(0, H * 0.7, 0, H);
  cond.addColorStop(0, VK.rgba('text', 0));
  cond.addColorStop(1, VK.rgba('text', (0.18 + amt.rain * 0.12) * (light ? 0.2 : 0.12)));
  ctx.fillStyle = cond;
  ctx.fillRect(0, H * 0.7, W, H * 0.3);

  frame(ctx, W, H);
  sign(ctx, W, H, A);
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
