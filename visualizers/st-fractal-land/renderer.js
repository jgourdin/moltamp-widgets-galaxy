// @moltamp-visualizer: Fractal Land
// Fractal Land — by Kali
// Original: https://www.shadertoy.com/view/XsBXWt
// License: CC BY-NC-SA 3.0 (Shadertoy default)
// License text: https://creativecommons.org/licenses/by-nc-sa/3.0/
// GPU port: the original GLSL runs on a WebGL2 OffscreenCanvas inside the visualizer worker.
// Note: the community repo asks for pure Canvas 2D presets, so this one is for local use only.
// Changes from the original:
//   - Image: "#define NYAN" -> "// #define NYAN  (sprite texture not bundled)"
//   - ch0: music -> MOLTamp system audio (FFT 128 + waveform, resampled to 512x2)
//   - ch1: Nyan Cat sprite -> unused (NYAN disabled)
//   - Sound pass dropped
//   - Colours remapped onto the skin palette (USE_SKIN_PALETTE), exposure pulses with beat.decay

var USE_SKIN_PALETTE = true;   // false = original shader colours
var PALETTE_MIX = 0.9;         // 0..1 blend between original colours and the skin ramp
var RENDER_SCALE = 1.0;        // offscreen resolution relative to CSS pixels
var MAX_PIXELS = 250000;      // pixel budget for wide vibes slots

