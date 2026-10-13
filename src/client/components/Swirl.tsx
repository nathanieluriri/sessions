import { useEffect, useRef, useState } from "react";
import { prefersStill } from "../lib/motion";

const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float ribbon(vec3 p) {
  p.yz *= rot(-1.08);
  p.xy *= rot(0.42);
  float a = atan(p.z, p.x);
  float r = 1.0 + 0.045 * sin(3.0 * a + uTime * 1.3) + 0.02 * sin(7.0 * a - uTime * 2.1);
  vec2 q = vec2(length(p.xz) - r, p.y);
  q *= rot(1.5 * a + uTime * 0.45);
  vec2 d = abs(q) - vec2(0.27, 0.03);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.035;
}

vec3 normalAt(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.0015;
  return normalize(k.xyy * ribbon(p + k.xyy * e) + k.yyx * ribbon(p + k.yyx * e) + k.yxy * ribbon(p + k.yxy * e) + k.xxx * ribbon(p + k.xxx * e));
}

vec3 film(float x) { return 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.0, 0.33, 0.67))); }

vec3 shade(vec3 p, vec3 rd) {
  vec3 n = normalAt(p);
  vec3 v = -rd;
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.2);
  vec3 r = reflect(rd, n);
  float key = smoothstep(0.62, 0.97, dot(r, normalize(vec3(-0.55, 0.75, 0.45))));
  float rim = smoothstep(0.75, 1.0, dot(r, normalize(vec3(0.85, -0.25, 0.5))));
  float sky = smoothstep(0.1, 0.95, r.y) * 0.18;
  vec3 tint = film(ndv * 1.7 + dot(p, vec3(0.5, 0.8, 0.3)) * 0.6 + uTime * 0.05);
  vec3 rr = refract(rd, n, 0.69);
  float caustic = smoothstep(0.35, 1.0, sin(dot(rr, vec3(4.0, 6.5, 2.5)) + uTime * 0.35));
  vec3 col = vec3(0.012);
  col += (key * 1.7 + sky) * mix(vec3(1.0), tint, 0.35);
  col += rim * film(ndv * 2.4 + 0.3) * 1.3;
  col += fres * tint * 1.25;
  col += caustic * film(dot(rr, vec3(1.2, 0.8, 0.4)) + uTime * 0.04) * (0.16 + 0.5 * fres);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.0, 4.3);
  vec3 rd = normalize(vec3(uv, -1.45));
  float b = dot(ro, rd), c = dot(ro, ro) - 1.85, h = b * b - c;
  if (h < 0.0) { gl_FragColor = vec4(0.0); return; }
  h = sqrt(h);
  float t = max(-b - h, 0.0), tmax = -b + h;
  float best = 1e9, tb = t;
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    float d = ribbon(ro + rd * t);
    if (d < best) { best = d; tb = t; }
    if (d < 0.0008) { hit = true; break; }
    t += d * 0.72;
    if (t > tmax) break;
  }
  float px = 2.0 / min(uRes.x, uRes.y);
  vec3 col = shade(ro + rd * tb, rd);
  float alpha = hit ? 1.0 : smoothstep(px * 2.2, 0.0, best);
  col = 1.0 - exp(-col * 1.3);
  vec3 glow = film(tb * 0.6 + uTime * 0.05) * exp(-best * 10.0) * 0.16;
  gl_FragColor = vec4(col * alpha + glow * (1.0 - alpha), alpha + (1.0 - alpha) * max(glow.r, max(glow.g, glow.b)));
}`;

function program(gl: WebGLRenderingContext) {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const v = make(gl.VERTEX_SHADER, VERT), f = make(gl.FRAGMENT_SHADER, FRAG);
  if (!v || !f) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

/** Iridescent glass ribbon drawn by a small WebGL shader. Pauses offscreen, drops resolution on slow devices, holds a still frame for reduced motion and falls back to a CSS glow without WebGL. */
export function Swirl({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    const prog = gl && program(gl);
    if (!gl || !prog) { setFallback(true); return; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes"), uTime = gl.getUniformLocation(prog, "uTime");
    const still = prefersStill();
    const start = performance.now() - 6000;
    let raf = 0, visible = false, scale = Math.min(window.devicePixelRatio || 1, 1.5), slow = 0, last = 0;
    const draw = (now: number) => {
      gl.uniform1f(uTime, still ? 6 : (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const size = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * scale));
      canvas.height = Math.max(1, Math.round(r.height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      draw(performance.now());
    };
    const loop = (now: number) => {
      if (last) {
        slow = now - last > 30 ? slow + 1 : Math.max(0, slow - 1);
        if (slow > 24 && scale > 0.6) { scale *= 0.8; slow = 0; size(); }
      }
      last = now;
      draw(now);
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => { if (visible && !still && !raf && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } };
    const ro = new ResizeObserver(size);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); });
    ro.observe(canvas);
    io.observe(canvas);
    document.addEventListener("visibilitychange", wake);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", wake); };
  }, []);
  return fallback ? <div className={`swirl-fallback ${className ?? ""}`} aria-hidden /> : <canvas ref={ref} className={className} aria-hidden />;
}
