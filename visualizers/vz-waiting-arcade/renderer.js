// @moltamp-visualizer: Waiting Arcade ♪
// Attract-mode space invaders that march one step per beat, with a pilot that fires on the hits and explosions that flare with the highs.
// Music version of the Waiting Arcade widget (Mission Control pack) of the MOLTamp Widgets Galaxy.
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

// Waiting Arcade ♪: the invaders march one step per beat, the attract-mode pilot fires on the hits.
var SPRITES = [
  ['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'],
  ['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.'],
  ['..#..#..', '...##...', '..####..', '.##..##.', '########', '#.####.#', '#.#..#.#', '...##...'],
  ['..#..#..', '#..##..#', '#.####.#', '###..###', '########', '.######.', '..#..#..', '.#....#.']
];
var ROW_TONE = ['magenta', 'cyan', 'green', 'yellow'];
var G = null, gw = 0, gh = 0, stars = [], sinceStep = 0, midAvg = 0, midCool = 0, hi = 0, flashT = 0;
var rnd = VK.prng(0.3141);
for (var s0 = 0; s0 < 70; s0++) stars.push({ x: rnd(), y: rnd(), v: 0.02 + rnd() * 0.08, s: rnd() < 0.2 ? 1.6 : 1 });

function newGame(w, h) {
  G = { inv: [], dir: 1, ox: 0, oy: 0, shots: [], bombs: [], booms: [], ship: { x: w / 2, inv: 0 }, ufo: null,
    frame: 0, cols: w < 260 ? 6 : 8, rows: 4, cell: 10, wave: 1, kills: 0, bob: 0 };
  setupWave(w, h);
}

function setupWave(w, h) {
  G.cell = Math.max(8, Math.min(w * 0.78 / G.cols, h * 0.42 / G.rows));
  G.inv = [];
  for (var r = 0; r < G.rows; r++) for (var c = 0; c < G.cols; c++) G.inv.push({ c: c, r: r, alive: true, glow: 0 });
  G.ox = (w - G.cols * G.cell) / 2;
  G.oy = h * 0.14;
  G.dir = 1;
  G.shots = []; G.bombs = [];
}

function invPos(v) { return { x: G.ox + v.c * G.cell, y: G.oy + v.r * G.cell * 0.85 }; }

function boom(x, y, tone, n, A) {
  // The highs make the explosions bigger and brighter.
  n = Math.round(n * (0.7 + A.high * 1.6));
  for (var i = 0; i < n; i++) {
    var a = rnd() * 6.283, sp = (30 + rnd() * 90) * (0.8 + A.high);
    G.booms.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + rnd() * 0.4 + A.high * 0.4, tone: tone,
      size: 1.6 + A.high * 2.2 });
  }
  if (G.booms.length > 260) G.booms.splice(0, G.booms.length - 260);
}

// One march step: the whole formation moves, toggles its sprites, turns and drops at the edges.
function step(w) {
  var alive = G.inv.filter(function (v) { return v.alive; });
  if (!alive.length) return;
  var cell = G.cell, minC = Infinity, maxC = -Infinity;
  alive.forEach(function (v) { minC = Math.min(minC, v.c); maxC = Math.max(maxC, v.c); });
  var stepX = cell * 0.32 * (1 + 0.1 * (G.wave - 1));
  var left = G.ox + minC * cell + G.dir * stepX, right = G.ox + (maxC + 1) * cell + G.dir * stepX;
  if ((G.dir > 0 && right > w - cell * 0.2) || (G.dir < 0 && left < cell * 0.2)) { G.dir *= -1; G.oy += cell * 0.35; }
  else G.ox += G.dir * stepX;
  G.frame ^= 1;
}

