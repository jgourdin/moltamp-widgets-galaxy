// @moltamp-visualizer: Event Horizon ♪
// The Starship black hole, played by your music: the bass heats and spins the accretion disk, the mids swell the
// horizon, the highs make the photon ring sparkle and every beat releases a flash of Hawking radiation.
// Music version of the Event Horizon widget (Starship pack) of the MOLTamp Widgets Galaxy.
// Author: j0j0 · License: MIT · original GLSL (gravitational lensing by ray bending around a Schwarzschild mass).
// GPU preset: WebGL2 (or WebGL1) on an OffscreenCanvas inside the visualizer worker; the community repo asks for
// pure Canvas 2D presets, so this one is for local use only.

var RENDER_SCALE = 1.0;   // offscreen resolution relative to CSS pixels
var MAX_PIXELS = 300000;  // pixel budget (lowered automatically when frames get expensive)
var INCLINATION = 0.22;   // disk tilt in radians (0.05 = edge-on, 1.4 = seen from above)

var EH_FS_BODY = "uniform vec2 uRes;\nuniform float uTime, uClock, uRs, uIncl, uHalfH, uStarScale, uHeat, uBurst, uFlicker, uPulse, uWarn, uLight;\nuniform float uSpark;\nuniform vec3 uBg, uFg, uAccent, uMagenta, uCyan, uYellow, uRed, uHot, uShadow, uRing, uBurstCol;\n\nfloat hash13(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }\n\n// Trilinear value noise\nfloat noise3(vec3 p) {\n  vec3 i = floor(p), f = fract(p);\n  f = f * f * (3.0 - 2.0 * f);\n  float a = hash13(i), b = hash13(i + vec3(1.0, 0.0, 0.0)), c = hash13(i + vec3(0.0, 1.0, 0.0)), d = hash13(i + vec3(1.0, 1.0, 0.0));\n  float e = hash13(i + vec3(0.0, 0.0, 1.0)), g = hash13(i + vec3(1.0, 0.0, 1.0)), h = hash13(i + vec3(0.0, 1.0, 1.0)), k = hash13(i + vec3(1.0, 1.0, 1.0));\n  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);\n}\n\nfloat fbm3(vec3 p) {\n  float s = 0.0, amp = 0.5;\n  for (int i = 0; i < 4; i++) { s += amp * noise3(p); p = p * 2.07 + vec3(11.3, 7.1, 3.7); amp *= 0.5; }\n  return s;\n}\n\nvec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }\n\n// Lensed sky: a soft two-tone nebula and a star field sized in screen pixels.\nvec3 sky(vec3 d) {\n  float n = fbm3(d * 2.4 + vec3(0.0, 0.0, uTime * 0.004));\n  float m = noise3(d * 4.5 + 9.3);\n  float cloud = smoothstep(0.42, 0.85, n);\n  vec3 neb = mix(uMagenta, uCyan, smoothstep(0.35, 0.65, m)) * cloud;\n  vec3 c = d * uStarScale;\n  vec3 cell = floor(c);\n  vec3 f = fract(c) - 0.5;\n  float h = hash13(cell);\n  vec3 off = vec3(hash13(cell + 7.13), hash13(cell + 3.71), hash13(cell + 5.37)) - 0.5;\n  float dist = length(f - off * 0.6);\n  float tw = 0.65 + 0.35 * sin(uTime * (0.8 + 2.5 * h) + h * 50.0);\n  float star = step(0.86, h) * smoothstep(0.22, 0.0, dist) * tw * (0.5 + 1.5 * (h - 0.86) / 0.14);\n  if (uLight > 0.5) return mix(uBg, mix(uBg, uMagenta, 0.5), cloud * 0.25) + (uFg - uBg) * min(star, 1.0) * 0.55;\n  return uBg * 0.7 + neb * 0.32 + mix(uFg, uCyan, fract(h * 13.0)) * star;\n}\n\nfloat diskPattern(vec2 q, float r, float seed) {\n  float n = noise3(vec3(q * 0.8, seed)) * 0.55 + noise3(vec3(q * 2.1, seed + 7.0)) * 0.3 + noise3(vec3(q * 5.3, seed + 13.0)) * 0.15;\n  float bands = 0.65 + 0.35 * sin(r * 4.2 + n * 6.0);\n  return clamp(n * 1.6 - 0.25, 0.0, 1.0) * bands;\n}\n\n// Accretion disk in the y = 0 plane: premultiplied colour + coverage.\nvec4 disk(vec3 hit, vec3 vel) {\n  float r = length(hit.xz);\n  float rin = 3.0 * uRs, rout = 9.5;\n  if (r < rin * 0.85 || r > rout * 1.1) return vec4(0.0);\n  float edge = smoothstep(rin * 0.85, rin * 1.15, r) * (1.0 - smoothstep(rout * 0.7, rout * 1.1, r));\n  // Keplerian shear, kept bounded by cross-fading two phases of the flow.\n  float omega = 1.6 * pow(r / 3.0, -1.5);\n  float T = 6.0;\n  float c1 = uClock / T, c2 = c1 + 0.5;\n  float ph1 = fract(c1), ph2 = fract(c2);\n  float w1 = 1.0 - abs(2.0 * ph1 - 1.0);\n  float p1 = diskPattern(rot(hit.xz, -omega * ph1 * T), r, floor(c1) * 17.0);\n  float p2 = diskPattern(rot(hit.xz, -omega * ph2 * T), r, floor(c2) * 17.0 + 5.0);\n  float dens = mix(p2, p1, w1);\n  // Thin-disk temperature profile, Doppler beaming and gravitational redshift.\n  float x = rin / max(r, 1e-3);\n  float temp = pow(x, 0.75) * pow(max(1.0 - sqrt(x) * 0.98, 0.0), 0.25) * 1.9;\n  float beta = min(0.62, sqrt(uRs / max(2.0 * (r - uRs), 0.2)));\n  vec3 tang = normalize(vec3(-hit.z, 0.0, hit.x));\n  float cosT = dot(tang, -normalize(vel));\n  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * cosT);\n  float grav = sqrt(max(1.0 - uRs / r, 0.04));\n  float heat = temp * (0.55 + uHeat * 0.9) * pow(g * grav, 3.0);\n  float pulse = 1.0 - uPulse * 0.45 * (0.5 + 0.5 * sin(uTime * 2.4));\n  float I = heat * (0.25 + 0.75 * dens) * edge * pulse;\n  vec3 c = mix(uRed, uMagenta, smoothstep(0.05, 0.35, heat));\n  c = mix(c, uAccent, smoothstep(0.3, 0.75, heat));\n  c = mix(c, uYellow, smoothstep(0.7, 1.3, heat));\n  c = mix(c, uHot, smoothstep(1.3, 2.4, heat));\n  c = mix(c, uRed, uFlicker * 0.85);\n  float alpha = clamp(I * 1.2, 0.0, 0.92) * edge;\n  return vec4(uLight > 0.5 ? c * alpha : c * I, alpha);\n}\n\nvoid main() {\n  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;\n  vec3 cam = vec3(0.0, sin(uIncl), -cos(uIncl)) * 30.0;\n  vec3 fwd = -normalize(cam);\n  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));\n  vec3 up = cross(right, fwd);\n  vec3 v = normalize(fwd + (right * uv.x + up * uv.y) * (2.0 * uHalfH / 30.0));\n  vec3 p = cam;\n  vec3 hv = cross(p, v);\n  float h2 = dot(hv, hv);\n  vec4 acc = vec4(0.0);\n  float rmin = 1e4;\n  float fate = 0.0;\n  // Photon paths around a Schwarzschild mass: a = -1.5 rs h^2 p / r^5 (h = angular momentum).\n  for (int i = 0; i < 140; i++) {\n    float r = length(p);\n    rmin = min(rmin, r);\n    if (r < uRs) { fate = 2.0; break; }\n    if (r > 48.0 && dot(p, v) > 0.0) { fate = 1.0; break; }\n    if (acc.a > 0.97) { fate = 3.0; break; }\n    float dt = clamp((r - uRs) * 0.2, 0.025, 2.4);\n    v += -1.5 * uRs * h2 * p / (r * r * r * r * r) * dt;\n    vec3 pn = p + v * dt;\n    if (p.y * pn.y < 0.0) {\n      vec4 d = disk(mix(p, pn, p.y / (p.y - pn.y)), v);\n      acc.rgb += (1.0 - acc.a) * d.rgb;\n      acc.a += (1.0 - acc.a) * d.a;\n    }\n    p = pn;\n  }\n  vec3 back = fate == 1.0 ? sky(normalize(v)) : uShadow;\n  vec3 col = acc.rgb + (1.0 - acc.a) * back;\n  if (fate == 1.0) {\n    // Photon ring: rays that skimmed the photon sphere (1.5 rs) on their way out\n    float ring = exp(-pow((rmin - 1.5 * uRs) / (0.06 * uRs + 0.015), 2.0));\n    float shimmer = 0.6 + 0.4 * sin(uTime * 37.0 + atan(uv.y, uv.x) * 9.0);\n    col += ring * uRing * (0.55 + uWarn * 0.8 + uSpark * shimmer) * (1.0 - acc.a);\n    col += uWarn * uRed * exp(-max(rmin - 1.5 * uRs, 0.0) / (1.2 * uRs)) * 0.4 * (0.65 + 0.35 * sin(uTime * 2.2));\n  }\n  // Hawking burst after a compaction: an expanding ring and a flash\n  float q = length(uv) * 2.0 * uHalfH;\n  float R = 2.6 * uRs + uBurst * 10.0;\n  float wv = 0.25 + uBurst * 0.6;\n  col += uBurstCol * (exp(-pow((q - R) / wv, 2.0)) * exp(-uBurst * 0.9) * 1.2 + exp(-uBurst * 6.0) * 0.35);\n  if (uLight < 0.5) col = 1.0 - exp(-col * 1.5);\n  SET_COLOR(vec4(clamp(col, 0.0, 1.0), 1.0));\n}";

