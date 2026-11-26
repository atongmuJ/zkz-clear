/**
 * 用 WebGL 画一个真正的球体：对每个像素做射线-球体求交，
 * 把命中点按球面坐标映射到等距柱状（equirectangular）贴图上。
 *
 * 这样拖动改变的是「采样经度」而不是「图片角度」，
 * 光照方向始终固定在镜头前上方，转起来才像地球。
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform sampler2D uMap;
uniform vec2  uRes;
uniform float uYaw;
uniform float uPitch;
uniform float uScan;    // 0..1 扫描强度
uniform float uScanY;   // -1..1 扫描光带当前位置

const float PI = 3.14159265359;

mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}

void main() {
  vec2 p = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  p.x *= uRes.x / uRes.y;            // 非正方形时保持球体不被拉扁

  float r = length(p);
  float alpha = 1.0 - smoothstep(0.995, 1.005, r);
  if (alpha <= 0.002) discard;

  float rc = min(r, 1.0);
  float z = sqrt(max(0.0, 1.0 - rc * rc));
  vec3 n = normalize(vec3(p, z));

  // 采样点 = 反向旋转法线，得到球面经纬度
  vec3 s = rotX(uPitch) * rotY(uYaw) * n;
  float lon = atan(s.x, s.z);
  float lat = asin(clamp(s.y, -1.0, 1.0));
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);

  vec3 albedo = texture2D(uMap, uv).rgb;

  // 固定光照（左上前方），明暗交界做柔化
  vec3 L = normalize(vec3(-0.52, 0.58, 0.62));
  float ndl = dot(n, L);
  float lit = smoothstep(-0.30, 0.40, ndl);
  vec3 day   = albedo * (0.20 + 1.18 * max(ndl, 0.0));
  vec3 night = albedo * 0.085 + vec3(0.016, 0.030, 0.058);
  vec3 col = mix(night, day, lit);

  // 大气边缘光：越靠边缘越亮，暗侧也留一点蓝
  float rim = pow(1.0 - z, 2.6);
  col += vec3(0.20, 0.45, 0.88) * rim * (0.28 + 0.62 * lit);

  // 扫描光带：沿纬度扫过球体
  if (uScan > 0.001) {
    float d = abs(n.y - uScanY);
    float band = smoothstep(0.20, 0.0, d);
    float line = smoothstep(0.022, 0.0, d);
    col += vec3(0.28, 0.66, 1.0) * band * uScan * 0.30;
    col += vec3(0.62, 0.90, 1.0) * line * uScan * 0.55;
  }

  gl_FragColor = vec4(col, alpha);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader 失败");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`着色器编译失败: ${log}`);
  }
  return sh;
}

function link(gl: WebGLRenderingContext) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram 失败");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`着色器链接失败: ${log}`);
  }
  return prog;
}

export interface GlobeOptions {
  mapUrl: string;
  /** 贴图与着色器就绪，可以淡入显示 */
  onReady?: () => void;
}

export interface GlobeHandle {
  setScanning(on: boolean): void;
  dispose(): void;
}

const YAW_PER_PX = 0.0062;
const PITCH_PER_PX = 0.0052;
const PITCH_LIMIT = 1.2;
const AUTO_SPIN = 0.055; // rad/s
const FRAME_INTERVAL = 22; // ms，约 45fps，省电

export function createGlobe(canvas: HTMLCanvasElement, opts: GlobeOptions): GlobeHandle {
  const gl = (canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: true,
    depth: false,
    powerPreference: "high-performance",
  }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

  if (!gl) throw new Error("WebGL 不可用");

  const program = link(gl);
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {
    map: gl.getUniformLocation(program, "uMap"),
    res: gl.getUniformLocation(program, "uRes"),
    yaw: gl.getUniformLocation(program, "uYaw"),
    pitch: gl.getUniformLocation(program, "uPitch"),
    scan: gl.getUniformLocation(program, "uScan"),
    scanY: gl.getUniformLocation(program, "uScanY"),
  };

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const reduceMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    yaw: -1.02,
    pitch: -0.16,
    vel: 0,
    scanning: false,
    scanAmount: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    lastMoveAt: 0,
    raf: 0,
    disposed: false,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  };

  // ---------- 纹理 ----------
  // 1024x512 是 2 的幂，可以生成 mipmap 并横向重复（经度 0/360 首尾相接）
  const makeTexture = (img: HTMLImageElement) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  };

  let texture: WebGLTexture | null = null;
  const baseImage = new Image();
  baseImage.onload = () => {
    if (state.disposed) return;
    texture = makeTexture(baseImage);
    opts.onReady?.();
  };
  baseImage.src = opts.mapUrl;


  // ---------- 尺寸 ----------
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * state.dpr));
    const h = Math.max(1, Math.round(rect.height * state.dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  // ---------- 交互 ----------
  const onDown = (e: PointerEvent) => {
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.lastMoveAt = performance.now();
    state.vel = 0;
    canvas.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;

    state.yaw -= dx * YAW_PER_PX;
    state.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, state.pitch + dy * PITCH_PER_PX));

    const now = performance.now();
    const dt = Math.max(8, now - state.lastMoveAt) / 1000;
    state.lastMoveAt = now;
    state.vel = (-dx * YAW_PER_PX) / dt;
  };

  const onUp = (e: PointerEvent) => {
    state.dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  // ---------- 渲染 ----------
  let lastT = 0;

  const draw = (t: number) => {
    state.raf = requestAnimationFrame(draw);
    if (state.disposed) return;
    if (t - lastT < FRAME_INTERVAL) return;
    const dt = Math.min(0.08, lastT ? (t - lastT) / 1000 : 0.016);
    lastT = t;

    if (!state.dragging) {
      if (Math.abs(state.vel) > 0.02) {
        state.yaw += state.vel * dt;
        state.vel *= Math.pow(0.06, dt); // 指数衰减
      } else if (!reduceMotion) {
        state.vel = 0;
        state.yaw += AUTO_SPIN * dt;
      }
    }

    // 扫描量淡入淡出
    const target = state.scanning ? 1 : 0;
    state.scanAmount += (target - state.scanAmount) * Math.min(1, dt * 8);

    const scanY = state.scanning ? Math.sin(t * 0.0011) : 0;
    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(u.map, 0);
    }
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.yaw, state.yaw);
    gl.uniform1f(u.pitch, state.pitch);
    gl.uniform1f(u.scan, state.scanAmount);
    gl.uniform1f(u.scanY, scanY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  state.raf = requestAnimationFrame(draw);

  return {
    setScanning(on: boolean) {
      state.scanning = on;
    },
    dispose() {
      state.disposed = true;
      cancelAnimationFrame(state.raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      if (texture) gl.deleteTexture(texture);
      if (buf) gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    },
  };
}