var SHADER = {"title": "Fractal Land", "author": "Kali", "url": "https://www.shadertoy.com/view/XsBXWt", "common": "", "code": "// \"Fractal Cartoon\" - former \"DE edge detection\" by Kali\n\n// There are no lights and no AO, only color by normals and dark edges.\n\n// update: Nyan Cat cameo, thanks to code from mu6k: https://www.shadertoy.com/view/4dXGWH\n\n\n//#define SHOWONLYEDGES\n// #define NYAN  (sprite texture not bundled) \n#define WAVES\n#define BORDER\n\n#define RAY_STEPS 150\n\n#define BRIGHTNESS 1.2\n#define GAMMA 1.4\n#define SATURATION .65\n\n\n#define detail .001\n#define t iTime*.5\n\n\nconst vec3 origin=vec3(-1.,.7,0.);\nfloat det=0.0;\n\n\n// 2D rotation function\nmat2 rot(float a) {\n\treturn mat2(cos(a),sin(a),-sin(a),cos(a));\t\n}\n\n// \"Amazing Surface\" fractal\nvec4 formula(vec4 p) {\n\t\tp.xz = abs(p.xz+1.)-abs(p.xz-1.)-p.xz;\n\t\tp.y-=.25;\n\t\tp.xy*=rot(radians(35.));\n\t\tp=p*2./clamp(dot(p.xyz,p.xyz),.2,1.);\n\treturn p;\n}\n\n// Distance function\nfloat de(vec3 pos) {\n#ifdef WAVES\n\tpos.y+=sin(pos.z-t*6.)*.15; //waves!\n#endif\n\tfloat hid=0.;\n\tvec3 tpos=pos;\n\ttpos.z=abs(3.-mod(tpos.z,6.));\n\tvec4 p=vec4(tpos,1.);\n\tfor (int i=0; i<4; i++) {p=formula(p);}\n\tfloat fr=(length(max(vec2(0.),p.yz-1.5))-1.)/p.w;\n\tfloat ro=max(abs(pos.x+1.)-.3,pos.y-.35);\n\t\t  ro=max(ro,-max(abs(pos.x+1.)-.1,pos.y-.5));\n\tpos.z=abs(.25-mod(pos.z,.5));\n\t\t  ro=max(ro,-max(abs(pos.z)-.2,pos.y-.3));\n\t\t  ro=max(ro,-max(abs(pos.z)-.01,-pos.y+.32));\n\tfloat d=min(fr,ro);\n\treturn d;\n}\n\n\n// Camera path\nvec3 path(float ti) {\n\tti*=1.5;\n\tvec3  p=vec3(sin(ti),(1.-sin(ti*2.))*.5,-ti*5.)*.5;\n\treturn p;\n}\n\n// Calc normals, and here is edge detection, set to variable \"edge\"\n\nfloat edge=0.;\nvec3 normal(vec3 p) { \n\tvec3 e = vec3(0.0,det*5.,0.0);\n\n\tfloat d1=de(p-e.yxx),d2=de(p+e.yxx);\n\tfloat d3=de(p-e.xyx),d4=de(p+e.xyx);\n\tfloat d5=de(p-e.xxy),d6=de(p+e.xxy);\n\tfloat d=de(p);\n\tedge=abs(d-0.5*(d2+d1))+abs(d-0.5*(d4+d3))+abs(d-0.5*(d6+d5));//edge finder\n\tedge=min(1.,pow(edge,.55)*15.);\n\treturn normalize(vec3(d1-d2,d3-d4,d5-d6));\n}\n\n\n// Used Nyan Cat code by mu6k, with some mods\n\nvec4 rainbow(vec2 p)\n{\n\tfloat q = max(p.x,-0.1);\n\tfloat s = sin(p.x*7.0+t*70.0)*0.08;\n\tp.y+=s;\n\tp.y*=1.1;\n\t\n\tvec4 c;\n\tif (p.x>0.0) c=vec4(0,0,0,0); else\n\tif (0.0/6.0<p.y&&p.y<1.0/6.0) c= vec4(255,43,14,255)/255.0; else\n\tif (1.0/6.0<p.y&&p.y<2.0/6.0) c= vec4(255,168,6,255)/255.0; else\n\tif (2.0/6.0<p.y&&p.y<3.0/6.0) c= vec4(255,244,0,255)/255.0; else\n\tif (3.0/6.0<p.y&&p.y<4.0/6.0) c= vec4(51,234,5,255)/255.0; else\n\tif (4.0/6.0<p.y&&p.y<5.0/6.0) c= vec4(8,163,255,255)/255.0; else\n\tif (5.0/6.0<p.y&&p.y<6.0/6.0) c= vec4(122,85,255,255)/255.0; else\n\tif (abs(p.y)-.05<0.0001) c=vec4(0.,0.,0.,1.); else\n\tif (abs(p.y-1.)-.05<0.0001) c=vec4(0.,0.,0.,1.); else\n\t\tc=vec4(0,0,0,0);\n\tc.a*=.8-min(.8,abs(p.x*.08));\n\tc.xyz=mix(c.xyz,vec3(length(c.xyz)),.15);\n\treturn c;\n}\n\nvec4 nyan(vec2 p)\n{\n\tvec2 uv = p*vec2(0.4,1.0);\n\tfloat ns=3.0;\n\tfloat nt = iTime*ns; nt-=mod(nt,240.0/256.0/6.0); nt = mod(nt,240.0/256.0);\n\tfloat ny = mod(iTime*ns,1.0); ny-=mod(ny,0.75); ny*=-0.05;\n\tvec4 color = texture(iChannel1,vec2(uv.x/3.0+210.0/256.0-nt+0.05,1.-.5+uv.y+ny));\n\tif (uv.x<-0.3) color.a = 0.0;\n\tif (uv.x>0.2) color.a=0.0;\n\tif (uv.y>.3) color.a=0.0;\n\tif (uv.y<-.3) color.a=0.0;\n\treturn color;\n}\n\n\n// Raymarching and 2D graphics\n\nvec3 raymarch(in vec3 from, in vec3 dir) \n\n{\n\tedge=0.;\n\tvec3 p, norm;\n\tfloat d=100.;\n\tfloat totdist=0.;\n\tfor (int i=0; i<RAY_STEPS; i++) {\n\t\tif (d>det && totdist<25.0) {\n\t\t\tp=from+totdist*dir;\n\t\t\td=de(p);\n\t\t\tdet=detail*exp(.13*totdist);\n\t\t\ttotdist+=d; \n\t\t}\n\t}\n\tvec3 col=vec3(0.);\n\tp-=(det-d)*dir;\n\tnorm=normal(p);\n#ifdef SHOWONLYEDGES\n\tcol=1.-vec3(edge); // show wireframe version\n#else\n\tcol=(1.-abs(norm))*max(0.,1.-edge*.8); // set normal as color with dark edges\n#endif\t\t\n\ttotdist=clamp(totdist,0.,26.);\n\tdir.y-=.02;\n\tfloat sunsize=7.-max(0.,texture(iChannel0,vec2(.6,.2)).x)*5.; // responsive sun size\n\tfloat an=atan(dir.x,dir.y)+iTime*1.5; // angle for drawing and rotating sun\n\tfloat s=pow(clamp(1.0-length(dir.xy)*sunsize-abs(.2-mod(an,.4)),0.,1.),.1); // sun\n\tfloat sb=pow(clamp(1.0-length(dir.xy)*(sunsize-.2)-abs(.2-mod(an,.4)),0.,1.),.1); // sun border\n\tfloat sg=pow(clamp(1.0-length(dir.xy)*(sunsize-4.5)-.5*abs(.2-mod(an,.4)),0.,1.),3.); // sun rays\n\tfloat y=mix(.45,1.2,pow(smoothstep(0.,1.,.75-dir.y),2.))*(1.-sb*.5); // gradient sky\n\t\n\t// set up background with sky and sun\n\tvec3 backg=vec3(0.5,0.,1.)*((1.-s)*(1.-sg)*y+(1.-sb)*sg*vec3(1.,.8,0.15)*3.);\n\t\t backg+=vec3(1.,.9,.1)*s;\n\t\t backg=max(backg,sg*vec3(1.,.9,.5));\n\t\n\tcol=mix(vec3(1.,.9,.3),col,exp(-.004*totdist*totdist));// distant fading to sun color\n\tif (totdist>25.) col=backg; // hit background\n\tcol=pow(col,vec3(GAMMA))*BRIGHTNESS;\n\tcol=mix(vec3(length(col)),col,SATURATION);\n#ifdef SHOWONLYEDGES\n\tcol=1.-vec3(length(col));\n#else\n\tcol*=vec3(1.,.9,.85);\n#ifdef NYAN\n\tdir.yx*=rot(dir.x);\n\tvec2 ncatpos=(dir.xy+vec2(-3.+mod(-t,6.),-.27));\n\tvec4 ncat=nyan(ncatpos*5.);\n\tvec4 rain=rainbow(ncatpos*10.+vec2(.8,.5));\n\tif (totdist>8.) col=mix(col,max(vec3(.2),rain.xyz),rain.a*.9);\n\tif (totdist>8.) col=mix(col,max(vec3(.2),ncat.xyz),ncat.a*.9);\n#endif\n#endif\n\treturn col;\n}\n\n// get camera position\nvec3 move(inout vec3 dir) {\n\tvec3 go=path(t);\n\tvec3 adv=path(t+.7);\n\tfloat hd=de(adv);\n\tvec3 advec=normalize(adv-go);\n\tfloat an=adv.x-go.x; an*=min(1.,abs(adv.z-go.z))*sign(adv.z-go.z)*.7;\n\tdir.xy*=mat2(cos(an),sin(an),-sin(an),cos(an));\n    an=advec.y*1.7;\n\tdir.yz*=mat2(cos(an),sin(an),-sin(an),cos(an));\n\tan=atan(advec.x,advec.z);\n\tdir.xz*=mat2(cos(an),sin(an),-sin(an),cos(an));\n\treturn go;\n}\n\nvoid mainImage( out vec4 fragColor, in vec2 fragCoord )\n{\n\tvec2 uv = fragCoord.xy / iResolution.xy*2.-1.;\n\tvec2 oriuv=uv;\n\tuv.y*=iResolution.y/iResolution.x;\n\tvec2 mouse=(iMouse.xy/iResolution.xy-.5)*3.;\n\tif (iMouse.z<1.) mouse=vec2(0.,-0.05);\n\tfloat fov=.9-max(0.,.7-iTime*.3);\n\tvec3 dir=normalize(vec3(uv*fov,1.));\n\tdir.yz*=rot(mouse.y);\n\tdir.xz*=rot(mouse.x);\n\tvec3 from=origin+move(dir);\n\tvec3 color=raymarch(from,dir); \n\t#ifdef BORDER\n\tcolor=mix(vec3(0.),color,pow(max(0.,.95-length(oriuv*oriuv*oriuv*vec2(1.05,1.1))),.3));\n\t#endif\n\tfragColor = vec4(color,1.);\n}", "inputs": [{"channel": 0, "kind": "audio"}, {"channel": 1, "kind": "gen", "gen": "gray", "size": 64, "seed": 3, "filter": "mipmap", "wrap": "repeat"}]};

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
    'uniform vec3 stPal[5];\nuniform float stMix;\nuniform float stBeat;\nout vec4 st_FragColor;\n';
  // Skin remap: luminance of the shader colour walks a 5-stop ramp built from the skin palette.
  var footer = '\nvec3 stSkin(vec3 c) {\n  float l = clamp(dot(clamp(c, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0) * 4.0;\n' +
    '  vec3 r = mix(stPal[0], stPal[1], clamp(l, 0.0, 1.0));\n  r = mix(r, stPal[2], clamp(l - 1.0, 0.0, 1.0));\n' +
    '  r = mix(r, stPal[3], clamp(l - 2.0, 0.0, 1.0));\n  r = mix(r, stPal[4], clamp(l - 3.0, 0.0, 1.0));\n  return r;\n}\n' +
    'void main() {\n  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);\n  mainImage(c, gl_FragCoord.xy);\n' +
    '  c.rgb = mix(c.rgb, stSkin(c.rgb), stMix) * (1.0 + 0.25 * stBeat);\n  st_FragColor = vec4(c.rgb, 1.0);\n}\n';

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
    'iChannelResolution', 'stPal', 'stMix', 'stBeat'].forEach(function (n) { s.u[n] = gl.getUniformLocation(s.prog, n); });
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

  var time = (now - st.t0) / 1000, date = new Date();
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
  gl.uniform1f(st.u.stBeat, beat ? beat.decay : 0);
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
