// ---- Tweak these ----
const SIM = 128, DYE = 512;      // grid resolutions
const FORCE = 0.35;              // how hard the cursor pushes fluid
const DYE_AMOUNT = 0.12;         // color injected per splat
const VEL_DISSIPATION = 0.9, DYE_DISSIPATION = 0.55;
const PRESSURE_ITER = 20;
const IDLE_MS = 2500;            // auto-animate after this much stillness

const c = document.getElementById('c');
const gl = c.getContext('webgl2', { alpha:false, antialias:false });
if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
  document.getElementById('err').style.display = 'flex';
  document.getElementById('hint').style.display = 'none';
  throw new Error('WebGL2 float targets unavailable');
}

const VS = `#version 300 es
out vec2 v;
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); v = p; gl_Position = vec4(p*2.-1.,0.,1.); }`;
const HEAD = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 v; out vec4 o;`;

function prog(fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, HEAD + fs]]) {
    const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  return { p };
}

const splatP = prog(`uniform sampler2D u; uniform vec2 p; uniform vec3 col; uniform float r, asp;
  void main(){ vec2 d = v-p; d.x *= asp; o = texture(u,v) + vec4(col*exp(-dot(d,d)/r),0.); }`);

const advectP = prog(`uniform sampler2D vel, src; uniform float dt, dis, asp;
  void main(){ vec2 co = v - dt*texture(vel,v).xy*vec2(1./asp,1.); o = texture(src,co)/(1.+dis*dt); }`);

const divP = prog(`uniform sampler2D u;
  void main(){ vec2 t = 1./vec2(textureSize(u,0));
    float L = texture(u,v-vec2(t.x,0)).x, R = texture(u,v+vec2(t.x,0)).x;
    float B = texture(u,v-vec2(0,t.y)).y, T = texture(u,v+vec2(0,t.y)).y;
    o = vec4(.5*(R-L+T-B),0,0,1); }`);

const pressP = prog(`uniform sampler2D p, d;
  void main(){ vec2 t = 1./vec2(textureSize(p,0));
    float L = texture(p,v-vec2(t.x,0)).x, R = texture(p,v+vec2(t.x,0)).x;
    float B = texture(p,v-vec2(0,t.y)).x, T = texture(p,v+vec2(0,t.y)).x;
    o = vec4((L+R+B+T-texture(d,v).x)*.25,0,0,1); }`);

const gradP = prog(`uniform sampler2D p, u;
  void main(){ vec2 t = 1./vec2(textureSize(p,0));
    float L = texture(p,v-vec2(t.x,0)).x, R = texture(p,v+vec2(t.x,0)).x;
    float B = texture(p,v-vec2(0,t.y)).x, T = texture(p,v+vec2(0,t.y)).x;
    o = vec4(texture(u,v).xy - .5*vec2(R-L,T-B),0,1); }`);

const showP = prog(`uniform sampler2D dye;
  void main(){ vec3 c = texture(dye,v).rgb; c = 1.-exp(-c*1.7); c = pow(c, vec3(.92));
    vec3 bg = vec3(.02,.02,.05)*(1.-.6*length(v-.5)); o = vec4(bg + c, 1.); }`);

function mk(w, h) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  return { t, f, w, h };
}
function dbl(w, h) {
  let a = mk(w, h), b = mk(w, h);
  return { get r(){ return a; }, get w(){ return b; }, swap(){ [a, b] = [b, a]; } };
}
const V = dbl(SIM, SIM), D = dbl(DYE, DYE), P = dbl(SIM, SIM), DIV = mk(SIM, SIM);

function run(pr, u, target) {
  gl.useProgram(pr.p);
  let unit = 0;
  for (const k in u) {
    const val = u[k], loc = gl.getUniformLocation(pr.p, k);
    if (val && val.t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, val.t); gl.uniform1i(loc, unit++); }
    else if (typeof val === 'number') gl.uniform1f(loc, val);
    else if (val.length === 2) gl.uniform2f(loc, val[0], val[1]);
    else gl.uniform3f(loc, val[0], val[1], val[2]);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
  gl.viewport(0, 0, target ? target.w : c.width, target ? target.h : c.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

const hsv = (h, s, v) => {
  const f = n => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
};

let asp = 1;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
  asp = c.width / c.height;
}
addEventListener('resize', resize); resize();

function splat(x, y, vx, vy, hue, amt) {
  run(splatP, { u: V.r, p: [x, y], col: [vx * asp, vy, 0], r: 0.0006, asp }, V.w); V.swap();
  run(splatP, { u: D.r, p: [x, y], col: hsv(hue, 1, 1).map(z => z * amt), r: 0.0004, asp }, D.w); D.swap();
}

// ---- Input ----
let tx = .5, ty = .5, px = .5, py = .5, lastMove = -1e9, started = false;
const hint = document.getElementById('hint');
addEventListener('pointermove', e => {
  tx = e.clientX / innerWidth; ty = 1 - e.clientY / innerHeight; lastMove = performance.now();
  if (!started) { px = tx; py = ty; started = true; }
  hint.classList.add('gone');
});
addEventListener('pointerdown', e => {
  const x = e.clientX / innerWidth, y = 1 - e.clientY / innerHeight;
  hint.classList.add('gone');
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    splat(x, y, Math.cos(a) * 1.6, Math.sin(a) * 1.6, i / 12, 0.45);
  }
});

// ---- Loop ----
let t0 = performance.now();
function frame(now) {
  const dt = Math.min((now - t0) / 1000, 0.033); t0 = now;
  let x = tx, y = ty;
  if (now - lastMove > IDLE_MS) {           // idle: drift on a slow Lissajous path
    const s = now / 1000;
    x = .5 + .3 * Math.sin(s * .9); y = .5 + .25 * Math.sin(s * 1.3 + 1);
    if (!started) { px = x; py = y; started = true; }
  }
  const dx = x - px, dy = y - py, dist = Math.hypot(dx, dy);
  if (dist > 0.0005 && dt > 0) {
    const n = Math.min(24, Math.ceil(dist / 0.008));
    for (let i = 1; i <= n; i++) {
      const sx = px + dx * i / n, sy = py + dy * i / n;
      splat(sx, sy, dx / dt * FORCE, dy / dt * FORCE, (now * 0.00015 + sx * 0.4) % 1, DYE_AMOUNT);
    }
  }
  px = x; py = y;

  run(advectP, { vel: V.r, src: V.r, dt, dis: VEL_DISSIPATION, asp }, V.w); V.swap();
  run(advectP, { vel: V.r, src: D.r, dt, dis: DYE_DISSIPATION, asp }, D.w); D.swap();
  run(divP, { u: V.r }, DIV);
  for (let i = 0; i < PRESSURE_ITER; i++) { run(pressP, { p: P.r, d: DIV }, P.w); P.swap(); }
  run(gradP, { p: P.r, u: V.r }, V.w); V.swap();
  run(showP, { dye: D.r }, null);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);