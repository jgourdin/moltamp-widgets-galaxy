// @moltamp-visualizer: Mondrian Hexagons ♪
// Mondrian Hexagon Infinity — by DavidBraun
// Original: https://www.shadertoy.com/view/sXGGzV
// License: MIT (David Braun)
// GPU port: the original GLSL runs on a WebGL2 OffscreenCanvas inside the visualizer worker.
// Note: the community repo asks for pure Canvas 2D presets, so this one is for local use only.
// Changes from the original:
//   - Colours remapped onto the skin palette (USE_SKIN_PALETTE)
//   - Music drive (this shader does not read audio): its clock speeds up with the bass and the
//     overall energy, never runs backwards and drifts in silence; every beat kicks the exposure
//     and a short zoom (MUSIC_* settings below)

var USE_SKIN_PALETTE = true;   // false = original shader colours
var PALETTE_MIX = 0.9;         // 0..1 blend between original colours and the skin ramp
var RENDER_SCALE = 1.0;        // offscreen resolution relative to CSS pixels
var MAX_PIXELS = 400000;      // pixel budget for wide vibes slots
var MUSIC_IDLE_RATE = 0.25; // clock speed in silence
var MUSIC_MIN_RATE = 0.55; // clock speed on quiet music
var MUSIC_MAX_RATE = 2.2; // clock speed at full energy
var MUSIC_KICK_RATE = 1.0; // extra speed right after a beat
var MUSIC_FLASH = 0.45; // exposure kick on a beat
var MUSIC_ZOOM = 0.035; // zoom kick on a beat (fraction of the frame)

