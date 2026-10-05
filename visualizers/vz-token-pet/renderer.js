// @moltamp-visualizer: Token Pet ♪
// Token Pet dances to your music: it hops on every beat, sways with the bass, sends notes flying, grows up as the beats add up and dozes off when the music stops.
// Music version of the Token Pet widget (Night Lounge pack) of the MOLTamp Widgets Galaxy.
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

// Token Pet: the Token Pet widget's original pixel creature, dancing: hops on beats, sways with the bass,
// throws notes on hits, sleeps through silence. It grows up as the beats of the session add up.
// o outline, b body, l belly, a antenna, t glowing tip, s spot, f foot, w wing (16x16, eyes and mouth drawn on top)
var SPRITES = [
  { name: 'egg', eyes: null, mouth: null, rows: [
    '................', '.......oo.......', '.....oobboo.....', '....obbbbbbo....', '...obbsbbbbbo...', '...obbbbbbbbo...',
    '..obbbbbbbsbbo..', '..obbbbbbbbbbo..', '..obsbbbbbbbbo..', '..obbbbbbbbsbo..', '..obbbbbbbbbbo..', '..obbbsbbbbbbo..',
    '...obbbbbbbbo...', '....oobbbboo....', '......oooo......', '................'] },
  { name: 'blip', eyes: [6, 5, 9], mouth: [9, 7], rows: [
    '................', '.......tt.......', '.......aa.......', '.....oooooo.....', '....obbbbbbo....', '...obbbbbbbbo...',
    '...obbbbbbbbo...', '..obbbbbbbbbbo..', '..obbbbbbbbbbo..', '..obbllllllbbo..', '..obbllllllbbo..', '...obbllllbbo...',
    '....obbbbbbo....', '....off..ffo....', '................', '................'] },
  { name: 'byte', eyes: [6, 4, 10], mouth: [9, 7], rows: [
    '.......tt.......', '..oo...aa...oo..', '..obo.oooo.obo..', '..obbobbbbobbo..', '...obbbbbbbbo...', '..obbbbbbbbbbo..',
    '..obbbbbbbbbbo..', '.obbbbbbbbbbbbo.', '.obbbbbbbbbbbbo.', 'obobbllllllbbobo', 'obobbllllllbbobo', '.o.obbllllbbo.o.',
    '....obbbbbbo....', '...obbo..obbo...', '...offo..offo...', '....oo....oo....'] },
  { name: 'kernel', eyes: [6, 4, 10], mouth: [9, 7], rows: [
    '....t..tt..t....', '....a..aa..a....', '....oooooooo....', '...obbbbbbbbo...', '..obbbbbbbbbbo..', '.obbbbbbbbbbbbo.',
    '.obbbbbbbbbbbbo.', 'wobbbbbbbbbbbbow', 'wwobbllllllbboww', 'wwobllllllllboww', '.wobllllllllbow.', '..obbllllllbbo..',
    '...obbbbbbbbo...', '...obbo..obbo...', '...offo..offo...', '....oo....oo....'] }
];
// Beats heard before each evolution: the egg hatches within the first bars of a song.
var STAGE_AT = [0, 8, 160, 640];
var NOTES = ['♪', '♫', '♪', '♬'];
var NOTE_COLS = ['accent', 'cyan', 'magenta', 'yellow', 'green'];
var hop = 0, hopDir = 1, land = 0, sway = 0, notes = [], zs = [], zClock = 0, sleepy = 0, stage = 0, grow = 0, t = 0;

function stageFor(beats) {
  var s = 0;
  for (var i = 0; i < STAGE_AT.length; i++) if (beats >= STAGE_AT[i]) s = i;
  return s;
}

function pal(light) {
  var body = VK.c.accent;
  return {
    o: light ? VK.mix('accent', 'text', 0.55) : VK.mix('accent', 'bg', 0.55),
    b: body,
    l: VK.mix('accent', light ? 'bg' : 'text', 0.45),
    a: light ? VK.mix('accent', 'text', 0.55) : VK.mix('accent', 'bg', 0.4),
    t: VK.c.yellow, s: VK.c.magenta, f: VK.mix('accent', light ? 'text' : 'bg', 0.3), w: VK.rgba('cyan', 0.85),
    eye: light ? VK.mix('text', 'bg', 0.05) : VK.mix('bg', 'text', 0.05), glint: light ? VK.c.bg : VK.c.text, cheek: VK.rgba('red', 0.55)
  };
}

