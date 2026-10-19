// @moltamp-visualizer: Audio Galaxy
// A spiral galaxy that dances to your music: the arms spin faster with the bass, the mids swell the arms
// and their dust lanes, the stars twinkle with the highs and the core flares on every beat.
// Painted in the active skin's palette.
// Author: j0j0 · License: MIT

var ARMS = 3;
var ARM_STARS = 900;
var BULGE = 180;
var DUST = 170;
var N = ARM_STARS + BULGE + DUST;
var FIELD = 150;
var MAX_FLARES = 4;
var MAX_METEORS = 3;
var TWIST = 2.3;
var R0 = 0.05;

// Per-star constants (polar coordinates in galaxy units, brightness, twinkle phase/frequency, colour bucket).
var sr = new Float32Array(N);
var sa = new Float32Array(N);
var sw = new Float32Array(N);
var sb = new Float32Array(N);
var sp = new Float32Array(N);
var sf = new Float32Array(N);
var sk = new Uint8Array(N);
var sd = new Uint8Array(N); // 0 arm, 1 bulge, 2 dust
// Stars grouped by colour bucket so each bucket sets fillStyle once per frame.
var BUCKETS = 6;
var order = new Uint16Array(N);
var bucketStart = new Uint16Array(BUCKETS + 1);
var fx = new Float32Array(FIELD);
var fy = new Float32Array(FIELD);
var fp = new Float32Array(FIELD);

var kick = 0, bassSlow = 0, quiet = 0;
var flares = [];
var meteors = [];
for (var q = 0; q < MAX_FLARES; q++) flares.push({ life: 0 });
for (q = 0; q < MAX_METEORS; q++) meteors.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0 });

var t = 0;
var rot = 0;
var lastNow = 0;
// Stars are batched per colour bucket and alpha level into Path2D objects: a few fills per frame instead of one per star.
var LEVELS = 4;
var HAS_PATH2D = typeof Path2D !== 'undefined';
var bassS = 0;
var midS = 0;
var highS = 0;

(function seed() {
  var s = 20261005;
  function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
  function gauss() { return (rnd() + rnd() + rnd() - 1.5) / 1.5; }
  for (var i = 0; i < N; i++) {
    var kind = i < ARM_STARS ? 0 : i < ARM_STARS + BULGE ? 1 : 2;
    sd[i] = kind;
    if (kind === 1) {
      sr[i] = 0.2 * Math.pow(rnd(), 1.6);
      sa[i] = rnd() * 6.2832;
      sw[i] = 0;
    } else {
      sr[i] = Math.max(R0, Math.min(1, R0 + (1 - R0) * Math.pow(rnd(), kind === 2 ? 0.8 : 0.95) + gauss() * 0.035));
      sa[i] = ((i % ARMS) / ARMS) * 6.2832;
      sw[i] = gauss() * (kind === 2 ? 0.2 : 0.42);
    }
    sb[i] = kind === 2 ? 0.08 + rnd() * 0.12 : 0.35 + rnd() * 0.65;
    sp[i] = rnd() * 6.2832;
    sf[i] = 1.2 + rnd() * 4.5;
    var r = sr[i];
    if (kind === 2) sk[i] = 5;
    else if (kind === 1 || r < 0.12) sk[i] = 0;
    else {
      var v = r + (rnd() - 0.5) * 0.18;
      sk[i] = v < 0.3 ? 1 : v < 0.55 ? 2 : v < 0.8 ? 3 : 4;
    }
  }
  var count = new Uint16Array(BUCKETS);
  for (i = 0; i < N; i++) count[sk[i]]++;
  for (var b = 0; b < BUCKETS; b++) bucketStart[b + 1] = bucketStart[b] + count[b];
  var fill = new Uint16Array(BUCKETS);
  for (i = 0; i < N; i++) order[bucketStart[sk[i]] + fill[sk[i]]++] = i;
  for (i = 0; i < FIELD; i++) { fx[i] = rnd(); fy[i] = rnd(); fp[i] = rnd() * 6.2832; }
})();