var SHADER = {"title": "Mondrian Hexagon Infinity", "author": "DavidBraun", "url": "https://www.shadertoy.com/view/sXGGzV", "common": "", "code": "// Mondrian Hexagon Infinity\n//\n// by David Braun, 2026\n//\n// MIT License\n//\n// Mondrian-influenced hexagons subdivide and merge while also infinitely approaching the camera.\n\n#define DEPTH   5.0      // levels of subdivision below the screen (2..5)\n#define DETAIL  0.0      // -1..1: fewer / more splits\n#define FLOW    1.0      // playback speed\n#define STEP    0.5      // seconds per depth step\n#define HOLD    4.1      // seconds latched on a target\n#define GLIDE   3.4      // seconds gliding to the next target\n#define HS      1.3      // on-screen size of the top level\n#define M       2048.0   // cell ids are kept modulo M (a power of two, see anchorFor)\n\nconst vec2  S = vec2(1.0, 1.7320508);\nconst float W = 0.5;     // share of a depth step each cell spends moving; the rest is stagger\n\n// ---------------------------------------------------------------- hex grid\nfloat hexDist(vec2 p) { p = abs(p); return max(dot(p, S * 0.5), p.x); }\nvec4 hexCoords(vec2 p) {                     // xy = offset from centre, zw = cell id\n  vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / S.xyxy) + 0.5;\n  vec4 h  = vec4(p - hC.xy * S, p - (hC.zw + 0.5) * S);\n  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);\n}\n\n// ---------------------------------------------------------------- noise\nfloat hash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }\nfloat vnoise2(vec2 x) {\n  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);\n  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);\n}\nfloat pnoise(vec2 x, float P, vec2 sd) {     // tiles every P cells\n  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);\n  vec2 i0 = mod(i, P), i1 = mod(i + 1.0, P);\n  return mix(mix(hash2(i0 + sd), hash2(vec2(i1.x, i0.y) + sd), f.x),\n             mix(hash2(vec2(i0.x, i1.y) + sd), hash2(i1 + sd), f.x), f.y);\n}\nfloat pfbm(vec2 q, vec2 sd) {                // tiles every 16 units, so wrapped ids stay seamless\n  q = mod(q, 16.0);\n  float v = 0.0, a = 0.5, P = 16.0;\n  for (int o = 0; o < 3; o++) { v += a * pnoise(q, P, sd + float(o) * 17.3); q *= 2.0; P *= 2.0; a *= 0.5; }\n  return v / 0.875;\n}\nvec2 epochSeed(float ep) { float e = mod(ep, 997.0); return vec2(hash2(vec2(e, 1.3)), hash2(vec2(e, 7.9))) * 173.0; }\n// target leaf depth for an epoch, relative to it, in [1, DEPTH + 1)\nfloat depthField(vec2 q, float ep) {\n  float f = pfbm(q, epochSeed(ep));\n  float m = smoothstep(0.0, 1.0, clamp((f - 0.3 + DETAIL * 0.12) / 0.4, 0.0, 1.0));\n  return 1.0 + DEPTH * m * 0.999;\n}\n\n// ---------------------------------------------------------------- camera, from iTime alone\n// The camera always sits on a point defined by a sequence of random hex steps, one per depth\n// (\"digits\"). Each new target shares every digit with the previous one down to a few levels\n// below the screen, then diverges, so gliding to it is a short, on-screen move.\nfloat epochLen() { return (2.0 * DEPTH + 2.0) * STEP; }\nfloat divDepth(float k) {                    // first digit where target k differs from target k-1\n  return k < 0.5 ? 0.0 : floor(((k - 1.0) * (HOLD + GLIDE) + HOLD) / epochLen()) + 3.0;\n}\nfloat owner(float j, float i) {              // which target's random draw decides digit j\n  float kc = max(0.0, floor(((j - 2.0) * epochLen() - HOLD) / (HOLD + GLIDE) + 1.0));\n  if (divDepth(kc) > j) kc -= 1.0;\n  if (divDepth(kc + 1.0) <= j) kc += 1.0;\n  return clamp(kc, 0.0, i);\n}\nvec2 digitJ(float j, float i) {              // a hex-lattice step, in id units (2 × centre)\n  float n = floor(hash2(vec2(owner(j, i) * 1.618 + 3.7, j * 0.731 + 9.1)) * 7.0);\n  if (n < 0.5) return vec2(0.0);\n  if (n < 1.5) return vec2( 2.0,  0.0);\n  if (n < 2.5) return vec2(-2.0,  0.0);\n  if (n < 3.5) return vec2( 1.0,  1.0);\n  if (n < 4.5) return vec2( 1.0, -1.0);\n  if (n < 5.5) return vec2(-1.0,  1.0);\n  return vec2(-1.0, -1.0);\n}\n// camera offset from the anchor cell, in lattice units one level above the screen\nvec2 camFor(float e, float i) {\n  vec2 c = vec2(0.0); float w = 0.5;\n  for (int n = 0; n < 22; n++) { vec2 J = digitJ(e + float(n), i); c += vec2(J.x * 0.5, J.y * 0.5 * S.y) * w; w *= 0.5; }\n  return c;\n}\n// the anchor cell's id modulo M: with M a power of two only the last 11 digits matter\nvec2 anchorFor(float e, float i) {\n  vec2 A = vec2(0.0); float w = 1.0;\n  for (int n = 1; n <= 11; n++) { float j = e - float(n); if (j < 0.0) break; A += digitJ(j, i) * w; w *= 2.0; }\n  return mod(A, M);\n}\n\n// ---------------------------------------------------------------- per-frame state\nfloat gEpoch, gU, gPhase, gF;\nvec2  gCam, gAnchor;\n\n// ---------------------------------------------------------------- drawing\nfloat lineW(float rd, float px) {            // weight by on-screen size, constant above one screen\n  float rc = mix(-1.0, rd, smoothstep(-1.0, 0.0, rd));\n  return max(0.0058 * pow(0.64, rc), 0.6 * px);\n}\nfloat wobAt(vec2 p1, float r) {              // hand-drawn wobble anchored to the world\n  vec2 pr = exp2(r + 1.0) * p1;\n  vec2 pos = mod(gAnchor * exp2(r + 1.0), M) * 0.5 + vec2(pr.x, pr.y / S.y);\n  return pnoise(mod(pos, 64.0) * 8.0, 512.0, vec2(3.1, 7.7)) - 0.5;\n}\nfloat paintTex(vec2 lr, float pxl, float periodPx, vec2 aniso, float key) {\n  float lf = log2(1.0 / (periodPx * pxl));   // grain stays a fixed size on screen\n  float fl = floor(lf), t = fract(lf), f0 = exp2(fl);\n  float a = vnoise2(lr * f0 * aniso + vec2(mod(fl, 32.0) * 7.1, key * 9.0));\n  float b = vnoise2(lr * f0 * 2.0 * aniso + vec2(mod(fl + 1.0, 32.0) * 7.1, key * 9.0));\n  return (mix(a, b, t) - 0.5) / sqrt(t * t + (1.0 - t) * (1.0 - t)) + 0.5;\n}\nvec3 mondrian(float key, vec2 local, float cls, float pc, float pxl) {\n  // whites: interleaved tones per colour class, picked at random, so neighbours differ\n  float tone = cls + 3.0 * floor(hash2(vec2(key, 8.3)) * 1.999);\n  vec3 c = mix(vec3(0.957, 0.941, 0.898), vec3(0.886, 0.876, 0.848), tone / 5.0);\n  if (cls < 0.5) {                           // one class of three may take a primary\n    float h = hash2(vec2(key, 4.7));\n    if (h < 0.07) c = vec3(0.09);\n    else if (h < 0.62) {\n      float pick = mod(floor(hash2(vec2(key * 91.3, 2.9)) * 3.0) + pc, 3.0);\n      c = pick < 0.5 ? vec3(0.788, 0.188, 0.173) : (pick < 1.5 ? vec3(0.122, 0.247, 0.580) : vec3(0.941, 0.769, 0.098));\n    }\n  }\n  vec2 bs = hash2(vec2(key, 2.3)) > 0.5 ? vec2(1.0, 0.2) : vec2(0.2, 1.0);\n  return c * (0.965 + 0.05 * paintTex(local, pxl, 5.0, bs, key));\n}\n\nvec3 render(vec2 uv) {\n  float px = 1.0 / iResolution.y, aa = px * 0.75;\n  float total1 = HS * exp2(-1.0 - gU);       // lattice units per screen unit, one level above the screen\n  vec2  p1 = gCam + uv * total1;\n  // start two levels higher still, so large hexagons' outlines are drawn until far off screen\n  vec2  Jr = mod(gAnchor, 8.0), anc = gAnchor - Jr;\n  vec2  p = (Jr * 0.5 * S + p1) * 0.25;\n  float total = total1 * 0.25, rStart = -3.0;\n\n  // one depth moves at a time: expand sweep top-down, then collapse sweep bottom-up\n  bool  expanding = gPhase < DEPTH + 0.5;\n  float rAct = expanding ? gPhase : 2.0 * DEPTH + 1.0 - gPhase;\n  float eo = 1.0, en = 1.0, eu = 1.0;        // capped depth chains: old, new, union\n\n  float wob = mix(wobAt(p1, 0.0), wobAt(p1, 1.0), gU) * 0.0016;\n  float ink = 0.0;\n  vec2  Ll = vec2(0.0), Laid = vec2(0.0);\n  float Lr = -1.0, Lcls = 0.0, Lpc = 0.0, prevCls = 0.0, Ltotal = total;\n  float kAnc = exp2(rStart + 1.0), kO = exp2(-rStart), kN = 2.0 * kO;\n\n  for (int i = 0; i < 10; i++) {\n    float r = float(i) + rStart;\n    if (r > DEPTH + 1.5) break;\n    float invT = 1.0 / total;\n    vec4  h = hexCoords(p);\n    vec2  c = h.zw * S, l = h.xy;\n    float hd = hexDist(l), edge = 0.5 - hd;\n    vec2  aid = mod(anc * kAnc + h.zw * 2.0, M);\n    vec2  ci = aid * 0.5;\n\n    float s;\n    if (r < -1.5) s = 1.0;\n    else if (r < -0.5) {\n      if (expanding) eo = min(depthField(ci * kO, gEpoch), 2.0);\n      en = 2.0; eu = 2.0; s = 1.0;\n    } else if (r < DEPTH + 0.5) {\n      bool deep = r > rAct + 0.5;            // below the active depth only one chain is read\n      float ho = (expanding || !deep) ? depthField(ci * kO, gEpoch) : 0.0;\n      float hn = (!expanding || !deep) ? 1.0 + depthField(ci * kN, gEpoch + 1.0) : 0.0;\n      eo = min(ho, eo + 1.0); en = min(hn, en + 1.0); eu = min(max(ho, hn), eu + 1.0);\n      float so = step(r + 1.0001, eo), sn = step(r + 1.0001, en), su = step(r + 1.0001, eu);\n      bool act = abs(r - rAct) < 0.5;\n      float a = 0.0;\n      if (act) {                             // stagger each cell's start by a smooth noise map\n        float sg = pfbm(ci * kN * 0.5, epochSeed(gEpoch + 1.0) + vec2(41.0, 59.0));\n        float d = clamp((sg - 0.22) / 0.56, 0.0, 1.0) * (1.0 - W);\n        a = smoothstep(d, d + W, gF);\n      }\n      if (expanding) s = act ? mix(so, su, a) : (r < rAct ? su : so);\n      else           s = act ? mix(su, sn, a) : (r > rAct ? sn : su);\n    } else s = 0.0;\n\n    float rd = r - gU;\n    float fade = smoothstep(-4.0, -3.0, rd); // only for hexagons many screens across\n    float w = lineW(rd, px);\n    ink = max(ink, (1.0 - smoothstep(w - aa, w + aa, edge * invT + wob)) * fade);\n\n    float cls = mod(aid.x, 3.0);             // proper 3-colouring of the hex lattice\n    Ll = l; Laid = aid; Lr = r; Lcls = cls; Lpc = prevCls; Ltotal = total;\n    prevCls = cls;\n    if (s < 0.01) break;\n\n    float dR0 = (s * 0.5 - hd) * invT;       // children grow out of the centre\n    if (s < 0.995) {\n      float wc = lineW(rd + 1.0, px);\n      ink = max(ink, (1.0 - smoothstep(wc - aa, wc + aa, abs(dR0 + wob))) * fade);\n      if (dR0 < 0.0) break;\n    }\n    float k = 2.0 / s;\n    total *= k; p = 2.0 * c + l * k;\n    kAnc *= 2.0; kO *= 0.5; kN *= 0.5;\n  }\n\n  float kd = mod(gEpoch + Lr, 89.0);\n  float key = hash2(Laid * 0.0731 + vec2(kd * 3.17, 1.9));\n  float cls = mod(Lcls + floor(hash2(vec2(kd, 4.4)) * 3.0), 3.0);   // palette rotates with depth\n  vec3 col = mondrian(key, Ll, cls, Lpc, px * Ltotal);\n  return mix(col, vec3(0.078), ink);\n}\n\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  float T = iTime * FLOW;\n  float zl = T / epochLen();\n  gEpoch = floor(zl); gU = zl - gEpoch;\n  float steps = 2.0 * DEPTH + 2.0;\n  gPhase = min(floor(gU * steps), steps - 1.0);\n  gF = min((gU * steps - gPhase) / 0.92, 1.0);\n\n  // latched on target c, or gliding from c to c + 1 (smoothstep)\n  float cyc = HOLD + GLIDE, c = floor(T / cyc), tau = T - c * cyc;\n  if (tau < HOLD) { gCam = camFor(gEpoch, c); gAnchor = anchorFor(gEpoch, c); }\n  else {\n    float k = smoothstep(0.0, 1.0, (tau - HOLD) / GLIDE);\n    gCam = mix(camFor(gEpoch, c), camFor(gEpoch, c + 1.0), k);\n    gAnchor = anchorFor(gEpoch, c + 1.0);\n  }\n\n  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;\n  vec3 col = render(uv);\n  col *= 0.975 + 0.04 * vnoise2(uv * 600.0);                        // paper grain\n  vec2 suv = fragCoord / iResolution.xy - 0.5;\n  col *= 1.0 - 0.14 * dot(suv, suv);\n  col += (hash2(fragCoord) - 0.5) / 255.0;\n  fragColor = vec4(col, 1.0);\n}\n", "inputs": []};

