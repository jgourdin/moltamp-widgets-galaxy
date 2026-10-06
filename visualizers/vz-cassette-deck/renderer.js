// @moltamp-visualizer: Tape Deck ♪
// A mixtape in a tape deck that plays along with your music: the reels spin with the tempo, the tape winds as the songs go by and the VU meters bounce with the real levels.
// Music version of the Cassette Deck widget (Night Lounge pack) of the MOLTamp Widgets Galaxy.
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

// Tape Deck: the Cassette Deck widget's mixtape, played by the music: reels at the tempo, tape winding with
// listening time, VU meters on the real bass / mid-high levels. Silence parks the deck.
var SIDE_S = 45 * 60;
var rotL = 0, rotR = 0, played = 0, vu = [0, 0], peak = [0, 0], idle = 0;

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

function clock(s) {
  s = Math.max(0, Math.floor(s));
  var m = Math.floor(s / 60), r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

function hubDraw(ctx, x, y, r, rot, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.beginPath();
  for (var k = 0; k < 6; k++) {
    var a = rot + k * Math.PI / 3;
    ctx.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45);
    ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
  }
  ctx.stroke();
}

function reels(ch, prog) {
  var hubR = ch * 0.07, maxR = ch * 0.22;
  return {
    hub: hubR,
    l: Math.sqrt(hubR * hubR + (maxR * maxR - hubR * hubR) * (1 - prog)),
    r: Math.sqrt(hubR * hubR + (maxR * maxR - hubR * hubR) * prog)
  };
}

function drawCassette(ctx, x, y, cw, ch, light, A, side, prog) {
  var shell = VK.mix('bg', 'text', light ? 0.1 : 0.17), edge = VK.mix('bg', 'text', light ? 0.25 : 0.32);
  var paper = light ? VK.mix('bg', 'text', 0.03) : VK.mix('text', 'bg', 0.1), ink = light ? VK.c.text : VK.c.bg;
  var tape = VK.mix('bg', 'red', light ? 0.35 : 0.3);
  // Shell
  rrect(ctx, x, y, cw, ch, ch * 0.07);
  ctx.fillStyle = shell; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, ch * 0.012); ctx.stroke();
  ctx.fillStyle = edge;
  [[0.045, 0.07], [0.955, 0.07], [0.045, 0.93], [0.955, 0.93], [0.5, 0.9]].forEach(function (p) {
    ctx.beginPath(); ctx.arc(x + cw * p[0], y + ch * p[1], Math.max(1.2, ch * 0.022), 0, 6.283); ctx.fill();
  });
  // Label: the stripes glow a little on the beat
  var lx = x + cw * 0.07, ly = y + ch * 0.08, lw = cw * 0.86, lh = ch * 0.62;
  rrect(ctx, lx, ly, lw, lh, ch * 0.03);
  ctx.fillStyle = paper; ctx.fill();
  ctx.fillStyle = VK.rgba('accent', 0.75 + 0.25 * A.kick); ctx.fillRect(lx, ly + lh * 0.3, lw, lh * 0.07);
  ctx.fillStyle = VK.rgba('magenta', 0.75 + 0.25 * A.kick); ctx.fillRect(lx, ly + lh * 0.38, lw, lh * 0.04);
  ctx.fillStyle = VK.c.cyan; ctx.fillRect(lx, ly + lh * 0.43, lw, lh * 0.025);
  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = VK.font(Math.max(9, lh * 0.2), 'bold');
  ctx.fillText(side, lx + lw * 0.03, ly + lh * 0.15);
  var tx = lx + lw * 0.03 + lh * 0.2, tmax = lx + lw - tx - lw * 0.03;
  ctx.font = 'italic ' + VK.font(Math.max(8, lh * 0.14), 'bold');
  ctx.fillText('MIXTAPE', tx, ly + lh * 0.1);
  ctx.font = 'italic ' + VK.font(Math.max(7, lh * 0.1));
  ctx.globalAlpha = 0.75;
  ctx.fillText(fit(ctx, A.silent ? 'standby · waiting for music' : (A.bpm ? A.bpm + ' BPM · ' : '') + 'live from your speakers', tmax), tx, ly + lh * 0.22);
  ctx.globalAlpha = 1;
  // Window with the two tape packs; their radii follow the listening time (tape area is conserved).
  var wx = x + cw * 0.25, wy = ly + lh * 0.52, ww = cw * 0.5, wh = lh * 0.4;
  var R = reels(ch, prog), hy = wy + wh / 2, hl = x + cw * 0.33, hr = x + cw * 0.67;
  rrect(ctx, wx, wy, ww, wh, wh * 0.18);
  ctx.fillStyle = VK.mix('bg', 'text', light ? 0.06 : 0.04); ctx.fill();
  ctx.save();
  rrect(ctx, wx, wy, ww, wh, wh * 0.18); ctx.clip();
  ctx.fillStyle = tape;
  ctx.beginPath(); ctx.arc(hl, hy, R.l, 0, 6.283); ctx.fill();
  ctx.beginPath(); ctx.arc(hr, hy, R.r, 0, 6.283); ctx.fill();
  ctx.fillStyle = VK.rgba('text', 0.06);
  ctx.fillRect(wx, wy, ww, wh * 0.35);
  ctx.restore();
  var hubCol = light ? VK.mix('bg', 'text', 0.55) : VK.mix('text', 'bg', 0.15);
  hubDraw(ctx, hl, hy, R.hub, rotL, hubCol);
  hubDraw(ctx, hr, hy, R.hub, rotR, hubCol);
  // Bottom bridge with the tape running past the head openings
  var by = y + ch * 0.78;
  ctx.beginPath();
  ctx.moveTo(x + cw * 0.2, y + ch); ctx.lineTo(x + cw * 0.26, by); ctx.lineTo(x + cw * 0.74, by); ctx.lineTo(x + cw * 0.8, y + ch);
  ctx.closePath();
  ctx.fillStyle = VK.mix('bg', 'text', light ? 0.16 : 0.11); ctx.fill();
  ctx.strokeStyle = tape; ctx.lineWidth = Math.max(1, ch * 0.015);
  ctx.beginPath(); ctx.moveTo(x + cw * 0.24, y + ch * 0.965); ctx.lineTo(x + cw * 0.76, y + ch * 0.965); ctx.stroke();
  ctx.fillStyle = VK.rgba('bg', 0.6);
  [0.36, 0.64].forEach(function (p) { ctx.beginPath(); ctx.arc(x + cw * p, y + ch * 0.88, ch * 0.03, 0, 6.283); ctx.fill(); });
}

