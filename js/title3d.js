// Tindang Sara — the title logo as a gently swaying 3D object.
// The PNG becomes a chunky slab: a stack of alpha-cut layers of the logo, so the thickness follows the
// letter shapes. The sides use the logo's own colors (just shaded darker): no dark outline. The "Sara"
// letters get a blinking, shimmering light on top. All layers share one subdivided plane that ripples a little.
//
// Rendering is full-resolution and anti-aliased by default. Set PIXEL to 2 or more
// for the retro pixel-shader look (low-res render + posterize).
import * as THREE from 'three';

const LOGO_URL = './assets/title.png';
const W_LOGO = 4;             // logo width in world units
const LAYERS = 18;            // slices that make up the thickness
const DEPTH = 0.3;            // total thickness

const PIXEL = 1;              // 1 = crisp full-res. 2, 3... = chunky pixel-shader look
const LEVELS = 24;            // (pixel mode) color levels per channel
const DITHER = 0.0;           // (pixel mode) 0 = off, 1 = full ordered dither

const PAD = 32;               // transparent margin around the logo (room for the glow)
const SIDE_DARK = 0.38;       // shade of the slab's back layers (1 = same as the front)
const SIDE_LIGHT = 0.82;      // shade of the layer right behind the front face
const SARA_X = 410;           // the SARA part starts here (x in the PNG)
const SARA_Y0 = 115, SARA_Y1 = 220;   // ... and lives in this band (y in the PNG)
const HALO = [0.75, 0.7, 0.55, 0.4];   // glow strength of each blur level (1/2, 1/4, 1/8, 1/16 resolution): bigger levels = wider, softer glow

const host = document.getElementById('logo3d');
if (host) host.style.setProperty('--lw', 'min(860px, 94vw, calc(60vh * 669 / 373))');   // bigger logo
const titleEl = document.getElementById('title');

function fallback() {
  const img = new Image();
  img.src = LOGO_URL;
  img.alt = 'Tindang Sara';
  host.replaceChildren(img);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// logo on a padded canvas (original colors, no recoloring)
function buildLogoCanvas(img, cw, ch) {
  const c = makeCanvas(cw, ch);
  c.getContext('2d').drawImage(img, PAD, PAD);
  return c;
}

// the yellow SARA letters as a white mask: this is where the blinking light is drawn
function buildGlowCanvas(img, cw, ch) {
  const c = makeCanvas(cw, ch);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, PAD, PAD);
  const d = ctx.getImageData(0, 0, cw, ch), p = d.data;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = (y * cw + x) * 4, ix = x - PAD, iy = y - PAD;
    const r = p[i], g = p[i + 1], b = p[i + 2], a = p[i + 3];
    const on = a > 0 && ix >= SARA_X && iy >= SARA_Y0 && iy <= SARA_Y1 && r > 150 && r - b > 70 && g > r * 0.5;
    p[i] = p[i + 1] = p[i + 2] = 255; p[i + 3] = on ? a : 0;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

// smooth halo around the SARA letters: the mask is shrunk step by step and stretched back with smoothing,
// then the blur levels are added up (a cheap gaussian-like bloom that works in every browser)
function buildHaloCanvas(glowCanvas, cw, ch) {
  const c = makeCanvas(cw, ch), ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'lighter';
  let cur = glowCanvas;
  HALO.forEach((w) => {
    const n = makeCanvas(Math.max(2, Math.ceil(cur.width / 2)), Math.max(2, Math.ceil(cur.height / 2)));
    const nx = n.getContext('2d'); nx.imageSmoothingEnabled = true; nx.imageSmoothingQuality = 'high';
    nx.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
    ctx.globalAlpha = w; ctx.drawImage(n, 0, 0, cw, ch);
  });
  return c;
}

function init() {
  const pixelMode = PIXEL > 1;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !pixelMode });
  } catch (e) {
    return fallback();
  }
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.imageRendering = pixelMode ? 'pixelated' : 'auto';
  host.replaceChildren(renderer.domElement);

  const img = new Image();
  img.onload = () => build(renderer, img, pixelMode);
  img.onerror = () => fallback();
  img.src = LOGO_URL;
}