// ---------------------------------------------------------------- music drive (music versions of the shader widgets)
// These shaders never read audio: the music bends their clock instead. Bass and overall energy speed it up,
// it never runs backwards, silence slows it to a drift, and every beat kicks the exposure and a short zoom.
// MOLTamp's beat flag is backed by a kick detector (a bass hit clearly above its recent average, rising).

var stMus = { time: 0, energy: 0, bass: 0, kick: 0, avg: 0, prev: 0, cool: 0, quiet: 0, flash: 0, zoom: 0 };

function stMusBand(data, from, to) {
  var n = Math.min(to, data.length) - from;
  if (n <= 0) return 0;
  var s = 0;
  for (var i = from; i < from + n; i++) s += data[i];
  return s / (n * 255);
}

function stMusicClock(dt, data, beat) {
  var m = stMus, d = data && data.length ? data : null;
  var bass = d ? stMusBand(d, 1, 8) : 0, mid = d ? stMusBand(d, 8, 40) : 0, high = d ? stMusBand(d, 40, 110) : 0;
  var k = 1 - Math.exp(-dt / 0.15);
  m.bass += (bass - m.bass) * k;
  m.energy += (bass * 0.5 + mid * 0.35 + high * 0.15 - m.energy) * k;
  m.avg += (bass - m.avg) * (1 - Math.exp(-dt / 0.7));
  m.cool -= dt;
  var onset = bass > m.avg * 1.22 + 0.035 && bass - m.prev > 0.02;
  m.prev = bass;
  // MOLTamp's flag and ours often fire on the same hit: the cooldown counts it once.
  if ((onset || (beat && beat.isBeat)) && m.cool <= 0) { m.kick = 1; m.cool = 0.2; }
  m.kick = Math.max(m.kick * Math.exp(-dt * 5.2), (beat && beat.decay) || 0);
  m.quiet = m.energy < 0.025 ? m.quiet + dt : 0;
  var drive = Math.min(1, Math.pow(Math.max(0, m.energy * 1.6 + m.bass * 0.4), 0.85));
  var rate = m.quiet > 1.5 ? MUSIC_IDLE_RATE : MUSIC_MIN_RATE + (MUSIC_MAX_RATE - MUSIC_MIN_RATE) * drive + m.kick * MUSIC_KICK_RATE;
  m.time += dt * Math.max(0, rate);
  m.flash = m.kick * MUSIC_FLASH;
  m.zoom = m.kick * MUSIC_ZOOM;
  return m.time;
}