// Skin colours can be empty, var() or color-mix() strings, which canvas rejects: each role falls back to
// the next valid skin colour, and only then to a neutral value.
var ROLES = {
  bg: ['bg', 'termBg'],
  text: ['termFg', 'text', 'accent'],
  accent: ['accent', 'cyan', 'magenta', 'text'],
  yellow: ['yellow', 'accent', 'text'],
  magenta: ['magenta', 'accent', 'red'],
  cyan: ['cyan', 'blue', 'accent'],
  blue: ['blue', 'cyan', 'accent'],
  dim: ['dim', 'border', 'text']
};
var pal = { bg: '', text: '', accent: '', yellow: '', magenta: '', cyan: '', blue: '', dim: '' };
var palKey = '';
var rgb = {};
var light = false;
var hasBg = false;

function validColor(v) {
  return typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(v.trim());
}

function parseRgb(c) {
  c = c.trim();
  var m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (m) return [+m[1], +m[2], +m[3]];
  if (c.charAt(0) !== '#') return null;
  if (c.length === 4 || c.length === 5) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  return [parseInt(c.slice(1, 3), 16) || 0, parseInt(c.slice(3, 5), 16) || 0, parseInt(c.slice(5, 7), 16) || 0];
}

function rgba(role, alpha) {
  var c = rgb[role];
  return c ? 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')' : pal[role];
}

var picks = {};

function resolvePalette(colors) {
  var key = '';
  for (var role in ROLES) {
    var picked = '';
    var chain = ROLES[role];
    for (var j = 0; j < chain.length && !picked; j++) if (validColor(colors[chain[j]])) picked = colors[chain[j]].trim();
    picks[role] = picked;
    key += picked + '|';
  }
  if (key === palKey) return;
  palKey = key;
  for (role in ROLES) pal[role] = picks[role];
  hasBg = !!pal.bg;
  if (!pal.text) pal.text = 'rgb(220,220,235)';
  for (role in pal) {
    if (!pal[role]) pal[role] = role === 'bg' ? '' : pal.text;
    rgb[role] = pal[role] ? parseRgb(pal[role]) : null;
  }
  var b = rgb.bg;
  light = !!b && (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) / 255 > 0.55;
}

