// @moltamp-visualizer: Psyche Skull
// .-=its a skurr=-. — by im_paul_hi
// Original: https://www.shadertoy.com/view/Ws2Bzw
// License: default CC BY-NC-SA 3.0 + embedded MIT noise by Stefan Gustavson (keep notice)
// License text: https://creativecommons.org/licenses/by-nc-sa/3.0/
// GPU port: the original GLSL runs on a WebGL2 OffscreenCanvas inside the visualizer worker.
// Note: the community repo asks for pure Canvas 2D presets, so this one is for local use only.
// Changes from the original:
//   - ch0: musicstream -> MOLTamp system audio (FFT 128 + waveform, resampled to 512x2)
//   - Colours remapped onto the skin palette (USE_SKIN_PALETTE), exposure pulses with beat.decay

var USE_SKIN_PALETTE = true;   // false = original shader colours
var PALETTE_MIX = 0.9;         // 0..1 blend between original colours and the skin ramp
var RENDER_SCALE = 1.0;        // offscreen resolution relative to CSS pixels
var MAX_PIXELS = 400000;      // pixel budget for wide vibes slots

var SHADER = {"title": ".-=its a skurr=-.", "author": "im_paul_hi", "url": "https://www.shadertoy.com/view/Ws2Bzw", "common": "", "code": "/*\nprecision highp float;\nuniform vec2 iResolution;\nuniform float iTime;\nuniform float mod1;\nuniform float mod2;\nuniform float mod3;\nuniform float mod4;\nuniform float mod5;\nuniform float mod6;\nuniform float mod7;\nuniform float mod8;\nuniform float mod9;\n*/\n\n/*\n    -sdf functions from iq   \n    \n\n*/\n\n// https://www.shadertoy.com/view/MsjXRt\nvec4 HueShift (in vec3 Color, in float Shift)\n{\n    vec3 P = vec3(0.55735)*dot(vec3(0.55735),Color);\n    \n    vec3 U = Color-P;\n    \n    vec3 V = cross(vec3(0.55735),U);    \n\n    Color = U*cos(Shift*6.2832) + V*sin(Shift*6.2832) + P;\n    \n    return vec4(Color,1.0);\n}\n\n//\n// GLSL textureless classic 2D noise \"cnoise\",\n// with an RSL-style periodic variant \"pnoise\".\n// Author:  Stefan Gustavson (stefan.gustavson@liu.se)\n// Version: 2011-08-22\n//\n// Many thanks to Ian McEwan of Ashima Arts for the\n// ideas for permutation and gradient selection.\n//\n// Copyright (c) 2011 Stefan Gustavson. All rights reserved.\n// Distributed under the MIT license. See LICENSE file.\n// https://github.com/ashima/webgl-noise\n//\n\nvec4 mod289(vec4 x)\n{\n  return x - floor(x * (1.0 / 289.0)) * 289.0;\n}\n\nvec4 permute(vec4 x)\n{\n  return mod289(((x*34.0)+1.0)*x);\n}\n\nvec4 taylorInvSqrt(vec4 r)\n{\n  return 1.79284291400159 - 0.85373472095314 * r;\n}\n\nvec2 fade(vec2 t) {\n  return t*t*t*(t*(t*6.0-15.0)+10.0);\n}\n\n// Classic Perlin noise\nfloat cnoise(vec2 P)\n{\n  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);\n  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);\n  Pi = mod289(Pi); // To avoid truncation effects in permutation\n  vec4 ix = Pi.xzxz;\n  vec4 iy = Pi.yyww;\n  vec4 fx = Pf.xzxz;\n  vec4 fy = Pf.yyww;\n\n  vec4 i = permute(permute(ix) + iy);\n\n  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0 ;\n  vec4 gy = abs(gx) - 0.5 ;\n  vec4 tx = floor(gx + 0.5);\n  gx = gx - tx;\n\n  vec2 g00 = vec2(gx.x,gy.x);\n  vec2 g10 = vec2(gx.y,gy.y);\n  vec2 g01 = vec2(gx.z,gy.z);\n  vec2 g11 = vec2(gx.w,gy.w);\n\n  vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));\n  g00 *= norm.x;\n  g01 *= norm.y;\n  g10 *= norm.z;\n  g11 *= norm.w;\n\n  float n00 = dot(g00, vec2(fx.x, fy.x));\n  float n10 = dot(g10, vec2(fx.y, fy.y));\n  float n01 = dot(g01, vec2(fx.z, fy.z));\n  float n11 = dot(g11, vec2(fx.w, fy.w));\n\n  vec2 fade_xy = fade(Pf.xy);\n  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);\n  float n_xy = mix(n_x.x, n_x.y, fade_xy.y);\n  return 2.3 * n_xy;\n}\n\n// https://www.shadertoy.com/view/4dsSzr\nvec3 ansiGradient(float t) {\n\treturn mod(floor(t * vec3(8.0, 4.0, 2.0)), 2.0);\n}\n\n// #define AA 0.005\n#define PI 3.14159\n#define TAU 2.0 * PI\n#define gridThickness 0.05\n\nvec3 headColor = vec3(0.45,0.21,0.67);\nvec3 bgColor = vec3(0.95,0.92,0.99);\nvec3 headGooColor = vec3(0.87,0.56,0.40);\nvec3 blackOutlineColor = vec3(0.23,0.24,0.21);\nvec3 gearCol1 = vec3(0.44,0.48,0.80);\nvec3 gearCol2 = vec3(0.36,0.83,0.99);\nvec3 col = vec3(0.95,0.92,0.99);\nfloat blackOutlineWidth = 0.02;\nvec3 mixedCol = vec3(0.0);\nfloat AA = 0.005;\n\n/*********************************************************\n**********************************************************\n**********************************************************\n**********************************************************/\n\nfloat linearStep(float begin, float end, float t) {\n    return clamp((t - begin) / (end - begin), 0.0, 1.0);\n}\n\nfloat map(float value, float min1, float max1, float min2, float max2) {\n  return min2 + (value - min1) * (max2 - min2) / (max1 - min1);\n}\n\nvec2 within(vec2 uv, vec4 rect) {\n    vec2 val = (uv-rect.xy)/(rect.zw-rect.xy);\n    // val.y = remap(val.y, 0.0, 1.0, 1.0, 0.0);\n    val.y = -val.y + 1.0;\n\treturn val;\n}\n\nfloat inside01(vec2 p) {\n    return step(0.0, p.x) * (1.0 - step(1.0, p.x)) * step(0.0, p.y) * (1.0 - step(1.0, p.y));\n}\n\nfloat insideY(vec2 p) {\n    return step(0.0, p.y) * (1.0 - step(1.0, p.y));\n}\n\nfloat insideX(vec2 p) {\n    return step(0.0, p.x) * (1.0 - step(1.0, p.x));\n}\n\nvoid addGrid(vec2 p, inout vec3 col) {\n    float all = inside01(p);\n    vec3 gridOutlineCol = vec3(1.0, 0.0, 0.0);\n    vec3 gridCol = vec3(0.0);\n\n    // add outline\n    float outline = step(p.x, gridThickness);\n    outline += step(1.0 - gridThickness, p.x);\n    outline += step(p.y, gridThickness);\n    outline += step(1.0 - gridThickness, p.y);\n\n    // p.y = -p.y;\n    // p.y += 1.0;\n\n    // float outline = step(0.0, p.y) * (1.0 - step(0.1, p.y));\n\n    col = mix(col, gridOutlineCol, outline * all);\n}\n\nfloat opSmoothUnion( float d1, float d2, float k ) {\n    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );\n    return mix( d2, d1, h ) - k*h*(1.0-h); \n}\n\nvec3 returnDottedCol(vec2 p, vec3 bgCol, vec3 dotCol) {\n    vec3 dottedCol = vec3(0.0);\n\n    p *= 28.0;\n    p.x += 0.48;\n    p.y *= 2.49;\n    float yIndex = floor(p.y);\n    float xIndex = floor(p.x);\n    p = fract(p);\n\n    // float circle = smoothstep(mod1, mod2, length(p - vec2(0.5)));\n    // circle *= smoothstep(mod3, mod4, length(p - vec2(1.0, 0.0)));\n\n    float circleBool = 0.0;\n\n    float circle = smoothstep(0.3, 0.6, length(p - vec2(0.5)));\n\n    if(mod(xIndex, 2.0) == 0.0 && mod(yIndex, 2.0) == 0.0) {\n        circleBool = 0.0;\n    } else if(mod(xIndex, 2.0) != 0.0 && mod(yIndex, 2.0) == 0.0) {\n        circleBool = 1.0;\n    } else if(mod(xIndex, 2.0) == 0.0 && mod(yIndex, 2.0) != 0.0) {\n        circleBool = 1.0;\n    }\n\n    dottedCol = mix(bgCol, dotCol, (1.0 - circle) * circleBool);\n\n    return dottedCol;\n}\n\nfloat gain(float x, float k) \n{\n    float a = 0.5*pow(2.0*((x<0.5)?x:1.0-x), k);\n    return (x<0.5)?a:1.0-a;\n}\n\nfloat expImpulse( float x, float k )\n{\n    float h = k*x;\n    return h*exp(1.0-h);\n}\n\nfloat customEase(float x, float k) {\n    return pow(x, k);\n}\n\nfloat almostIdentity( float x, float m, float n )\n{\n    if( x>m ) return x;\n    float a = 2.0*n - m;\n    float b = 2.0*m - 3.0*n;\n    float t = x/m;\n    return (a*t + b)*t*t + n;\n}\n\nfloat undulateAngle(int index, float angle, float movementScale, float offsetScale, float timeScale) {\n    float offset = float(index) * offsetScale;\n    float m = angle + sin(iTime * timeScale + offset) * movementScale;\n    return m;\n}\n\n\n\n/*********************************************************\n**********************************************************\n**********************************************************\n**********************************************************/\n\nfloat sdCircle( in vec2 p, in float r ) \n{\n    return length(p)-r;\n}\n\nfloat sdCross( in vec2 p, in vec2 b, float r ) \n{\n    p = abs(p); p = (p.y>p.x) ? p.yx : p.xy;\n    vec2  q = p - b;\n    float k = max(q.y,q.x);\n    vec2  w = (k>0.0) ? q : vec2(b.y-p.x,-k);\n    return sign(k)*length(max(w,0.0)) + r;\n}\n\n\n\nfloat returnTween4Dist(vec2 p, float t, float circleRadius) {\n    // t = normalized time\n    vec2 from = vec2(0.5, 0.66);\n    vec2 to = vec2(0.5, 0.3);\n    float radius = (from.y - to.y) / 2.0;\n    float startAngle = (3.0 * PI) / 2.0;\n    float endAngle = PI;\n    float angle = map(t, 0.0, 1.0, startAngle, endAngle);\n    float angleOffset = -PI * 2.0;\n    // cycle through angle based on t\n    vec2 pos = vec2(sin(angle + angleOffset) * radius, cos(angle + angleOffset) * radius);\n    pos += 0.5;\n    float d = sdCircle(p - pos, circleRadius);\n    return d;\n}\n\nfloat returnTween5Dist(vec2 p, float t, float circleRadius) {\n    // t = normalized time\n    vec2 from = vec2(0.5, 0.32);\n    vec2 to = vec2(0.5, -0.3);\n    vec2 pos = mix(from, to, t);\n    float d = sdCircle(p - pos, circleRadius);\n    return d;\n}\n\nfloat returnTween1Dist(vec2 p, float t, float circleRadius) {\n    // t = normalized time\n    vec2 from = vec2(0.5, 1.0);\n    vec2 to = vec2(0.5, 0.66);\n    vec2 pos = mix(from, to, t);\n    float d = sdCircle(p - pos, circleRadius);\n    return d;\n}\n\nmat2 rotate2d(float _angle){\n    return mat2(cos(_angle),-sin(_angle),\n                sin(_angle),cos(_angle));\n}\n\nvoid makeSecondSwoop(vec2 p, inout float d, float loopTime, inout vec3 col, float time) {\n    p -= vec2(0.28, 0.02);\n    // p -= vec2(0.58, 0.02);  // debug view\n\n    for(int i = 0; i < 5; i++) {\n        float d1 = 0.0;\n        float margin = sin(float(i) + time) * 1.0;\n        float modTime = fract((time + margin) / loopTime);\n        float circleRadius = map(modTime, 0.0, 1.0, 0.0, 0.15);\n\n        if(modTime < 0.5) {\n            d1 = returnTween4Dist(p, linearStep(0.0, 0.5, modTime), circleRadius);\n        } else {\n            d1 = returnTween5Dist(p, linearStep(0.5, 1.0, modTime), circleRadius);\n        }\n       \n        // d1 = smoothstep(0.0, AA, d1);\n        // col = mix(col, vec3(1.0), 1.0 - d1);\n\n        if(i != 0) {\n            d = opSmoothUnion(d, d1, 0.04);\n        }\n    }\n}\n\nfloat returnTween2Dist(vec2 p, float t, float circleRadius) {\n    // t = normalized time\n    vec2 from = vec2(0.5, 0.66);\n    vec2 to = vec2(0.5, 0.33);\n    float radius = (from.y - to.y) / 2.0;\n    float startAngle = PI / 2.0;\n    float endAngle = (3.0 * PI) / 2.0;\n    float angle = map(t, 0.0, 1.0, startAngle, endAngle);\n    float angleOffset = -PI * 0.5;\n    // cycle through angle based on t\n    vec2 pos = vec2(sin(angle + angleOffset) * radius, cos(angle + angleOffset) * radius);\n    pos += 0.5;\n    float d = sdCircle(p - pos, circleRadius);\n    return d;\n}\n\nfloat returnTween3Dist(vec2 p, float t, float circleRadius) {\n    // t = normalized time\n    vec2 from = vec2(0.5, 0.33);\n    vec2 to = vec2(0.66, -0.1);\n    vec2 pos = mix(from, to, t);\n    float d = sdCircle(p - pos, circleRadius);\n    return d;\n}\n\nfloat sdBox( in vec2 p, in vec2 b, float r)\n{\n    vec2 d = abs(p) - (b - r);\n    return length(max(d,0.0)) + min(max(d.x,d.y),0.0) - r;\n}\n\n\nfloat sdSegment( in vec2 p, in vec2 a, in vec2 b )\n{\n    vec2 pa = p-a, ba = b-a;\n    float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );\n    return length( pa - ba*h );\n}\n\nfloat sdUnevenCapsule( vec2 p, float r1, float r2, float h )\n{\n    p.x = abs(p.x);\n    float b = (r1-r2)/h;\n    float a = sqrt(1.0-b*b);\n    float k = dot(p,vec2(-b,a));\n    if( k < 0.0 ) return length(p) - r1;\n    if( k > a*h ) return length(p-vec2(0.0,h)) - r2;\n    return dot(p, vec2(a,b) ) - r1;\n}\n\n\n\nfloat opSmoothSubtraction( float d1, float d2, float k ) {\n    float h = clamp( 0.5 - 0.5*(d2+d1)/k, 0.0, 1.0 );\n    return mix( d2, -d1, h ) + k*h*(1.0-h); \n}\n\nfloat opSubtraction( float d1, float d2 ) { return max(-d1,d2); }\n\nfloat sdRoundBox( in vec2 p, in vec2 b, in vec4 r ) \n{\n    r.xy = (p.x>0.0)?r.xy : r.zw;\n    r.x  = (p.y>0.0)?r.x  : r.y;\n    \n    vec2 q = abs(p)-b+r.x;\n    return min(max(q.x,q.y),0.0) + length(max(q,0.0)) - r.x;\n}\n\nfloat sdTriangle( in vec2 p, in vec2 p0, in vec2 p1, in vec2 p2 )\n{\n    vec2 e0 = p1-p0, e1 = p2-p1, e2 = p0-p2;\n    vec2 v0 = p -p0, v1 = p -p1, v2 = p -p2;\n    vec2 pq0 = v0 - e0*clamp( dot(v0,e0)/dot(e0,e0), 0.0, 1.0 );\n    vec2 pq1 = v1 - e1*clamp( dot(v1,e1)/dot(e1,e1), 0.0, 1.0 );\n    vec2 pq2 = v2 - e2*clamp( dot(v2,e2)/dot(e2,e2), 0.0, 1.0 );\n    float s = sign( e0.x*e2.y - e0.y*e2.x );\n    vec2 d = min(min(vec2(dot(pq0,pq0), s*(v0.x*e0.y-v0.y*e0.x)),\n                     vec2(dot(pq1,pq1), s*(v1.x*e1.y-v1.y*e1.x))),\n                     vec2(dot(pq2,pq2), s*(v2.x*e2.y-v2.y*e2.x)));\n    return -sqrt(d.x)*sign(d.y);\n}\n\nfloat dot2(in vec2 v ) { return dot(v,v); }\n\n// trapezoid / capped cone, specialized for Y alignment\nfloat sdTrapezoid( in vec2 p, in float r1, float r2, float he )\n{\n    vec2 k1 = vec2(r2,he);\n    vec2 k2 = vec2(r2-r1,2.0*he);\n\n\tp.x = abs(p.x);\n    vec2 ca = vec2(max(0.0,p.x-((p.y<0.0)?r1:r2)), abs(p.y)-he);\n    vec2 cb = p - k1 + k2*clamp( dot(k1-p,k2)/dot2(k2), 0.0, 1.0 );\n    \n    float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;\n    \n    return s*sqrt( min(dot2(ca),dot2(cb)) );\n}\n\nfloat sdArc( in vec2 p, in vec2 sca, in vec2 scb, in float ra, float rb )\n{\n    p *= mat2(sca.x,sca.y,-sca.y,sca.x);\n    p.x = abs(p.x);\n    float k = (scb.y*p.x>scb.x*p.y) ? dot(p.xy,scb) : length(p.xy);\n    return sqrt( dot(p,p) + ra*ra - 2.0*ra*k ) - rb;\n}\n\nfloat sdBezier( in vec2 pos, in vec2 A, in vec2 B, in vec2 C )\n{    \n    vec2 a = B - A;\n    vec2 b = A - 2.0*B + C;\n    vec2 c = a * 2.0;\n    vec2 d = A - pos;\n    float kk = 1.0/dot(b,b);\n    float kx = kk * dot(a,b);\n    float ky = kk * (2.0*dot(a,a)+dot(d,b)) / 3.0;\n    float kz = kk * dot(d,a);      \n    float res = 0.0;\n    float p = ky - kx*kx;\n    float p3 = p*p*p;\n    float q = kx*(2.0*kx*kx-3.0*ky) + kz;\n    float h = q*q + 4.0*p3;\n    if( h >= 0.0) \n    { \n        h = sqrt(h);\n        vec2 x = (vec2(h,-h)-q)/2.0;\n        vec2 uv = sign(x)*pow(abs(x), vec2(1.0/3.0));\n        float t = clamp( uv.x+uv.y-kx, 0.0, 1.0 );\n        res = dot2(d + (c + b*t)*t);\n    }\n    else\n    {\n        float z = sqrt(-p);\n        float v = acos( q/(p*z*2.0) ) / 3.0;\n        float m = cos(v);\n        float n = sin(v)*1.732050808;\n        vec3  t = clamp(vec3(m+m,-n-m,n-m)*z-kx,0.0,1.0);\n        res = min( dot2(d+(c+b*t.x)*t.x),\n                   dot2(d+(c+b*t.y)*t.y) );\n        // the third root cannot be the closest\n        // res = min(res,dot2(d+(c+b*t.z)*t.z));\n    }\n    return sqrt( res );\n}\n\n/*********************************************************\n**********************************************************\n**********************************************************\n**********************************************************/\n\n\n\n\nvoid bg(vec2 p, inout vec3 col, vec2 origP) {\n    // col = mix(col, vec3(0.90,0.76,0.34), map(origP.y, 0.39, 0.74, 0.0, 1.0));\n\n    // col = mix(col, vec3(0.76,0.78,0.53), map(origP.y, -0.09, -0.59, 0.0, 1.0));\n}\n\nvoid cranium(vec2 p, inout vec3 col, vec2 origP) {\n    float d = 0.0;\n    float d1 = 0.0;\n    float d2 = 0.0;\n    float d3 = 0.0;\n    float r = 0.0;\n    vec2 modP = vec2(0.0);\n    vec3 mixedCol = vec3(0.0);\n    float modTime = 0.0;\n    float loopTime = 0.0;\n    float n = 0.0;\n    float m = 0.0;\n\n    // testing noise - looks great!\n    // modP = vec2(origP.x, origP.y) * 0.6;\n    // p = vec2(p.x, p.y);\n    // n = cnoise(modP * 10.0) * 0.02;\n    // modP.x += n;\n    // modP.y -= n;\n    // p.x += n;\n    // p.y -= n;\n\n    \n    //////////////////\n    // lower layers LEWWWWWWWP\n    //////////////////\n    for(int i = 0; i < 10; i++) {\n        float loopTime = 2.0;\n        float iVal = float(i);\n        float totalI = 10.0;\n        float maxScale = 4.0 + (sin(iTime + iVal) * 0.05);\n        float minScale = 0.1 - (sin(iTime + iVal) * 0.05);\n        //////////////////\n        // outline\n        //////////////////\n        // cranium circle\n        modP = vec2(origP.x, origP.y);\n        modP = rotate2d(sin(iTime + iVal) * 0.05) * modP;\n        float borderSize = (0.05 * (iVal / totalI)) * sin(iTime * 2.0 + iVal) + 0.05;\n        modP /= map(iVal, 0.0, totalI, maxScale, minScale) + borderSize;\n        d = sdCircle(modP - vec2(0.0, 0.1), 0.59);\n        d1 = sdBox(modP - vec2(0.07, 0.96), vec2(0.41, 0.13), -0.07);\n        d = opSmoothSubtraction(d1, d, 0.26);\n        // mandible box\n        d1 = sdBox(modP - vec2(0.0, -0.37), vec2(0.33, 0.33), 0.11);\n        d = opSmoothUnion(d, d1, 0.22);\n        // zygomatic indents\n        modP = vec2(p.x, p.y);\n        modP /= map(iVal, 0.0, totalI, maxScale, minScale) + borderSize;\n        d1 = sdCircle(modP - vec2(0.74, -0.5), 0.39);\n        d = opSmoothSubtraction(d1, d, 0.15);\n        // eye socket protrusions\n        d1 = sdRoundBox(modP - vec2(0.34, -0.22), vec2(0.22, 0.2), vec4(0.07, 0.11, 0.22, 0.22));\n        d = opSmoothUnion(d, d1, 0.04);\n        // zygomatic indents\n        d1 = sdCircle(modP - vec2(0.41, -0.46), 0.04);\n        d = opSmoothSubtraction(d1, d, 0.04);\n        // temple indents\n        d1 = sdCircle(modP - vec2(0.7, -0.17), 0.15);\n        d = opSmoothSubtraction(d1, d, 0.02);\n        d = smoothstep(0.0, AA, d);\n        col = mix(col, blackOutlineColor, 1.0 - d);\n        //////////////////\n        // color\n        //////////////////\n        // cranium circle\n        modP = vec2(origP.x, origP.y);\n        modP /= map(iVal, 0.0, totalI, maxScale, minScale);\n        d = sdCircle(modP - vec2(0.0, 0.1), 0.59);\n        d1 = sdBox(modP - vec2(0.07, 0.96), vec2(0.41, 0.13), -0.07);\n        d = opSmoothSubtraction(d1, d, 0.26);\n        // mandible box\n        d1 = sdBox(modP - vec2(0.0, -0.37), vec2(0.33, 0.33), 0.11);\n        d = opSmoothUnion(d, d1, 0.22);\n        // zygomatic indents\n        modP = vec2(p.x, p.y);\n        modP /= map(iVal, 0.0, totalI, maxScale, minScale);\n        d1 = sdCircle(modP - vec2(0.74, -0.5), 0.39);\n        d = opSmoothSubtraction(d1, d, 0.15);\n        // eye socket protrusions\n        d1 = sdRoundBox(modP - vec2(0.34, -0.22), vec2(0.22, 0.2), vec4(0.07, 0.11, 0.22, 0.22));\n        d = opSmoothUnion(d, d1, 0.04);\n        // zygomatic indents\n        d1 = sdCircle(modP - vec2(0.41, -0.46), 0.04);\n        d = opSmoothSubtraction(d1, d, 0.04);\n        // temple indents\n        d1 = sdCircle(modP - vec2(0.7, -0.17), 0.15);\n        d = opSmoothSubtraction(d1, d, 0.02);\n        d = smoothstep(0.0, AA, d);\n        col = mix(col, ansiGradient(iVal / totalI), 1.0 - d);\n    }\n    \n\n    \n\n//////////////////////////////////////////////////////////////////////////////////\n//////////////////////////////////////////////////////////////////////////////////\n//////////////////////////////////////////////////////////////////////////////////\n    \n    /////////////////\n    // blackbottom\n    ////////////////\n    // cranium circle\n    d = sdCircle(origP - vec2(0.0, 0.1), 0.59);\n    d1 = sdBox(origP - vec2(0.07, 0.96), vec2(0.41, 0.13), -0.07);\n    d = opSmoothSubtraction(d1, d, 0.26);\n    // mandible box\n    d1 = sdBox(origP - vec2(0.0, -0.37), vec2(0.33, 0.33), 0.11);\n    d = opSmoothUnion(d, d1, 0.22);\n    // zygomatic indents\n    d1 = sdCircle(p - vec2(0.74, -0.5), 0.39);\n    d = opSmoothSubtraction(d1, d, 0.15);\n    // eye socket protrusions\n    d1 = sdRoundBox(p - vec2(0.34, -0.22), vec2(0.22, 0.2), vec4(0.07, 0.11, 0.22, 0.22));\n    d = opSmoothUnion(d, d1, 0.04);\n    // zygomatic indents\n    d1 = sdCircle(p - vec2(0.41, -0.46), 0.04);\n    d = opSmoothSubtraction(d1, d, 0.04);\n    // temple indents\n    d1 = sdCircle(p - vec2(0.7, -0.17), 0.15);\n    d = opSmoothSubtraction(d1, d, 0.02);\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n\n    \n\n    ////////////////\n    // color\n    ///////////////\n    // cranium circle\n    d = sdCircle(origP - vec2(0.0, 0.1), 0.57);\n    d1 = sdBox(origP - vec2(0.07, 0.96), vec2(0.41, 0.13), -0.07);\n    d = opSmoothSubtraction(d1, d, 0.26);\n    // mandible box\n    d1 = sdBox(origP - vec2(0.0, -0.37), vec2(0.3, 0.3), 0.11);\n    d = opSmoothUnion(d, d1, 0.22);\n    // zygomatic indents\n    d1 = sdCircle(p - vec2(0.74, -0.5), 0.41);\n    d = opSmoothSubtraction(d1, d, 0.15);\n    // eye socket protrusions\n    d1 = sdRoundBox(p - vec2(0.34, -0.22), vec2(0.20, 0.18), vec4(0.07, 0.11, 0.22, 0.22));\n    d = opSmoothUnion(d, d1, 0.04);\n    // zygomatic indents\n    d1 = sdCircle(p - vec2(0.41, -0.46), 0.06);\n    d = opSmoothSubtraction(d1, d, 0.04);\n    // temple indents\n    d1 = sdCircle(p - vec2(0.7, -0.17), 0.17);\n    d = opSmoothSubtraction(d1, d, 0.02);\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.82,0.87,0.85), 1.0 - d);\n\n    // eye socket black bottom\n    d = sdCircle(p - vec2(0.26, -0.11), 0.2);\n    // eye socket subtraction\n    d1 = sdCircle(p - vec2(0.46, 0.26), 0.28);\n    d = opSmoothSubtraction(d1, d, 0.10);\n    d1 = sdCircle(p - vec2(0.26, -0.46), 0.17);\n    d = opSmoothSubtraction(d1, d, 0.02);\n    modP = vec2(p.x, p.y);\n    modP = rotate2d(0.61 * TAU) * modP;\n    d1 = sdBox(modP - vec2(0.28, 0.3), vec2(0.24, 0.26), 0.04);\n    d = opSmoothSubtraction(d1, d, 0.02);\n    modP = vec2(p.x, p.y);\n    modP = rotate2d(0.5 * TAU) * modP;\n    d1 = sdBox(modP - vec2(0.04, 0.8), vec2(0.09, 1.0), 0.26);\n    d = opSmoothSubtraction(d1, d, 0.15);\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n\n    // eye socket color\n    d = sdCircle(p - vec2(0.26, -0.11), 0.18);\n    // eye socket subtraction\n    d1 = sdCircle(p - vec2(0.46, 0.26), 0.28);\n    d = opSmoothSubtraction(d1, d, 0.10);\n    d1 = sdCircle(p - vec2(0.26, -0.46), 0.17);\n    d = opSmoothSubtraction(d1, d, 0.02);\n    modP = vec2(p.x, p.y);\n    modP = rotate2d(0.61 * TAU) * modP;\n    d1 = sdBox(modP - vec2(0.28, 0.3), vec2(0.24, 0.26), 0.04);\n    d = opSmoothSubtraction(d1, d, 0.04);\n    modP = vec2(p.x, p.y);\n    modP = rotate2d(0.5 * TAU) * modP;\n    d1 = sdBox(modP - vec2(0.04, 0.8), vec2(0.09, 1.0), 0.26);\n    d = opSmoothSubtraction(d1, d, 0.15);\n    d1 = sdCircle(origP - vec2(0.13, -0.22), 0.07);\n    d = opSmoothSubtraction(d1, d, 0.04);\n    d1 = sdCircle(vec2(origP.x * -1.0, origP.y) - vec2(0.105, -0.22), 0.07);\n    d = opSmoothSubtraction(d1, d, 0.04);\n    d = smoothstep(0.0, AA, d);\n    mixedCol = mix(blackOutlineColor, vec3(0.85,0.65,0.68), smoothstep(-0.17, 0.43, length(vec2(p.x, p.y + 0.3))));\n    col = mix(col, mixedCol, 1.0 - d);\n\n\n\n    // nose socket black\n    d = sdSegment(p, vec2(0.0, -0.26), vec2(0.05, -0.39)) - 0.05;\n    d1 = sdSegment(p, vec2(-0.02, -0.37 - 0.11), vec2(0.0, -0.7 - 0.11)) - 0.02;\n    d = opSmoothSubtraction(d1, d, 0.13);\n    // d1 = sdCircle(p - vec2(mod1, mod2), mod3);\n    // d = opSmoothUnion(d1, d, mod4);\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n\n\n\n\n    // teeth\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.0, -1.2 + 0.22), vec2(-0.09+0.0, -1.14 + 0.22)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.0, -1.2 + 0.22), vec2(-0.09+0.0, -1.14 + 0.22)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09 + 0.065, -1.2 + 0.22), vec2(-0.09 + 0.065, -1.14 + 0.22)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09 + 0.065, -1.2 + 0.22), vec2(-0.09 + 0.065, -1.14 + 0.22)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    //\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.15, -1.2 + 0.22), vec2(-0.09+0.15, -1.14 + 0.22)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.15, -1.2 + 0.22), vec2(-0.09+0.15, -1.14 + 0.22)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    //\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.22, -1.2 + 0.22), vec2(-0.09+0.22, -1.14 + 0.22)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.22, -1.2 + 0.22), vec2(-0.09+0.22, -1.14 + 0.22)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    //\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.28, -1.2 + 0.22), vec2(-0.09+0.28, -1.14 + 0.22)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.28, -1.2 + 0.22), vec2(-0.09+0.28, -1.14 + 0.22)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    //\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.41, -1.2+0.24), vec2(-0.09+0.41, -1.14+0.24)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.41, -1.2+0.24), vec2(-0.09+0.41, -1.14+0.24)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    //\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.48, -1.2 + 0.22 + 0.04), vec2(-0.09+0.48, -1.14 + 0.22 + 0.04)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.48, -1.2 + 0.22 + 0.04), vec2(-0.09+0.48, -1.14 + 0.22 + 0.04)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    //\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.35, -1.2 + 0.22), vec2(-0.09+0.35, -1.14 + 0.22)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+0.35, -1.2 + 0.22), vec2(-0.09+0.35, -1.14 + 0.22)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    //\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09-0.28, -1.2 + 0.29), vec2(-0.09-0.28, -1.14 + 0.29)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09-0.28, -1.2 + 0.29), vec2(-0.09-0.28, -1.14 + 0.29)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    //\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+-0.07, -1.2 + 0.22), vec2(-0.09+-0.07, -1.14 + 0.22)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+-0.07, -1.2 + 0.22), vec2(-0.09+-0.07, -1.14 + 0.22)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    //\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09-0.22, -1.2 + 0.25), vec2(-0.09-0.22, -1.14 + 0.25)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09-0.22, -1.2 + 0.25), vec2(-0.09-0.22, -1.14 + 0.25)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n    //\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+-0.15, -1.2 + 0.22), vec2(-0.09+-0.15, -1.14 + 0.22)) - 0.04;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    modP = vec2(origP.x, origP.y) * 0.8;\n    n = cnoise(modP * 10.0) * 0.02; \n    modP.x += n;\n    modP.y -= n;\n    modP *= 1.7;\n    d = sdSegment(modP, vec2(-0.09+-0.15, -1.2 + 0.22), vec2(-0.09+-0.15, -1.14 + 0.22)) - 0.03;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, vec3(0.99,0.94,0.81), 1.0 - d);\n\n\n\n    // d = sdSegment(modP, vec2(-0.09, -0.65), vec2(-0.09, -0.74)) - 0.03;\n    // d = smoothstep(0.0, AA, d);\n    // col = mix(col, vec3(0.96,0.89,0.74), 1.0 - d);\n\n}\n\nvoid darkLines(vec2 p, inout vec3 col, vec2 origP) {\n    float d = 0.0;\n    float d1 = 0.0;\n    float d2 = 0.0;\n    float d3 = 0.0;\n    float r = 0.0;\n    vec2 modP = vec2(0.0);\n    vec3 mixedCol = vec3(0.0);\n    float modTime = 0.0;\n    float loopTime = 0.0;\n    float n = 0.0;\n    float m = 0.0;\n    float mask = 0.0;\n\n    // testing noise - looks great!\n    // modP = vec2(origP.x, origP.y) * 0.6;\n    // p = vec2(p.x, p.y);\n    // n = cnoise(modP * 10.0) * 0.02;\n    // modP.x += n;\n    // modP.y -= n;\n    // p.x += n;\n    // p.y -= n;\n\n    // zygomatic (bottom)\n    modP = vec2(p.x, p.y);\n    m = sin(p.x + 4.4);\n    modP.y += m;\n    modP.y -= -0.262 * 4.0;\n    modP.x += 0.05;\n    modP = rotate2d(0.02 * TAU) * modP;\n    d = sdSegment(modP, vec2(0.24, -0.41), vec2(0.35, -0.41)) - 0.01;\n    d = smoothstep(0.0, AA, d);\n    col = mix(col, blackOutlineColor, 1.0 - d);\n    // zygomatic (side)\n    modP = within(p - vec2(0.46, -0.04), vec4(0.29, 0.17, 0.74, -0.26));\n    modP = rotate2d(PI * 0.5) * modP;\n    m = sin((modP.x + 5.0) * 6.0) * 0.06;\n    m += 0.5;\n    d = length(modP - vec2(modP.x, m));\n    mask = step(0.0, modP.x) * step(modP.x, 0.65);\n    d = smoothstep(0.018, 0.028, d);\n    col = mix(col, blackOutlineColor, (1.0 - d) * mask);\n\n    // frontal (corner)\n    modP = within(p - vec2(0.57, 0.09), vec4(0.13, 0.22, 0.39, -0.04));\n    modP = rotate2d(0.39 * TAU) * modP;\n    m = sin(modP.x * 6.0) * 0.08;\n    m += 0.6;\n    d = length(modP - vec2(modP.x, m));\n    mask = step(0.55, modP.x) * step(modP.x, 0.75);\n    d = smoothstep(0.005, 0.02, d);\n    col = mix(col, blackOutlineColor, (1.0 - d) * mask);\n    // addGrid(modP, col);\n    // frontal right\n    modP = within(origP, vec4(0.13, 0.22, 0.39, -0.04));\n    modP = rotate2d(-0.01 * TAU) * modP;\n    m = sin(modP.x * 6.0) * 0.03;\n    m += 0.6;\n    d = length(modP - vec2(modP.x, m));\n    mask = step(0.25, modP.x) * step(modP.x, 0.75);\n    d = smoothstep(0.005, 0.02, d);\n    col = mix(col, blackOutlineColor, (1.0 - d) * mask);\n    // front left\n    modP = within(vec2(origP.x * -1.0, origP.y), vec4(0.13, 0.22, 0.48, -0.04));\n    modP = rotate2d(0.000 * TAU) * modP;\n    m = sin(modP.x * 6.0) * 0.03;\n    m += 0.6;\n    d = length(modP - vec2(modP.x, m));\n    mask = step(0.25, modP.x) * step(modP.x, 0.75);\n    d = smoothstep(0.005, 0.02, d);\n    col = mix(col, blackOutlineColor, (1.0 - d) * mask);\n\n    // upper maxilla\n    modP = within(p - vec2(0.0, -0.22), vec4(0.13, 0.22, 0.39, -0.04));\n    modP = rotate2d(-0.275 * TAU) * modP;\n    m = sin(modP.x * 6.0) * 0.08;\n    m += 0.6;\n    d = length(modP - vec2(modP.x, m));\n    mask = step(0.55, modP.x) * step(modP.x, 0.85);\n    d = smoothstep(0.005, 0.02, d);\n    col = mix(col, blackOutlineColor, (1.0 - d) * mask);\n    // upper maxilla\n    modP = within(p - vec2(0.035, -0.22), vec4(0.13, 0.22, 0.39, -0.04));\n    modP = rotate2d(-0.275 * TAU) * modP;\n    m = sin(modP.x * 6.0) * 0.08;\n    m += 0.6;\n    d = length(modP - vec2(modP.x, m));\n    mask = step(0.55, modP.x) * step(modP.x, 0.65);\n    d = smoothstep(0.005, 0.02, d);\n    col = mix(col, blackOutlineColor, (1.0 - d) * mask);\n    // maxilla\n    modP = within(origP - vec2(-0.4, -0.25), vec4(0.13, 0.22, 0.39, -0.04));\n    modP = rotate2d(0.76 * TAU) * modP;\n    m = sin(modP.x * 6.0) * 0.08;\n    m += 0.6;\n    d = length(modP - vec2(modP.x, m));\n    mask = step(0.55, modP.x) * step(modP.x, 0.85);\n    d = smoothstep(0.005, 0.02, d);\n    col = mix(col, blackOutlineColor, (1.0 - d) * mask);\n    // addGrid(modP, col);\n\n    // eye socket\n    // d = sdBezier(p, vec2(0.1, -0.11), vec2(0.11, 0.03), vec2(0.26, 0.0)) - 0.0;\n    // d = smoothstep(0.0, AA, d);\n    // col = mix(col, blackOutlineColor, 1.0 - d);\n    // d = sdBezier(p, vec2(mod1, mod2), vec2(mod3, mod4), vec2(mod5, mod6)) - mod7;\n    // d = smoothstep(0.0, AA, d);\n    // col = mix(col, blackOutlineColor, 1.0 - d);\n}\n\n\n\nvoid mainImage( out vec4 fragColor, in vec2 fragCoord )\n//void main()\n{\n    vec2 p = (2.0*fragCoord-iResolution.xy)/iResolution.y;\n    //vec2 p = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;\n    vec2 uv = fragCoord.xy / iResolution.xy;\n\t\n    // https://www.shadertoy.com/view/MsdGzn\n    // first texture row is frequency data\n\tfloat fft  = texture( iChannel0, vec2(uv.x,0.25) ).x; \n\t// convert frequency to colors\n\tvec3 freqCol = vec3( fft, 4.0*fft*(1.0-fft), 1.0-fft ) * fft;\n    \n    // perturb coords - highs\n    float highsMod = 2.0 * freqCol.r;\n    float m = sin(iTime + (p.y * 20.0)) * highsMod;\n    m *= smoothstep(-0.35, 0.0, p.y) - (smoothstep(0.0, 0.2, p.y));\n    // m *= p.y * 4.0;\n    p.x += m;\n\n    // perturb coords - lows\n    float lowsMod = 0.1 * freqCol.b;\n    float noiseScale = 10.0;\n    float n = cnoise(vec2(p.x, p.y + (iTime * 0.5)) * noiseScale) * lowsMod;\n    p.x += n;\n    p.y -= n;\n\n    vec2 origP = vec2(p.x, p.y);\n\n\n    // mirror coords\n    p.x = abs(p.x);\n\n    \n    bg(p, col, origP);\n    cranium(p, col, origP);\n    darkLines(p, col, origP);\n\n\tfragColor = vec4(col,1.0);\n    //gl_FragColor = vec4(col, 1.0);\n}\n", "inputs": [{"channel": 0, "kind": "audio"}]};

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
