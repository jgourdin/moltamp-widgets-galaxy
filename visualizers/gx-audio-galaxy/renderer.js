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
  var bassNow = band(data, 1, 7);
  bassS += (bassNow - bassS) * (1 - Math.pow(0.85, f60));
  bassSlow += (bassNow - bassSlow) * (1 - Math.exp(-dt / 2));
  // How far the bass sits above its last two seconds: reacts to the groove, whatever the level or the mastering.
  var pulse = Math.max(0, Math.min(1, (bassS - bassSlow) / Math.max(0.04, bassSlow * 0.35)));
  midS += (band(data, 8, 40) - midS) * (1 - Math.pow(0.88, f60));
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

// audio-frontend v2 — shared input stage of the MOLTamp Widgets Galaxy visualizers (MIT, j0j0).
// MOLTamp's FFT can arrive far below full scale (quiet output) or pinned near the top (loud, compressed masters), and
// it is smoothed at 0.8: effects keyed to absolute levels end up stuck at their minimum or their maximum. Before the
// renderer runs, the spectrum is brought back to a usable range (peaks tracked over ~4 s, raised to ~200/255, gain
// 1x-6x, silence left alone), and onsets are found by spectral flux on the low end (the rise of energy from one frame
// to the next, above an adaptive mean + 1.25 sigma threshold), which works whatever the level. They back up the beat
// flag and decay handed to the renderer, in place of MOLTamp's own.
;(function () {
  var inner = module.exports;
  if (typeof inner !== 'function') return;
  var ref = 0, last = 0, out = null, prev = null, fMean = 0, fVar = 0, cool = 0, own = 0;
  module.exports = function (ctx, data, W, H, colors, beat, waveData) {
    var now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    var dt = last ? Math.min(0.2, Math.max(0.001, (now - last) / 1000)) : 1 / 60;
    last = now;
    var src = beat || {}, onset = false, measured = false;
    if (data && data.length > 12) {
      var n = data.length, peak = 0, i;
      for (i = 1; i < n; i++) if (data[i] > peak) peak = data[i];
      ref = Math.max(peak, ref * Math.exp(-dt / 4));
      var gain = ref > 6 ? Math.max(1, Math.min(6, 200 / Math.max(ref, 24))) : 1;
      if (gain > 1.02) {
        if (!out || out.length !== n) out = new Uint8Array(n);
        for (i = 0; i < n; i++) { var v = data[i] * gain; out[i] = v > 255 ? 255 : v; }
        data = out;
      }
      // Spectral flux of the kick / bass region (bins 1-12), normalised to 0..1.
      if (!prev || prev.length !== n) prev = new Float32Array(n);
      var flux = 0;
      for (i = 1; i <= 12; i++) { var d = data[i] - prev[i]; if (d > 0) flux += d; }
      for (i = 0; i < n; i++) prev[i] = data[i];
      flux /= 12 * 255;
      var k = 1 - Math.exp(-dt / 1.0);
      var diff = flux - fMean;
      fMean += diff * k;
      fVar += (diff * diff - fVar) * k;
      cool -= dt;
      onset = flux > fMean + 1.25 * Math.sqrt(fVar) + 0.004 && cool <= 0;
      if (onset) { own = 1; cool = 0.18; }
      measured = true;
    }
    own *= Math.exp(-dt * 5);
    // MOLTamp's own flag fires off the beat on smoothed or compressed audio: with a spectrum to measure, only our
    // onsets count; without one, MOLTamp's beat state passes through.
    var merged = measured ? { energy: src.energy, peak: src.peak, isBeat: onset, decay: own } : src;
    return inner.call(this, ctx, data, W, H, colors, merged, waveData);
  };
})();