// ---------------------------------------------------------------- GPU runtime (shadertoy-runner, visualizer flavour)
// Compiles the Shadertoy GLSL on a WebGL2 OffscreenCanvas inside the visualizer worker and blits it onto ctx.
// MOLTamp's 128-bin FFT and waveform are resampled into Shadertoy's 512x2 audio texture (row 0 FFT, row 1 wave).

var st = null;
var AUDIO_W = 512;

function stPrng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stHexToVec(hex, fallback) {
  if (typeof hex !== 'string') return fallback;
  var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  var h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

function stInit() {
  if (typeof OffscreenCanvas === 'undefined') return { error: 'OffscreenCanvas unavailable' };
  var canvas = new OffscreenCanvas(16, 16);
  var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false });
  if (!gl) return { error: 'WebGL2 unavailable in the visualizer worker' };
  var parallel = gl.getExtension('KHR_parallel_shader_compile');

  var header = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n' +
    '#define HW_PERFORMANCE 1\n' +
    'uniform vec3 iResolution;\nuniform float iTime;\nuniform float iTimeDelta;\nuniform float iFrameRate;\nuniform int iFrame;\n' +
    'uniform float iChannelTime[4];\nuniform vec3 iChannelResolution[4];\nuniform vec4 iMouse;\nuniform vec4 iDate;\nuniform float iSampleRate;\n' +
    'uniform sampler2D iChannel0;\nuniform sampler2D iChannel1;\nuniform sampler2D iChannel2;\nuniform sampler2D iChannel3;\n' +
    'uniform vec3 stPal[5];\nuniform float stMix;\nuniform float stBeat;\nuniform float stZoom;\nout vec4 st_FragColor;\n';
  // Skin remap: luminance of the shader colour walks a 5-stop ramp built from the skin palette.
  var footer = '\nvec3 stSkin(vec3 c) {\n  float l = clamp(dot(clamp(c, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0) * 4.0;\n' +
    '  vec3 r = mix(stPal[0], stPal[1], clamp(l, 0.0, 1.0));\n  r = mix(r, stPal[2], clamp(l - 1.0, 0.0, 1.0));\n' +
    '  r = mix(r, stPal[3], clamp(l - 2.0, 0.0, 1.0));\n  r = mix(r, stPal[4], clamp(l - 3.0, 0.0, 1.0));\n  return r;\n}\n' +
    'void main() {\n  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);\n  mainImage(c, (gl_FragCoord.xy - 0.5 * iResolution.xy) / (1.0 + stZoom) + 0.5 * iResolution.xy);\n' +
    '  c.rgb = mix(c.rgb, stSkin(c.rgb), stMix) * (1.0 + stBeat);\n  st_FragColor = vec4(c.rgb, 1.0);\n}\n';

  var vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, '#version 300 es\nlayout(location = 0) in vec2 pos;\nvoid main() { gl_Position = vec4(pos, 0.0, 1.0); }\n');
  gl.compileShader(vs);
  var fs = gl.createShader(gl.FRAGMENT_SHADER);
  var head = header + (SHADER.common ? SHADER.common + '\n' : '');
  gl.shaderSource(fs, head + SHADER.code + footer);
  gl.compileShader(fs);
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'pos');
  gl.linkProgram(prog);

  var vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  return {
    gl: gl, canvas: canvas, prog: prog, fs: fs, parallel: parallel, lineOffset: head.split('\n').length - 1,
    linked: false, t0: performance.now(), last: 0, frame: 0, fps: 60,
    audio: new Uint8Array(AUDIO_W * 2), chans: [], u: null, pal: new Float32Array(15), chanTime: new Float32Array(4)
  };
}