function band(data, from, to) {
  var n = Math.min(to, data.length) - from;
  if (n <= 0) return 0;
  var sum = 0;
  for (var i = from; i < from + n; i++) sum += data[i];
  return sum / (n * 255);
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  colors = colors || {};
  data = data || [];
  beat = beat || { decay: 0, isBeat: false };
  resolvePalette(colors);
  // Everything moves on real time (f = elapsed frames at 60 fps), so a slow frame never slows the dance down.
  var nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  var dt = lastNow ? Math.min(0.1, Math.max(0.001, (nowMs - lastNow) / 1000)) : 1 / 60;
  lastNow = nowMs;
  var f60 = dt * 60;
  // Beats come from the shared audio front-end (spectral-flux onsets); the flash is sharpened so it reads as a hit.
  var hit = !!beat.isBeat;
  if (hit) kick = 1;
  kick *= Math.exp(-dt * 6);
  var decay = Math.max(Math.pow(Math.min(1, beat.decay || 0), 1.5), kick);

  t += dt;
  // Bins are ~187 Hz wide: the kick and the bass fundamentals live in bins 0-2.
  var bassNow = band(data, 0, 3);
  bassS += (bassNow - bassS) * (1 - Math.pow(0.85, f60));
  bassSlow += (bassNow - bassSlow) * (1 - Math.exp(-dt / 2));
  // How far the bass sits above its last two seconds: reacts to the groove, whatever the level or the mastering.
  var pulse = Math.max(0, Math.min(1, (bassS - bassSlow) / Math.max(0.025, bassSlow * 0.12)));
  midS += (band(data, 3, 40) - midS) * (1 - Math.pow(0.88, f60));
  highS += (band(data, 48, 110) - highS) * (1 - Math.pow(0.8, f60));
  quiet = bassS + midS + highS < 0.03 ? quiet + dt : 0;
  // The groove drives the spin: a steady pace that grows with the level, bursts on every rise of the bass and kick.
  rot += (0.0025 + bassSlow * 0.012 + pulse * 0.035 + decay * 0.025) * f60;

  // Framing: a tilted disc in a panel, a nearly edge-on one stretched across a wide banner.
  var aspect = H / W;
  var tilt = Math.max(0.2, Math.min(0.62, aspect * 2.2));
  var wide = W > H * 1.8;
  var spin = wide ? -0.05 : -0.42;
  // The whole disc breathes with the bass and swells on every kick.
  var R = Math.min(W * 0.47, (H * (wide ? 0.85 : 0.62)) / tilt) * (0.92 + pulse * 0.08 + decay * 0.08);
  var cx = W / 2;
  var cy = H / 2;
  var cosT = Math.cos(spin);
  var sinT = Math.sin(spin);
  var add = light ? 'source-over' : 'lighter';

  if (hasBg) {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
  }

  // Background field: faint stars over the whole canvas, livelier with the highs.
  ctx.fillStyle = pal.text;
  var fieldBase = light ? 0.18 : 0.12, fieldAmp = 0.25 + highS * 0.5;
  if (HAS_PATH2D) {
    var fpaths = [];
    for (var fl0 = 0; fl0 < LEVELS; fl0++) fpaths.push(new Path2D());
    for (var i = 0; i < FIELD; i++) {
      var fa = fieldBase + fieldAmp * (0.5 + 0.5 * Math.sin(t * 1.3 + fp[i]));
      fpaths[Math.min(LEVELS - 1, Math.floor(fa * LEVELS))].rect(fx[i] * W, fy[i] * H, 1, 1);
    }
    for (fl0 = 0; fl0 < LEVELS; fl0++) { ctx.globalAlpha = (fl0 + 0.6) / LEVELS; ctx.fill(fpaths[fl0]); }
  } else {
    for (i = 0; i < FIELD; i++) {
      ctx.globalAlpha = fieldBase + fieldAmp * (0.5 + 0.5 * Math.sin(t * 1.3 + fp[i]));
      ctx.fillRect(fx[i] * W, fy[i] * H, 1, 1);
    }
  }

  // Halo and nebula, drawn as ellipses in the disc's plane.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.scale(1, tilt);
  ctx.globalCompositeOperation = add;
  ctx.globalAlpha = 1;
  var halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.05);
  halo.addColorStop(0, rgba('magenta', (light ? 0.1 : 0.16) + midS * 0.12));
  halo.addColorStop(0.55, rgba('blue', light ? 0.04 : 0.07));
  halo.addColorStop(1, rgba('blue', 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.05, 0, 6.2832);
  ctx.fill();
  ctx.restore();

  // Stars, one colour bucket at a time.
  var BUCKET_ROLE = light
    ? ['accent', 'accent', 'magenta', 'blue', 'cyan', 'dim']
    : ['yellow', 'accent', 'magenta', 'cyan', 'blue', 'magenta'];
  var twAmp = Math.min(1, 0.25 + highS * 1.6);
  var swell = 1 + midS * 1.1;
  ctx.globalCompositeOperation = add;
  for (var b = 0; b < BUCKETS; b++) {
    ctx.fillStyle = pal[BUCKET_ROLE[b]];
    var paths = null;
    if (HAS_PATH2D) { paths = []; for (var lv = 0; lv < LEVELS; lv++) paths.push(new Path2D()); }
    for (var k = bucketStart[b]; k < bucketStart[b + 1]; k++) {
      var s = order[k];
      var r = sr[s];
      var theta;
      if (sd[s] === 1) {
        r *= 1 + decay * 0.12;
        theta = sa[s] + rot * 1.6;
      } else {
        theta = sa[s] + TWIST * Math.log(r / R0) + sw[s] * swell * (1.15 - r * 0.5) + rot;
        if (sd[s] === 2) theta -= 0.2;
      }
      var px = Math.cos(theta) * r * R;
      var py = Math.sin(theta) * r * R * tilt;
      var x = cx + px * cosT - py * sinT;
      var y = cy + px * sinT + py * cosT;
      if (x < -3 || x > W + 3 || y < -3 || y > H + 3) continue;
      var tw = Math.sin(t * sf[s] + sp[s]);
      var a = sb[s] * (1 - twAmp * 0.45 + twAmp * 0.45 * tw) + highS * 0.3 * sb[s];
      if (r > 0.85) a *= (1 - r) / 0.15 + 0.15;
      if (sd[s] === 2) a = sb[s] * (0.6 + midS * 1.4) * (light ? 0.6 : 1);
      if (light && sd[s] !== 2) a *= 1.5;
      a = a > 1 ? 1 : a < 0 ? 0 : a;
      var size = sd[s] === 2 ? 3 : (sb[s] > 0.9 ? 1.8 : 1.1) * (light ? 1.25 : 1);
      if (r < 0.3) size *= 1 + decay * 0.7 * (1 - r / 0.3);
      if (paths) {
        if (a < 0.04) continue;
        paths[Math.min(LEVELS - 1, Math.floor(a * LEVELS))].rect(x - size / 2, y - size / 2, size, size);
      } else {
        ctx.globalAlpha = a;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
    if (paths) {
      for (lv = 0; lv < LEVELS; lv++) {
        ctx.globalAlpha = (lv + 0.6) / LEVELS;
        ctx.fill(paths[lv]);
      }
    }
  }

  // Core: pulses with the bass, flares on the beat.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.scale(1, tilt * 1.15);
  ctx.globalAlpha = 1;
  var coreR = R * (0.12 + bassSlow * 0.04 + pulse * 0.07 + decay * 0.13);
  var core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
  core.addColorStop(0, rgba(light ? 'accent' : 'text', 0.95));
  core.addColorStop(0.25, rgba(light ? 'accent' : 'yellow', 0.7));
  core.addColorStop(0.6, rgba('accent', 0.22 + decay * 0.2));
  core.addColorStop(1, rgba('accent', 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, 6.2832);
  ctx.fill();

  // Beat flash: the nucleus blooms, then the rings ride outwards.
  if (decay > 0.03) {
    var bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * (1.6 + decay * 1.6));
    bloom.addColorStop(0, rgba(light ? 'accent' : 'text', 0.7 * decay));
    bloom.addColorStop(0.35, rgba('accent', 0.45 * decay));
    bloom.addColorStop(1, rgba('accent', 0));
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * (1.6 + decay * 1.6), 0, 6.2832);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  if (hit) {
    var slot = flares[0];
    for (var f = 1; f < MAX_FLARES; f++) if (flares[f].life < slot.life) slot = flares[f];
    slot.life = 1;
  }
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = pal.accent;
  for (f = 0; f < MAX_FLARES; f++) {
    var fl = flares[f];
    if (fl.life <= 0) continue;
    fl.life -= 0.045 * f60;
    ctx.globalAlpha = Math.max(0, fl.life) * 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * (1 + (1 - fl.life) * 2.2), 0, 6.2832);
    ctx.stroke();
  }
  ctx.restore();

  // Four-point sparkle on the nucleus, longest right after a beat.
  var spark = R * (0.05 + decay * 0.16);
  if (spark > 2) {
    ctx.globalAlpha = 0.35 + decay * 0.5;
    ctx.strokeStyle = pal[light ? 'accent' : 'text'];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - spark, cy);
    ctx.lineTo(cx + spark, cy);
    ctx.moveTo(cx, cy - spark * Math.max(0.5, tilt * 1.4));
    ctx.lineTo(cx, cy + spark * Math.max(0.5, tilt * 1.4));
    ctx.stroke();
  }

  // Shooting stars across the field, now and then on a beat.
  if (hit && Math.random() < 0.35) {
    for (var m = 0; m < MAX_METEORS; m++) {
      var mt = meteors[m];
      if (mt.life > 0) continue;
      mt.life = 1;
      mt.x = Math.random() * W;
      mt.y = Math.random() * H * 0.5;
      var dir = Math.random() < 0.5 ? -1 : 1;
      mt.vx = dir * (4 + Math.random() * 5);
      mt.vy = 1 + Math.random() * 1.5;
      break;
    }
  }
  ctx.strokeStyle = pal.cyan;
  ctx.lineWidth = 1.2;
  for (m = 0; m < MAX_METEORS; m++) {
    mt = meteors[m];
    if (mt.life <= 0) continue;
    mt.x += mt.vx * f60;
    mt.y += mt.vy * f60;
    mt.life -= 0.03 * f60;
    ctx.globalAlpha = Math.max(0, mt.life) * 0.8;
    ctx.beginPath();
    ctx.moveTo(mt.x, mt.y);
    ctx.lineTo(mt.x - mt.vx * 5, mt.y - mt.vy * 5);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  // After a few seconds of silence, a discreet note in the corner: a muted audio capture is then easy to spot.
  if (quiet > 6 && W >= 90 && H >= 40) {
    ctx.globalAlpha = Math.min(1, (quiet - 6) / 2) * 0.6;
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = Math.max(8, Math.min(10, H / 14)).toFixed(1) + 'px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = pal.dim;
    ctx.fillText('\u266a no audio signal', W - 6, H - 4);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
};

// audio-frontend v3 — shared input stage of the MOLTamp Widgets Galaxy visualizers (MIT, j0j0).
// MOLTamp hands over a 128-bin analyser spectrum (fftSize 256, smoothing 0.8, dB bytes): each bin spans ~187 Hz, so
// the kick lives in bins 0-2 only, bins 3-12 follow the bass line and off-beats, and loud masters pin bins 0-1 at 255.
// Measured on real music, a kick barely lifts those bins frame by frame, so beats are tracked rather than detected:
// tempo and phase are folded out of the last 8 s of low-end flux, every predicted beat is checked afterwards against
// the flux between beats, and flashes follow the predicted grid only while it holds (lock above 1.9, release below
// 1.4 or as soon as the low end goes quiet). Without a steady beat, only clear low-end hits flash. The spectrum itself
// is brought back to a usable range for the renderer (peaks tracked over ~4 s, raised to ~200/255, gain 1x-6x).
;(function () {
  var inner = module.exports;
  if (typeof inner !== 'function') return;
  var LOW = [1, 1, 1], HIST = 8, LOCK_ON = 1.9, LOCK_OFF = 1.4;
  var ref = 0, last = 0, out = null, prev = null, own = 0, sat = [0, 0, 0];
  var ts = [], os = [], wt = [], head = 0, nextEval = 0, slots = new Float64Array(24);
  var period = 0, phase = 0, lastPred = -1e9, pend = [], scored = [], lock = 0, locked = false;
  var fMean = 0, fVar = 0, cool = 0, act = 0, actSlow = 0;

  // Folds the weighted flux history over one beat period: returns the contrast of the strongest slot and its phase.
  function fold(P) {
    var S = slots.length, i, total = 0;
    for (i = 0; i < S; i++) slots[i] = 0;
    for (i = head; i < ts.length; i++) {
      var x = ts[i] / P;
      slots[Math.floor((x - Math.floor(x)) * S) % S] += wt[i];
      total += wt[i];
    }
    if (total <= 0) return null;
    var best = -1, at = 0, mean = total / S;
    for (i = 0; i < S; i++) {
      var v = slots[(i + S - 1) % S] + 2 * slots[i] + slots[(i + 1) % S];
      if (v > best) { best = v; at = i; }
    }
    var a = slots[(at + S - 1) % S], b = slots[at], c = slots[(at + 1) % S], den = a - 2 * b + c;
    var off = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
    return { score: (best / 4 - mean) / mean, phase: ((at + off + 0.5) / S + 1) % 1 };
  }

  // Best tempo between 80 and 170 BPM (1 BPM steps, then 0.1 around the winner), with a mild pull toward 125 BPM
  // so that half and double tempos lose ties. Recent frames weigh more (3 s time constant) to follow tempo drifts.
  function evaluate(now) {
    while (head < ts.length && now - ts[head] > HIST) head++;
    if (head > 600) { ts = ts.slice(head); os = os.slice(head); wt = wt.slice(head); head = 0; }
    if (ts.length - head < 90) { period = 0; return; }
    for (var i = head; i < ts.length; i++) wt[i] = os[i] * Math.exp(-(now - ts[i]) / 3);
    var best = null, bpm;
    function consider(b) {
      var r = fold(60 / b);
      if (!r) return;
      var l = Math.log(b / 125) / Math.LN2;
      r.score *= Math.exp(-0.5 * l * l / 0.36);
      r.bpm = b;
      if (!best || r.score > best.score) best = r;
    }
    for (bpm = 80; bpm <= 170; bpm += 1) consider(bpm);
    if (!best) { period = 0; return; }
    var c0 = best.bpm;
    for (bpm = c0 - 1; bpm <= c0 + 1; bpm += 0.1) consider(bpm);
    period = 60 / best.bpm;
    phase = best.phase;
  }

  function meanIn(a, b) {
    var s = 0, c = 0;
    for (var i = ts.length - 1; i >= head && ts[i] > a; i--) if (ts[i] <= b) { s += os[i]; c++; }
    return c ? s / c : 0;
  }

  module.exports = function (ctx, data, W, H, colors, beat, waveData) {
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    var dt = last ? Math.min(0.2, Math.max(0.001, now - last)) : 1 / 60;
    last = now;
    var src = beat || {}, hit = false, measured = false;
    if (data && data.length > 12) {
      var n = data.length, peak = 0, i, raw = data;
      if (!prev || prev.length !== n) prev = new Uint8Array(n);
      // Low-end flux (bins 0-2); a bin pinned at 255 most of the last ~4 s carries no information and is left out.
      var o = 0, wsum = 0, ks = 1 - Math.exp(-dt / 4);
      for (i = 0; i < LOW.length; i++) {
        sat[i] += ((raw[i] >= 254 ? 1 : 0) - sat[i]) * ks;
        if (sat[i] > 0.4) continue;
        wsum += LOW[i];
        var d = raw[i] - prev[i];
        if (d > 0) o += LOW[i] * d;
      }
      prev.set(raw);
      o = wsum ? o / (255 * wsum) : 0;
      ts.push(now); os.push(o); wt.push(0);
      if (now >= nextEval) { evaluate(now); nextEval = now + 0.25; }

      // Every predicted beat is checked once it has passed: flux on the beat against flux between beats.
      while (pend.length && now > pend[0][0] + pend[0][1] * 0.8 + 0.02) {
        var pb = pend.shift();
        scored.push([meanIn(pb[0] - 0.035, pb[0] + 0.05), meanIn(pb[0] + pb[1] * 0.2, pb[0] + pb[1] * 0.8)]);
        if (scored.length > 12) scored.shift();
        var on = 0, offb = 0;
        for (i = 0; i < scored.length; i++) { on += scored[i][0]; offb += scored[i][1]; }
        lock = scored.length < 4 ? 0 : offb > 0 ? on / offb : on > 0 ? 9 : 0;
      }
      var predicted = false;
      if (period > 0) {
        var tb = (Math.floor(now / period - phase) + phase) * period;
        if (tb > lastPred + 0.6 * period && now - tb < 0.1) {
          lastPred = tb;
          pend.push([tb, period]);
          predicted = true;
        }
      }
      // The low end going quiet (silence, a breakdown) drops the lock at once instead of after a dozen empty beats.
      act += (o - act) * (1 - Math.exp(-dt / 0.6));
      actSlow += (o - actSlow) * (1 - Math.exp(-dt / 6));
      if (act < actSlow * 0.2) { scored.length = 0; lock = 0; }
      locked = locked ? lock > LOCK_OFF : lock > LOCK_ON;

      var k = 1 - Math.exp(-dt / 1.0), diff = o - fMean;
      fMean += diff * k;
      fVar += (diff * diff - fVar) * k;
      cool -= dt;
      if (locked) hit = predicted;
      else if (o > fMean + 2.5 * Math.sqrt(fVar) + 0.01 && cool <= 0) { hit = true; cool = 0.3; }
      if (hit) own = 1;

      for (i = 1; i < n; i++) if (raw[i] > peak) peak = raw[i];
      ref = Math.max(peak, ref * Math.exp(-dt / 4));
      var gain = ref > 6 ? Math.max(1, Math.min(6, 200 / Math.max(ref, 24))) : 1;
      if (gain > 1.02) {
        if (!out || out.length !== n) out = new Uint8Array(n);
        for (i = 0; i < n; i++) { var v = raw[i] * gain; out[i] = v > 255 ? 255 : v; }
        data = out;
      }
      measured = true;
    }
    own *= Math.exp(-dt * 5);
    // MOLTamp's own flag fires off the beat on smoothed or compressed audio: with a spectrum to measure, only ours
    // counts; without one, MOLTamp's beat state passes through.
    var merged = measured
      ? { energy: src.energy, peak: src.peak, isBeat: hit, decay: own, tempo: locked ? 60 / period : 0, locked: locked }
      : src;
    return inner.call(this, ctx, data, W, H, colors, merged, waveData);
  };
})();