function update(A, w, h) {
  var dt = A.dt, cell = G.cell, ship = G.ship, shipY = h - cell * 0.9;
  var alive = G.inv.filter(function (v) { return v.alive; });
  if (!alive.length) { G.wave++; setupWave(w, h); return; }

  if (!A.silent) {
    sinceStep += dt;
    // A step per beat; a slow fallback keeps beatless music moving.
    if (A.hit || sinceStep > 1.1) { step(w); sinceStep = 0; }
    if (A.hit) alive.forEach(function (v) { v.glow = 1; });
  } else {
    G.bob += dt;
  }
  alive.forEach(function (v) { v.glow *= Math.exp(-dt * 5); });

  // Attract-mode pilot: follows the lowest invader, fires on the hits (and on bright highs).
  var low = alive.reduce(function (a, v) { return v.r >= a.r ? v : a; }, alive[0]);
  var target = invPos(low).x + cell / 2 + Math.sin(A.t * 1.3) * cell * 0.6;
  var maxV = w * 0.9 * dt;
  ship.x += Math.max(-maxV, Math.min(maxV, target - ship.x));
  ship.x = Math.max(cell * 0.6, Math.min(w - cell * 0.6, ship.x));
  ship.inv = Math.max(0, ship.inv - dt);
  var fire = !A.silent && (A.hit || (A.high > 0.3 && rnd() < dt * A.high * 4));
  if (fire && G.shots.length < 3) G.shots.push({ x: ship.x, y: shipY - cell * 0.4 });

  // Bombs drop on the snare-like bursts in the mids.
  midAvg += (A.raw.mid - midAvg) * (1 - Math.exp(-dt / 0.6));
  midCool -= dt;
  if (!A.silent && midCool <= 0 && A.raw.mid > midAvg * 1.25 + 0.03) {
    midCool = 0.25;
    var shooter = alive[(rnd() * alive.length) | 0], col = alive.filter(function (v) { return v.c === shooter.c; });
    var bottom = col.reduce(function (a, v) { return v.r > a.r ? v : a; }, col[0]), bp = invPos(bottom);
    G.bombs.push({ x: bp.x + cell / 2, y: bp.y + cell * 0.7 });
  }

  // A UFO crosses on every 32nd beat.
  if (A.hit && A.beats % 32 === 0 && !G.ufo) G.ufo = { x: -cell, dir: 1 };
  if (G.ufo) { G.ufo.x += G.ufo.dir * w * 0.25 * dt; if (G.ufo.x > w + cell) G.ufo = null; }

  for (var i = G.shots.length - 1; i >= 0; i--) {
    var s = G.shots[i], hit = false;
    s.y -= h * 1.1 * dt;
    for (var j = 0; j < alive.length && !hit; j++) {
      var p = invPos(alive[j]);
      if (alive[j].alive && s.x > p.x + cell * 0.12 && s.x < p.x + cell * 0.88 && s.y > p.y && s.y < p.y + cell * 0.7) {
        alive[j].alive = false; hit = true; G.kills++;
        boom(p.x + cell / 2, p.y + cell * 0.35, ROW_TONE[alive[j].r % 4], 14, A);
      }
    }
    if (!hit && G.ufo && Math.abs(s.x - G.ufo.x) < cell * 0.6 && Math.abs(s.y - h * 0.07) < cell * 0.35) {
      hit = true; boom(G.ufo.x, h * 0.07, 'red', 24, A); G.ufo = null;
    }
    if (hit || s.y < 0) G.shots.splice(i, 1);
  }
  for (i = G.bombs.length - 1; i >= 0; i--) {
    var b = G.bombs[i];
    b.y += h * 0.42 * dt;
    if (Math.abs(b.x - ship.x) < cell * 0.45 && b.y > shipY - cell * 0.3 && b.y < shipY + cell * 0.3 && ship.inv <= 0) {
      G.bombs.splice(i, 1); boom(ship.x, shipY, 'accent', 30, A); ship.inv = 1.6; continue;
    }
    if (b.y > h) G.bombs.splice(i, 1);
  }
  var maxR = 0;
  alive.forEach(function (v) { if (v.alive) maxR = Math.max(maxR, v.r); });
  if (G.oy + maxR * cell * 0.85 + cell * 0.7 > shipY - cell * 0.3) setupWave(w, h);
}

function sprite(ctx, rows, x, y, size, tone, glow) {
  var px = size / 8;
  ctx.fillStyle = glow > 0.05 ? VK.mix(tone, 'text', glow * 0.55) : VK.c[tone];
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) if (rows[r].charAt(c) === '#') ctx.fillRect(x + c * px, y + r * px, px + 0.3, px + 0.3);
}