// Segmented VU meter, horizontal or vertical
function drawVu(ctx, x, y, len, thick, level, pk, vertical) {
  var n = 12, gap = Math.max(1, len * 0.012), seg = (len - gap * (n - 1)) / n;
  for (var k = 0; k < n; k++) {
    var on = level * n > k, isPeak = Math.round(pk * n) - 1 === k;
    var col = k >= n - 2 ? 'red' : k >= n - 4 ? 'yellow' : 'green';
    ctx.fillStyle = on || isPeak ? VK.rgba(col, 0.9) : VK.rgba('dim', 0.15);
    var p = k * (seg + gap);
    if (vertical) ctx.fillRect(x, y + len - p - seg, thick, seg);
    else ctx.fillRect(x + p, y, seg, thick);
  }
}

// Graphic equaliser: LED columns on the real spectrum, peaks held.
var eqPeaks = [];
function drawEq(ctx, x, y, w, h, A) {
  var cols = Math.max(8, Math.min(24, Math.floor(w / 14))), lv = VK.bands(cols), rows = Math.max(6, Math.min(14, Math.floor(h / 6)));
  var cw = w / cols, rh = h / rows;
  for (var i = 0; i < cols; i++) {
    var v = A.silent ? 0 : Math.min(1, lv[i] * 1.3);
    eqPeaks[i] = Math.max(v, (eqPeaks[i] || 0) - A.dt * 0.6);
    for (var r = 0; r < rows; r++) {
      var on = v * rows > r, pk = Math.round(eqPeaks[i] * rows) - 1 === r;
      var col = r >= rows - 2 ? 'red' : r >= rows - 4 ? 'yellow' : 'green';
      ctx.fillStyle = on || pk ? VK.rgba(col, 0.88) : VK.rgba('dim', 0.12);
      ctx.fillRect(x + i * cw + 1, y + h - (r + 1) * rh + 1, cw - 2, rh - 2);
    }
  }
}