function build(renderer, img, pixelMode) {
  const cw = img.naturalWidth + PAD * 2, ch = img.naturalHeight + PAD * 2;
  const W = W_LOGO * cw / img.naturalWidth;
  const H = W * ch / cw;

  const camera = new THREE.PerspectiveCamera(30, cw / ch, 0.1, 50);
  const scene = new THREE.Scene();

  const mkTex = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const logoTex = mkTex(buildLogoCanvas(img, cw, ch));
  const glowCanvas = buildGlowCanvas(img, cw, ch);
  const glowTex = mkTex(glowCanvas), haloTex = mkTex(buildHaloCanvas(glowCanvas, cw, ch));

  // one geometry shared by every layer, so the ripple keeps the slab's thickness intact
  const geo = new THREE.PlaneGeometry(W, H, 56, 24);
  const pos = geo.attributes.position;
  const baseX = Float32Array.from(pos.array.filter((_, i) => i % 3 === 0));
  const baseY = Float32Array.from(pos.array.filter((_, i) => i % 3 === 1));

  const logo = new THREE.Group();   // swayed as a whole
  scene.add(logo);

  // slab: every layer is the logo itself, cut by its alpha; the layers behind the front are just shaded darker
  for (let i = 0; i < LAYERS; i++) {
    const k = i / (LAYERS - 1);     // 0 = back, 1 = front
    const front = i === LAYERS - 1;
    const mat = front
      ? new THREE.MeshBasicMaterial({ map: logoTex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ map: logoTex, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color().setScalar(SIDE_DARK + (SIDE_LIGHT - SIDE_DARK) * Math.pow(k, 2)) });
    const m = new THREE.Mesh(geo, mat);
    m.position.z = (k - 0.5) * DEPTH;
    logo.add(m);
  }

  // blinking light on SARA: the whole word glows together (no per-letter cutouts), slowly swelling and fading.
  // Two additive layers: the lit letters, and a soft halo around them. 
  const lv = { value: 0 };
  const glowCommon = 'uniform float lv; uniform float time; varying vec2 vUv;';
  const glowVert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const addMat = (frag, tex) => new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, lv, time: { value: 0 } },
    vertexShader: glowVert, fragmentShader: 'uniform sampler2D map;' + glowCommon + frag,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    // add light to the colors only and leave the canvas alpha alone (default additive blending raised alpha to 1 = a black box around the glow)
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const glowMat = addMat(`
    void main() {
      if (texture2D(map, vUv).a < 0.5) discard;
      float sweep = 0.5 + 0.5 * sin(vUv.x * 40.0 - time * 3.0);   // a light running across the letters
      float k = lv * 0.3 * (0.8 + 0.2 * sweep);
      gl_FragColor = vec4(vec3(1.0, 0.93, 0.55) * k, 1.0);
    }`, glowTex);
  const haloMat = addMat(`
    void main() {
      float a = texture2D(map, vUv).a;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vec3(1.0, 0.78, 0.22) * a * lv * 0.4, 1.0);
    }`, haloTex);
  const halo = new THREE.Mesh(geo, haloMat); halo.position.z = DEPTH / 2 + 0.004; logo.add(halo);
  const glow = new THREE.Mesh(geo, glowMat); glow.position.z = DEPTH / 2 + 0.008; logo.add(glow);
  // slow blink: the glow is always on (dim) and slowly swells to full and fades back, each cycle a little different in length
  const rnd = (a, b) => a + Math.random() * (b - a);
  const REST = 0.35;                 // glow level at the dimmest (0 = off, 1 = brightest)
  const B = { phase: Math.PI, period: rnd(2.6, 3.8) };   // starts dim
  let lastT = 0;
  const blinkStep = (t) => {
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    B.phase += dt * Math.PI * 2 / B.period;
    if (B.phase >= Math.PI * 3) { B.phase -= Math.PI * 2; B.period = rnd(2.6, 3.8); }   // new random length every cycle
    lv.value = REST + (1 - REST) * (0.5 - 0.5 * Math.cos(B.phase));
    glowMat.uniforms.time.value = haloMat.uniforms.time.value = t;
  };

  // soft drop shadow behind the slab
  const shadow = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      map: logoTex, alphaTest: 0.5, color: 0x000000,
      transparent: true, opacity: 0.28, depthWrite: false,
    })
  );
  shadow.position.set(0.06, -0.1, -DEPTH / 2 - 0.12);
  shadow.scale.setScalar(1.02);
  logo.add(shadow);

  // ---- optional pixel shader pass (PIXEL >= 2) ----
  let rt, postScene, postCam, postMat;
  if (pixelMode) {
    rt = new THREE.WebGLRenderTarget(8, 8, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    postScene = new THREE.Scene();
    postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, levels: { value: LEVELS }, dither: { value: DITHER } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float levels; uniform float dither; varying vec2 vUv;
        float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          vec3 rgb = c.rgb / max(c.a, 0.001);
          vec4 o = linearToOutputTexel(vec4(clamp(rgb, 0.0, 1.0), 1.0));
          float b = (bayer4(gl_FragCoord.xy) - 0.5) * dither + 0.5;
          vec3 q = floor(o.rgb * (levels - 1.0) + b) / (levels - 1.0);
          float a = c.a < 0.5 ? c.a : 1.0;
          gl_FragColor = vec4(q * a, a);
        }`,
      depthTest: false, depthWrite: false,
    });
    postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    if (pixelMode) {
      renderer.setPixelRatio(1);
      const lw = Math.max(32, Math.round(w / PIXEL)), lh = Math.max(18, Math.round(h / PIXEL));
      renderer.setSize(lw, lh, false);
      rt.setSize(lw, lh);
    } else {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
    }
    camera.aspect = w / h;
    // fit the logo (plus room for the sway) into the view
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const distH = (H * 1.05) / 2 / Math.tan(vfov / 2);
    const distW = (W * 1.03) / 2 / (Math.tan(vfov / 2) * camera.aspect);
    camera.position.set(0, 0, Math.max(distH, distW));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  // intro / exit timing (seconds). Exit starts when START RUN is tapped (the title gets .pop).
  const EXIT_TIME = 0.5;
  const clock = new THREE.Clock();
  let introT0 = null, exitT0 = null;
  const startBtn = document.getElementById('t-start');
  if (startBtn) startBtn.addEventListener('click', () => {
    if (exitT0 === null) exitT0 = clock.getElapsedTime();
  });

  // the logo waits for the loading screen's crash (it fires 'loadingdone'), so it pops in right as the title is revealed
  let ready = !window.__loader;   // no loading screen at all -> start right away
  window.addEventListener('loadingdone', () => { ready = true; introT0 = null; });
  setTimeout(() => { ready = true; }, 30000);   // failsafe

  function frame() {
    requestAnimationFrame(frame);
    if (!ready) return;
    // stop drawing once the title screen is gone; reset so it pops in again next time
    if (!titleEl || titleEl.offsetParent === null || titleEl.classList.contains('off')) {
      introT0 = null; exitT0 = null;
      return;
    }

    const t = clock.getElapsedTime();
    if (introT0 === null) introT0 = t;
    if (exitT0 === null && titleEl.classList.contains('pop')) exitT0 = t;
    if (exitT0 !== null && !titleEl.classList.contains('pop') && t - exitT0 > EXIT_TIME + 0.3) {
      exitT0 = null; introT0 = t;       // title came back (e.g. exit to menu)
    }

    // gentle ripple across the banner, a little stronger toward the right edge
    for (let i = 0; i < pos.count; i++) {
      const x = baseX[i], y = baseY[i];
      const edge = 0.45 + 0.55 * ((x + W / 2) / W);
      pos.setZ(i, Math.sin(x * 1.7 + t * 1.9) * 0.03 * edge + Math.sin(y * 2.2 + t * 1.3) * 0.012);
    }
    pos.needsUpdate = true;

    // sway + bob
    const pop = Math.min((t - introT0) / 0.9, 1);
    const ease = 1 - Math.pow(1 - pop, 3);

    // exit: spin a full turn while shrinking away
    let exitE = 0;
    if (exitT0 !== null) {
      const p = Math.min((t - exitT0) / EXIT_TIME, 1);
      exitE = p * p * p;
    }
    logo.scale.setScalar(Math.max((0.6 + 0.4 * ease) * (1 - exitE), 0.001));
    logo.rotation.y = Math.sin(t * 0.85) * 0.12 + exitE * Math.PI * 2;
    logo.rotation.x = Math.sin(t * 0.55 + 1.0) * 0.025;
    logo.rotation.z = Math.sin(t * 0.65) * 0.012 + exitE * 0.5;
    logo.position.y = Math.sin(t * 1.15) * 0.025;
    blinkStep(t);

    if (pixelMode) {
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(postScene, postCam);
    } else {
      renderer.render(scene, camera);
    }
  }
  frame();
}

if (host) init();