function drawSprite(ctx, sp, ox, oy, px, sy, p) {
  for (var r = 0; r < 16; r++) {
    var row = sp.rows[r], y = oy + (r - 15) * px * sy;
    for (var c = 0; c < 16; c++) {
      var ch = row.charAt(c);
      if (ch === '.') continue;
      if (ch === 't') { ctx.fillStyle = VK.rgba('yellow', 0.3); ctx.fillRect(ox + c * px - px * 0.5, y - px * 0.5, px * 2, px * 2 * sy); }
      ctx.fillStyle = p[ch] || p.b;
      ctx.fillRect(ox + c * px, y, px + 0.5, px * sy + 0.5);
    }
  }
}

function drawFace(ctx, sp, ox, oy, px, sy, p, mood, kick) {
  if (!sp.eyes) return;
  var er = sp.eyes[0], cols = [sp.eyes[1], sp.eyes[2]], y = oy + (er - 15) * px * sy;
  var blink = Math.sin(t * 0.9) > 0.985;
  for (var i = 0; i < 2; i++) {
    var x = ox + cols[i] * px;
    ctx.fillStyle = p.eye;
    if (mood === 'sleep' || (blink && mood === 'calm')) ctx.fillRect(x, y + px * sy, px * 2, px * 0.6);
    else if (mood === 'happy') { ctx.fillRect(x, y + px * sy * 0.6, px * 0.6, px * 0.6); ctx.fillRect(x + px * 0.6, y, px * 0.8, px * 0.6); ctx.fillRect(x + px * 1.4, y + px * sy * 0.6, px * 0.6, px * 0.6); }
    else {
      ctx.fillRect(x, y, px * 2, px * 2 * sy);
      ctx.fillStyle = p.glint;
      ctx.fillRect(x + px * 0.2, y + px * 0.2, px * 0.6, px * 0.6);
    }
  }
  if (mood === 'happy') {
    ctx.fillStyle = p.cheek;
    ctx.fillRect(ox + (cols[0] - 1) * px, y + px * 2.2 * sy, px * 1.4, px * 0.8);
    ctx.fillRect(ox + (cols[1] + 1.6) * px, y + px * 2.2 * sy, px * 1.4, px * 0.8);
  }
  // Mouth: sings (opens with the kick) while dancing, a smile otherwise.
  var my = oy + (sp.mouth[0] - 15) * px * sy, mx = ox + sp.mouth[1] * px;
  ctx.fillStyle = p.eye;
  if (mood === 'happy' || mood === 'dance') ctx.fillRect(mx, my, px * 2, px * (0.5 + kick * 1.2));
  else if (mood !== 'sleep') {
    ctx.fillRect(mx, my, px * 0.6, px * 0.5); ctx.fillRect(mx + px * 0.5, my + px * 0.5, px, px * 0.5); ctx.fillRect(mx + px * 1.4, my, px * 0.6, px * 0.5);
  }
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt, light = VK.light;
  t += dt;
  ctx.clearRect(0, 0, W, H);

  sleepy += ((A.silent ? 1 : 0) - sleepy) * (1 - Math.exp(-dt / 1.2));
  var newStage = stageFor(A.beats);
  if (newStage > stage) { stage = newStage; grow = 1.6; }
  var sp = SPRITES[stage], p = pal(light);
  var wide = W > H * 1.8;
  var px = Math.max(2, Math.floor(Math.min(wide ? H * 0.62 : H * 0.48, W * 0.55) / 16));
  var cx = wide ? W * 0.4 : W / 2, ground = wide ? H * 0.88 : H * 0.74;

  // Hop on each hit, alternating lean; sway with the bass; land with a squash.
  if (A.hit && !A.silent) {
    hop = 1;
    hopDir = -hopDir;
    for (var n = 0; n < (A.kick > 0.8 ? 2 : 1); n++) {
      if (notes.length < 24) notes.push({ x: cx + (Math.random() - 0.3) * px * 8, y: ground - px * 14, vx: (0.5 + Math.random()) * px * 3 * (Math.random() < 0.5 ? -1 : 1),
        age: 0, ch: NOTES[(Math.random() * NOTES.length) | 0], col: NOTE_COLS[(Math.random() * NOTE_COLS.length) | 0], s: 1.6 + Math.random() * 1.4 });
    }
  }
  var wasUp = hop > 0.05;
  hop = Math.max(0, hop - dt * 3.2);
  if (wasUp && hop <= 0.05) land = 1;
  land = Math.max(0, land - dt * 6);
  var bpmRate = (A.bpm || 110) / 60;
  sway += dt * bpmRate * Math.PI;
  var swayAmp = (0.4 + A.bass * 2.2) * (1 - sleepy);
  var dy = -Math.sin(hop * Math.PI) * px * (2 + A.kick * 2.5) * (1 - sleepy);
  var dx = Math.sin(sway) * px * swayAmp + hopDir * hop * px * 0.8;
  var sy = (1 + Math.sin(t * (A.silent ? 1.2 : 2.4)) * (A.silent ? 0.04 : 0.02)) * (1 - land * 0.12);
  if (sp.name === 'egg') { dx = Math.sin(t * (A.silent ? 2 : 9)) * px * (0.2 + A.kick * 0.5); dy *= 0.35; }
  var mood = sleepy > 0.6 ? 'sleep' : A.kick > 0.75 ? 'happy' : A.energy > 0.08 ? 'dance' : 'calm';
  var ox = cx - 8 * px + dx, oy = ground + dy;

  // Dance floor glow and shadow
  var floor = ctx.createRadialGradient(cx, ground + px, 0, cx, ground + px, px * 12);
  floor.addColorStop(0, VK.rgba('magenta', (light ? 0.12 : 0.2) * (A.kick * 0.8 + A.energy) * (1 - sleepy)));
  floor.addColorStop(1, VK.rgba('magenta', 0));
  ctx.fillStyle = floor;
  ctx.beginPath(); ctx.arc(cx, ground + px, px * 12, 0, 6.283); ctx.fill();
  ctx.fillStyle = VK.rgba(light ? 'text' : 'dim', 0.18);
  ctx.beginPath(); ctx.ellipse(cx + dx * 0.3, ground + px * 0.6, px * 6 * (1 + dy / (px * 20)) * (1 + land * 0.1), px * 1.2, 0, 0, 6.283); ctx.fill();

  drawSprite(ctx, sp, ox, oy, px, sy, p);
  drawFace(ctx, sp, ox, oy, px, sy, p, mood, A.kick);

  // Notes thrown on the beats drift up and fade
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (var i = notes.length - 1; i >= 0; i--) {
    var nt = notes[i];
    nt.age += dt;
    if (nt.age > 2.2) { notes.splice(i, 1); continue; }
    nt.x += nt.vx * dt;
    nt.y -= px * 7 * dt;
    ctx.globalAlpha = Math.max(0, 1 - nt.age / 2.2);
    ctx.fillStyle = VK.c[nt.col];
    ctx.font = VK.font(px * nt.s * 1.4, 'bold');
    ctx.fillText(nt.ch, nt.x + Math.sin(nt.age * 5) * px * 0.8, nt.y);
  }
  ctx.globalAlpha = 1;

  // Asleep through the silence
  var headX = cx + px * 5, headY = oy - 16 * px * sy;
  if (sleepy > 0.6) {
    zClock -= dt;
    if (zClock <= 0) { zClock = 1.1; zs.push({ age: 0 }); }
  }
  for (var zi = zs.length - 1; zi >= 0; zi--) {
    var z = zs[zi];
    z.age += dt;
    if (z.age > 3 || sleepy < 0.4) { zs.splice(zi, 1); continue; }
    ctx.fillStyle = VK.rgba('text', 1 - z.age / 3);
    ctx.font = VK.font(px * (2 + z.age), 'bold');
    ctx.textAlign = 'left';
    ctx.fillText('z', headX + z.age * px * 2, headY - z.age * px * 3);
  }

  // Evolution flash
  if (grow > 0) {
    grow = Math.max(0, grow - dt);
    ctx.fillStyle = Math.sin(t * 12) > 0 ? VK.c.yellow : VK.c.accent;
    ctx.font = VK.font(Math.max(10, px * 2.2), 'bold');
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL UP!', cx, Math.max(px * 2, oy - 19 * px));
  }

  // HUD: name, stage and tempo
  var hs = Math.max(9, Math.min(14, (wide ? H * 0.13 : H * 0.07), W * 0.05));
  var hx = wide ? cx + px * 12 : 8, hy = wide ? H / 2 - hs * 1.4 : 8;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = VK.font(hs, 'bold');
  ctx.fillStyle = VK.c.text;
  ctx.fillText('Bit · ' + sp.name, hx, hy);
  ctx.font = VK.font(hs * 0.85);
  ctx.fillStyle = A.silent ? VK.c.dim : VK.c.magenta;
  ctx.fillText(A.silent ? 'zzz · no music' : '♪ ' + (A.bpm ? A.bpm + ' BPM' : 'dancing'), hx, hy + hs * 1.35);
  var next = STAGE_AT[stage + 1];
  if (next) {
    var bw = hs * 6, bh = Math.max(2, hs * 0.28), prev = STAGE_AT[stage];
    ctx.fillStyle = VK.rgba('dim', 0.25);
    ctx.fillRect(hx, hy + hs * 2.7, bw, bh);
    ctx.fillStyle = VK.c.yellow;
    ctx.fillRect(hx, hy + hs * 2.7, bw * Math.min(1, (A.beats - prev) / (next - prev)), bh);
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
