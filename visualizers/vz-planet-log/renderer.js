// @moltamp-visualizer: Planet Pulse ♪
// A procedural planet that pulses with your music: the atmosphere glows with the energy, the rings shimmer with the highs, the moons orbit to the tempo, and every 16 beats a hyperspace hop finds a new named world.
// Music version of the Planet Log widget (Starship pack) of the MOLTamp Widgets Galaxy.
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

// Planet Pulse: the Planet Log widget's procedural worlds, played by the music. Every 16 beats a hyperspace hop
// lands on a new planet; its atmosphere, rings, moons and spin follow the energy, the highs and the tempo.
var TW = 256, TH = 128, HOP_BEATS = 16, CHARGE_S = 0.4, JUMP_S = 1.4, ARRIVE_S = 1.0;
var TYPES = ['rocky', 'ocean', 'gas', 'ice', 'lava', 'ring'];
var TYPE_NAMES = { rocky: 'rocky world', ocean: 'ocean world', gas: 'gas giant', ice: 'ice world', lava: 'lava world', ring: 'ringed giant' };
var SYL = ['va', 'shti', 'kor', 'ra', 'ne', 'lu', 'mi', 'os', 'ta', 'ri', 'zen', 'ka', 'lo', 'dre', 'quo', 'ix', 'or', 'an', 'bel', 'cy', 'do', 'fen',
  'gal', 'hel', 'io', 'jor', 'kep', 'lyr', 'mon', 'nyx', 'pra', 'rho', 'sel', 'tor', 'umb', 'vex', 'wyn', 'xa', 'yor', 'zan', 'the', 'mar'];
var SUFFIX = ['', '', ' Prime', ' Minor', ' Major', ' II', ' III', ' IV', ' V', ' VII', '-b', '-c'];
// The first world changes at every load; the hops that follow are seeded from the beats.
var homeSeed = VK.hash('home#' + Date.now());
var count = 1, entry = { n: 1, s: homeSeed, k: Math.floor(VK.hash(homeSeed + '#k') * 6) }, planet = null, palKey = '', phase = 'idle', phaseT = 0, nextEntry = null;
var hopAt = HOP_BEATS, streaks = [], t = 0;
var stars = (function () { var r = VK.prng(0.2718), l = []; for (var i = 0; i < 110; i++) l.push({ x: r(), y: r(), s: 0.4 + r() * 1.1, p: r() * 6.283 }); return l; })();

function genName(seed) {
  var r = VK.prng(seed), n = 2 + (r() < 0.3 ? 1 : 0), s = '';
  for (var i = 0; i < n; i++) s += SYL[Math.floor(r() * SYL.length)];
  s = s.charAt(0).toUpperCase() + s.slice(1);
  var suf = SUFFIX[Math.floor(r() * SUFFIX.length)];
  if (r() < 0.12) suf = ' ' + (100 + Math.floor(r() * 900)) + 'b';
  return s + suf;
}