// ---------------------------------------------------------------- Event Horizon runtime (visualizer worker)
// The black-hole shader of the Starship widget, on a WebGL2 (or WebGL1) OffscreenCanvas blitted onto ctx.
// Music instead of Claude: bass heats and spins the accretion disk, mids swell the horizon, highs make the
// photon ring sparkle, every beat releases a Hawking-radiation flash. Silence leaves a calm, slowly turning hole.

var EH = null;
var EH_D = 30;
var EH_UNIFORMS = ['uRes', 'uTime', 'uClock', 'uRs', 'uIncl', 'uHalfH', 'uStarScale', 'uHeat', 'uBurst', 'uFlicker', 'uPulse', 'uWarn',
  'uLight', 'uSpark', 'uBg', 'uFg', 'uAccent', 'uMagenta', 'uCyan', 'uYellow', 'uRed', 'uHot', 'uShadow', 'uRing', 'uBurstCol'];
var EH_VS2 = '#version 300 es\nin vec2 aPos;\nvoid main() { gl_Position = vec4(aPos, 0.0, 1.0); }\n';
var EH_VS1 = 'attribute vec2 aPos;\nvoid main() { gl_Position = vec4(aPos, 0.0, 1.0); }\n';
var EH_FS_HEAD2 = '#version 300 es\nprecision highp float;\nout vec4 fragColor;\n#define SET_COLOR(c) fragColor = c\n';
var EH_FS_HEAD1 = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
  '#define SET_COLOR(c) gl_FragColor = c\n';
