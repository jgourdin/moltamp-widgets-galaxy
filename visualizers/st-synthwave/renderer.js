// @moltamp-visualizer: Synthwave Sunset
// Inspired by "Synthwave audio removed" by axiomgraph — https://www.shadertoy.com/view/clsfRr
// (itself credited to https://www.shadertoy.com/view/tsScRK).
// License: CC BY-NC-SA 3.0 (Shadertoy default) — attribution kept, non-commercial, share-alike.
// License text: https://creativecommons.org/licenses/by-nc-sa/3.0/
// Canvas 2D recreation, no shader code reused: the raymarched terrain becomes a perspective grid and
// FFT-driven mountains; striped sun, stars and glow follow the skin palette and the beat.

var MOUNT = 48;
var STARS = 70;
var mount = new Float32Array(MOUNT);
var starX = new Float32Array(STARS);
var starY = new Float32Array(STARS);
var starP = new Float32Array(STARS);
var scroll = 0;
var t = 0;

(function seedStars() {
  var s = 1234567;
  for (var i = 0; i < STARS; i++) {
    s = (s * 16807) % 2147483647; starX[i] = s / 2147483647;
    s = (s * 16807) % 2147483647; starY[i] = s / 2147483647;
    s = (s * 16807) % 2147483647; starP[i] = (s / 2147483647) * 6.283;
  }
})();

// Gradient stops throw on an empty or unparsable colour, which would blank the whole frame:
// every skin colour is validated against a fallback first.
var FALLBACK = { bg: '#0b0612', blue: '#3a4bd8', magenta: '#d62f9b', cyan: '#2fd2e0', yellow: '#ffd25a', accent: '#ff7a3c', text: '#e0d8ef' };
var pal = { bg: '', blue: '', magenta: '', cyan: '', yellow: '', accent: '', text: '' };

function validColor(v) {
  return typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(v.trim());
}

function hexToRgba(c, alpha) {
  c = c.trim();
  var m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + alpha + ')';
  if (c.charAt(0) !== '#') return c;
  if (c.length === 4 || c.length === 5) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  var r = parseInt(c.slice(1, 3), 16) || 0;
  var g = parseInt(c.slice(3, 5), 16) || 0;
  var b = parseInt(c.slice(5, 7), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function band(data, from, to) {
  var sum = 0, n = Math.min(to, data.length) - from;
  for (var i = from; i < from + n; i++) sum += data[i];
  return n > 0 ? sum / (n * 255) : 0;
}

module.exports = function (ctx, data, W, H, skin, beat) {
  t += 1 / 60;
  skin = skin || {};
  for (var key in pal) pal[key] = validColor(skin[key]) ? skin[key] : FALLBACK[key];
  if (validColor(skin.termFg)) pal.text = skin.termFg;
  var colors = pal;
  data = data || [];
  beat = beat || { decay: 0 };
  var bass = band(data, 1, 6), high = band(data, 60, 100);
  var horizon = H * 0.58, cx = W / 2;
  scroll = (scroll + 0.004 + bass * 0.02 + beat.decay * 0.01) % 1;

  // Sky
  var sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, colors.bg);
  sky.addColorStop(0.6, hexToRgba(colors.blue, 0.55));
  sky.addColorStop(1, hexToRgba(colors.magenta, 0.9));
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);

  // Stars twinkle with the highs
  ctx.fillStyle = colors.text;
  for (var i = 0; i < STARS; i++) {
    var sy = starY[i] * horizon * 0.8;
    ctx.globalAlpha = 0.15 + 0.6 * Math.abs(Math.sin(t * 1.7 + starP[i])) * (0.35 + high);
    ctx.fillRect(starX[i] * W, sy, 1.3, 1.3);
  }
  ctx.globalAlpha = 1;

  // Striped sun
  var r = Math.min(W, H * 1.6) * 0.17 * (1 + beat.decay * 0.06 + bass * 0.05);
  var sunY = horizon - r * 0.6;
  var sunGrad = ctx.createLinearGradient(0, sunY - r, 0, sunY + r);
  sunGrad.addColorStop(0, colors.yellow);
  sunGrad.addColorStop(0.55, colors.accent);
  sunGrad.addColorStop(1, colors.magenta);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, sunY, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = sunGrad;
  ctx.fillRect(cx - r, sunY - r, r * 2, r * 2);
  // Dark stripes on the lower half slide down, the classic retro-sun cut.
  ctx.fillStyle = colors.bg;
  var slide = (t * 0.04) % 0.14;
  for (var k = 0; k < 6; k++) {
    var y0 = sunY + r * (-0.12 + k * 0.14 + slide);
    ctx.fillRect(cx - r, y0, r * 2, r * (0.02 + 0.014 * k));
  }
  ctx.restore();

  // Sun glow
  ctx.globalCompositeOperation = 'lighter';
  var glow = ctx.createRadialGradient(cx, sunY, r * 0.7, cx, sunY, r * 2);
  glow.addColorStop(0, hexToRgba(colors.magenta, 0.25 + beat.decay * 0.25));
  glow.addColorStop(1, hexToRgba(colors.magenta, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 2, sunY - r * 2, r * 4, r * 2 + (horizon - sunY));
  ctx.globalCompositeOperation = 'source-over';

  // FFT mountains, mirrored around the centre and kept low in the middle so the sun stays visible
  for (i = 0; i < MOUNT; i++) mount[i] += ((data[2 + i] || 0) / 255 - mount[i]) * 0.25;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  var steps = MOUNT * 2;
  for (var s = 0; s <= steps; s++) {
    var x = (s / steps) * W;
    var d = Math.abs(x - cx) / (W / 2);
    var idx = Math.min(MOUNT - 1, Math.floor(d * (MOUNT - 1)));
    var jag = (s % 2 === 0) ? 1 : 0.55;
    var hgt = (0.03 + mount[idx] * 0.22) * H * (0.25 + 0.75 * d) * jag;
    ctx.lineTo(x, horizon - hgt);
  }
  ctx.lineTo(W, horizon);
  ctx.closePath();
  ctx.fillStyle = colors.bg;
  ctx.fill();
  ctx.strokeStyle = colors.cyan;
  ctx.lineWidth = 1.2;
  if (beat.decay > 0.01) { ctx.shadowColor = colors.cyan; ctx.shadowBlur = beat.decay * 10; }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Floor: opaque base first so the sun does not show through, then the tinted gradient
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, horizon, W, H - horizon);
  var floor = ctx.createLinearGradient(0, horizon, 0, H);
  floor.addColorStop(0, hexToRgba(colors.magenta, 0.35));
  floor.addColorStop(1, colors.bg);
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, W, H - horizon);

  // Perspective grid: verticals converge to the vanishing point, horizontals scroll toward the viewer
  ctx.strokeStyle = colors.magenta;
  ctx.lineWidth = 1 + beat.decay;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  for (i = -14; i <= 14; i++) {
    ctx.moveTo(cx + i * W * 0.012, horizon);
    ctx.lineTo(cx + i * W * 0.14, H);
  }
  for (k = 0; k < 14; k++) {
    var u = (k + scroll) / 14;
    var y = horizon + (H - horizon) * u * u * u;
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  // Horizon line
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = colors.accent;
  ctx.fillRect(0, horizon - 1, W, 2);

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'source-over';
};