// ---- procedural texture (value noise that wraps around the longitude)
function makeNoise(seed) {
  var r = VK.prng(seed), perm = new Uint8Array(512), val = new Float32Array(256), i;
  for (i = 0; i < 256; i++) { perm[i] = i; val[i] = r(); }
  for (i = 255; i > 0; i--) { var j = Math.floor(r() * (i + 1)), tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp; }
  for (i = 0; i < 256; i++) perm[256 + i] = perm[i];
  function lat(ix, iy) { return val[perm[(perm[ix & 255] + iy) & 255]]; }
  return function (x, y, period) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    var xa = ((x0 % period) + period) % period, xb = (xa + 1) % period;
    var a = lat(xa, y0), b = lat(xb, y0), c = lat(xa, y0 + 1), d = lat(xb, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function fbm(noise, u, v, oct) {
  var sum = 0, amp = 0.5, norm = 0, P = 6;
  for (var o = 0; o < oct; o++) { var f = P << o; sum += noise(u * f, v * f / 2, f) * amp; norm += amp; amp *= 0.5; }
  return sum / norm;
}
function lerp3(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
function col(name) { return VK.rgb[name] || VK.rgb.text; }
function ramp(stops, x) {
  x = Math.max(0, Math.min(0.9999, x));
  var f = x * (stops.length - 1), i = Math.floor(f);
  return lerp3(stops[i], stops[i + 1], f - i);
}

function genPlanet(e) {
  var seed = e.s, type = TYPES[e.k], r = VK.prng(seed), noise = makeNoise(seed), cloudNoise = makeNoise(seed * 0.7 + 0.13);
  var dark = lerp3(col('bg'), [0, 0, 0], 0.3), pick = function (list) { return list[Math.floor(r() * list.length)]; };
  var stops, atmos = 'cyan', clouds = 0, emissive = false, bands = false;
  if (type === 'ocean') { stops = [lerp3(col('blue'), dark, 0.55), col('blue'), col('cyan'), lerp3(col('green'), dark, 0.2), col('green'), lerp3(col('text'), [255, 255, 255], 0.3)]; atmos = 'cyan'; clouds = 0.55; }
  else if (type === 'rocky') { stops = [lerp3(col('dim'), dark, 0.5), lerp3(col('yellow'), dark, 0.45), lerp3(col('red'), dark, 0.35), col('yellow'), lerp3(col('dim'), col('text'), 0.4)]; atmos = pick(['yellow', 'dim']); clouds = r() < 0.4 ? 0.25 : 0; }
  else if (type === 'ice') { stops = [lerp3(col('blue'), dark, 0.3), col('cyan'), lerp3(col('text'), col('cyan'), 0.3), lerp3(col('text'), [255, 255, 255], 0.5)]; atmos = 'cyan'; clouds = 0.3; }
  else if (type === 'lava') { stops = [dark, lerp3(col('dim'), dark, 0.6), lerp3(col('red'), dark, 0.3), col('red'), col('yellow')]; atmos = 'red'; emissive = true; }
  else {
    var a = pick(['magenta', 'yellow', 'accent', 'cyan', 'red']), b = pick(['yellow', 'text', 'accent', 'blue', 'magenta']);
    stops = [lerp3(col(a), dark, 0.4), col(a), lerp3(col(a), col(b), 0.5), col(b), lerp3(col(b), [255, 255, 255], 0.35)];
    atmos = a;
    bands = true;
  }
  var tex = new Uint8ClampedArray(TW * TH * 4), cl = clouds ? new Float32Array(TW * TH) : null, freq = 6 + r() * 10, warp = 2 + r() * 3;
  for (var y = 0; y < TH; y++) {
    var v = y / TH, latv = (v - 0.5) * Math.PI;
    for (var x = 0; x < TW; x++) {
      var u = x / TW, h = fbm(noise, u, v, 5), c;
      if (bands) c = ramp(stops, 0.5 + 0.5 * Math.sin(latv * freq + (h - 0.5) * warp * 3));
      else {
        var polar = Math.abs(latv) / (Math.PI / 2);
        c = ramp(stops, h * 1.15 - 0.08 + (type === 'ocean' || type === 'ice' ? Math.pow(polar, 6) * 0.6 : 0));
      }
      var o = (y * TW + x) * 4;
      tex[o] = c[0]; tex[o + 1] = c[1]; tex[o + 2] = c[2];
      tex[o + 3] = emissive ? Math.max(0, h - 0.62) * 255 * 2.4 : 0;
      if (cl) { var cv = fbm(cloudNoise, u, v, 4); cl[y * TW + x] = Math.max(0, Math.min(1, (cv - (1 - clouds)) * 3.2)); }
    }
  }
  var ringed = type === 'ring' || (type === 'rocky' && r() < 0.25) || (type === 'gas' && r() < 0.35);
  var moons = [], nm = 1 + Math.floor(r() * 2.6);
  for (var m = 0; m < nm; m++) moons.push({ dist: 1.6 + m * 0.55 + r() * 0.3, size: 0.08 + r() * 0.1, speed: (0.25 + r() * 0.4) * (r() < 0.5 ? -1 : 1), a: r() * 6.283 });
  return { entry: e, name: genName(seed), type: type, tex: tex, clouds: cl, atmos: atmos, emissive: emissive, tilt: (r() - 0.5) * 0.7, spin: 4 + r() * 6,
    ring: ringed ? { inner: 1.35 + r() * 0.2, outer: 1.9 + r() * 0.5, tilt: 0.28 + r() * 0.12, col: pick(['text', 'yellow', 'accent', 'cyan']), bands: 3 + Math.floor(r() * 4), seed: r() } : null,
    moons: moons, rot: 0, cloudRot: 0 };
}

// ---- sphere: per-pixel texture coordinates and light, baked once per size and planet (worker-side OffscreenCanvas)
var sph = { key: '', cv: null, ctx: null, img: null, n: 0 };
function bakeSphere(R) {
  var key = R + ':' + planet.entry.s;
  if (sph.key === key) return;
  sph.key = key;
  var D = R * 2;
  sph.cv = new OffscreenCanvas(D, D);
  sph.ctx = sph.cv.getContext('2d');
  sph.img = sph.ctx.createImageData(D, D);
  var max = D * D, idx = new Uint32Array(max), us = new Float32Array(max), vs = new Uint16Array(max), sh = new Float32Array(max), aa = new Float32Array(max), n = 0;
  var L = [-0.55, -0.4, 0.73], ll = Math.hypot(L[0], L[1], L[2]), ct = Math.cos(planet.tilt), st = Math.sin(planet.tilt);
  for (var py = 0; py < D; py++) {
    for (var px = 0; px < D; px++) {
      var nx = (px + 0.5 - R) / R, ny = (py + 0.5 - R) / R, d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      var nz = Math.sqrt(1 - d2), tx = nx * ct - ny * st, ty = nx * st + ny * ct;
      var lat = Math.asin(Math.max(-1, Math.min(1, -ty))), lon = Math.atan2(tx, nz);
      idx[n] = (py * D + px) * 4;
      us[n] = (lon / 6.283 + 0.5) * TW;
      vs[n] = Math.min(TH - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * TH)));
      sh[n] = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ll);
      aa[n] = Math.min(1, (1 - Math.sqrt(d2)) * R);
      n++;
    }
  }
  sph.idx = idx; sph.us = us; sph.vs = vs; sph.sh = sh; sph.aa = aa; sph.n = n;
}
function paintSphere(rot, cloudRot, light, glow) {
  var data = sph.img.data, tex = planet.tex, cl = planet.clouds, cr = light ? 250 : 240;
  for (var k = 0; k < sph.n; k++) {
    var tx = ((sph.us[k] + rot) % TW + TW) % TW | 0, ti = sph.vs[k] * TW + tx, o = ti * 4, s = 0.06 + 0.94 * sph.sh[k];
    var r = tex[o] * s, g = tex[o + 1] * s, b = tex[o + 2] * s;
    if (planet.emissive) { var e = tex[o + 3] / 255 * (1 - sph.sh[k] * 0.5) * (0.7 + glow * 0.8); r += 255 * e; g += 120 * e; b += 40 * e; }
    if (cl) {
      var cx = ((sph.us[k] + cloudRot) % TW + TW) % TW | 0, ca = cl[sph.vs[k] * TW + cx] * 0.85;
      r = r * (1 - ca) + cr * s * ca; g = g * (1 - ca) + cr * s * ca; b = b * (1 - ca) + cr * s * ca;
    }
    var i = sph.idx[k];
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255 * sph.aa[k];
  }
  sph.ctx.putImageData(sph.img, 0, 0);
}

