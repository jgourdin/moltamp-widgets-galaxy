// @moltamp-visualizer: Artifakt Cubes ♪
// artifakt — by incre_ment
// Original: https://www.shadertoy.com/view/N3KGz3
// License: CC BY-NC-SA 3.0 (Shadertoy default)
// License text: https://creativecommons.org/licenses/by-nc-sa/3.0/
// GPU port: the original GLSL runs on a WebGL2 OffscreenCanvas inside the visualizer worker.
// Note: the community repo asks for pure Canvas 2D presets, so this one is for local use only.
// Changes from the original:
//   - Image: "#define AA 2.0" -> "#define AA 1.0"
//   - Colours remapped onto the skin palette (USE_SKIN_PALETTE)
//   - Music drive (this shader does not read audio): its clock speeds up with the bass and the
//     overall energy, never runs backwards and drifts in silence; every beat kicks the exposure
//     and a short zoom (MUSIC_* settings below)

var USE_SKIN_PALETTE = true;   // false = original shader colours
var PALETTE_MIX = 0.9;         // 0..1 blend between original colours and the skin ramp
var RENDER_SCALE = 1.0;        // offscreen resolution relative to CSS pixels
var MAX_PIXELS = 300000;      // pixel budget for wide vibes slots
var MUSIC_IDLE_RATE = 0.25; // clock speed in silence
var MUSIC_MIN_RATE = 0.55; // clock speed on quiet music
var MUSIC_MAX_RATE = 2.2; // clock speed at full energy
var MUSIC_KICK_RATE = 1.0; // extra speed right after a beat
var MUSIC_FLASH = 0.45; // exposure kick on a beat
var MUSIC_ZOOM = 0.035; // zoom kick on a beat (fraction of the frame)