function stTexture(gl, w, h, data, filter, wrap) {
  var t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (data && data.length === w * h) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  if (filter === 'mipmap') gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter === 'mipmap' ? gl.LINEAR_MIPMAP_LINEAR : filter === 'nearest' ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === 'nearest' ? gl.NEAREST : gl.LINEAR);
  var wr = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
  return t;
}

function stLink(s) {
  var gl = s.gl;
  if (!gl.getProgramParameter(s.prog, gl.LINK_STATUS)) {
    var log = (gl.getShaderInfoLog(s.fs) || gl.getProgramInfoLog(s.prog) || 'link failed')
      .replace(/ERROR: 0:(\d+)/g, function (_, n) { return 'line ' + (Number(n) - s.lineOffset); });
    s.error = log.slice(0, 300);
    return;
  }
  s.u = {};
  ['iResolution', 'iTime', 'iTimeDelta', 'iFrameRate', 'iFrame', 'iMouse', 'iDate', 'iSampleRate', 'iChannelTime',
    'iChannelResolution', 'stPal', 'stMix', 'stBeat', 'stZoom'].forEach(function (n) { s.u[n] = gl.getUniformLocation(s.prog, n); });
  s.u.ch = [0, 1, 2, 3].map(function (c) { return gl.getUniformLocation(s.prog, 'iChannel' + c); });
  s.chanRes = new Float32Array(12);
  (SHADER.inputs || []).forEach(function (inp) {
    var tex, w, h;
    if (inp.kind === 'audio') {
      w = AUDIO_W; h = 2;
      tex = stTexture(gl, w, h, s.audio, 'linear', 'clamp');
      s.audioTex = tex;
    } else {
      w = h = inp.size || 256;
      var rnd = stPrng(inp.seed || 1), d = new Uint8Array(w * h * 4);
      for (var i = 0; i < d.length; i++) d[i] = (rnd() * 256) | 0;
      if (inp.gen === 'gray') for (i = 0; i < w * h; i++) d[i * 4 + 1] = d[i * 4 + 2] = d[i * 4 + 3] = d[i * 4];
      tex = stTexture(gl, w, h, d, inp.filter, inp.wrap);
    }
    s.chans[inp.channel] = tex;
    s.chanRes[inp.channel * 3] = w; s.chanRes[inp.channel * 3 + 1] = h; s.chanRes[inp.channel * 3 + 2] = 1;
  });
  s.linked = true;
}

