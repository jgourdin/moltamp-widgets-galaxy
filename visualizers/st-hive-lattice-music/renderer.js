// @moltamp-visualizer: Hex Hive Tunnel ♪
// Hexagonal Hive Lattice — by nobody93
// Original: https://www.shadertoy.com/view/73KGRd
// License: CC BY-NC-SA 3.0 (Shadertoy default)
// License text: https://creativecommons.org/licenses/by-nc-sa/3.0/
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
var MAX_PIXELS = 250000;      // pixel budget for wide vibes slots
var MUSIC_IDLE_RATE = 0.25; // clock speed in silence
var MUSIC_MIN_RATE = 0.55; // clock speed on quiet music
var MUSIC_MAX_RATE = 2.0; // clock speed at full energy
var MUSIC_KICK_RATE = 1.0; // extra speed right after a beat
var MUSIC_FLASH = 0.45; // exposure kick on a beat
var MUSIC_ZOOM = 0.035; // zoom kick on a beat (fraction of the frame)

var SHADER = {"title": "Hexagonal Hive Lattice", "author": "nobody93", "url": "https://www.shadertoy.com/view/73KGRd", "common": "", "code": "// =============================================================================\n//  H E X A C O R E\n//  Infinite D6-symmetric crystal lattice, raymarched through a twisted\n//  hexagonal tunnel carved directly into the distance field.\n//\n//  Techniques\n//   - Honeycomb (triangular-lattice Voronoi) domain repetition in XY, slab\n//     repetition in Z\n//   - KIFS fractal whose fold group is the dihedral group D6 (order 12):\n//     abs() gives the Klein-4 quadrant fold, one reflection across the 30deg\n//     mirror completes the hexagonal fundamental domain\n//   - CSG tunnel carve  d = max(d, -tunnel)  (still 1-Lipschitz) along a\n//     camera spline -> collision-free flight, guaranteed by construction\n//   - Over-relaxed sphere tracing with fail-safe backtracking\n//     (Keinert et al. 2014, \"Enhanced Sphere Tracing\"), pixel-cone termination\n//   - Tetrahedral normals, 5-tap AO, penumbra soft shadows, GGX microfacet\n//     specular (Smith-Schlick G, Schlick F), one reflection bounce\n//   - Emissive hexagonal circuitry with an energy pulse running down the\n//     tunnel, integrated as volumetric in-scattering along primary rays\n//   - Cosine-gradient palettes, ACES filmic tonemap, chromatic vignette\n//\n//  Pure GLSL, no iChannels. Paste into the Shadertoy Image tab.\n// =============================================================================\n\n#define MAX_STEPS    110\n#define MAX_DIST     28.0\n#define KIFS_ITERS   4\n#define REFLECTIONS  1       // 0 = off (faster)\n#define AA           1       // 2 = 4x SSAA (high-end GPUs only)\n\nconst float PI    = 3.14159265359;\nconst float SQ3   = 1.73205080757;\nconst float CELL  = 2.6;     // honeycomb pitch (XY)\nconst float SLAB  = 2.6;     // repetition period (Z)\nconst float TUN_R = 0.95;    // tunnel inradius\n\nfloat gT;                    // time\nfloat gTrap;                 // orbit trap\nfloat gCid;                  // per-cell random id\nfloat gEmit;                 // distance to emissive circuitry\nfloat gMat;                  // 0 = crystal / pillars, 1 = perforated shell\nfloat gCell2;                // per-alveolus random id\nfloat gCamZ;                 // camera z (for the energy pulse)\n\n// -----------------------------------------------------------------------------\n// Utilities\n// -----------------------------------------------------------------------------\nmat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }\n\nfloat hash21(vec2 p){\n    p = fract(p * vec2(123.34, 456.21));\n    p += dot(p, p + 45.32);\n    return fract(p.x * p.y);\n}\n\nvec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b * cos(2.0 * PI * (c * t + d)); }\nvec3 palCrystal(float t){ return pal(t, vec3(.50,.50,.55), vec3(.50,.45,.45), vec3(1.,1.,1.),  vec3(.00,.15,.35)); }\nvec3 palEnergy (float t){ return pal(t, vec3(.60,.45,.50), vec3(.45,.45,.50), vec3(1.,.9,.8),   vec3(.55,.25,.05)); }\n\n// -----------------------------------------------------------------------------\n// Hexagonal geometry\n// -----------------------------------------------------------------------------\n// Exact 2D hexagon SDF, inradius r (flat top/bottom)\nfloat sdHex2(vec2 p, float r){\n    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);\n    p = abs(p);\n    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;\n    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);\n    return length(p) * sign(p.y);\n}\n// Exact hexagonal prism SDF, h = (inradius, half-height)\nfloat sdHexPrism(vec3 p, vec2 h){\n    vec2 d = vec2(sdHex2(p.xy, h.x), abs(p.z) - h.y);\n    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));\n}\n// D6 fold into the 30deg fundamental wedge\nvec2 foldD6(vec2 p){\n    const vec2 k = vec2(-0.866025404, 0.5);\n    p = abs(p);\n    return p - 2.0 * min(dot(k, p), 0.0) * k;\n}\n// Honeycomb lattice: (local xy, cell id). Two offset rect grids, nearest wins.\nvec4 hexLattice(vec2 p){\n    const vec2 s = vec2(1.0, SQ3);\n    vec4 c = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;\n    vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s);\n    return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, c.xy) : vec4(h.zw, c.zw + 0.5);\n}\n\n// -----------------------------------------------------------------------------\n// Camera spline (tunnel axis)\n// -----------------------------------------------------------------------------\nvec2 path(float z){\n    return vec2(1.9 * sin(z * 0.19) + 0.9 * sin(z * 0.083 + 1.3),\n                1.3 * cos(z * 0.145) + 0.6 * sin(z * 0.061));\n}\n\n// -----------------------------------------------------------------------------\n// Scene SDF\n// -----------------------------------------------------------------------------\nfloat map(vec3 p){\n    // honeycomb repetition\n    vec4  hl  = hexLattice(p.xy / CELL);\n    vec2  lq  = hl.xy * CELL;                         // local XY in cell\n    float sz  = floor(p.z / SLAB + 0.5);\n    vec3  q   = vec3(lq, p.z - sz * SLAB);\n    gCid      = hash21(hl.zw + sz * 7.13);\n\n    // ---- D6 KIFS crystal ----------------------------------------------------\n    const float SCALE = 2.05;\n    const vec3  OFF   = vec3(0.92, 0.46, 0.70);\n    float s    = 1.0, trap = 1e9;\n    float tw   = 0.18 + 0.10 * sin(gT * 0.3 + gCid * 6.2831);   // breathing twist\n    q.xy = rot(gCid * 1.0472) * q.xy;                           // per-cell 60deg phase\n    for (int i = 0; i < KIFS_ITERS; i++){\n        q.xy = foldD6(q.xy);\n        q.z  = abs(q.z);\n        q.xy = rot(tw) * q.xy;\n        q    = q * SCALE - OFF * (SCALE - 1.0);\n        s   *= SCALE;\n        trap = min(trap, dot(q, q));\n    }\n    float crystal = sdHexPrism(q, vec2(0.95, 0.40)) / s;\n\n    // emissive circuitry: hex rings engraved into the finest-level prisms\n    float ring = max(abs(sdHex2(q.xy, 0.55)) - 0.07, abs(q.z) - 0.43) / s;\n\n    // ---- tunnel frame (twisted hexagonal prism following the spline) --------\n    vec2  tq  = rot(p.z * 0.12 + 0.3 * sin(gT * 0.2)) * (p.xy - path(p.z));\n    float tun = sdHex2(tq, TUN_R);                              // < 0 inside\n\n    // ---- honeycomb-perforated shell ------------------------------------------\n    // Unroll the hexagonal wall: angular coordinate wraps exactly N_AROUND cells\n    // of the triangular lattice (x-period 1), so the pattern tiles seamlessly.\n    const float N_AROUND = 12.0;\n    const float PITCH    = 6.9282 * TUN_R / N_AROUND;          // perimeter / N\n    float ang   = atan(tq.y, tq.x) / (2.0 * PI) * N_AROUND;\n    vec4  wl    = hexLattice(vec2(ang, p.z / PITCH));\n    float holeD = sdHex2(wl.yx, 0.36) * PITCH;                  // pointy-top alveoli\n    float shellD = abs(tun - 0.07) - 0.045;\n    float shell  = max(shellD, -holeD);\n    float rimE   = max(abs(holeD) - 0.0045, abs(tun - 0.025) - 0.007); // inner-lip hex filaments\n\n    // ---- honeycomb pillars of the outer lattice -------------------------------\n    float R    = 0.5 * CELL;\n    vec2  cq   = foldD6(lq.yx) - vec2(0.57735 * (R - 0.05), R - 0.05);\n    float cols = length(cq) - 0.06;\n\n    // ---- CSG: keep outer structure away from the shell ------------------------\n    float outer = max(min(crystal, cols), -(tun - 0.42));\n    float d     = min(outer, shell);\n    gMat        = shell < outer ? 1.0 : 0.0;\n    gCell2      = hash21(wl.zw);\n\n    gEmit = min(max(ring, -(tun - 0.42)), rimE);\n    gTrap = trap;\n    return d;\n}\n\n// -----------------------------------------------------------------------------\n// Geometry & lighting\n// -----------------------------------------------------------------------------\nvec3 calcNormal(vec3 p, float t){\n    float h = 0.0004 + 0.0006 * t;\n    const vec2 k = vec2(1.0, -1.0);\n    return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) +\n                     k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));\n}\n\nfloat calcAO(vec3 p, vec3 n){\n    float occ = 0.0, w = 1.0;\n    for (int i = 0; i < 5; i++){\n        float h = 0.012 + 0.07 * float(i);\n        occ += (h - map(p + n * h)) * w;\n        w   *= 0.72;\n    }\n    return clamp(1.0 - 3.0 * occ, 0.0, 1.0);\n}\n\nfloat softShadow(vec3 ro, vec3 rd, float tmax){\n    float res = 1.0, t = 0.03;\n    for (int i = 0; i < 24; i++){\n        float h = map(ro + rd * t);\n        res = min(res, 12.0 * h / t);\n        t  += clamp(h, 0.02, 0.2);\n        if (res < 0.004 || t > tmax) break;\n    }\n    res = clamp(res, 0.0, 1.0);\n    return res * res * (3.0 - 2.0 * res);\n}\n\n// GGX / Trowbridge-Reitz specular, Smith-Schlick visibility, Schlick Fresnel\nvec3 ggx(vec3 n, vec3 v, vec3 l, float rough, vec3 F0){\n    vec3  h   = normalize(v + l);\n    float NoH = max(dot(n, h), 0.0), NoV = max(dot(n, v), 1e-3), NoL = max(dot(n, l), 0.0);\n    float a2  = rough * rough; a2 *= a2;\n    float dn  = NoH * NoH * (a2 - 1.0) + 1.0;\n    float D   = a2 / (PI * dn * dn);\n    float k   = (rough + 1.0) * (rough + 1.0) / 8.0;\n    float V   = 1.0 / ((NoV * (1.0 - k) + k) * (NoL * (1.0 - k) + k));\n    vec3  F   = F0 + (1.0 - F0) * pow(1.0 - max(dot(h, v), 0.0), 5.0);\n    return D * V * F * NoL * 0.25;\n}\n\nvec3 aces(vec3 x){\n    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);\n}\n\n// energy pulse racing down the tunnel\nfloat pulse(float z){\n    float w = fract((z - gCamZ) * 0.09 - gT * 0.45);\n    return 0.2 + 5.0 * pow(w, 30.0) + 0.7 * pow(w, 5.0);\n}\n\nvec3 energyCol(float z){ return palEnergy(0.03 * z + 0.05 * gT); }\n\nvec3 fogCol(vec3 rd){ return 0.02 * palEnergy(0.6 + 0.3 * rd.y + 0.03 * gT); }\n\n// -----------------------------------------------------------------------------\n// Over-relaxed sphere tracer (Keinert 2014). Returns t or -1. Accumulates glow.\n// -----------------------------------------------------------------------------\nfloat march(vec3 ro, vec3 rd, float pix, int steps, float tmax, inout vec3 vol, float volW){\n    float t = 0.02, omega = 1.35, prevR = 0.0, stepLen = 0.0;\n    float candErr = 1e9, candT = -1.0;\n    for (int i = 0; i < MAX_STEPS; i++){\n        if (i >= steps) break;\n        vec3  p  = ro + rd * t;\n        float r  = map(p);\n        float ar = abs(r);\n\n        // volumetric in-scattering from the emissive circuitry\n        if (volW > 0.0){\n            float e = gEmit;\n            vol += volW * energyCol(p.z) * pulse(p.z) * 0.0004 / (0.0004 + e * e * 300.0)\n                   * exp(-0.07 * t) * min(ar, 0.15) * 0.6;\n        }\n\n        bool fail = omega > 1.0 && (ar + prevR) < stepLen;\n        if (fail){ stepLen -= omega * stepLen; omega = 1.0; }\n        else     { stepLen  = r * omega; }\n        prevR = ar;\n\n        float err = ar / t;\n        if (!fail && err < candErr){ candErr = err; candT = t; }\n        if (!fail && err < pix) return t;\n        t += stepLen;\n        if (t > tmax) break;\n    }\n    return candErr < pix * 4.0 ? candT : -1.0;\n}\n\n// surface shading (shared by primary hit & reflection)\nvec3 shade(vec3 p, vec3 n, vec3 rd, float t, bool full, out vec3 F0out, out float roughOut){\n    map(p);\n    float trap = gTrap, cid = gCid, mat = gMat, emit = gEmit;\n\n    vec3  alb;\n    float rough;\n    vec3  F0;\n    if (mat < 0.5){\n        alb   = palCrystal(0.22 * log(1.0 + trap) + 0.35 * cid + 0.04 * p.z);\n        alb   = mix(alb, alb * alb, 0.4);\n        rough = 0.22;\n        F0    = mix(vec3(0.04), alb, 0.55);      // semi-metallic crystal\n    } else {\n        alb   = vec3(0.02, 0.02, 0.028);\n        rough = 0.30;\n        F0    = vec3(0.16, 0.15, 0.17);           // dark brushed alloy\n    }\n    F0out = F0; roughOut = rough;\n\n    vec3 v = -rd;\n\n    // key light rides ahead of the camera along the tunnel axis\n    vec3  lp  = vec3(path(gCamZ + 2.2), gCamZ + 2.2);\n    vec3  lv  = lp - p;\n    float ld2 = dot(lv, lv);\n    vec3  l   = lv * inversesqrt(ld2);\n    float att = 1.8 / (1.0 + ld2 * 0.9);\n    float sh  = full ? softShadow(p + n * 0.004, l, sqrt(ld2)) : 1.0;\n    float ao  = full ? calcAO(p, n) : 0.6;\n    float dif = max(dot(n, l), 0.0);\n\n    vec3 lc  = mix(vec3(1.0, 0.9, 0.8), energyCol(gCamZ + 4.0), 0.35);\n    vec3 col = alb * (1.0 - F0) * dif * att * sh * lc / PI * 3.0;\n    col     += ggx(n, v, l, rough, F0) * att * sh * lc * (mat < 0.5 ? 1.2 : 0.18);\n\n    // hemispheric bounce tinted by the energy field\n    col += alb * ao * (0.06 + 0.06 * n.y) * energyCol(p.z + 3.0);\n\n    // emissive circuitry\n    float em = smoothstep(0.003 + 0.002 * t, 0.0, emit);\n    col += em * energyCol(p.z + 6.0 * gCell2) * pulse(p.z) * 3.0;\n\n    return col * mix(0.5, 1.0, ao);\n}\n\n// -----------------------------------------------------------------------------\nvec3 render(vec3 ro, vec3 rd, float pix){\n    vec3  vol = vec3(0.0);\n    float t   = march(ro, rd, pix, MAX_STEPS, MAX_DIST, vol, 1.0);\n    vec3  bg  = fogCol(rd);\n    vec3  col = bg;\n\n    if (t > 0.0){\n        vec3 p = ro + rd * t;\n        vec3 n = calcNormal(p, t);\n        vec3 F0; float rough;\n        col = shade(p, n, rd, t, true, F0, rough);\n\n#if REFLECTIONS\n        vec3  rr   = reflect(rd, n);\n        vec3  fres = F0 + (1.0 - F0) * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);\n        vec3  dummy = vec3(0.0);\n        float tr   = march(p + n * 0.01, rr, pix * 3.0, 56, 10.0, dummy, 0.0);\n        vec3  rc   = fogCol(rr);\n        if (tr > 0.0){\n            vec3 rp = p + n * 0.01 + rr * tr;\n            vec3 rn = calcNormal(rp, tr);\n            vec3 f2; float r2;\n            rc = shade(rp, rn, rr, tr, false, f2, r2);\n            rc = mix(rc, fogCol(rr), 1.0 - exp(-0.05 * tr * tr));\n        }\n        col += rc * fres * (1.0 - rough) * 0.8;\n#endif\n        col = mix(col, bg, 1.0 - exp(-0.004 * t * t));\n    }\n    return col + vol;\n}\n\n// -----------------------------------------------------------------------------\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord){\n    gT = iTime;\n\n    // camera on the spline, looking ahead with banking proportional to curvature\n    gCamZ   = gT * 1.1;\n    vec3 ro = vec3(path(gCamZ), gCamZ);\n    vec3 ta = vec3(path(gCamZ + 1.6), gCamZ + 1.6);\n    float bank = 2.2 * (path(gCamZ + 2.0).x - 2.0 * path(gCamZ + 1.0).x + ro.x);   // ~x''\n    bank += 0.15 * sin(gT * 0.23);\n\n    vec3 fw = normalize(ta - ro);\n    vec3 rt = normalize(cross(fw, vec3(sin(bank), cos(bank), 0.0)));\n    vec3 up = cross(rt, fw);\n    float fl = 1.35;\n    float pix = 1.2 / (iResolution.y * fl);          // cone half-angle per pixel\n\n    vec3 col = vec3(0.0);\n    for (int m = 0; m < AA; m++)\n    for (int k = 0; k < AA; k++){\n        vec2 o  = vec2(float(m), float(k)) / float(AA) - 0.5 / float(AA);\n        vec2 uv = (2.0 * (fragCoord + o) - iResolution.xy) / iResolution.y;\n        vec3 rd = normalize(uv.x * rt + uv.y * up + fl * fw);\n        col += render(ro, rd, pix);\n    }\n    col /= float(AA * AA);\n\n    // post\n    vec2 q = fragCoord / iResolution.xy;\n    float vig = pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.18);\n    col *= mix(vec3(0.55, 0.45, 0.65), vec3(1.0), vig);\n    col  = aces(col * 1.1);\n    col  = pow(col, vec3(0.4545));\n    col += (hash21(fragCoord + fract(gT)) - 0.5) / 255.0;   // dither vs banding\n\n    fragColor = vec4(col, 1.0);\n}", "inputs": []};

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