var EH_FALLBACK = { bg: [0.04, 0.03, 0.1], fg: [0.9, 0.88, 1], accent: [1, 0.44, 0.81], magenta: [0.73, 0.4, 1], cyan: [0.0, 0.8, 1],
  yellow: [1, 0.98, 0.59], red: [1, 0.36, 0.48] };

var ehSim = { rs: 0.85, heat: 0.3, clock: 0, burst: 99, spark: 0, t: 0, last: 0, bass: 0, mid: 0, high: 0, energy: 0,
  kick: 0, avg: 0, prev: 0, cool: 0, quiet: 0, quality: 1, cost: 0, lastAdjust: 0 };

function ehHex(v, fb) {
  if (typeof v !== 'string') return fb;
  var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (m) {
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v.trim());
  return m ? [+m[1] / 255, +m[2] / 255, +m[3] / 255] : fb;
}
function ehLum(v) { return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
function ehMix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
function ehMul(a, f) { return [a[0] * f, a[1] * f, a[2] * f]; }

function ehInit() {
  if (typeof OffscreenCanvas === 'undefined') return { error: 'OffscreenCanvas unavailable' };
  var canvas = new OffscreenCanvas(16, 16);
  var attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false };
  var gl = canvas.getContext('webgl2', attrs), v2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', attrs);
  if (!gl) return { error: 'WebGL unavailable in the visualizer worker' };
  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) return { error: String(gl.getShaderInfoLog(sh)).slice(0, 300) };
    return { sh: sh };
  }
  var vs = compile(gl.VERTEX_SHADER, v2 ? EH_VS2 : EH_VS1);
  var fs = compile(gl.FRAGMENT_SHADER, (v2 ? EH_FS_HEAD2 : EH_FS_HEAD1) + EH_FS_BODY);
  if (vs.error || fs.error) return { error: 'shader: ' + (vs.error || fs.error) };
  var prog = gl.createProgram();
  gl.attachShader(prog, vs.sh);
  gl.attachShader(prog, fs.sh);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) return { error: 'link: ' + String(gl.getProgramInfoLog(prog)).slice(0, 300) };
  var U = {};
  EH_UNIFORMS.forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return { gl: gl, canvas: canvas, prog: prog, U: U, buf: buf, api: v2 ? 'webgl2' : 'webgl' };
}

