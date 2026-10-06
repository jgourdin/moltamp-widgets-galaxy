// @moltamp-visualizer: Beat Taxi ♪
// The retro taxi meter charging by the beat: every kick rolls the fare drums up a cent, with the tempo, trip time and hourly rate on the side and the roof lamp lit while the music plays.
// Music version of the Taxi Meter widget (Mission Control pack) of the MOLTamp Widgets Galaxy.
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

// Beat Taxi ♪: one cent per beat on rolling mechanical drums; a long silence ends the trip.
var TRIP_GAP = 20;
var trip = { cents: 0, time: 0, quiet: 0 }, shownFare = 0, total = 0, shownTotal = 0, lampPulse = 0, paid = 0;

// Mechanical drums: the lowest one rolls continuously, each higher one turns while the one below passes 9 -> 0.
function drums(ctx, v, n, x, y, cw, ch, dec, colors) {
  for (var i = 0; i < n; i++) {
    var dx = x + (n - 1 - i) * cw, p = v / Math.pow(10, i), d = Math.floor(p) % 10, r;
    if (i === 0) r = p - Math.floor(p);
    else { var lo = v / Math.pow(10, i - 1); r = Math.floor(lo) % 10 === 9 ? lo - Math.floor(lo) : 0; }
    var g = ctx.createLinearGradient(0, y, 0, y + ch);
    g.addColorStop(0, colors.drumEdge); g.addColorStop(0.5, colors.drum); g.addColorStop(1, colors.drumEdge);
    ctx.fillStyle = g;
    ctx.fillRect(dx + 1, y, cw - 2, ch);
    ctx.save();
    ctx.beginPath(); ctx.rect(dx + 1, y, cw - 2, ch); ctx.clip();
    ctx.fillStyle = colors.digit;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = VK.font(ch * 0.78, 'bold');
    // Leading zeros stay blank on the integer part
    if (!(i > dec && v < Math.pow(10, i))) {
      ctx.fillText(String(d), dx + cw / 2, y + ch / 2 - r * ch);
      ctx.fillText(String((d + 1) % 10), dx + cw / 2, y + ch / 2 + ch - r * ch);
    }
    ctx.restore();
    if (dec && i === dec) {
      var dot = Math.max(3, ch * 0.08);
      ctx.fillStyle = VK.c.accent;
      ctx.beginPath(); ctx.arc(dx + cw, y + ch - dot * 1.2, dot / 2, 0, 6.283); ctx.fill();
    }
  }
}

function lamp(ctx, x, y, w, h, A) {
  var on = paid > 0.05 ? ['支払', 'PAY', 'cyan'] : A.silent ? ['空車', 'FOR HIRE', 'red'] : ['賃走', 'ON FARE', 'green'];
  ctx.fillStyle = VK.mix('bg', 'text', 0.06);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = VK.rgba(on[2], 0.6);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // The roof lamp throbs on every beat while a fare is running.
  var glow = 0.3 + (A.silent ? 0 : lampPulse * 0.45);
  var g = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 1.6);
  g.addColorStop(0, VK.rgba(on[2], glow));
  g.addColorStop(1, VK.rgba(on[2], 0));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = A.silent ? VK.rgba(on[2], 0.85) : VK.mix(on[2], 'text', lampPulse * 0.35);
  var big = Math.min(h * 0.55, w / 3.2);
  ctx.font = VK.font(big, 'bold');
  ctx.fillText(on[0], x + w / 2, y + h * (h > 34 ? 0.4 : 0.5));
  if (h > 34) {
    ctx.font = VK.font(Math.min(h * 0.18, w / 11));
    ctx.fillText(on[1], x + w / 2, y + h * 0.78);
  }
}

function small(ctx, title, value, x, y, size) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = VK.font(Math.max(7, size * 0.62));
  ctx.fillStyle = VK.c.dim;
  ctx.fillText(title, x, y);
  ctx.font = VK.font(size, 'bold');
  ctx.fillStyle = VK.c.text;
  ctx.fillText(value, x, y + size * 0.85);
}