// Deck display: side, tape counter, listening time and the position on the side.
function drawDisplay(ctx, x, y, dw, dh, A, side, prog) {
  rrect(ctx, x, y, dw, dh, dh * 0.08);
  ctx.fillStyle = VK.mix('bg', 'text', 0.05); ctx.fill();
  ctx.strokeStyle = VK.rgba('accent', 0.35 + 0.3 * A.kick); ctx.lineWidth = 1; ctx.stroke();
  var pad = dh * 0.12, tx = x + pad, tw = dw - pad * 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = VK.c.text;
  ctx.font = VK.font(Math.max(9, dh * 0.21), 'bold');
  ctx.fillText('MIXTAPE · SIDE ' + side, tx, y + dh * 0.24);
  ctx.fillStyle = VK.c.dim;
  ctx.font = VK.font(Math.max(8, dh * 0.15));
  ctx.fillText(A.silent ? '⏸ standby · no signal' : (A.bpm ? A.bpm + ' BPM' : 'live') + ' · from your speakers', tx, y + dh * 0.48);
  ctx.font = VK.font(Math.max(8, dh * 0.15), 'bold');
  ctx.fillStyle = VK.c.accent;
  var counter = ('000' + Math.floor(played / 2) % 1000).slice(-3);
  ctx.fillText(counter, tx, y + dh * 0.72);
  ctx.fillStyle = VK.c.dim;
  ctx.font = VK.font(Math.max(8, dh * 0.14));
  ctx.fillText((A.silent ? '❚❚ ' : '▶ ') + clock(played % SIDE_S) + ' / ' + clock(SIDE_S), tx + dh * 0.62, y + dh * 0.72);
  ctx.fillStyle = VK.rgba('dim', 0.25);
  ctx.fillRect(tx, y + dh * 0.87, tw, Math.max(2, dh * 0.035));
  ctx.fillStyle = VK.c.accent;
  ctx.fillRect(tx, y + dh * 0.87, tw * prog, Math.max(2, dh * 0.035));
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  ctx.clearRect(0, 0, W, H);
  var playing = !A.silent;
  if (playing) played += dt;
  // The reels ease to a stop on silence and pick up again with the music.
  idle += ((playing ? 1 : 0) - idle) * (1 - Math.exp(-dt / 0.4));
  var tempo = A.bpm ? Math.max(0.6, Math.min(1.6, A.bpm / 120)) : 1;
  var sp = idle * tempo * (0.55 + A.energy * 1.5) + A.kick * 0.35 * idle;
  var prog = (played % SIDE_S) / SIDE_S, side = Math.floor(played / SIDE_S) % 2 ? 'B' : 'A';

  // VU: left follows the bass, right the mids and highs; fast attack, slower release, peaks hold.
  var tl = playing ? Math.min(1, A.raw.bass * 1.15 + A.kick * 0.18) : 0;
  var tr = playing ? Math.min(1, A.raw.mid * 0.95 + A.raw.high * 0.75 + A.kick * 0.1) : 0;
  [tl, tr].forEach(function (target, c) {
    vu[c] += (target - vu[c]) * (1 - Math.exp(-dt / (target > vu[c] ? 0.03 : 0.12)));
    peak[c] = Math.max(vu[c], peak[c] - dt * 0.35);
  });

  var wide = W > H * 2.1, cw, ch, cx, cy;
  if (wide) {
    ch = H * 0.8; cw = ch * 1.58;
    if (cw > W * 0.4) { cw = W * 0.4; ch = cw / 1.58; }
    cx = W * 0.02; cy = (H - ch) / 2;
  } else {
    cw = Math.min(W * 0.9, H * 0.62 * 1.58); ch = cw / 1.58;
    cx = (W - cw) / 2; cy = H * 0.06;
  }
  var R = reels(ch, prog), v = ch * 0.12 * sp;
  rotL -= v / R.l * dt;
  rotR -= v / R.r * dt;
  drawCassette(ctx, cx, cy, cw, ch, light, A, side, prog);

  if (wide) {
    var vt = Math.max(3, H * 0.055), vx = W - vt * 3.2 - W * 0.015;
    drawVu(ctx, vx, H * 0.12, H * 0.76, vt, vu[0], peak[0], true);
    drawVu(ctx, vx + vt * 1.8, H * 0.12, H * 0.76, vt, vu[1], peak[1], true);
    var dx0 = cx + cw + W * 0.025, dw = vx - dx0 - W * 0.025, dispW = Math.min(dw, 420);
    if (dw > 110) drawDisplay(ctx, dx0, H * 0.14, dispW, H * 0.72, A, side, prog);
    // Whatever room is left between the display and the meters gets a graphic equaliser.
    var ex = dx0 + dispW + W * 0.02, ew = vx - ex - W * 0.02;
    if (dw > 110 && ew > 90) drawEq(ctx, ex, H * 0.14, ew, H * 0.72, A);
  } else {
    var vy = cy + ch + H * 0.06, vlen = cw * 0.8, vh = Math.max(3, Math.min(7, H * 0.022)), vx2 = (W - vlen) / 2;
    drawVu(ctx, vx2, vy, vlen, vh, vu[0], peak[0], false);
    drawVu(ctx, vx2, vy + vh * 1.8, vlen, vh, vu[1], peak[1], false);
    var ty = vy + vh * 2.8 + Math.max(10, H * 0.05);
    if (ty < H - 6) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = VK.font(Math.max(9, Math.min(13, W / 26)), 'bold');
      ctx.fillStyle = VK.c.accent;
      ctx.fillText(('000' + Math.floor(played / 2) % 1000).slice(-3) + '  ' + (A.silent ? '❚❚ standby' : '▶ ' + clock(played % SIDE_S) + (A.bpm ? ' · ' + A.bpm + ' BPM' : '')), W / 2, ty);
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
