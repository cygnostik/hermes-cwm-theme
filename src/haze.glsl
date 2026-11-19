precision highp float;
uniform vec2 uSize;
uniform float uTime;
uniform vec4 uArt;
uniform float uSweep;

float hash(vec2 p) {
  vec3 a = fract(p.xyx * vec3(.1031, .11369, .13787));
  a += dot(a, a.yzx + 19.19);
  return fract((a.x + a.y) * a.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
    mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float cloud(vec2 p) {
  return .60 * noise(p) + .27 * noise(p * 2.13 + 7.) + .13 * noise(p * 4.27 - 11.);
}
// Recursive Bayer thresholds, locked to the low-resolution backing grid.
float bayer2(vec2 i) {
  i = mod(i, 2.);
  return mod(i.x + i.y, 2.) * 2. + i.y;
}
float bayer8(vec2 i) {
  return (16. * bayer2(i) + 4. * bayer2(floor(i / 2.)) + bayer2(floor(i / 4.)) + .5) / 64.;
}
// Front projection traced face by face from the approved silhouette.
float edge(vec2 p, vec2 a, vec2 b) {
  vec2 e = b - a, v = p - a;
  return (e.x * v.y - e.y * v.x) / length(e);
}
float quad(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  vec4 s = vec4(edge(p,a,b),edge(p,b,c),edge(p,c,d),edge(p,d,a));
  return max(min(min(s.x,s.y),min(s.z,s.w)), -max(max(s.x,s.y),max(s.z,s.w)));
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 e = b - a, v = p - a;
  return length(v - e * clamp(dot(v,e)/dot(e,e),0.,1.));
}
void face(inout vec4 m, float d, float angle, float polish, float occlusion) {
  if (d > m.w) m = vec4(angle, polish, occlusion, d);
}
vec4 steel(vec2 p, float phase, float dots) {
  if (p.x < 163. || p.x > 593. || p.y < 15. || p.y > 750.) return vec4(0.);
  vec4 m = vec4(0.,0.,0.,-1e4);
  face(m, quad(p,vec2(321,21),vec2(373,31),vec2(585,185),vec2(535,179)), .95, 1.05, .11);
  face(m, quad(p,vec2(321,21),vec2(535,179),vec2(463,253),vec2(321,145)), -.48, .76, .095);
  face(m, quad(p,vec2(535,179),vec2(585,185),vec2(590,465),vec2(537,471)), 1.11, 1.07, .13);
  face(m, quad(p,vec2(463,253),vec2(535,179),vec2(537,471),vec2(465,529)), -.82, .68, .077);
  face(m, quad(p,vec2(465,529),vec2(537,471),vec2(590,465),vec2(507,529)), -2., .28, .02);
  face(m, quad(p,vec2(367,185),vec2(445,242),vec2(447,389),vec2(370,385)), 2.6, .37, .04);
  face(m, quad(p,vec2(170,311),vec2(367,185),vec2(367,292),vec2(211,392)), .43, .89, .09);
  face(m, quad(p,vec2(211,392),vec2(367,292),vec2(370,385),vec2(260,438)), -2.7, .48, .04);
  face(m, quad(p,vec2(170,311),vec2(211,392),vec2(260,438),vec2(166,551)), -.66, .69, .073);
  face(m, quad(p,vec2(166,551),vec2(260,438),vec2(260,529),vec2(411,746)), -.66, .69, .073);
  face(m, quad(p,vec2(166,551),vec2(260,529),vec2(472,685),vec2(411,746)), -.66, .69, .073);
  face(m, quad(p,vec2(260,438),vec2(317,429),vec2(518,580),vec2(474,591)), .92, 1.05, .10);
  face(m, quad(p,vec2(260,438),vec2(474,591),vec2(472,685),vec2(260,529)), -2.3, .43, .039);
  face(m, quad(p,vec2(474,591),vec2(518,580),vec2(518,683),vec2(472,685)), 1.19, .97, .095);
  face(m, quad(p,vec2(411,746),vec2(472,685),vec2(518,683),vec2(467,738)), -2.5, .25, .024);
  if (m.w < -2.) return vec4(0.);
  vec2 q = p / vec2(806.,804.);
  // One soft pass over the bevels, then the steel settles back to its resting light.
  float drive = mix(.14, 1.05, phase);
  float path = q.y * .94 + q.x * .38 + .052 * sin(q.x * 7.);
  float band = (path - drive) / .166;
  float sweep = exp(-band * band) * smoothstep(0., .19, phase) * (1. - smoothstep(.76, 1., phase));
  float facing = .57 + .43 * cos(m.x - .24);
  float grain = .62 + .44 * noise(p * .39) + .27 * noise(p * vec2(.22,.54));
  float pits = hash(floor(p * .9));
  grain *= .77 + .42 * smoothstep(.06,.57,pits);
  float bevel = exp(-max(m.w,0.) * .42) * (.28 + .36 * sweep) * m.y;
  float value = m.z * grain + m.y * (.30 * sweep * facing * grain + .23 * bevel);
  value = floor(value * 33. + dots) / 33.;
  vec3 metal = vec3(.31,.56,.91) * value;
  float weld = min(segment(p,vec2(369,302),vec2(370,387)), segment(p,vec2(370,387),vec2(279,439)));
  metal += vec3(1.,.12,.035) * exp(-weld * .31) * (.21 + .27 * sweep);
  return vec4(metal, .89 * smoothstep(-1., 4., m.w));
}
void main() {
  vec2 p = gl_FragCoord.xy / uSize;
  float t = uTime;
  float drift = cloud(vec2(p.x * 5.5 - t * .26, p.y * 19. + .13 * sin(t * .32)));
  float eddies = cloud(vec2(p.x * 8.3 + t * .16, p.y * 28. - t * .054));
  float ground = (p.y - .134 - .025 * drift) * 13.5;
  float high = (p.y - .314 - .04 * (eddies - .5)) * 10.;
  float lower = exp(-ground * ground);
  float upper = exp(-high * high);
  float light = smoothstep(.19, .66, p.x) * (1. - smoothstep(.93, 1., p.x) * .42);
  float density = (lower * smoothstep(.33, .73, drift) * .48
    + upper * smoothstep(.36, .77, eddies) * .25) * light;
  float dots = bayer8(floor(gl_FragCoord.xy));
  float mist = floor(density * 26. + dots) / 26.;
  vec2 art = (vec2(p.x,1. - p.y) - uArt.xy) / uArt.zw * vec2(806.,804.);
  vec4 metal = steel(art, uSweep, dots);
  vec3 fog = mix(vec3(.15,.26,.46), vec3(.41,.61,.88), drift);
  float alpha = mist + metal.a * (1. - mist);
  gl_FragColor = vec4((fog * mist + metal.rgb * metal.a * (1. - mist)) / max(alpha,.001), alpha);
}