function drawRing(ctx, x, y, R, front, A) {
  var rg = planet.ring;
  ctx.save();
  ctx.beginPath();
  // Back half sits behind the planet, front half over it.
  if (front) ctx.rect(x - R * 3, y, R * 6, R * 3); else ctx.rect(x - R * 3, y - R * 3, R * 6, R * 3);
  ctx.clip();
  for (var b = 0; b < rg.bands; b++) {
    var k = b / rg.bands, rr = R * (rg.inner + (rg.outer - rg.inner) * k);
    // The highs make the ring bands shimmer one after the other.
    var shimmer = A.high * 1.6 * (0.5 + 0.5 * Math.sin(t * 9 - b * 1.3));
    ctx.strokeStyle = VK.rgba(rg.col, Math.min(0.95, 0.16 + 0.3 * Math.abs(Math.sin((k + rg.seed) * 9)) + shimmer * 0.5));
    ctx.lineWidth = Math.max(1, R * (rg.outer - rg.inner) / rg.bands * 0.8);
    ctx.beginPath(); ctx.ellipse(x, y, rr, rr * rg.tilt, planet.tilt, 0, 6.283); ctx.stroke();
  }
  ctx.restore();
}
function drawMoon(ctx, x, y, R, m) {
  var mx = x + Math.cos(m.a) * R * m.dist, my = y + Math.sin(m.a) * R * m.dist * 0.32, mr = Math.max(1.5, R * m.size);
  var g = ctx.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, mr * 0.1, mx, my, mr);
  g.addColorStop(0, VK.mix('text', 'dim', 0.2));
  g.addColorStop(1, VK.mix('dim', 'bg', 0.6));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.283); ctx.fill();
}