function ehBand(data, from, to) {
  var n = Math.min(to, data.length) - from;
  if (n <= 0) return 0;
  var s = 0;
  for (var i = from; i < from + n; i++) s += data[i];
  return s / (n * 255);
}

function ehUpdate(dt, data, beat) {
  var m = ehSim, d = data && data.length ? data : null;
  var bass = d ? ehBand(d, 1, 8) : 0, mid = d ? ehBand(d, 8, 40) : 0, high = d ? ehBand(d, 40, 110) : 0;
  var k = 1 - Math.exp(-dt / 0.15);
  m.bass += (bass - m.bass) * k;
  m.mid += (mid - m.mid) * k;
  m.high += (high - m.high) * (1 - Math.exp(-dt / 0.08));
  m.energy += (bass * 0.5 + mid * 0.35 + high * 0.15 - m.energy) * k;
  // Kick detector backing up MOLTamp's beat flag; the cooldown counts a hit flagged by both once.
  m.avg += (bass - m.avg) * (1 - Math.exp(-dt / 0.7));
  m.cool -= dt;
  var onset = bass > m.avg * 1.22 + 0.035 && bass - m.prev > 0.02;
  m.prev = bass;
  var hit = (onset || (beat && beat.isBeat)) && m.cool <= 0;
  if (hit) { m.kick = 1; m.cool = 0.2; m.burst = 0; }
  m.kick = Math.max(m.kick * Math.exp(-dt * 5.2), (beat && beat.decay) || 0);
  m.burst = Math.min(99, m.burst + dt);
  m.quiet = m.energy < 0.025 ? m.quiet + dt : 0;
  var silent = m.quiet > 1.5;
  var heatT = silent ? 0.25 : 0.3 + Math.min(1.2, m.bass * 1.3) + m.kick * 0.35;
  m.heat += (heatT - m.heat) * (1 - Math.exp(-dt / 0.35));
  var rsT = silent ? 0.85 : 0.72 + 0.8 * Math.min(1, m.mid * 1.7) + m.kick * 0.06;
  m.rs += (rsT - m.rs) * (1 - Math.exp(-dt / 0.5));
  m.spark = silent ? 0 : Math.min(1.4, m.high * 2.6);
  m.clock += dt * (0.25 + (silent ? 0 : m.bass * 1.6 + m.kick * 0.6));
  m.t = (m.t + dt) % 3600;
}

function ehMessage(ctx, W, H, colors, text) {
  ctx.fillStyle = (colors && colors.red) || '#ff5555';
  ctx.font = '11px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(String(text).slice(0, Math.max(10, Math.floor(W / 7))), 6, 6);
}