function stFillAudio(s, data, waveData) {
  var a = s.audio, n = data ? data.length : 0, m = waveData ? waveData.length : 0;
  for (var i = 0; i < AUDIO_W; i++) {
    var f = n ? (i / AUDIO_W) * (n - 1) : 0, k = f | 0, t = f - k;
    a[i] = n ? (data[k] + ((data[Math.min(n - 1, k + 1)] - data[k]) * t)) | 0 : 0;
    var g = m ? (i / AUDIO_W) * (m - 1) : 0, j = g | 0, u = g - j;
    a[AUDIO_W + i] = m ? (waveData[j] + ((waveData[Math.min(m - 1, j + 1)] - waveData[j]) * u)) | 0 : 128;
  }
}

function stDrawMessage(ctx, W, H, colors, text) {
  ctx.fillStyle = colors.red || '#ff5555';
  ctx.font = '11px monospace';
  ctx.textBaseline = 'top';
  var words = String(text).split(/\s+/), line = '', y = 6;
  for (var i = 0; i < words.length && y < H - 12; i++) {
    var test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > W - 12 && line) { ctx.fillText(line, 6, y); y += 13; line = words[i]; }
    else line = test;
  }
  if (line && y < H - 12) ctx.fillText(line, 6, y);
}

// Ramp stops: skin colours sorted by luminance (skins differ a lot, e.g. "text" is dark red in Lunar),
// always starting from the panel background.
var RAMP_NAMES = ['blue', 'magenta', 'cyan', 'accent', 'yellow', 'green', 'termFg', 'text'];
var RAMP_FALLBACK = { bg: [0.05, 0.05, 0.08], blue: [0.2, 0.35, 0.9], magenta: [0.8, 0.2, 0.7], cyan: [0.2, 0.85, 0.9],
  accent: [0.95, 0.65, 0.2], yellow: [0.95, 0.9, 0.4], green: [0.3, 0.8, 0.4], termFg: [0.9, 0.9, 0.9], text: [0.85, 0.85, 0.85] };