// baseR sets the baked resolution, so the arrival zoom only rescales the image.
function drawPlanet(ctx, x, y, R, alpha, A, baseR, light) {
  var Ri = Math.max(8, Math.min(96, Math.round(baseR * 2)));
  bakeSphere(Ri);
  var tempo = A.bpm ? Math.max(0.5, Math.min(1.8, A.bpm / 120)) : 1, drive = A.silent ? 0.3 : 0.5 + A.energy * 1.6;
  planet.rot += A.dt * planet.spin * drive;
  planet.cloudRot += A.dt * planet.spin * drive * 1.35;
  var glowLvl = Math.min(1, A.energy * 2.4 + A.kick * 0.5);
  paintSphere(planet.rot, planet.cloudRot, light, glowLvl);
  ctx.globalAlpha = alpha;
  planet.moons.forEach(function (m) { m.a += A.dt * m.speed * tempo * (A.silent ? 0.4 : 0.6 + A.energy * 1.8); if (Math.sin(m.a) < 0) drawMoon(ctx, x, y, R, m); });
  if (planet.ring) drawRing(ctx, x, y, R, false, A);
  // Atmosphere: brighter and wider with the energy, a breath on every beat
  var gr = R * (1.22 + glowLvl * 0.18 + A.kick * 0.08);
  var glow = ctx.createRadialGradient(x, y, R * 0.92, x, y, gr);
  glow.addColorStop(0, VK.rgba(planet.atmos, (light ? 0.28 : 0.36) + glowLvl * 0.5));
  glow.addColorStop(1, VK.rgba(planet.atmos, 0));
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, gr, 0, 6.283); ctx.fill();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sph.cv, x - R, y - R, R * 2, R * 2);
  var rim = ctx.createRadialGradient(x - R * 0.35, y - R * 0.3, R * 0.7, x, y, R * 1.02);
  rim.addColorStop(0, VK.rgba(planet.atmos, 0));
  rim.addColorStop(1, VK.rgba(planet.atmos, 0.22 + glowLvl * 0.3));
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.fill();
  if (planet.ring) drawRing(ctx, x, y, R, true, A);
  planet.moons.forEach(function (m) { if (Math.sin(m.a) >= 0) drawMoon(ctx, x, y, R, m); });
  ctx.globalAlpha = 1;
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  t += dt;
  ctx.clearRect(0, 0, W, H);
  var key = [VK.c.bg, VK.c.text, VK.c.accent, VK.c.cyan, VK.c.blue, VK.c.green, VK.c.red, VK.c.yellow, VK.c.magenta, VK.c.dim].join('');
  if (!planet || key !== palKey) { palKey = key; planet = genPlanet(entry); sph.key = ''; }

  // Every 16 beats of music, the drive charges and jumps to a new world.
  if (phase === 'idle' && A.beats >= hopAt && !A.silent) { phase = 'charge'; phaseT = 0; }
  phaseT += dt;
  if (phase === 'charge' && phaseT > CHARGE_S) {
    phase = 'jump'; phaseT = 0;
    streaks = [];
    for (var i = 0; i < 140; i++) streaks.push({ a: Math.random() * 6.283, r: Math.random() * 0.15, v: 0.4 + Math.random() * 1.2, c: ['accent', 'cyan', 'text', 'magenta'][i % 4] });
    count++;
    var seed = VK.hash('planet#' + count + '#' + A.beats + '#' + Math.round(A.t * 1000));
    nextEntry = { n: count, s: seed, k: Math.floor(VK.hash(seed + '#k') * TYPES.length) };
  } else if (phase === 'jump' && phaseT > 0.05 && nextEntry) {
    // Generated mid-jump, while the streaks hide the frame it costs.
    entry = nextEntry; nextEntry = null; planet = genPlanet(entry); sph.key = '';
  } else if (phase === 'jump' && phaseT > JUMP_S) { phase = 'arrive'; phaseT = 0; }
  else if (phase === 'arrive' && phaseT > ARRIVE_S) { phase = 'idle'; phaseT = 0; hopAt = A.beats + HOP_BEATS; }

  var wide = W > H * 1.6, R = wide ? Math.min(H * 0.34, W * 0.16) : Math.min(W * 0.28, H * 0.25);
  // The layout keeps the rings and the farthest moon clear of the log text.
  var reach = planet.ring ? Math.max(1.9, planet.ring.outer * 1.04) : 1.9;
  planet.moons.forEach(function (m) { reach = Math.max(reach, m.dist + m.size + 0.1); });
  if (!wide && planet.ring) R = Math.min(R, W * 0.47 / planet.ring.outer);
  if (wide) R = Math.min(R, (W - 18 - Math.min(260, W * 0.45)) / (2 * reach + 0.2));
  var px = wide ? R * reach + 8 : W / 2, py = wide ? H / 2 : H * 0.4;

  // Stars twinkle with the highs; they stretch into streaks during the jump
  var speed = phase === 'jump' ? 1 + phaseT * 6 : phase === 'charge' ? 1 + phaseT * 2 : 1;
  ctx.fillStyle = VK.rgba('text', light ? 0.3 : 0.6);
  stars.forEach(function (s) {
    ctx.globalAlpha = (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * (1.2 + A.high * 6) + s.p))) * (phase === 'jump' ? 0.3 : 1);
    ctx.fillRect(s.x * W, s.y * H, s.s * speed, s.s);
  });
  ctx.globalAlpha = 1;

  if (phase === 'jump') {
    var k = phaseT / JUMP_S, maxR = Math.hypot(W, H) * 0.6;
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    ctx.lineCap = 'round';
    streaks.forEach(function (s) {
      s.r += dt * s.v * (0.6 + k * 3);
      if (s.r > 1.1) s.r = Math.random() * 0.1;
      var r1 = s.r * maxR, r0 = Math.max(0, r1 - (20 + k * 120) * s.v);
      ctx.strokeStyle = VK.rgba(s.c, 0.35 + 0.5 * k);
      ctx.lineWidth = 1 + k * 1.5;
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(s.a) * r0, H / 2 + Math.sin(s.a) * r0);
      ctx.lineTo(W / 2 + Math.cos(s.a) * r1, H / 2 + Math.sin(s.a) * r1);
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
  } else {
    var a = phase === 'charge' ? Math.max(0, 1 - phaseT / CHARGE_S) : phase === 'arrive' ? Math.min(1, phaseT / ARRIVE_S) : 1;
    var growK = phase === 'arrive' ? 0.35 + 0.65 * (1 - Math.pow(1 - a, 3)) : 1;
    drawPlanet(ctx, px, py, R * growK * (1 + A.kick * 0.025), a, A, R, light);
    if (phase === 'arrive' && phaseT < 0.4) {
      ctx.fillStyle = VK.rgba('text', (1 - phaseT / 0.4) * (light ? 0.4 : 0.7));
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Log line: planet number, name, type and the beats left before the next hop
  if (phase === 'idle' || phase === 'arrive') {
    var left = Math.max(0, hopAt - A.beats);
    var meta = TYPE_NAMES[planet.type] + (A.silent ? ' · drifting · no music' : ' · next hop in ' + left + ' beat' + (left === 1 ? '' : 's'));
    ctx.textBaseline = 'top';
    if (wide) {
      var tx = px + R * (reach + 0.2), tw = W - tx - 10, ts = Math.max(11, Math.min(22, H * 0.15));
      if (tw > 60) {
        ctx.textAlign = 'left';
        ctx.font = VK.font(ts, 'bold');
        ctx.fillStyle = VK.c.text;
        var y0 = H / 2 - ts * (H > 90 ? 1.3 : 0.8);
        ctx.fillText(fit(ctx, '#' + planet.entry.n + ' ' + planet.name, tw), tx, y0);
        ctx.font = VK.font(Math.max(8, ts * 0.55));
        ctx.fillStyle = VK.c.dim;
        ctx.fillText(fit(ctx, meta, tw), tx, y0 + ts * 1.25);
        if (H > 90 && A.bpm) { ctx.fillStyle = VK.c.accent; ctx.fillText('♪ ' + A.bpm + ' BPM', tx, y0 + ts * 2.1); }
      }
    } else {
      var ts2 = Math.max(10, Math.min(18, W / 16)), ty = py + R * 1.45;
      ctx.textAlign = 'center';
      ctx.font = VK.font(ts2, 'bold');
      ctx.fillStyle = VK.c.text;
      ctx.fillText(fit(ctx, '#' + planet.entry.n + ' ' + planet.name, W - 16), W / 2, ty);
      ctx.font = VK.font(Math.max(8, ts2 * 0.6));
      ctx.fillStyle = VK.c.dim;
      ctx.fillText(fit(ctx, meta, W - 16), W / 2, ty + ts2 * 1.3);
      if (ty + ts2 * 3.2 < H - 6 && A.bpm) { ctx.fillStyle = VK.c.accent; ctx.fillText('♪ ' + A.bpm + ' BPM', W / 2, ty + ts2 * 2.2); }
    }
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
