// @moltamp-visualizer: Open Ocean ♪
// Very fast procedural ocean — by afl_ext
// Original: https://www.shadertoy.com/view/MdXyzX
// License: MIT (afl_ext)
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
var MAX_PIXELS = 300000;      // pixel budget for wide vibes slots
var MUSIC_IDLE_RATE = 0.25; // clock speed in silence
var MUSIC_MIN_RATE = 0.55; // clock speed on quiet music
var MUSIC_MAX_RATE = 1.8; // clock speed at full energy
var MUSIC_KICK_RATE = 1.0; // extra speed right after a beat
var MUSIC_FLASH = 0.45; // exposure kick on a beat
var MUSIC_ZOOM = 0.02; // zoom kick on a beat (fraction of the frame)

var SHADER = {"title": "Very fast procedural ocean", "author": "afl_ext", "url": "https://www.shadertoy.com/view/MdXyzX", "common": "", "code": "// afl_ext 2017-2024\n// MIT License\n\n// Use your mouse to move the camera around! Press the Left Mouse Button on the image to look around!\n\n#define DRAG_MULT 0.38 // changes how much waves pull on the water\n#define WATER_DEPTH 1.0 // how deep is the water\n#define CAMERA_HEIGHT 1.5 // how high the camera should be\n#define ITERATIONS_RAYMARCH 12 // waves iterations of raymarching\n#define ITERATIONS_NORMAL 36 // waves iterations when calculating normals\n\n#define NormalizedMouse (iMouse.xy / iResolution.xy) // normalize mouse coords\n\n// Calculates wave value and its derivative, \n// for the wave direction, position in space, wave frequency and time\nvec2 wavedx(vec2 position, vec2 direction, float frequency, float timeshift) {\n  float x = dot(direction, position) * frequency + timeshift;\n  float wave = exp(sin(x) - 1.0);\n  float dx = wave * cos(x);\n  return vec2(wave, -dx);\n}\n\n// Calculates waves by summing octaves of various waves with various parameters\nfloat getwaves(vec2 position, int iterations) {\n  float wavePhaseShift = length(position) * 0.1; // this is to avoid every octave having exactly the same phase everywhere\n  float iter = 0.0; // this will help generating well distributed wave directions\n  float frequency = 1.0; // frequency of the wave, this will change every iteration\n  float timeMultiplier = 2.0; // time multiplier for the wave, this will change every iteration\n  float weight = 1.0;// weight in final sum for the wave, this will change every iteration\n  float sumOfValues = 0.0; // will store final sum of values\n  float sumOfWeights = 0.0; // will store final sum of weights\n  for(int i=0; i < iterations; i++) {\n    // generate some wave direction that looks kind of random\n    vec2 p = vec2(sin(iter), cos(iter));\n    \n    // calculate wave data\n    vec2 res = wavedx(position, p, frequency, iTime * timeMultiplier + wavePhaseShift);\n\n    // shift position around according to wave drag and derivative of the wave\n    position += p * res.y * weight * DRAG_MULT;\n\n    // add the results to sums\n    sumOfValues += res.x * weight;\n    sumOfWeights += weight;\n\n    // modify next octave ;\n    weight = mix(weight, 0.0, 0.2);\n    frequency *= 1.18;\n    timeMultiplier *= 1.07;\n\n    // add some kind of random value to make next wave look random too\n    iter += 1232.399963;\n  }\n  // calculate and return\n  return sumOfValues / sumOfWeights;\n}\n\n// Raymarches the ray from top water layer boundary to low water layer boundary\nfloat raymarchwater(vec3 camera, vec3 start, vec3 end, float depth) {\n  vec3 pos = start;\n  vec3 dir = normalize(end - start);\n  for(int i=0; i < 64; i++) {\n    // the height is from 0 to -depth\n    float height = getwaves(pos.xz, ITERATIONS_RAYMARCH) * depth - depth;\n    // if the waves height almost nearly matches the ray height, assume its a hit and return the hit distance\n    if(height + 0.01 > pos.y) {\n      return distance(pos, camera);\n    }\n    // iterate forwards according to the height mismatch\n    pos += dir * (pos.y - height);\n  }\n  // if hit was not registered, just assume hit the top layer, \n  // this makes the raymarching faster and looks better at higher distances\n  return distance(start, camera);\n}\n\n// Calculate normal at point by calculating the height at the pos and 2 additional points very close to pos\nvec3 normal(vec2 pos, float e, float depth) {\n  vec2 ex = vec2(e, 0);\n  float H = getwaves(pos.xy, ITERATIONS_NORMAL) * depth;\n  vec3 a = vec3(pos.x, H, pos.y);\n  return normalize(\n    cross(\n      a - vec3(pos.x - e, getwaves(pos.xy - ex.xy, ITERATIONS_NORMAL) * depth, pos.y), \n      a - vec3(pos.x, getwaves(pos.xy + ex.yx, ITERATIONS_NORMAL) * depth, pos.y + e)\n    )\n  );\n}\n\n// Helper function generating a rotation matrix around the axis by the angle\nmat3 createRotationMatrixAxisAngle(vec3 axis, float angle) {\n  float s = sin(angle);\n  float c = cos(angle);\n  float oc = 1.0 - c;\n  return mat3(\n    oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, \n    oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s, \n    oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c\n  );\n}\n\n// Helper function that generates camera ray based on UV and mouse\nvec3 getRay(vec2 fragCoord) {\n  vec2 uv = ((fragCoord.xy / iResolution.xy) * 2.0 - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);\n  // for fisheye, uncomment following line and comment the next one\n  //vec3 proj = normalize(vec3(uv.x, uv.y, 1.0) + vec3(uv.x, uv.y, -1.0) * pow(length(uv), 2.0) * 0.05);  \n  vec3 proj = normalize(vec3(uv.x, uv.y, 1.5));\n  if(iResolution.x < 600.0) {\n    return proj;\n  }\n  return createRotationMatrixAxisAngle(vec3(0.0, -1.0, 0.0), 3.0 * ((NormalizedMouse.x + 0.5) * 2.0 - 1.0)) \n    * createRotationMatrixAxisAngle(vec3(1.0, 0.0, 0.0), 0.5 + 1.5 * (((NormalizedMouse.y == 0.0 ? 0.27 : NormalizedMouse.y) * 1.0) * 2.0 - 1.0))\n    * proj;\n}\n\n// Ray-Plane intersection checker\nfloat intersectPlane(vec3 origin, vec3 direction, vec3 point, vec3 normal) { \n  return clamp(dot(point - origin, normal) / dot(direction, normal), -1.0, 9991999.0); \n}\n\n// Some very barebones but fast atmosphere approximation\nvec3 extra_cheap_atmosphere(vec3 raydir, vec3 sundir) {\n  //sundir.y = max(sundir.y, -0.07);\n  float special_trick = 1.0 / (raydir.y * 1.0 + 0.1);\n  float special_trick2 = 1.0 / (sundir.y * 11.0 + 1.0);\n  float raysundt = pow(abs(dot(sundir, raydir)), 2.0);\n  float sundt = pow(max(0.0, dot(sundir, raydir)), 8.0);\n  float mymie = sundt * special_trick * 0.2;\n  vec3 suncolor = mix(vec3(1.0), max(vec3(0.0), vec3(1.0) - vec3(5.5, 13.0, 22.4) / 22.4), special_trick2);\n  vec3 bluesky= vec3(5.5, 13.0, 22.4) / 22.4 * suncolor;\n  vec3 bluesky2 = max(vec3(0.0), bluesky - vec3(5.5, 13.0, 22.4) * 0.002 * (special_trick + -6.0 * sundir.y * sundir.y));\n  bluesky2 *= special_trick * (0.24 + raysundt * 0.24);\n  return bluesky2 * (1.0 + 1.0 * pow(1.0 - raydir.y, 3.0));\n} \n\n// Calculate where the sun should be, it will be moving around the sky\nvec3 getSunDirection() {\n  return normalize(vec3(-0.0773502691896258 , 0.5 + sin(iTime * 0.2 + 2.6) * 0.45 , 0.5773502691896258));\n}\n\n// Get atmosphere color for given direction\nvec3 getAtmosphere(vec3 dir) {\n   return extra_cheap_atmosphere(dir, getSunDirection()) * 0.5;\n}\n\n// Get sun color for given direction\nfloat getSun(vec3 dir) { \n  return pow(max(0.0, dot(dir, getSunDirection())), 720.0) * 210.0;\n}\n\n// Great tonemapping function from my other shader: https://www.shadertoy.com/view/XsGfWV\nvec3 aces_tonemap(vec3 color) {  \n  mat3 m1 = mat3(\n    0.59719, 0.07600, 0.02840,\n    0.35458, 0.90834, 0.13383,\n    0.04823, 0.01566, 0.83777\n  );\n  mat3 m2 = mat3(\n    1.60475, -0.10208, -0.00327,\n    -0.53108,  1.10813, -0.07276,\n    -0.07367, -0.00605,  1.07602\n  );\n  vec3 v = m1 * color;  \n  vec3 a = v * (v + 0.0245786) - 0.000090537;\n  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;\n  return pow(clamp(m2 * (a / b), 0.0, 1.0), vec3(1.0 / 2.2));  \n}\n\n// Main\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  // get the ray\n  vec3 ray = getRay(fragCoord);\n  if(ray.y >= 0.0) {\n    // if ray.y is positive, render the sky\n    vec3 C = getAtmosphere(ray) + getSun(ray);\n    fragColor = vec4(aces_tonemap(C * 2.0),1.0);   \n    return;\n  }\n\n  // now ray.y must be negative, water must be hit\n  // define water planes\n  vec3 waterPlaneHigh = vec3(0.0, 0.0, 0.0);\n  vec3 waterPlaneLow = vec3(0.0, -WATER_DEPTH, 0.0);\n\n  // define ray origin, moving around\n  vec3 origin = vec3(iTime * 0.2, CAMERA_HEIGHT, 1);\n\n  // calculate intersections and reconstruct positions\n  float highPlaneHit = intersectPlane(origin, ray, waterPlaneHigh, vec3(0.0, 1.0, 0.0));\n  float lowPlaneHit = intersectPlane(origin, ray, waterPlaneLow, vec3(0.0, 1.0, 0.0));\n  vec3 highHitPos = origin + ray * highPlaneHit;\n  vec3 lowHitPos = origin + ray * lowPlaneHit;\n\n  // raymatch water and reconstruct the hit pos\n  float dist = raymarchwater(origin, highHitPos, lowHitPos, WATER_DEPTH);\n  vec3 waterHitPos = origin + ray * dist;\n\n  // calculate normal at the hit position\n  vec3 N = normal(waterHitPos.xz, 0.01, WATER_DEPTH);\n\n  // smooth the normal with distance to avoid disturbing high frequency noise\n  N = mix(N, vec3(0.0, 1.0, 0.0), 0.8 * min(1.0, sqrt(dist*0.01) * 1.1));\n\n  // calculate fresnel coefficient\n  float fresnel = (0.04 + (1.0-0.04)*(pow(1.0 - max(0.0, dot(-N, ray)), 5.0)));\n\n  // reflect the ray and make sure it bounces up\n  vec3 R = normalize(reflect(ray, N));\n  R.y = abs(R.y);\n  \n  // calculate the reflection and approximate subsurface scattering\n  vec3 reflection = getAtmosphere(R) + getSun(R);\n  vec3 scattering = vec3(0.0293, 0.0698, 0.1717) * 0.1 * (0.2 + (waterHitPos.y + WATER_DEPTH) / WATER_DEPTH);\n\n  // return the combined result\n  vec3 C = fresnel * reflection + scattering;\n  fragColor = vec4(aces_tonemap(C * 2.0), 1.0);\n}", "inputs": []};

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