var rampSig = '';

function stLum(v) { return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }

function stUpdatePalette(colors, out) {
  var sig = RAMP_NAMES.map(function (k) { return colors[k]; }).join('|') + '|' + colors.bg;
  if (sig === rampSig) return;
  rampSig = sig;
  var cand = RAMP_NAMES.map(function (k) { return stHexToVec(colors[k], RAMP_FALLBACK[k]); });
  cand.sort(function (a, b) { return stLum(a) - stLum(b); });
  var bg = stHexToVec(colors.bg, RAMP_FALLBACK.bg), n = cand.length;
  var picks = [bg, cand[Math.round((n - 1) * 0.25)], cand[Math.round((n - 1) * 0.5)], cand[Math.round((n - 1) * 0.75)], cand[n - 1]];
  for (var i = 0; i < 5; i++) { out[i * 3] = picks[i][0]; out[i * 3 + 1] = picks[i][1]; out[i * 3 + 2] = picks[i][2]; }
}

module.exports = function (ctx, data, W, H, colors, beat, waveData) {
  if (!st) st = stInit();
  if (st.error) { stDrawMessage(ctx, W, H, colors, SHADER.title + ': ' + st.error); return; }
  var gl = st.gl;
  if (!st.linked) {
    if (st.parallel && !gl.getProgramParameter(st.prog, st.parallel.COMPLETION_STATUS_KHR)) return;
    stLink(st);
    if (st.error) return;
  }

  var now = performance.now(), dt = st.last ? Math.min((now - st.last) / 1000, 0.1) : 1 / 60;
  st.last = now;
  st.fps = st.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;

  // Offscreen resolution in CSS px, capped by a pixel budget for wide vibes slots.
  var scale = RENDER_SCALE, px = W * H * scale * scale;
  if (px > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (W * H));
  var w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
  if (st.canvas.width !== w || st.canvas.height !== h) { st.canvas.width = w; st.canvas.height = h; }

  if (st.audioTex) {
    stFillAudio(st, data, waveData);
    gl.bindTexture(gl.TEXTURE_2D, st.audioTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, AUDIO_W, 2, gl.RED, gl.UNSIGNED_BYTE, st.audio);
  }
  stUpdatePalette(colors || {}, st.pal);

  var time = stMusicClock(dt, data, beat), date = new Date();
  gl.viewport(0, 0, w, h);
  gl.useProgram(st.prog);
  for (var c = 0; c < 4; c++) {
    gl.activeTexture(gl.TEXTURE0 + c);
    gl.bindTexture(gl.TEXTURE_2D, st.chans[c] || null);
    gl.uniform1i(st.u.ch[c], c);
  }
  gl.uniform3f(st.u.iResolution, w, h, 1);
  gl.uniform1f(st.u.iTime, time);
  gl.uniform1f(st.u.iTimeDelta, dt);
  gl.uniform1f(st.u.iFrameRate, st.fps);
  gl.uniform1i(st.u.iFrame, st.frame++);
  gl.uniform4f(st.u.iMouse, 0, 0, 0, 0);
  gl.uniform4f(st.u.iDate, date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds());
  gl.uniform1f(st.u.iSampleRate, 44100);
  st.chanTime[0] = st.chanTime[1] = st.chanTime[2] = st.chanTime[3] = time;
  if (st.u.iChannelTime) gl.uniform1fv(st.u.iChannelTime, st.chanTime);
  if (st.u.iChannelResolution) gl.uniform3fv(st.u.iChannelResolution, st.chanRes);
  gl.uniform3fv(st.u.stPal, st.pal);
  gl.uniform1f(st.u.stMix, USE_SKIN_PALETTE ? PALETTE_MIX : 0);
  gl.uniform1f(st.u.stBeat, stMus.flash);
  if (st.u.stZoom) gl.uniform1f(st.u.stZoom, stMus.zoom);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // "both" presets are not auto-cleared; the blit covers the whole canvas anyway.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(st.canvas, 0, 0, W, H);
};

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
