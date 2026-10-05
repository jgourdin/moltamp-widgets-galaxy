// @moltamp-visualizer: Radio Scope ♪
// Deep Space Radio's dial, oscilloscope and spectrum fed with whatever is playing: the scope traces the real waveform, the needle drifts to where the energy sits and the dial reads the tempo.
// Music version of the Deep Space Radio widget (Starship pack) of the MOLTamp Widgets Galaxy.
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

// Radio Scope: Deep Space Radio's dial, oscilloscope and spectrum, fed by the real audio (dataType "both":
// frequency bins in data, waveform in waveData). The needle tunes to the spectral centroid; the dial reads the BPM.
var BANDS = [['SUB', 88.6], ['BASS', 91.5], ['LOW', 95.2], ['MID', 99.2], ['HIGH', 103.4], ['AIR', 107.0]];
var LO = 87.5, HI = 108.5;
var dial = 88.6, live = 0, t = 0, scope = new Float32Array(128), peaks = new Float32Array(48);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function screen(ctx, x, y, w, h, light) {
  roundRect(ctx, x, y, w, h, Math.min(8, h / 6));
  ctx.fillStyle = light ? VK.mix('bg', 'text', 0.06) : VK.mix('bg', 'text', 0.04);
  ctx.fill();
  ctx.strokeStyle = VK.rgba('dim', 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Spectral centroid of the 128 bins on a log-ish scale, mapped onto the FM dial (0 = sub-bass, 1 = air).
function centroid(d) {
  var sum = 0, wsum = 0;
  for (var i = 1; i < 120; i++) { var v = d[i] * d[i]; sum += v; wsum += v * Math.log(i + 1); }
  if (sum < 1) return 0;
  return Math.max(0, Math.min(1, (wsum / sum - Math.log(2)) / (Math.log(120) - Math.log(2))));
}

function drawDial(ctx, x, y, w, h, A, on, light) {
  screen(ctx, x, y, w, h, light);
  var pad = 10, sx = x + pad, sw = w - pad * 2, scaleY = y + h * 0.62;
  function X(f) { return sx + (f - LO) / (HI - LO) * sw; }
  ctx.strokeStyle = VK.rgba('text', on ? 0.55 : 0.3);
  ctx.lineWidth = 1;
  for (var f = 88; f <= 108; f += 0.5) {
    var major = f % 2 === 0, tx = X(f);
    ctx.beginPath(); ctx.moveTo(tx, scaleY - (major ? 7 : 3)); ctx.lineTo(tx, scaleY); ctx.stroke();
    if (major && sw > 160 && f % 4 === 0) {
      ctx.fillStyle = VK.rgba('dim', 0.8);
      ctx.font = VK.font(Math.max(7, Math.min(9, h * 0.1)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(String(f), tx, scaleY + 2);
    }
  }
  // Band marks: the one under the needle lights up
  var nearest = 0, best = 1e9;
  BANDS.forEach(function (b, i) { var d = Math.abs(b[1] - dial); if (d < best) { best = d; nearest = i; } });
  BANDS.forEach(function (b, i) {
    var hot = on && i === nearest;
    ctx.fillStyle = hot ? VK.c.accent : VK.rgba('dim', 0.6);
    ctx.fillRect(X(b[1]) - 1, scaleY - 12, 2, 4);
    if (sw > 220 || hot) {
      ctx.font = VK.font(Math.max(7, Math.min(9, h * 0.09)), hot ? 'bold' : 'normal');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(b[0], X(b[1]), scaleY - 13);
    }
  });
  // Needle, with a glow that swells on the kick
  var nx = X(dial);
  ctx.strokeStyle = on ? VK.c.red : VK.rgba('red', 0.45);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(nx, y + 6); ctx.lineTo(nx, y + h - 6); ctx.stroke();
  if (on) {
    var gw = 12 + A.kick * 14, g = ctx.createLinearGradient(nx - gw, 0, nx + gw, 0);
    g.addColorStop(0, VK.rgba('red', 0)); g.addColorStop(0.5, VK.rgba('red', 0.18 + A.kick * 0.25)); g.addColorStop(1, VK.rgba('red', 0));
    ctx.fillStyle = g;
    ctx.fillRect(nx - gw, y + 4, gw * 2, h - 8);
  }
  // Readout: frequency and tempo
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = on ? VK.c.text : VK.c.dim;
  var big = Math.max(9, Math.min(15, h * 0.17));
  ctx.font = VK.font(big, 'bold');
  ctx.fillText(dial.toFixed(1) + ' MHz' + (A.bpm ? '  ·  ' + A.bpm + ' BPM' : ''), x + pad, y + 5);
  if (h > 112) {
    ctx.fillStyle = VK.rgba('dim', on ? 0.85 : 0.5);
    ctx.font = VK.font(Math.max(7, big * 0.62));
    ctx.fillText('宇宙ラジオ · DEEP SPACE RADIO', x + pad, y + 9 + big * 1.15);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = on ? VK.c.green : VK.c.dim;
  ctx.beginPath(); ctx.arc(x + w - pad - 3, y + 11, 3 + (on ? A.kick * 1.5 : 0), 0, 6.283); ctx.fill();
  ctx.font = VK.font(Math.max(7, Math.min(9, h * 0.1)));
  ctx.fillText(on ? 'ON AIR' : 'NO SIGNAL', x + w - pad - 10, y + 6);
  // Signal strength bar (energy) in place of the widget's volume bar
  var vw = Math.min(110, w * 0.42), vx = x + w - pad - vw, vy = y + h - 9;
  ctx.fillStyle = VK.rgba('dim', 0.25);
  ctx.fillRect(vx, vy, vw, 4);
  ctx.fillStyle = VK.rgba('accent', 0.75);
  ctx.fillRect(vx, vy, vw * Math.min(1, A.energy * 2.2), 4);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = VK.rgba('dim', 0.9);
  ctx.font = VK.font(7);
  ctx.fillText('SIG', vx - 4, vy + 2);
}

function drawScope(ctx, x, y, w, h, A, on, light) {
  screen(ctx, x, y, w, h, light);
  ctx.save();
  roundRect(ctx, x, y, w, h, Math.min(8, h / 6));
  ctx.clip();
  ctx.strokeStyle = VK.rgba('green', 0.1);
  ctx.lineWidth = 1;
  for (var i = 1; i < 8; i++) { var gx = x + w * i / 8; ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
  for (i = 1; i < 4; i++) { var gy = y + h * i / 4; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
  var mid = y + h / 2;
  if (on) {
    ctx.strokeStyle = VK.c.green;
    ctx.lineWidth = 1.6 + A.kick;
    ctx.shadowColor = VK.rgba('green', 0.6);
    ctx.shadowBlur = light ? 0 : 6;
    ctx.beginPath();
    for (i = 0; i < 128; i++) {
      var px = x + i / 127 * w, py = mid + scope[i] * h * 0.45;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else {
    // Static between stations
    ctx.fillStyle = VK.rgba('text', 0.25);
    for (i = 0; i < Math.min(500, w * h / 60); i++) ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 1, 1);
    ctx.strokeStyle = VK.rgba('green', 0.35);
    ctx.beginPath(); ctx.moveTo(x, mid); ctx.lineTo(x + w, mid); ctx.stroke();
  }
  ctx.restore();
}

function drawSpectrum(ctx, x, y, w, h, A, on, light) {
  screen(ctx, x, y, w, h, light);
  var bars = Math.max(8, Math.min(48, Math.floor(w / 7))), bw = (w - 12) / bars, lv = VK.bands(bars);
  for (var i = 0; i < bars; i++) {
    var v = on ? Math.min(1, lv[i] * 1.25) : 0.04 + 0.03 * Math.sin(t * 2 + i);
    peaks[i] = Math.max(v, (peaks[i] || 0) - A.dt * 0.5);
    var bh = Math.max(2, v * (h - 12)), bx = x + 6 + i * bw;
    ctx.fillStyle = VK.mix('cyan', 'magenta', i / bars, on ? 0.9 : 0.35);
    ctx.fillRect(bx, y + h - 6 - bh, Math.max(1, bw - 2), bh);
    if (on) {
      ctx.fillStyle = VK.rgba('text', 0.7);
      ctx.fillRect(bx, y + h - 6 - Math.max(2, peaks[i] * (h - 12)) - 2, Math.max(1, bw - 2), 1.5);
    }
  }
}

module.exports = function (ctx, data, W, H, colors, beat, waveData) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors, waveData), dt = A.dt, light = VK.light;
  t += dt;
  // "both" mode is not cleared by the host.
  ctx.clearRect(0, 0, W, H);
  live += ((A.silent ? 0 : 1) - live) * (1 - Math.exp(-dt / 0.3));
  var on = live > 0.5;
  // Scope: the real waveform (centred on 128), lightly smoothed so it does not shimmer frame to frame.
  var wd = waveData && waveData.length ? waveData : null;
  for (var i = 0; i < 128; i++) {
    var s = wd ? (wd[Math.min(wd.length - 1, i)] - 128) / 128 : 0;
    scope[i] += (s - scope[i]) * 0.6;
  }
  var target = LO + 1.1 + centroid(A.data) * (HI - LO - 2.2);
  dial += (target - dial) * (1 - Math.exp(-dt * (1.2 + A.energy * 3)));

  var m = 6, bottom = H - 6, wide = W > H * 1.8;
  if (wide) {
    var dw = Math.min(W * 0.32, 360), sw2 = Math.min(W * 0.26, 320);
    drawDial(ctx, m, m, dw, bottom - m, A, on, light);
    drawScope(ctx, m * 2 + dw, m, W - dw - sw2 - m * 4, bottom - m, A, on, light);
    drawSpectrum(ctx, W - m - sw2, m, sw2, bottom - m, A, on, light);
  } else {
    var hh = bottom - m * 3, dh = Math.max(44, hh * 0.36), sh = (hh - dh) * 0.55;
    drawDial(ctx, m, m, W - m * 2, dh, A, on, light);
    drawScope(ctx, m, m * 2 + dh, W - m * 2, sh, A, on, light);
    drawSpectrum(ctx, m, m * 3 + dh + sh, W - m * 2, hh - dh - sh, A, on, light);
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