function center(ctx, text, W, y, size, tone, box) {
  ctx.font = VK.font(size, 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (box) {
    var tw = ctx.measureText(text).width + size * 1.4;
    ctx.fillStyle = VK.rgba('bg', 0.85);
    ctx.fillRect(W / 2 - tw / 2, y - size, tw, size * 2);
    ctx.strokeStyle = VK.c[tone];
    ctx.lineWidth = 1;
    ctx.strokeRect(W / 2 - tw / 2 + 0.5, y - size + 0.5, tw - 1, size * 2 - 1);
  }
  ctx.fillStyle = VK.c[tone];
  ctx.fillText(text, W / 2, y);
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  var A = VK.frame(data, beat, colors), dt = A.dt;
  if (!G || W !== gw || H !== gh) { gw = W; gh = H; newGame(W, H); }
  update(A, W, H);
  var cell = G.cell, score = A.beats;
  hi = Math.max(hi, score);
  if (A.hit) flashT = 1;
  flashT *= Math.exp(-dt * 6);

  ctx.fillStyle = VK.c.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = VK.c.text;
  for (var i = 0; i < stars.length; i++) {
    var st = stars[i];
    st.y = (st.y + st.v * dt * (A.silent ? 0.3 : 0.8 + A.energy * 2)) % 1;
    ctx.globalAlpha = 0.25 + A.high * 0.4;
    ctx.fillRect(st.x * W, st.y * H, st.s, st.s);
  }
  ctx.globalAlpha = 1;

  // Ground line pulses on the beat
  var shipY = H - cell * 0.9;
  ctx.fillStyle = VK.rgba('green', 0.25 + flashT * 0.6);
  ctx.fillRect(0, shipY + cell * 0.4, W, Math.max(1, 1 + flashT * 2));

  var bob = A.silent ? Math.sin(G.bob * 1.5) * cell * 0.08 : 0;
  G.inv.forEach(function (v) {
    if (!v.alive) return;
    var p = invPos(v), grow = 1 + v.glow * 0.08;
    sprite(ctx, SPRITES[(v.r % 2) * 2 + G.frame], p.x + cell * 0.15 - cell * 0.35 * (grow - 1), p.y + bob, cell * 0.7 * grow, ROW_TONE[v.r % 4], v.glow);
  });
  if (G.ufo) {
    ctx.fillStyle = VK.c.red;
    ctx.beginPath(); ctx.ellipse(G.ufo.x, H * 0.07, cell * 0.55, cell * 0.2, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = VK.c.magenta;
    ctx.beginPath(); ctx.ellipse(G.ufo.x, H * 0.07 - cell * 0.14, cell * 0.25, cell * 0.16, 0, 0, 6.283); ctx.fill();
  }
  if (!(G.ship.inv > 0 && Math.sin(A.t * 30) > 0)) {
    ctx.fillStyle = VK.c.accent;
    ctx.beginPath();
    ctx.moveTo(G.ship.x, shipY - cell * 0.45);
    ctx.lineTo(G.ship.x + cell * 0.45, shipY + cell * 0.25);
    ctx.lineTo(G.ship.x - cell * 0.45, shipY + cell * 0.25);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = VK.c.text;
  G.shots.forEach(function (s) { ctx.fillRect(s.x - 1, s.y - cell * 0.3, 2, cell * 0.3); });
  ctx.fillStyle = VK.c.red;
  G.bombs.forEach(function (b) { ctx.fillRect(b.x - 1.5, b.y - cell * 0.25, 3, cell * 0.25); });
  ctx.globalCompositeOperation = VK.light ? 'source-over' : 'lighter';
  for (i = G.booms.length - 1; i >= 0; i--) {
    var bm = G.booms[i];
    bm.x += bm.vx * dt; bm.y += bm.vy * dt; bm.life -= dt;
    if (bm.life <= 0) { G.booms.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, bm.life * 1.6);
    ctx.fillStyle = VK.c[bm.tone];
    ctx.fillRect(bm.x, bm.y, bm.size, bm.size);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // HUD: score = beats, tempo, wave
  ctx.font = VK.font(Math.max(8, Math.min(12, cell * 0.38)));
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = VK.c.text;
  var hud = 'SCORE ' + ('000' + score).slice(-4) + '   HI ' + hi + (A.bpm ? '   ' + A.bpm + ' BPM' : '') + (W > 360 ? '   WAVE ' + G.wave : '');
  ctx.fillText(hud, 6, 6);

  if (A.silent) {
    if (Math.sin(A.t * 4) > -0.3) center(ctx, 'INSERT MUSIC ♪', W, H * 0.62, Math.max(10, Math.min(W / 18, H / 9)), 'accent', true);
    if (H > 120) center(ctx, '待機ゲーム WAITING ARCADE', W, H * 0.76, Math.max(8, Math.min(W / 32, H / 17)), 'dim', false);
  }
  VK.reset(ctx);
};

;(function () {
  var render = module.exports;
  module.exports = function (ctx, data, W, H) { render.apply(this, arguments); VK.hint(ctx, W, H); };
})();