var SHADER = {"title": "artifakt", "author": "incre_ment", "url": "https://www.shadertoy.com/view/N3KGz3", "common": "#define rotation(angle) mat2(cos(angle), -sin(angle), sin(angle), cos(angle))\n\nfloat PI = 3.14159256;\nfloat TAU = 2. * 3.14159256;\n\nfloat hash(vec2 p) {\n    p = fract(p * vec2(123.34, 456.21));\n    p += dot(p, p + 45.32);\n    return fract(p.x * p.y);\n}\n\nfloat hash3d(vec3 p) {\n    p = fract(p * vec3(123.34, 456.21, 789.12));\n    p += dot(p, p + 45.32);\n    return fract(p.x * p.y * p.z);\n}\n\n// Credit: IQ\nfloat sdLine(vec2 p, vec2 a, vec2 b) {\n    vec2 pa = p - a, ba = b - a;\n    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);\n    return length(pa - ba * h);\n}\n\n// Credit: IQ\nfloat sdBox(vec2 p, vec2 b) {\n    vec2 d = abs(p) - b;\n    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);\n}\n\n// Credit: IQ\n// https://iquilezles.org/articles/intersectors/\nvec2 boxIntersection( in vec3 ro, in vec3 rd, vec3 boxSize ) \n{\n    vec3 m = 1.0/rd;\n    vec3 n = m*ro;   \n    vec3 k = abs(m)*boxSize;\n    vec3 t1 = -n - k;\n    vec3 t2 = -n + k;\n    float tN = max( max( t1.x, t1.y ), t1.z );\n    float tF = min( min( t2.x, t2.y ), t2.z );\n    if( tN>tF || tF<0.0) return vec2(-1.0);\n    return vec2( tN, tF );\n}", "code": "const vec3 GRID_DIM = vec3(6.0, 6.0, 6.0);\nconst vec3 BOX_SIZE = vec3(1.0);\n\nbool isBlockSolid(vec3 cellID) {\n  float thresholdVal = 0.45;\n  return hash3d(cellID + vec3(18.1, 23.2, 52.3)) > thresholdVal;\n}\n\nfloat genGlyph(in vec2 p, in vec2 seed) {\n  // Random glyph attributes\n  float numArms = 2. + floor(3. * hash(seed));\n  float divisor = 1. + floor(4. * hash(seed + vec2(42.2, 942.1)));\n  float maxAng = TAU / divisor;\n  float armLength = clamp(.3 + .35 * hash(seed + vec2(12.8, 352.8)), 0., .35);\n  float boxSize = 0.1 + 0.15 * hash(seed + vec2(493.1, 72.7));\n  float rotAngle = (PI / 2.0) * floor(4.0 * hash(seed + vec2(81.1, 412.81)));\n  float numDot = 1.0 + floor(2.0 * hash(seed + vec2(53.1, 71.63)));\n  bool hasSquare = (hash(seed + vec2(824.2, 244.3)) > 0.5);\n\n  p *= rotation(rotAngle);\n\n  float angDelta = max(maxAng / max(numArms, 1.0), 0.001);\n\n  float minVal = 1E20;\n  for (float i = 0.; i <= maxAng + .001; i += angDelta) {\n    vec2 linePt1 = vec2(armLength * sin(i), armLength * cos(i));\n    minVal = min(minVal, sdLine(p, linePt1, vec2(0.)));\n  }\n\n  float circR = .75 * armLength;\n  for (float i = 0.; i <= numDot; i++) {\n    float circAng = maxAng + (i + 1.) * angDelta;\n    float circSDF = length(p - vec2(circR * sin(circAng), circR * cos(circAng)));\n    minVal = min(circSDF, minVal);\n  }\n\n  if (hasSquare) {\n    minVal = min(minVal, abs(sdBox(p, vec2(boxSize))));\n  }\n\n  return minVal;\n}\n\nvec3 renderScene(vec2 uv, float tt) {\n  vec3 col = vec3(0.);\n\n  float rotY = TAU * tt;\n  float rotX = .6 * sin(TAU * tt);\n\n  vec3 ro = vec3(0., 0., 7.0);\n  ro.yz *= rotation(rotX); \n  ro.xz *= rotation(rotY); \n    \n  vec3 target = vec3(0.);\n    \n  // Setup Camera Matrix\n  vec3 ww = normalize(target - ro); \n  vec3 uu = normalize(cross(vec3(0., 1., 0.), ww)); \n  vec3 vv = cross(ww, uu); \n  float FOVfac = 1.8;\n  vec3 rd = normalize(uv.x * uu + uv.y * vv + FOVfac * ww);\n    \n  // Ray Box intersection \n  vec2 boxHit = boxIntersection(ro, rd, BOX_SIZE);\n\n  // Start 3D DDA\n  if (boxHit.x > 0.) {\n    float tCurrent = max(boxHit.x + 0.0001, 0.0001);\n    vec3 pEntry = ro + tCurrent * rd;\n    vec3 gridP = (pEntry + BOX_SIZE) * 0.5 * GRID_DIM;\n    vec3 cellID = clamp(floor(gridP), vec3(0.), GRID_DIM - vec3(1.0));        \n    vec3 rayStep = sign(rd);\n    vec3 deltaT = abs(1.0 / (rd * 0.5 * GRID_DIM));       \n    vec3 cellBoundary = cellID + max(rayStep, 0.);\n    vec3 sideT = (cellBoundary - gridP) / (rd * 0.5 * GRID_DIM);\n\n    // Initial boundary normal check\n    vec3 absP = abs(pEntry);\n    float maxP = max(absP.x, max(absP.y, absP.z));\n    vec3 hitNormal = -sign(rd) * step(vec3(maxP), absP);\n\n    bool hit = false;\n    float totalT = tCurrent;\n    for (int i = 0; i < 18; i++) {\n      if (isBlockSolid(cellID)) {\n        hit = true;\n        break;\n      }\n\n      if (sideT.x < sideT.y) {\n        if (sideT.x < sideT.z) {\n          totalT = tCurrent + sideT.x;\n          sideT.x += deltaT.x;\n          cellID.x += rayStep.x;\n          hitNormal = vec3(-rayStep.x, 0., 0.);\n        } else {\n          totalT = tCurrent + sideT.z;\n          sideT.z += deltaT.z;\n          cellID.z += rayStep.z;\n          hitNormal = vec3(0., 0., -rayStep.z);\n        }\n      } else {\n        if (sideT.y < sideT.z) {\n          totalT = tCurrent + sideT.y;\n          sideT.y += deltaT.y;\n          cellID.y += rayStep.y;\n          hitNormal = vec3(0., -rayStep.y, 0.);\n        } else {\n          totalT = tCurrent + sideT.z;\n          sideT.z += deltaT.z;\n          cellID.z += rayStep.z;\n          hitNormal = vec3(0., 0., -rayStep.z);\n        }\n      }\n\n      if (any(lessThan(cellID, vec3(0.0))) || any(greaterThanEqual(cellID, GRID_DIM)))\n        break;    \n    }\n\n    if (hit) {\n      vec3 pHit = ro + totalT * rd;\n      vec3 cellSize = (BOX_SIZE * 2.) / GRID_DIM;\n      vec3 cellCenter = -BOX_SIZE + (cellID + .5) * cellSize;\n      vec3 localPos = (pHit - cellCenter) / (.5 * cellSize);\n\n      vec2 side = (abs(hitNormal.x) > .5) ? localPos.yz :\n                  (abs(hitNormal.y) > .5) ? localPos.xz : localPos.xy;\n\n      // Check interior facing status\n      vec3 nCell = cellID + hitNormal;\n      bool nInGrid = all(greaterThanEqual(nCell, vec3(0.))) && all(lessThan(nCell, GRID_DIM));\n      bool isInwardFacing = nInGrid && !isBlockSolid(nCell);\n\n      // Stroke width & box frame\n      float strokeWidth = .03 + .008 * totalT;\n      float frameSDF = abs(sdBox(side, vec2(.88))) - .02;\n      float frameLine = smoothstep(strokeWidth, .0, abs(frameSDF));\n      vec3 frameColor = vec3(1.) * frameLine * 1.2;\n\n      if (isInwardFacing) {\n        vec2 faceSeed = vec2(dot(cellID, vec3(1.12, 19.41, 71.5)), dot(hitNormal, vec3(13., 2., 16.)));\n        float dSign = abs(genGlyph(side * .55, faceSeed));\n        float glyphLine = smoothstep(strokeWidth, 0., dSign);\n        vec3 glyphCol = vec3(glyphLine * (1.8 + 1.5 * sin(6. * TAU * (tt + hash3d(cellID)))));\n        col = glyphCol + frameColor;\n      } else {\n        col = frameColor;\n      }\n    }\n  }\n  return col;\n}\n\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  vec3 accum = vec3(0.);\n  float tt = fract(0.1 * iTime);\n    \n  #define AA 1.0\n  for (int m = 0; m < int(AA); m++) {\n    for (int n = 0; n < int(AA); n++) {\n      vec2 offset = vec2(float(m), float(n)) / AA - .5;\n      vec2 uv = ((fragCoord + offset) - .5 * iResolution.xy) / iResolution.y;\n      accum += renderScene(uv, tt);\n    }\n  }\n  accum /= (AA * AA);\n  fragColor = vec4(accum, 1.);\n}", "inputs": []};

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
