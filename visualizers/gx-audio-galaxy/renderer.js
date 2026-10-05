// @moltamp-visualizer: Audio Galaxy
// A spiral galaxy that dances to your music: the arms spin faster with the bass, the mids swell the arms
// and their dust lanes, the stars twinkle with the highs and the core flares on every beat.
// Painted in the active skin's palette.
// Author: j0j0 · License: MIT

var ARMS = 3;
var ARM_STARS = 1500;
var BULGE = 260;
var DUST = 300;
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

var flares = [];
var meteors = [];
for (var q = 0; q < MAX_FLARES; q++) flares.push({ life: 0 });
for (q = 0; q < MAX_METEORS; q++) meteors.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0 });

var t = 0;
var rot = 0;
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
  var decay = beat.decay || 0;
  resolvePalette(colors);

  t += 1 / 60;
  bassS += (band(data, 1, 7) - bassS) * 0.15;
  midS += (band(data, 8, 40) - midS) * 0.12;
  highS += (band(data, 48, 110) - highS) * 0.2;
  rot += 0.0018 + bassS * 0.022 + decay * 0.006;

  // Framing: a tilted disc in a panel, a nearly edge-on one stretched across a wide banner.
  var aspect = H / W;
  var tilt = Math.max(0.2, Math.min(0.62, aspect * 2.2));
  var wide = W > H * 1.8;
  var spin = wide ? -0.05 : -0.42;
  var R = Math.min(W * 0.47, (H * (wide ? 0.85 : 0.62)) / tilt);
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
  for (var i = 0; i < FIELD; i++) {
    ctx.globalAlpha = (light ? 0.18 : 0.12) + (0.25 + highS * 0.5) * (0.5 + 0.5 * Math.sin(t * 1.3 + fp[i]));
    ctx.fillRect(fx[i] * W, fy[i] * H, 1, 1);
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
      ctx.globalAlpha = a > 1 ? 1 : a < 0 ? 0 : a;
      var size = sd[s] === 2 ? 3 : (sb[s] > 0.9 ? 1.8 : 1.1) * (light ? 1.25 : 1);
      if (r < 0.3) size *= 1 + decay * 0.7 * (1 - r / 0.3);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  // Core: pulses with the bass, flares on the beat.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.scale(1, tilt * 1.15);
  ctx.globalAlpha = 1;
  var coreR = R * (0.13 + bassS * 0.08 + decay * 0.1);
  var core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
  core.addColorStop(0, rgba(light ? 'accent' : 'text', 0.95));
  core.addColorStop(0.25, rgba(light ? 'accent' : 'yellow', 0.7));
  core.addColorStop(0.6, rgba('accent', 0.22 + decay * 0.2));
  core.addColorStop(1, rgba('accent', 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, coreR, 0, 6.2832);
  ctx.fill();

  if (beat.isBeat) {
    var slot = flares[0];
    for (var f = 1; f < MAX_FLARES; f++) if (flares[f].life < slot.life) slot = flares[f];
    slot.life = 1;
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = pal.accent;
  for (f = 0; f < MAX_FLARES; f++) {
    var fl = flares[f];
    if (fl.life <= 0) continue;
    fl.life -= 0.045;
    ctx.globalAlpha = Math.max(0, fl.life) * 0.35;
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
  if (beat.isBeat && Math.random() < 0.35) {
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
    mt.x += mt.vx;
    mt.y += mt.vy;
    mt.life -= 0.03;
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
};