module.exports = function (ctx, data, W, H, colors, beat) {
  if (!(W > 0 && H > 0)) return;
  colors = colors || {};
  if (!EH) EH = ehInit();
  if (EH.error) { ehMessage(ctx, W, H, colors, 'Event Horizon: ' + EH.error); return; }
  var gl = EH.gl;
  // A lost context comes back as a fresh one: rebuild everything on the next frame.
  if (gl.isContextLost()) { EH = null; return; }

  var now = performance.now(), dt = ehSim.last ? Math.min((now - ehSim.last) / 1000, 0.1) : 1 / 60;
  ehSim.last = now;
  ehUpdate(dt, data, beat);

  // Offscreen resolution in CSS px: a pixel budget, lowered when our frames get expensive, won back when they are cheap.
  var budget = MAX_PIXELS * ehSim.quality, scale = RENDER_SCALE;
  if (W * H * scale * scale > budget) scale = Math.sqrt(budget / (W * H));
  var w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
  if (EH.canvas.width !== w || EH.canvas.height !== h) { EH.canvas.width = w; EH.canvas.height = h; }

  var bg = ehHex(colors.bg, EH_FALLBACK.bg), fg = ehHex(colors.termFg || colors.text, EH_FALLBACK.fg);
  var accent = ehHex(colors.accent, EH_FALLBACK.accent), magenta = ehHex(colors.magenta, EH_FALLBACK.magenta);
  var cyan = ehHex(colors.cyan, EH_FALLBACK.cyan), yellow = ehHex(colors.yellow, EH_FALLBACK.yellow), red = ehHex(colors.red, EH_FALLBACK.red);
  var light = ehLum(bg) > 0.5;
  var halfH = Math.max(Math.min(10.5 / (W / H), 13), 3.4 + ehSim.rs * 0.8);
  var U = EH.U;
  gl.viewport(0, 0, w, h);
  gl.useProgram(EH.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, EH.buf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(U.uRes, w, h);
  gl.uniform1f(U.uTime, ehSim.t);
  gl.uniform1f(U.uClock, ehSim.clock);
  gl.uniform1f(U.uRs, ehSim.rs);
  gl.uniform1f(U.uIncl, INCLINATION + 0.05 * Math.sin(ehSim.t * 0.07));
  gl.uniform1f(U.uHalfH, halfH);
  gl.uniform1f(U.uStarScale, 1 / ((2 * halfH / EH_D) / H * 5));
  gl.uniform1f(U.uHeat, ehSim.heat);
  gl.uniform1f(U.uBurst, ehSim.burst);
  gl.uniform1f(U.uFlicker, 0);
  gl.uniform1f(U.uPulse, 0);
  gl.uniform1f(U.uWarn, 0);
  gl.uniform1f(U.uLight, light ? 1 : 0);
  gl.uniform1f(U.uSpark, ehSim.spark);
  gl.uniform3fv(U.uBg, bg);
  gl.uniform3fv(U.uFg, fg);
  gl.uniform3fv(U.uAccent, accent);
  gl.uniform3fv(U.uMagenta, magenta);
  gl.uniform3fv(U.uCyan, cyan);
  gl.uniform3fv(U.uYellow, yellow);
  gl.uniform3fv(U.uRed, red);
  gl.uniform3fv(U.uHot, light ? ehMix(yellow, fg, 0.25) : [1, 0.96, 0.9]);
  gl.uniform3fv(U.uShadow, light ? ehMul(fg, 0.35) : ehMul(bg, 0.12));
  gl.uniform3fv(U.uRing, light ? ehMul(accent, 0.8) : ehMix(accent, yellow, 0.5));
  gl.uniform3fv(U.uBurstCol, light ? ehMul(cyan, 0.8) : cyan);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(EH.canvas, 0, 0, W, H);

  // The blit waits for the GPU, so this call's duration is the frame's cost.
  var cost = performance.now() - now;
  ehSim.cost = ehSim.cost ? ehSim.cost * 0.9 + cost * 0.1 : cost;
  if (now - ehSim.lastAdjust > 1000 && ehSim.cost > 14 && ehSim.quality > 0.3) { ehSim.quality = Math.max(0.3, ehSim.quality * 0.8); ehSim.lastAdjust = now; }
  else if (now - ehSim.lastAdjust > 4000 && ehSim.cost < 6 && ehSim.quality < 1) { ehSim.quality = Math.min(1, ehSim.quality * 1.1); ehSim.lastAdjust = now; }
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