function mmss(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  if (A.silent) {
    trip.quiet += dt;
    // A long silence ends the trip: the meter shows PAY for a moment, then resets.
    if (trip.quiet > TRIP_GAP && trip.cents > 0) { trip.cents = 0; trip.time = 0; paid = 1; }
  } else {
    trip.quiet = 0;
    trip.time += dt;
    if (A.hit) { trip.cents++; total++; lampPulse = 1; }
  }
  lampPulse *= Math.exp(-dt * 5);
  paid *= Math.exp(-dt * 0.6);
  var ease = 1 - Math.exp(-dt / 0.18);
  shownFare += (trip.cents - shownFare) * ease;
  if (Math.abs(trip.cents - shownFare) < 0.002) shownFare = trip.cents;
  shownTotal += (total - shownTotal) * ease;
  var cols = {
    drum: light ? VK.mix('bg', 'text', 0.82) : VK.mix('bg', 'text', 0.08),
    drumEdge: light ? VK.mix('bg', 'text', 0.95) : VK.mix('bg', 'dim', 0.25),
    digit: light ? VK.c.bg : VK.c.text
  };

  ctx.fillStyle = VK.c.bg;
  ctx.fillRect(0, 0, W, H);
  var m = Math.max(4, Math.min(W, H) * 0.05), bx = m, by = m, bw = W - 2 * m, bh = H - 2 * m;
  ctx.fillStyle = VK.mix('bg', 'dim', 0.1);
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = VK.rgba('dim', 0.45);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

  var rate = A.bpm && !A.silent ? '$' + (A.bpm * 60 * 0.01).toFixed(2) + '/h' : '--';
  var bpm = A.bpm && !A.silent ? A.bpm + ' BPM' : '--';
  if (bw > bh * 2.2) {
    var lw = Math.min(bw * 0.2, bh * 1.6), ch = Math.min(bh * 0.62, (bw - lw) / 9.5), cw = ch * 0.68;
    lamp(ctx, bx + m, by + m, lw, bh - 2 * m, A);
    var fx = bx + lw + m * 2.5, fy = by + (bh - ch) / 2;
    ctx.fillStyle = VK.c.dim;
    ctx.font = VK.font(Math.max(7, ch * 0.24));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('料金 FARE $', fx, fy - 2);
    drums(ctx, shownFare, 6, fx, fy, cw, ch, 2, cols);
    var sx = fx + cw * 6 + m * 2, size = Math.max(8, Math.min(bh * 0.17, (bx + bw - sx) / 8));
    if (bx + bw - sx > 60) {
      small(ctx, 'TEMPO', bpm, sx, by + m, size);
      small(ctx, 'TRIP', mmss(trip.time), sx, by + bh / 2, size);
      if (bx + bw - sx > 150) {
        small(ctx, 'RATE', rate, sx + (bx + bw - sx) / 2, by + m, size);
        small(ctx, 'BEATS', String(trip.cents), sx + (bx + bw - sx) / 2, by + bh / 2, size);
      }
    }
  } else {
    var lh = Math.max(18, bh * 0.2);
    lamp(ctx, bx + m, by + m, bw - 2 * m, lh, A);
    var ch2 = Math.min(bh * 0.24, (bw - 2 * m) / 4.6), cw2 = ch2 * 0.68, fw = cw2 * 6;
    var fx2 = bx + (bw - fw) / 2, fy2 = by + m + lh + ch2 * 0.55;
    ctx.fillStyle = VK.c.dim;
    ctx.font = VK.font(Math.max(7, ch2 * 0.22));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('料金 FARE $', fx2, fy2 - 2);
    drums(ctx, shownFare, 6, fx2, fy2, cw2, ch2, 2, cols);
    var size2 = Math.max(8, Math.min(bh * 0.06, bw / 14)), ry = fy2 + ch2 + m * 1.5, col2 = bx + m + (bw - 2 * m) / 2;
    if (ry + size2 * 2 < by + bh) {
      small(ctx, 'TEMPO', bpm, bx + m * 2, ry, size2);
      small(ctx, 'TRIP', mmss(trip.time), col2, ry, size2);
    }
    var ry2 = ry + size2 * 2.4;
    if (ry2 + size2 * 2 < by + bh) {
      small(ctx, 'RATE', rate, bx + m * 2, ry2, size2);
      small(ctx, 'BEATS', String(trip.cents), col2, ry2, size2);
    }
    // Odometer: every beat heard since the visualizer started
    var oh = Math.min(size2 * 1.5, (bw - 2 * m) / 9), oy = by + bh - m - oh;
    if (oy > ry2 + size2 * 2.4) {
      var ow = oh * 0.62;
      ctx.fillStyle = VK.c.dim;
      ctx.font = VK.font(Math.max(7, oh * 0.5));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('TOTAL BEATS', bx + m * 2, oy + oh / 2);
      drums(ctx, shownTotal, 6, bx + bw - m * 2 - ow * 6, oy, ow, oh, 0, cols);
    }
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
