// @moltamp-visualizer: Neon Racer ♪
// Vibe coded Shadertoy Wipeout — by Himred
// Original: https://www.shadertoy.com/view/f3y3Rm
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
var MAX_PIXELS = 300000;      // pixel budget for wide vibes slots
var MUSIC_IDLE_RATE = 0.25; // clock speed in silence
var MUSIC_MIN_RATE = 0.55; // clock speed on quiet music
var MUSIC_MAX_RATE = 1.9; // clock speed at full energy
var MUSIC_KICK_RATE = 1.0; // extra speed right after a beat
var MUSIC_FLASH = 0.45; // exposure kick on a beat
var MUSIC_ZOOM = 0.03; // zoom kick on a beat (fraction of the frame)

var SHADER = {"title": "Vibe coded Shadertoy Wipeout", "author": "Himred", "url": "https://www.shadertoy.com/view/f3y3Rm", "common": "", "code": "\n// ===========================================================================\n//   W I P E O U T - a modern tribute to the Psygnosis Amiga classic\n//\n//   A single \"Image\" pass. No texture, no buffer.\n//   - very long procedural circuit, with climbs, dives and banking\n//   - tunnels, gantries, support pylons\n//   - anti-grav craft modelled as an SDF, raymarched with the scenery\n//   - specular reflections (second bounce) on the deck and the hull\n//   - volumetric glow accumulated along the rays (neon, thrusters)\n//   - blue boost pads: speed is integrated analytically\n//\n//   Hold the mouse or use the arrow keys to steer.\n//\n// Nota: Claude Opus 5.5 has been heavily used here.\n// ===========================================================================\n\n// ------------------------------------------------------------- settings ---\nconst int   STEPS = 260, RSTEPS = 80;          // primary / reflected ray steps\nconst float TMAX  = 950.0, RTMAX = 170.0;      // ray reach\nconst float HW    = 6.6;                       // deck half-width\nconst float V0 = 138.0, BST = 210.0;           // cruise speed, boost gain (u/s)\nconst float TAU = 0.95, TPAD = 4.0;            // decay constant, pad period (s)\nconst float PADL = 38.0;                       // length of one blue pad (u)\nconst float AHEAD = 21.0, SHIPS = 1.30;        // camera->craft distance, craft scale\n\nconst float CS = 26.0;       // city cell size\nconst vec3  SUN = vec3(-0.3000, 0.2000, 0.9300);   // already normalised\n\nconst vec3 FEI_Y = vec3(0.94,0.78,0.06);    // FEISAR yellow\nconst vec3 FEI_C = vec3(0.10,0.62,0.88);    // FEISAR cyan\n\n// key colours\nconst vec3 NEON_L = vec3(0.10, 0.62, 1.00);   // left barrier\nconst vec3 NEON_R = vec3(1.00, 0.13, 0.46);   // right barrier\nconst vec3 PADC   = vec3(0.16, 0.66, 1.00);   // boost pad\n\n// -------------------------------------------------------------- globals ---\nvec2  gQ;          // track-local coords from the last map()\nvec3  gGlow;       // accumulated volumetric glow\nvec3  gShipPos;    // craft position in world space\nmat3  gShipRot;    // craft frame (columns: right, up, forward)\nfloat gBoost;      // 0..1, current boost intensity\n\n// ---------------------------------------------------------------- tools ---\nmat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }\nfloat hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }\nfloat hashc(vec2 p){                       // sine-free hash, for the city\n    vec3 q = fract(vec3(p.xyx)*0.1031);\n    q += dot(q, q.yzx + 33.33);\n    return fract((q.x+q.y)*q.z);\n}\nfloat vnoise(vec2 p){\n    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);\n    float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));\n    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);\n}\nfloat fbm(vec2 p){\n    float s=0.0, a=0.5;\n    for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,-3.1); a*=0.5; }\n    return s;\n}\nfloat sband(float x, float a, float b, float w){\n    w=max(w,1e-4); return smoothstep(a-w,a+w,x)-smoothstep(b-w,b+w,x);\n}\nfloat smin(float a, float b, float k){\n    float h=clamp(0.5+0.5*(b-a)/k, 0.0, 1.0);\n    return mix(b,a,h)-k*h*(1.0-h);\n}\nfloat sdBox2(vec2 p, vec2 b){ vec2 d=abs(p)-b; return min(max(d.x,d.y),0.0)+length(max(d,0.0)); }\nfloat sdRBox(vec3 p, vec3 b, float r){\n    vec3 d=abs(p)-b; return length(max(d,0.0))+min(max(d.x,max(d.y,d.z)),0.0)-r;\n}\nfloat sdEll(vec3 p, vec3 r){\n    float k0=length(p/r), k1=length(p/(r*r));\n    return 0.85*k0*(k0-1.0)/max(k1,1e-5);\n}\nfloat sdCap(vec3 p, vec3 a, vec3 b, float r){\n    vec3 pa=p-a, ba=b-a;\n    return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0))-r;\n}\n// signed distance to interval [a,b] of a period (negative inside)\nfloat zGate(float z, float per, float a, float b){\n    float zz = mod(z, per);\n    return max(a-zz, zz-b);\n}\n\n// ------------------------------------------------------ 5x6 bitmap font ---\nconst uint FONT[40] = uint[40](\n    0x1d19d72eu, 0x1c4210c4u, 0x3e22222eu, 0x1d183a0fu, 0x11f4a988u,\n    0x1d183c3fu, 0x1d17844cu, 0x0842221fu, 0x1d18ba2eu, 0x0c887a2eu,\n    0x231fc62eu, 0x1f18be2fu, 0x1d10862eu, 0x1f18c62fu, 0x3e10bc3fu,\n    0x0210bc3fu, 0x1d18f42eu, 0x2318fe31u, 0x1c42108eu, 0x0c94211cu,\n    0x22949d31u, 0x3e108421u, 0x2318d771u, 0x231cd671u, 0x1d18c62eu,\n    0x0217c62fu, 0x2c9ac62eu, 0x2297c62fu, 0x1f08383eu, 0x0842109fu,\n    0x1d18c631u, 0x08a8c631u, 0x23bac631u, 0x22a21151u, 0x08421151u,\n    0x3e22221fu, 0x00400080u, 0x08000000u, 0x02221110u, 0x00000000u\n);\nfloat glyphPx(vec2 uv, uint g){\n    if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) return 0.0;\n    ivec2 c = ivec2(floor(uv*vec2(5.0,6.0)));\n    return float((g >> uint(c.x + (5-c.y)*5)) & 1u);\n}\nfloat drawText(vec2 c, uvec2 w, int n){\n    if(c.y<0.0||c.y>1.0) return 0.0;\n    int i = int(floor(c.x));\n    if(i<0||i>=n) return 0.0;\n    uint word = (i<5) ? w.x : w.y;\n    int code = int((word >> uint((i - (i<5?0:5))*6)) & 63u);\n    return glyphPx(vec2(fract(c.x)*1.2, c.y), FONT[code]);\n}\nfloat drawNum(vec2 c, int v, int nd){\n    if(c.y<0.0||c.y>1.0) return 0.0;\n    int i = int(floor(c.x));\n    if(i<0||i>=nd) return 0.0;\n    int dv=1; for(int k=0;k<nd-1-i;k++) dv*=10;\n    return glyphPx(vec2(fract(c.x)*1.2, c.y), FONT[(v/dv)%10]);\n}\nfloat drawGlyph(vec2 c, int code){ return glyphPx(vec2(c.x*1.2, c.y), FONT[code]); }\n\n// ------------------------------------------------------------ the track ---\n// Track centreline: a sum of sines. Low frequencies give the long sweeps\n// and the long climbs, high frequencies the tight sequences.\nvec2 trackPos(float z){\n    return vec2(60.0*sin(z*0.000331+2.1) + 22.0*sin(z*0.00131) + 11.0*sin(z*0.00327+1.7)\n              +  5.0*sin(z*0.00910-0.4)  +  2.2*sin(z*0.02130+2.2),\n                55.0*sin(z*0.000267+0.4) + 34.0*sin(z*0.00110+0.9) + 16.0*sin(z*0.00310+2.4)\n              +  7.0*sin(z*0.00820-1.2)  +  3.0*sin(z*0.01900+0.3));\n}\nvec2 trackTan(float z){\n    return vec2(0.019860*cos(z*0.000331+2.1) + 0.028820*cos(z*0.00131) + 0.035970*cos(z*0.00327+1.7)\n              + 0.045500*cos(z*0.00910-0.4)  + 0.046860*cos(z*0.02130+2.2),\n                0.014685*cos(z*0.000267+0.4) + 0.037400*cos(z*0.00110+0.9) + 0.049600*cos(z*0.00310+2.4)\n              + 0.057400*cos(z*0.00820-1.2)  + 0.057000*cos(z*0.01900+0.3));\n}\nfloat trackBank(float z){\n    float xpp = -(6.574e-6*sin(z*0.000331+2.1) + 3.775e-5*sin(z*0.00131)\n                + 1.176e-4*sin(z*0.00327+1.7) + 4.141e-4*sin(z*0.00910-0.4)\n                + 9.983e-4*sin(z*0.02130+2.2));\n    return clamp(-xpp*250.0, -0.62, 0.62);\n}\n\n// Ground height. The valley floor tracks the circuit 62 u below; ridges only\n// rise well off to the side (the test uses the sample's own z, so it is\n// locally exact), which makes it impossible for them to cross the layout.\nfloat terrainH(vec2 w, vec2 c){\n    float amp = smoothstep(30.0, 150.0, abs(w.x - c.x));\n    float h = c.y - 62.0 - 16.0*sin(w.y*0.00061);\n    h += 7.0*sin(w.x*0.0173+1.1)*sin(w.y*0.0141-0.7);        // valley floor\n    h += amp*( 46.0*(1.0-abs(sin(w.x*0.0083+1.3)*sin(w.y*0.0067-0.4)))\n             + 20.0*(1.0-abs(sin(w.x*0.0201-2.1)*sin(w.y*0.0179+1.7)))\n             +  9.0*(1.0-abs(sin(w.x*0.0431+0.6)*sin(w.y*0.0398-1.2))) );\n    return h;\n}\n\nconst float LAPLEN = 16200.0;       // lap length (units)\nfloat tunnelMask(float z){          // 1 = inside a tunnel\n    float a = smoothstep(5.0,-5.0, zGate(z, 5300.0, 1200.0, 1950.0));\n    float b = smoothstep(5.0,-5.0, zGate(z, 8900.0, 5600.0, 6120.0));\n    return max(a,b);\n}\n// boost pads: exact period derived from integrating v(t)\nfloat padPeriod(){ return V0*TPAD + BST*TAU*(1.0-exp(-TPAD/TAU)); }   // ~499 u\nfloat padLocal(float z){ return mod(z - AHEAD + 4.0, padPeriod()); }  // 0..P\nfloat padMask(float z){ return step(padLocal(z), PADL); }\n\n// position and speed: v(t) = V0 + BST*exp(-u/TAU) integrated piecewise\nfloat zOfT(float t){\n    float n = floor(t/TPAD), u = t - n*TPAD;\n    return n*padPeriod() + V0*u + BST*TAU*(1.0-exp(-u/TAU));\n}\nfloat vOfT(float t){ return V0 + BST*exp(-mod(t,TPAD)/TAU); }\n\n// ---------------------------------------------------------------- craft ---\n// Anti-grav dart: the hull is an intersection of half-spaces, hence crisp\n// edges and a tapered nose, instead of blended primitives.\n// Local frame: +x right, +y up, +z forward. Length 5.4 u, span 3.4 u.\nfloat pl(vec3 p, vec3 n, float d){ return dot(p,n) - d; }\n\nfloat sdShip(vec3 p){\n    float bound = length(p - vec3(0.0,0.05,0.55)) - 2.95;\n    if(bound > 0.30) return bound;                   // bounding sphere: early out\n    vec3 q = vec3(abs(p.x), p.y, p.z);\n\n    // Top and bottom planes meet at z=3.30: the nose tip is born from their\n    // intersection, it is not modelled.\n    vec3 nUp = vec3(0.0, 0.99860, 0.05293);  float dUp = 0.17475;\n    vec3 nDn = vec3(0.0,-0.99955, 0.02999);  float dDn = 0.09996;\n\n    // --- nose blade: very swept leading edge (0 -> 0.42 over 2.7 u)\n    float nose = pl(q, vec3(0.98811,0.0,0.15370), 0.50721);\n    nose = max(nose, pl(q, nUp, dUp));\n    nose = max(nose, pl(q, nDn, dDn));\n    nose = max(nose, 0.55 - p.z);\n\n    // --- rear delta body: flares out to 0.98 half-width\n    float body = pl(q, vec3(0.96624,0.0,0.25766), 0.56042);\n    body = max(body, pl(q, nUp, dUp));\n    body = max(body, pl(q, nDn, dDn));\n    body = max(body, p.z - 0.65);\n    body = max(body, -p.z - 1.60);\n    body = max(body, q.x - 0.98);\n    float d = min(nose, body);\n\n    // --- dorsal fairing: the back is not a plate, it has volume\n    d = smin(d, sdEll(p - vec3(0.0, 0.02, 0.55), vec3(0.38, 0.21, 2.05)), 0.20);\n\n    // --- nacelles: inboard (+-0.44) and long, so they do not read as wheels\n    float nac = max(sdCap(q, vec3(0.44,-0.04, 0.35), vec3(0.44,-0.04,-1.93), 0.165),\n                    -p.z - 1.95);\n    nac = min(nac, max(sdCap(q, vec3(0.44,-0.04,-1.74), vec3(0.44,-0.04,-1.62), 0.192),\n                       -p.z - 1.95));                       // collar ring\n    d = smin(d, nac, 0.10);\n\n    // --- low canopy, blended into the fairing\n    d = smin(d, sdEll(p - vec3(0.0, 0.225, 0.98), vec3(0.21, 0.125, 0.64)), 0.06);\n    // --- dorsal intake, discreet\n    d = min(d, sdRBox(p - vec3(0.0, 0.215,-0.45), vec3(0.15, 0.042, 0.40), 0.032));\n    // --- vertical fins on the nacelles (readable from three-quarter rear)\n    d = min(d, sdRBox(q - vec3(0.44, 0.235,-1.25), vec3(0.028, 0.215, 0.34), 0.022));\n    // --- wingtip plates angled downwards\n    vec3 w = q - vec3(0.88,-0.045,-1.05);\n    w.xy = mat2(0.766,-0.643, 0.643,0.766) * w.xy;\n    d = min(d, sdRBox(w, vec3(0.026, 0.26, 0.44), 0.022));\n\n    // --- nozzles carved out\n    d = max(d, -sdCap(q, vec3(0.44,-0.04,-1.75), vec3(0.44,-0.04,-2.02), 0.108));\n    return d;\n}\n\n// ------------------------------------------------------------ the scene ---\nconst float M_ROAD = 1.0, M_RAIL = 2.0, M_ARCH = 3.0, M_PYL  = 4.0;\nconst float M_TUN  = 5.0, M_SHIP = 6.0, M_TERR = 7.0, M_CITY = 8.0;\n\nvec2 map(vec3 p){\n    float z  = p.z;\n    vec2  c  = trackPos(z);\n    vec2  q  = rot(-trackBank(z)) * (p.xy - c);\n    gQ = q;\n    float ax = abs(q.x);\n\n    // deck + keel\n    float d = sdBox2(vec2(q.x, q.y+0.42), vec2(HW, 0.42)) - 0.06;\n    d = min(d, sdBox2(vec2(q.x, q.y+1.35), vec2(HW-1.6, 0.60)) - 0.16);\n    vec2 res = vec2(d, M_ROAD);\n\n    // barriers + light masts\n    float rail = sdBox2(vec2(ax-(HW+0.42), q.y-0.40), vec2(0.42,0.46)) - 0.10;\n    float pz   = abs(mod(z+7.0, 14.0) - 7.0);\n    rail = min(rail, max(sdBox2(vec2(ax-(HW+0.80), q.y-2.10), vec2(0.075,1.75))-0.035, pz-0.10));\n    rail = min(rail, max(sdBox2(vec2(ax-(HW+0.40), q.y-3.70), vec2(0.42,0.085))-0.05, pz-0.20));\n    if(rail < res.x) res = vec2(rail, M_RAIL);\n\n    // gantries + sign, every 240 u\n    float az = abs(mod(z+60.0, 240.0) - 120.0);\n    float arch = max(abs(sdBox2(vec2(q.x, q.y-4.3), vec2(HW+2.1, 5.6))) - 0.50, az-1.7);\n    arch = min(arch, max(sdBox2(vec2(q.x, q.y-11.5), vec2(5.4,1.10))-0.10, az-0.65));\n    if(arch < res.x) res = vec2(arch, M_ARCH);\n\n    // support pylons every 48 u\n    float py = abs(mod(z+24.0, 48.0) - 24.0);\n    float pylon = max(sdBox2(vec2(ax-2.9, q.y+21.0), vec2(0.65,19.7)), py-1.0);\n    pylon = min(pylon, max(sdBox2(vec2(q.x, q.y+3.1), vec2(3.9,0.32)), py-0.8));\n    if(pylon < res.x) res = vec2(pylon, M_PYL);\n\n    // tunnels: annular shells clipped by an exact interval in z\n    vec2 tq = vec2(q.x, q.y-0.4);\n    float tun = max(max(abs(length(tq)-12.0)-0.70, 0.9-q.y),\n                    zGate(z, 5300.0, 1200.0, 1950.0));\n    tun = min(tun, max(max(abs(length(tq)-10.2)-0.60, 0.9-q.y),\n                    zGate(z, 8900.0, 5600.0, 6120.0)));\n    if(tun < res.x) res = vec2(tun, M_TUN);\n\n    // --- terrain: valley below the track, ridges in the distance ----------\n    float hgt  = terrainH(p.xz, c);\n    float terr = (p.y - hgt) * 0.40;                 // Lipschitz margin\n    if(terr < res.x) res = vec2(terr, M_TERR);\n\n    // --- night city in the valley ----------------------------------------\n    // Lateral band: nothing in the track corridor, towers beyond, thinning out.\n    vec2  cid = floor(p.xz/CS);\n    vec2  lp  = p.xz - (cid+0.5)*CS;\n    float r1 = hashc(cid), r2 = hashc(cid+31.7), r3 = hashc(cid+57.3);\n    float dx = abs(p.x - c.x);\n    float band = smoothstep(20.0, 48.0, dx)*(1.0 - smoothstep(95.0, 210.0, dx));\n    float H = (5.0 + 46.0*r1*r1)*step(0.30, r3)*band;\n    vec3  hb = vec3(0.23+0.07*r2, H*0.5, 0.23+0.07*r1)*vec3(CS,1.0,CS);\n    float bld = sdRBox(vec3(lp.x, p.y-(hgt+H*0.5), lp.y), hb, 0.0);\n    float city = min(bld, 0.5*CS - max(abs(lp.x),abs(lp.y)) + 0.15*CS);\n    if(city < res.x) res = vec2(city, M_CITY);\n\n    // craft\n    float sh = sdShip((p - gShipPos)*gShipRot / SHIPS) * SHIPS;\n    if(sh < res.x) res = vec2(sh, M_SHIP);\n\n    res.x *= 0.80;    // Lipschitz margin (extrusion along a curve)\n    return res;\n}\n\nvec3 calcNormal(vec3 p, float t){\n    vec2 e = vec2(1.0,-1.0)*0.0013*max(t,1.0);\n    return normalize(e.xyy*map(p+e.xyy).x + e.yyx*map(p+e.yyx).x +\n                     e.yxy*map(p+e.yxy).x + e.xxx*map(p+e.xxx).x);\n}\n\n// ------------------------------------------------------------- marching ---\n// returns (distance, material); accumulates volumetric glow when asked\nvec2 trace(vec3 ro, vec3 rd, float tmax, int maxi, bool glow){\n    float t = 0.05, id = -1.0;\n    vec2 h = vec2(1e9, -1.0);\n    for(int i=0;i<220;i++){\n        if(i >= maxi) break;\n        vec3 p = ro + rd*t;\n        h = map(p);\n        float jetR = 1e9;                  // distance to the flame axis\n        if(glow){\n            float w = min(h.x, 8.0);\n            // barrier neon\n            float dr = length(vec2(abs(gQ.x)-(HW+0.80), gQ.y-3.70));\n            gGlow += mix(NEON_L, NEON_R, step(0.0,gQ.x))*exp(-dr*0.42)*w*0.011;\n            // blue centreline lights\n            float la = smoothstep(1.3, 0.0,\n                       length(vec2(gQ.x, max(abs(mod(p.z+5.0,10.0)-5.0)-0.55, 0.0))));\n            gGlow += vec3(0.20,0.62,1.15)*la*exp(-max(gQ.y,0.0)*1.3)*w*0.022;\n            // blue sheet over the boost pads\n            float pm = padMask(p.z)*smoothstep(HW*0.95, HW*0.35, abs(gQ.x));\n            gGlow += PADC*pm*exp(-max(gQ.y,0.0)*0.85)*w*0.055;\n            // --- thruster flame ---------------------------------------\n            // A column, not a plume: it barely widens, its edge is crisp\n            // (exp(-u^4) profile rather than gaussian), it carries marked\n            // shock diamonds and dies out sharply at the end.\n            vec3 rel = p - gShipPos;\n            if(dot(rel,rel) < 1300.0){\n                vec3 sp = rel*gShipRot / SHIPS;\n                float jz  = -(sp.z + 2.00);                   // 0 at the nozzle exit\n                float len = 12.0 + 10.0*gBoost;\n                if(jz > -0.30 && jz < len){\n                    // Reversed cone: wide at the nozzle, tapering fast, then a\n                    // thin trail whose intensity decays five times slower.\n                    float rad = 0.042 + 0.30*exp(-jz*1.0);\n                    float rr  = length(vec2(abs(sp.x)-0.44, sp.y+0.04));\n                    jetR = rr;\n                    float u = rr/rad;\n                    float shape = exp(-u*u*2.0);              // light inside the cone\n                    float edge  = smoothstep(1.25, 0.80, u);  // readable cone wall\n                    float atten = exp(-jz*0.20);              // long decay\n                    float pulse  = 0.88 + 0.12*sin(iTime*26.0 - jz*3.0);\n                    vec3 jc = mix(vec3(3.4,2.4,1.25), vec3(1.55,0.38,0.05),\n                                  clamp(jz*0.22, 0.0, 1.0));\n                    float near = smoothstep(1.5, 5.5, t);     // fade out near the eye\n                    gGlow += jc*shape*edge*atten*pulse*w*near*(0.95+1.9*gBoost);\n                    // mouth glow, on the nozzle itself\n                    gGlow += vec3(1.70,0.72,0.18)*exp(-u*u*0.9)*exp(-jz*2.2)\n                             *w*near*(0.25+0.40*gBoost);\n                }\n            }\n        }\n        if(h.x < 0.0016*t){ id = h.y; break; }\n        float stp = h.x;\n        if(glow){\n            // thin column: coarse steps would skip it and make it flicker\n            if(jetR < 1.2) stp = min(stp, mix(0.16, 0.50, smoothstep(0.15, 1.2, jetR)));\n            else{\n                vec3 jr = p - gShipPos + gShipRot[2]*4.0;\n                if(dot(jr,jr) < 49.0) stp = min(stp, 0.50);\n            }\n        }\n        t += stp;\n        if(t > tmax) break;\n    }\n    // Budget exhausted while grazing a surface (3 deg needs 80 steps, 1.5 deg\n    // needs 160): without this the ray would exit \"no hit\", be shaded as sky,\n    // and sky() looking down returns the dark horizon -> isolated black pixels.\n    if(id < 0.0 && t <= tmax && h.x < 2.0) id = h.y;\n    return vec2(t, id);\n}\n\n// --------------------------------------------------------------- sky -----\nvec3 sky(vec3 rd){\n    float h = rd.y;\n    vec3 sun = SUN;\n\n    vec3 zen = vec3(0.008,0.014,0.040);\n    vec3 hor = vec3(0.075,0.060,0.115);\n    vec3 col = mix(hor, zen, smoothstep(-0.02, 0.45, h));\n\n    float sd = max(dot(rd, sun), 0.0);\n    col += vec3(0.60,0.26,0.10)*pow(sd, 5.0)*0.16;               // city light pollution\n    col += vec3(0.55,0.62,0.85)*pow(sd, 60.0)*0.25;              // moon halo\n    col += vec3(2.40,2.55,2.80)*smoothstep(0.99955,0.99985,sd);  // moon disc\n\n    // stretched cloud bands\n    float ang = atan(rd.x, rd.z);\n    float cl = fbm(vec2(ang*2.6, h*9.0 - 1.5));\n    cl = smoothstep(0.50, 0.88, cl)*smoothstep(0.42, 0.02, abs(h-0.14));\n    col = mix(col, mix(vec3(0.09,0.06,0.13), vec3(0.95,0.48,0.28), pow(sd,3.0)), cl*0.55);\n\n    // stars: fine cells, tiny points\n    vec2 suv = vec2(ang, h*1.9)*320.0;\n    float hs = hash21(floor(suv));\n    col += step(0.962,hs)*smoothstep(0.11,0.01,length(fract(suv)-0.5))\n         * smoothstep(0.02,0.35,h)*vec3(0.78,0.86,1.0)*1.8;\n\n    // planet, opposite the moon\n    vec3 md = normalize(vec3(0.72,0.30,-0.62));\n    float a = acos(clamp(dot(rd,md),-1.0,1.0));\n    vec3 pd = normalize(rd - md*dot(rd,md));\n    float lam = clamp(dot(pd, normalize(vec3(-0.9,0.1,0.4)))*1.1+0.35, 0.0, 1.0);\n    col = mix(col, mix(vec3(0.05,0.04,0.09), vec3(0.50,0.30,0.34), lam)\n              *(0.75+0.25*fbm(vec2(a*26.0, dot(pd.xy,vec2(11.0,7.0))))), smoothstep(0.101,0.097,a));\n\n    // far ridges, heavily faded (the city owns the horizon)\n    float ridge = 0.050*fbm(vec2(ang*1.9, 0.0)) - 0.042;\n    float m = smoothstep(ridge+0.006, ridge-0.006, h);\n    col = mix(col, vec3(0.065,0.052,0.090)*(0.7+0.7*pow(sd,4.0)), m*0.45);\n    col += vec3(0.42,0.20,0.26)*exp(-abs(h)*20.0)*0.18;          // horizon haze\n    return col;\n}\n\n// -------------------------------------------------------- materials ------\nstruct Surf { vec3 alb; vec3 emi; float rough; float refl; vec3 nrm; };\n\n// deck relief, for bump mapping\n// Deck relief: grooves only. A noisy bump gets amplified by the specular lobe.\nfloat deckRelief(float x, float z){\n    float h = -0.55*smoothstep(0.34,0.0, abs(mod(z,6.0)-3.0));\n    h -= 0.45*smoothstep(0.20,0.0, abs(abs(x)-HW*0.44));\n    h -= 0.45*smoothstep(0.20,0.0, abs(abs(x)-HW*0.80));\n    return h;\n}\n\nSurf matRoad(vec3 p, vec2 q, vec3 n, vec3 rgt, vec3 fwd, float pw, float fw){\n    Surf s;\n    float z = p.z, u = q.x/HW, au = abs(u);\n\n    // asphalt\n    vec3 base = vec3(0.092,0.098,0.118);\n    float det = exp(-fw*0.85);                     // ~6 u patterns (slab joints)\n    float dtL = exp(-fw*0.35);                     // ~14 u patterns (dashes)\n    base = mix(base, vec3(0.125,0.132,0.152), smoothstep(0.55,0.95,au));   // worn edges\n    float line = smoothstep(0.55,0.0,abs(au-0.30));                        // racing line\n    base *= 1.0 - 0.10*line;\n\n    // UNIFORM: as a noise field it swung the specular exponent (15 to 41) and\n    // the reflection blur in soft patches -> blotches crawling over the deck\n    s.rough = 0.30 + 0.12*smoothstep(0.6,1.0,au);\n    s.emi = vec3(0.0);\n\n    // joints, slabs\n    float aw = pw*1.4;\n    float seam = smoothstep(0.30+fw*0.5, 0.10, abs(mod(z,6.0)-3.0));\n    base *= 1.0 - 0.55*seam*det;\n    base *= 1.0 - 0.40*smoothstep(0.18,0.05, abs(au-0.44))*det;\n    base *= 1.0 - 0.40*smoothstep(0.18,0.05, abs(au-0.80))*det;\n\n    // lit edge strip + kerb\n    base = mix(base, vec3(0.30,0.32,0.36), sband(au,0.86,0.965,aw)*0.9);\n    s.emi += sband(au,0.968,0.997,aw)*vec3(0.85,0.93,1.10)*2.2;\n\n    // --- blue centreline lights, recessed into the deck ------------------\n    float lz = abs(mod(z + 5.0, 10.0) - 5.0);\n    float dl = length(vec2(q.x, max(lz - 0.55, 0.0)));        // capsule\n    float core = smoothstep(0.24 + fw*0.35, 0.09, dl);\n    float halo = smoothstep(1.10 + fw*0.60, 0.18, dl);\n    float pulse = mix(1.0, 0.72 + 0.28*sin(z*0.55 - iTime*9.0), dtL);\n    base = mix(base, vec3(0.020,0.030,0.055), core*0.85);     // dark housing\n    s.emi += (core*3.6 + halo*0.70)*pulse*vec3(0.22,0.70,1.35);\n\n    // ---- blue boost zones ------------------------------------------------\n    float pl = padLocal(z);\n    float pad = sband(pl, 0.0, PADL, pw*1.6)*smoothstep(0.93,0.80,au);\n    if(pad > 0.001){\n        float detP = dtL;                           // detail fades with distance\n        float chevron = smoothstep(0.55,0.20, abs(fract((z + abs(q.x)*0.62)*0.28 - iTime*3.2)-0.5)*2.0);\n        chevron = mix(0.45, chevron, detP);\n        float grid = mix(0.5, smoothstep(0.85,0.35, abs(fract(q.x*0.5)-0.5)*2.0), detP);\n        vec3 glowc = PADC*(0.9 + 3.0*chevron) + vec3(0.08,0.28,0.48)*grid;\n        float head = smoothstep(2.5,0.0,pl) + smoothstep(2.5,0.0,PADL-pl);   // entry edge\n        base = mix(base, vec3(0.055,0.105,0.185), pad);\n        s.emi += pad*(glowc*1.15 + vec3(0.5,0.8,1.15)*head*2.2);\n        s.rough = mix(s.rough, 0.10, pad);\n    }\n\n    // start line chequer\n    float fin = sband(mod(z, LAPLEN), 0.0, 4.0, pw*1.6);\n    float chk = mix(0.5, mod(floor(q.x*1.2) + floor(z*0.7), 2.0), det);\n    base = mix(base, vec3(chk)*0.75+0.04, fin);\n\n    // bump\n    float e = 0.16;\n    float h0 = deckRelief(q.x, z);\n    float hx = deckRelief(q.x+e, z) - h0;\n    float hz = deckRelief(q.x, z+e) - h0;\n    s.nrm = normalize(n - (rgt*hx + fwd*hz)*0.15*exp(-fw*1.20)); // fades with distance\n\n    s.alb  = base;\n    s.refl = 0.45 - 0.22*smoothstep(0.3,0.8,s.rough);\n    return s;\n}\n\nSurf matRail(vec3 p, vec2 q, vec3 n, float pw, float fw){\n    Surf s; s.nrm = n;\n    float z = p.z, ax = abs(q.x);\n    vec3 col = vec3(0.145,0.155,0.180);\n    col *= 1.0 + 0.12*(vnoise(vec2(z*0.9, q.y*2.0))-0.5)*exp(-fw*1.4);\n    float dR = exp(-fw*1.10);\n    col *= 1.0 - 0.45*smoothstep(1.34,1.48, abs(mod(z,3.0)-1.5))*dR;\n\n    // sponsor panels\n    float seg = floor(z/12.0);\n    float hh = hash21(vec2(seg, 3.0));\n    vec3 spon = 0.5+0.5*cos(6.2831*hh + vec3(0.0,2.1,4.2));\n    float pan = sband(q.y, 0.18, 0.72, pw)*step(0.55,hh)*step(abs(mod(z,12.0)-6.0), 4.2);\n    col = mix(col, spon*0.30, pan);\n\n    // hazard stripes\n    float hazard = mix(0.5, step(fract((z + q.y*2.6)*0.20), 0.5), dR);\n    col = mix(col, mix(vec3(0.52,0.06,0.08), vec3(0.70,0.72,0.78), hazard),\n              sband(q.y,0.05,0.18,pw)*0.9);\n\n    // crest neon: running light\n    vec3 neon = (q.x>0.0) ? NEON_R : NEON_L;\n    float chase = 0.55 + 0.45*sin(z*0.22 - iTime*14.0);\n    s.emi  = sband(q.y, 0.74, 0.90, pw)*neon*(2.2+1.4*chase);\n    s.emi += sband(q.y, 2.15, 2.55, pw)*step(abs(mod(z+6.0,12.0)-6.0), 0.30)*neon*4.0;\n    s.alb = col; s.rough = 0.35; s.refl = 0.35;\n    return s;\n}\n\nSurf matArch(vec3 p, vec2 q, vec3 n, float pw){\n    Surf s; s.nrm = n;\n    vec3 col = vec3(0.130,0.140,0.165)*(0.85+0.3*vnoise(q*3.0));\n    s.emi = vec3(0.0);\n    // lamp row under the top beam\n    float cell = floor(q.x*0.8);\n    s.emi += smoothstep(0.42,0.12, abs(fract(q.x*0.8)-0.5))*step(9.3, q.y)\n           * step(0.42, fract(iTime*1.7 + cell*0.08))*vec3(1.0,0.62,0.14)*4.0;\n    // light panel\n    float sgn = sband(q.y, 10.5, 12.5, pw)*sband(abs(q.x), 0.0, 5.3, pw);\n    float bars = smoothstep(0.55,0.15, abs(fract(q.x*0.45 + iTime*0.35)-0.5)*2.0);\n    s.emi += sgn*mix(vec3(0.08,0.40,0.85), vec3(1.0,0.75,0.25), bars)*2.6;\n    // uprights: vertical tubes\n    s.emi += smoothstep(0.30,0.0,abs(abs(q.x)-(HW+1.75)))*sband(q.y,0.3,8.6,0.06)\n           * vec3(0.12,0.65,1.0)*1.8;\n    s.alb = col; s.rough = 0.42; s.refl = 0.25;\n    return s;\n}\n\nSurf matTunnel(vec3 p, vec2 q, vec3 n, float pw){\n    Surf s; s.nrm = n;\n    vec2 tq = vec2(q.x, q.y-0.4);\n    float a = atan(tq.x, tq.y);            // angle around the axis\n    float r = length(tq);\n    vec3 col = vec3(0.048,0.052,0.066)*(0.75+0.5*vnoise(vec2(a*9.0, p.z*1.4)));\n    // ribs\n    float rib = smoothstep(0.36,0.12, abs(mod(p.z,8.0)-4.0));\n    col *= 1.0 - 0.45*rib;\n    col = mix(col, vec3(0.09,0.10,0.13), rib*0.5);\n    // side light strips\n    float strip = smoothstep(0.09,0.0, abs(abs(a)-1.05)) + smoothstep(0.07,0.0, abs(abs(a)-0.42));\n    float run = 0.55+0.45*sin(p.z*0.55 - iTime*22.0);\n    s.emi = strip*mix(vec3(0.25,0.70,1.0), vec3(0.9,0.35,0.9), step(0.0,q.x))*(1.6+1.6*run);\n    s.emi += rib*step(0.5, fract(p.z/8.0 - iTime*0.6))*vec3(0.15,0.45,0.9)*0.5;\n    s.alb = col; s.rough = 0.30 + 0.25*rib; s.refl = 0.45;\n    return s;\n}\n\nSurf matShip(vec3 p, vec3 n, float pw){\n    Surf s;\n    vec3 q = (p - gShipPos)*gShipRot / SHIPS;\n    vec3 aq = vec3(abs(q.x), q.y, q.z);\n    s.nrm = n; s.emi = vec3(0.0);\n\n    vec3 col = vec3(0.84,0.86,0.90);                          // base white\n    // central yellow field, flaring towards the rear\n    float w1 = 0.18 + 0.44*smoothstep(1.7,-1.4,q.z);\n    col = mix(col, FEI_Y, smoothstep(0.09,0.0, aq.x - w1)*0.92);\n    // cyan flank stripe\n    col = mix(col, FEI_C, smoothstep(0.09,0.0, abs(aq.x - (w1+0.22)) - 0.09)*0.88);\n    // cyan nose tip\n    col = mix(col, FEI_C, smoothstep(2.10,2.95,q.z)*0.90);\n    // dark belly + flank pinstripe\n    col = mix(col, vec3(0.07,0.08,0.10), smoothstep(-0.02,-0.10,q.y));\n    col = mix(col, vec3(0.04,0.05,0.06), smoothstep(0.022,0.0,abs(q.y-0.010))*0.70);\n    // fine panel grooves\n    col *= 1.0 - 0.22*smoothstep(0.015,0.0, abs(mod(q.z*0.8+0.5,1.0)-0.5)-0.485);\n\n    s.rough = 0.13; s.refl = 0.32;\n\n    // --- nacelles: matt black body, yellow collar\n    float rn = length(vec2(aq.x-0.44, q.y+0.04));\n    float nacm = smoothstep(0.205,0.165,rn)*smoothstep(-0.30,-0.42,q.z);\n    col = mix(col, vec3(0.055,0.062,0.075)*(0.8+0.4*step(0.5,fract(q.z*3.2))), nacm);\n    col = mix(col, FEI_Y, nacm*smoothstep(0.10,0.0,abs(q.z+1.68))*0.85);\n    s.rough = mix(s.rough, 0.35, nacm);\n\n    // --- black dorsal spine\n    float spn = smoothstep(0.04,0.0, sdRBox(q - vec3(0.0,0.30,-0.45), vec3(0.15,0.055,0.40), 0.04));\n    col = mix(col, vec3(0.05,0.055,0.065), spn*0.9);\n\n    // --- canopy: very dark glass, black surround\n    float ckd = sdEll(q - vec3(0.0,0.225,0.98), vec3(0.225,0.140,0.66));\n    float ck = smoothstep(0.040,0.0, ckd)*step(0.175, q.y);\n    col *= 1.0 - 0.70*smoothstep(0.075,0.035, abs(ckd));\n    col = mix(col, vec3(0.012,0.032,0.048), ck);\n    s.rough = mix(s.rough, 0.035, ck);\n    s.refl  = mix(s.refl, 1.00, ck);\n    s.emi  += ck*vec3(0.06,0.24,0.34)*0.30;\n\n    // --- nozzles: black surround, plasma core\n    float nz = length(vec2(aq.x-0.44, q.y+0.04));\n    float mouth = smoothstep(-1.72,-1.90, q.z);\n    col *= 1.0 - 0.85*smoothstep(0.170,0.115,nz)*mouth;\n    s.alb = col;\n    s.emi += smoothstep(0.068,0.024,nz)*mouth\n           * mix(vec3(2.00,0.90,0.26), vec3(2.8,2.3,1.6), gBoost)*(1.2+3.0*gBoost);\n    s.emi += smoothstep(0.092,0.068,nz)*mouth*vec3(0.85,0.34,0.09)*0.7;\n\n    // --- anti-grav strips under the hull\n    float bg = smoothstep(0.05,0.0, abs(aq.x-0.45))*smoothstep(-0.13,-0.22,q.y)\n             * sband(q.z,-1.4,1.9,0.05);\n    s.emi += bg*vec3(0.20,0.75,1.0)*(1.5+0.7*sin(iTime*9.0+q.z*3.0));\n    // --- position lights\n    s.emi += smoothstep(0.055,0.0,length(aq - vec3(0.96,0.06,-1.35)))*vec3(1.0,0.22,0.08)*7.0;\n    s.emi += smoothstep(0.045,0.0,length(aq - vec3(0.05,0.00,3.15)))*vec3(0.3,0.9,1.0)*5.0;\n    return s;\n}\n\nSurf matTerr(vec3 p, vec3 n, vec2 tc, float pw){\n    Surf s; s.nrm = n;\n    float slope = clamp(n.y, 0.0, 1.0);\n    float alt   = p.y - tc.y;                       // height relative to the track\n\n    vec3 rock = mix(vec3(0.088,0.074,0.100), vec3(0.168,0.138,0.154), slope);\n    rock *= 0.72 + 0.56*fbm(p.xz*0.019);\n    rock *= 0.85 + 0.30*fbm(p.xz*0.085)*exp(-pw*0.35);        // grain, faded with distance\n    // rock strata\n    rock *= 1.0 - 0.18*smoothstep(0.35,0.0,abs(fract(p.y*0.055)-0.5)-0.42);\n    // snow on gentle slopes at altitude\n    float snow = smoothstep(0.58,0.86,slope)*smoothstep(-8.0, 26.0, alt);\n    vec3 col = mix(rock, vec3(0.50,0.52,0.60), snow*0.88);\n    // pale scree at the foot of the cliffs\n    col = mix(col, vec3(0.045,0.040,0.046), smoothstep(0.30,0.05,slope)*0.5);\n\n    s.alb = col;\n    s.emi = vec3(0.0);\n    s.rough = mix(0.80, 0.55, snow);\n    s.refl  = 0.05;\n    return s;\n}\n\nSurf matCity(vec3 p, vec3 n, vec2 tc, float pw){\n    Surf s; s.nrm = n;\n    vec2 cid = floor(p.xz/CS);\n    float r1 = hashc(cid);\n    float up = smoothstep(0.55,0.92,abs(n.y));\n\n    vec3 col = mix(vec3(0.020,0.022,0.030), vec3(0.042,0.038,0.040), r1);\n    // window grid on vertical facades\n    vec2 uv = (abs(n.x) > abs(n.z)) ? vec2(p.z,p.y) : vec2(p.x,p.y);\n    vec2 w  = vec2(uv.x/2.7, uv.y/3.6);\n    vec2 wi = floor(w), wf = fract(w);\n    float pane = step(0.16,wf.x)*step(wf.x,0.84)*step(0.24,wf.y)*step(wf.y,0.82);\n    float on   = step(0.42, hashc(wi + cid*17.0));\n    vec3  wc   = mix(vec3(1.00,0.72,0.34), vec3(0.62,0.80,1.00),\n                     step(0.66, hashc(wi + cid*7.0 + 3.1)));\n    // past one window per pixel, replace the detail by its average\n    float det = exp(-pw*0.55);\n    vec3 winAvg = vec3(0.90,0.66,0.38)*0.55*(1.0-up);\n    s.emi = mix(winAvg, wc*pane*on*(1.0-up)*(1.1+1.4*hashc(wi + cid*5.0)), det);\n    col = mix(col, vec3(0.008,0.010,0.016), pane*(1.0-on)*(1.0-up)*0.8*det);\n    col = mix(col, vec3(0.030,0.032,0.036), up);\n    s.alb = col; s.rough = 0.42; s.refl = 0.16;\n    return s;\n}\n\n// ------------------------------------------------------------- lighting ---\nvec3 shadeSurf(vec3 p, vec3 rd, vec3 n, float id, float t, float pw,\n               out vec3 nrm, out float refl, out float rough, out vec3 emiOut)\n{\n    vec2 tc = trackPos(p.z);\n    float bk = trackBank(p.z);\n    vec2 q = rot(-bk)*(p.xy - tc);\n    vec2 tan2 = trackTan(p.z);\n    vec3 fwd = normalize(vec3(tan2, 1.0));\n    vec3 rgt = normalize(vec3(cos(bk), sin(bk), 0.0));\n\n    Surf s;\n    // Pixel footprint MEASURED ON THE SURFACE: x25 at 5 deg grazing. Without\n    // it, periodic patterns drop below the pixel and speckle.\n    float fw = min(pw/max(dot(n,-rd), 0.045), 60.0);\n    if     (id == M_ROAD) s = matRoad(p, q, n, rgt, fwd, pw, fw);\n    else if(id == M_RAIL) s = matRail(p, q, n, pw, fw);\n    else if(id == M_ARCH) s = matArch(p, q, n, pw);\n    else if(id == M_TUN ) s = matTunnel(p, q, n, pw);\n    else if(id == M_SHIP) s = matShip(p, n, pw);\n    else if(id == M_TERR) s = matTerr(p, n, tc, pw);\n    else if(id == M_CITY) s = matCity(p, n, tc, pw);\n    else {\n        s.alb = vec3(0.042,0.046,0.058)*(0.7+0.5*fbm(p.xy*0.7+p.z*0.25));\n        s.emi = vec3(0.0); s.rough = 0.55; s.refl = 0.12; s.nrm = n;\n    }\n    nrm = s.nrm; refl = s.refl; rough = s.rough;\n\n    vec3 sun = SUN;\n    float tun = tunnelMask(p.z);\n    vec3 v = -rd;\n\n    // hemispheric ambient, darkened inside tunnels\n    float up = 0.5 + 0.5*s.nrm.y;\n    // cool sky-dome ambient; the directional key light carries the contrast\n    vec3 amb = mix(vec3(0.075,0.095,0.165), vec3(0.045,0.055,0.095), tun);\n    vec3 col = s.alb*amb*(0.35 + 0.65*up);\n\n    // grazing key light (backlight) + tunnel attenuation\n    float dif = max(dot(s.nrm, sun), 0.0);\n    vec3 keyCol = (id == M_SHIP) ? vec3(0.80,0.88,1.15) : vec3(0.62,0.70,1.00);\n    col += s.alb*keyCol*dif*((id == M_SHIP) ? 0.85 : 0.70)*(1.0-0.85*tun);\n\n    // barrier neon fill: coloured light from the sides\n    float side = clamp(q.x/HW, -1.0, 1.0);\n    vec3 neonFill = mix(NEON_L, NEON_R, 0.5+0.5*side)\n                  * (0.10 + 0.22*smoothstep(1.6,0.2,abs(abs(q.x)-HW)));\n    col += s.alb*neonFill*(0.6+0.4*up);\n\n    // boost pad sheet: lights whatever sits just above it\n    float pad = padMask(p.z)*exp(-max(q.y,0.0)*0.45);\n    col += s.alb*PADC*pad*0.55;\n\n    // craft thrusters\n    vec3 ld = (gShipPos - gShipRot[2]*(1.3 + 2.8*gBoost)) - p;\n    float dd = length(ld); ld /= max(dd,1e-3);\n    float att = 1.0/(1.0 + dd*dd*0.012);\n    vec3 eng = mix(vec3(1.35,0.58,0.17), vec3(1.15,1.00,0.82), gBoost)*(2.4+7.0*gBoost);\n    float engK = (id == M_SHIP) ? 0.20 : 1.0;      // no self-lighting from its own exhaust\n    col += s.alb*max(dot(s.nrm,ld),0.0)*att*eng*engK;\n\n    // Specular, on a near-geometric normal: with an exponent near 22 the bump\n    // noise would turn into golden speckle. The bump stays on the diffuse.\n    vec3 sn = normalize(mix(n, s.nrm, 0.35));\n    float sh = 2.0/max(s.rough*s.rough, 1e-3);\n    vec3 hv = normalize(ld + v);\n    col += eng*pow(max(dot(sn,hv),0.0), sh)*att*(1.0-s.rough)*0.55*engK;\n    vec3 hs = normalize(sun + v);\n    col += vec3(1.4,0.7,0.35)*pow(max(dot(sn,hs),0.0), sh)*(1.0-s.rough)*0.55*(1.0-0.9*tun);\n\n    emiOut = s.emi;\n    return col;\n}\n\n// ---------------------------------------------------------- rendering ----\nvec3 renderRay(vec3 ro, vec3 rd, float pw0){\n    vec2 h = trace(ro, rd, TMAX, STEPS, true);\n    float t = h.x, id = h.y;\n    if(id < 0.0) return sky(rd) + gGlow;\n\n    vec3 p = ro + rd*t;\n    vec3 n = calcNormal(p, t);\n    float pw = max(pw0*t, 0.004);\n\n    vec3 nrm, emi; float refl, rough;\n    vec3 col = shadeSurf(p, rd, n, id, t, pw, nrm, refl, rough, emi);\n\n    if(refl > 0.05 && rough < 0.55){\n        // the bumped normal is for lighting, not for the mirror: otherwise the\n        // joints flip the reflection between sky and deck in patches\n        vec3 rn = normalize(mix(n, nrm, 0.30));\n        vec3 rr = reflect(rd, rn);\n        rr = normalize(rr + (vec3(hash21(p.xy*13.0), hash21(p.yz*17.0), hash21(p.zx*19.0))-0.5)*rough*rough*0.18);\n        float rdn = dot(rr, n);\n\n        // Too grazing a reflected ray runs parallel to the deck, exhausts its\n        // budget and flips between hit and sky pixel to pixel (the dotted light\n        // masts). Above the threshold we trace it, below we take analytic sky.\n        bool traceIt = rdn > 0.12;\n\n        vec3 rcol;\n        if(traceIt){\n            vec3 rro = p + n*max(0.10, 0.030*t);   // > hit tolerance\n            vec2 rh = trace(rro, rr, RTMAX, RSTEPS, false);\n            if(rh.y < 0.0) rcol = sky(rr);\n            else{\n                vec3 rp = rro + rr*rh.x;\n                vec3 rnn = calcNormal(rp, rh.x);\n                vec3 d1, remi; float d2, d3;\n                rcol = shadeSurf(rp, rr, rnn, rh.y, rh.x, pw, d1, d2, d3, remi) + remi;\n                // blur by roughness and distance: neon punches through, dark does not\n                float blur = clamp(rough*1.6 + rh.x*0.016, 0.0, 0.86);\n                rcol = mix(rcol, sky(rr), max(blur, 1.0-exp(-rh.x*0.012)));\n            }\n        }else{\n            float blur = clamp(rough*1.6, 0.0, 0.80);\n            rcol = mix(sky(rr), sky(normalize(rn + rr*0.15)), blur);   // widened lobe\n        }\n        // floor: a reflection cannot darken the surface below ~75%\n        rcol = max(rcol, col*0.45);\n        // pure Fresnel: mirror at grazing incidence, almost nothing head-on\n        float fre = 0.04 + 0.96*pow(1.0-max(dot(rn,-rd),0.0), 5.0);\n        col = mix(col, rcol, clamp(refl*(0.05 + 0.95*fre), 0.0, 0.70));\n    }\n\n    col += emi;\n\n    // aerial fog\n    // High exponent: clear up close, saturating abruptly far away - that is\n    // what buys visible depth AND an invisible far clip.\n    float fog = 1.0 - exp(-pow(max(t,0.0)*0.00273, 2.8));\n    vec3 fogCol = sky(rd)*0.85 + vec3(0.30,0.17,0.09)*smoothstep(0.06,-0.30,rd.y)*0.85;\n    col = mix(col, fogCol, fog);\n    return col + gGlow;\n}\n\n// --------------------------------------------------------------- HUD -----\nvec3 hudRamp(float f){\n    vec3 a = mix(vec3(0.10,0.45,1.00), vec3(0.15,0.95,0.85), smoothstep(0.00,0.35,f));\n    vec3 b = mix(a,                    vec3(0.45,1.00,0.25), smoothstep(0.30,0.58,f));\n    vec3 c = mix(vec3(1.00,0.80,0.10), vec3(1.00,0.22,0.06), smoothstep(0.80,1.00,f));\n    return mix(b, c, smoothstep(0.55,0.85,f));\n}\nvoid put(inout vec3 col, float m, vec3 tint){ col = mix(col, tint, clamp(m,0.0,1.0)); }\n\n// italic cell coordinates for one HUD item\nvec2 hudCell(vec2 s, vec2 pos, float h, vec2 off){\n    vec2 c = (s - pos - off)/h;\n    c.x -= c.y*0.26;\n    return c;\n}\nvoid drawHud(inout vec3 col, vec2 s, float asp, float kph, float lvl, float boost){\n    float L = -0.5*asp, R = 0.5*asp;\n    vec3 orange = vec3(1.00,0.55,0.10), white = vec3(0.92,0.96,1.00), cyan = vec3(0.25,0.80,1.0);\n\n    float tt = iTime;\n    int mn = int(mod(tt/60.0,10.0)), sc = int(mod(tt,60.0)), tn = int(mod(tt*10.0,10.0));\n    int lap = int(mod(floor(zOfT(tt)/LAPLEN), 9.0)) + 1;\n\n    // pass 0 lays a drop shadow, pass 1 the ink\n    for(int pass=0; pass<2; pass++){\n        vec2 off = (pass==0 ? vec2(0.004,-0.004) : vec2(0.0));\n        vec3 tA = (pass==0 ? vec3(0.0) : orange);\n        vec3 tW = (pass==0 ? vec3(0.0) : white);\n        vec3 tC = (pass==0 ? vec3(0.0) : cyan);\n\n        vec2 c = hudCell(s, vec2(L+0.030,-0.462), 0.050, off);          // lap timer\n        put(col, drawNum(c,mn,1) + drawGlyph(c-vec2(1.05,0.0),36)\n               + drawNum(c-vec2(1.55,0.0),sc,2) + drawGlyph(c-vec2(3.60,0.0),37)\n               + drawNum(c-vec2(4.05,0.0),tn,1), tA);\n\n        c = hudCell(s, vec2(L+0.030, 0.430), 0.026, off);               // LAP\n        put(col, drawText(c, uvec2(0x279d9295u,0x279e79e7u),3), tC);\n        c = hudCell(s, vec2(L+0.030, 0.368), 0.042, off);\n        put(col, drawNum(c,lap,1)+drawGlyph(c-vec2(1.15,0.0),38)+drawNum(c-vec2(1.95,0.0),9,1), tA);\n        c = hudCell(s, vec2(R-0.120, 0.430), 0.026, off);               // POS\n        put(col, drawText(c, uvec2(0x279dc619u,0x279e79e7u),3), tC);\n        c = hudCell(s, vec2(R-0.120, 0.368), 0.042, off);\n        put(col, drawNum(c,1,1), tA);\n\n        c = hudCell(s, vec2(R-0.335,-0.368), 0.056, off);               // speed\n        put(col, drawNum(c, int(kph), 4), tW);\n        c = hudCell(s, vec2(R-0.105,-0.360), 0.024, off);               // KPH\n        put(col, drawText(c, uvec2(0x279d1654u,0x279e79e7u),3), tC);\n    }\n\n    // thrust bar, 22 skewed segments\n    vec2 bp = s - vec2(R-0.340,-0.452); bp.x -= bp.y*0.40;\n    const float BW = 0.330, BH = 0.030;\n    if(bp.x>-0.010 && bp.x<BW+0.010 && bp.y>-0.008 && bp.y<BH+0.008){\n        float in0 = step(0.0,bp.x)*step(bp.x,BW)*step(0.0,bp.y)*step(bp.y,BH);\n        col = mix(col, vec3(0.55,0.62,0.72), (1.0-in0)*0.55);\n        float fi = bp.x/BW;\n        float gap = smoothstep(0.10,0.30, abs(fract(fi*22.0)-0.5)*2.0);\n        col = mix(col, hudRamp(floor(fi*22.0)/21.0)*(step(fi,lvl)*1.5+0.10)*gap + 0.01, in0);\n    }\n    // boost indicator\n    if(boost > 0.04){\n        vec2 c7 = hudCell(s, vec2(R-0.335,-0.300), 0.030, vec2(0.0));\n        put(col, drawText(c7, uvec2(0x1d71860bu,0x279e79e7u), 5)      // BOOST\n                 *smoothstep(0.02,0.25,boost)*(0.55+0.45*sin(iTime*26.0)),\n            mix(vec3(0.3,0.8,1.0), vec3(1.0), boost));\n    }\n}\n\n// ------------------------------------------------------------ main ---------\nfloat steerOf(float z){ return 0.55*sin(z*0.00127) + 0.30*sin(z*0.00065+1.1) + 0.18*sin(z*0.0042); }\n\nvec3 aces(vec3 x){\n    return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);\n}\n\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord){\n    vec2  fc  = fragCoord;\n    float asp = iResolution.x/iResolution.y;\n\n    float tm   = iTime;\n    float camZ = zOfT(tm);\n    float spd  = vOfT(tm);\n    gBoost = clamp((spd - V0)/BST, 0.0, 1.0);\n\n    // steering\n    float st0, st1;\n    if(iMouse.z > 0.001){ st0 = clamp((iMouse.x/iResolution.x-0.5)*2.4,-1.0,1.0); st1 = st0; }\n    else { st0 = steerOf(camZ); st1 = steerOf(camZ + 9.0); }\n    float lat  = st0*(HW-2.6);\n    float dlat = (st1-st0)*(HW-2.6);\n\n    // ---- craft frame -------------------------------------------------------\n    float shZ = camZ + AHEAD;\n    vec2  shC = trackPos(shZ);\n    float shB = trackBank(shZ);\n    vec3  fwd = normalize(vec3(trackTan(shZ), 1.0));\n    vec3  rg0 = normalize(cross(vec3(0.0,1.0,0.0), fwd));\n    vec3  up0 = cross(fwd, rg0);\n    float roll = shB + clamp(dlat*1.5, -0.5, 0.5);\n    vec3  rgt = rg0*cos(roll) + up0*sin(roll);\n    vec3  upv = up0*cos(roll) - rg0*sin(roll);\n    float hover = 1.05 + 0.05*sin(tm*3.7) + 0.03*sin(tm*8.9) + 0.10*gBoost;\n    gShipPos = vec3(shC, shZ) + rgt*(st1*(HW-2.6)) + upv*hover;\n    gShipRot = mat3(rgt, upv, fwd);\n\n    // ---- camera ------------------------------------------------------------\n    float camBank = trackBank(camZ);\n    // drops inside tunnels: the small tube's inner radius is only 9.6 u\n    float camH = 7.60 - 1.40*tunnelMask(camZ);\n    vec3 ro = vec3(trackPos(camZ) + rot(camBank)*vec2(lat, camH), camZ);\n    ro += vec3(sin(tm*57.0), sin(tm*43.0+2.0), 0.0)*(0.012 + 0.10*gBoost);\n    vec3 ta = gShipPos + upv*0.20 + fwd*14.0;\n\n    float camRoll = camBank*0.80 + clamp(dlat*0.8,-0.4,0.4);\n    vec3 cw = normalize(ta - ro);\n    vec3 cu = normalize(cross(vec3(sin(camRoll), cos(camRoll), 0.0), cw));\n    vec3 cv = cross(cw, cu);\n    float foc = 1.85 - 0.42*gBoost;\n\n    float pw0 = 2.0/(iResolution.y*foc);\n    vec2  s   = (fc - 0.5*iResolution.xy)/iResolution.y;\n    gGlow = vec3(0.0);\n    vec3 col = renderRay(ro, normalize(s.x*cu + s.y*cv + foc*cw), pw0);\n\n    // ---- post --------------------------------------------------------------\n    col *= 1.0 - 0.42*dot(s,s);                                 // vignette\n    col.r *= 1.0 + 0.05*dot(s,s);  col.b *= 1.0 - 0.04*dot(s,s);// chromatic fringe\n    col = aces(col*0.95);\n    col = pow(col, vec3(0.95));\n    col += (hash21(fc + tm)-0.5)*0.022;                         // grain\n\n    drawHud(col, s, asp, spd*3.0, clamp((spd-V0*0.55)/(V0*0.45+BST),0.0,1.0), gBoost);\n\n    fragColor = vec4(clamp(col,0.0,1.0), 1.0);\n}", "inputs": []};

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
