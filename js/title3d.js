// Tindang Sara — the title logo as a swaying 3D object.
// The PNG becomes a chunky slab: a stack of alpha-cut layers of the logo, so the
// thickness follows the letter shapes. The front face keeps the logo colors (its
// green-ish edge is recolored to navy), the sides and a ring around the letters are
// dark blue. All layers share one subdivided plane that ripples like a hanging banner.
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

const OUTLINE_PX = 3;        // thickness of the dark blue outline, in texture pixels
const SIDE_BACK = '#050d2e';  // dark blue at the back of the slab
const SIDE_FRONT = '#0d2a78'; // dark blue just behind the front face (this is the ring around the letters)
const PAD = OUTLINE_PX + 5;   // transparent margin so the outline has room

const host = document.getElementById('logo3d');
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

// logo on a padded canvas, with its greenish outline pixels turned navy
function buildLogoCanvas(img, cw, ch) {
  const c = makeCanvas(cw, ch);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, PAD, PAD);
  const d = ctx.getImageData(0, 0, cw, ch);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const mx = Math.max(r, g, b);
    if (mx < 150 && (g >= r * 0.85 || b >= r * 0.85)) {   // dark and not reddish -> the green/teal outline
      const k = mx / 150;
      p[i]     = 10 + 12 * k;
      p[i + 1] = 22 + 26 * k;
      p[i + 2] = 64 + 60 * k;
    }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

// the logo's silhouette, grown by OUTLINE_PX and filled flat dark blue
function buildMaskCanvas(img, cw, ch) {
  const sil = makeCanvas(cw, ch);
  const s = sil.getContext('2d');
  s.drawImage(img, PAD, PAD);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = '#0a1d58';
  s.fillRect(0, 0, cw, ch);

  const c = makeCanvas(cw, ch);
  const ctx = c.getContext('2d');
  ctx.drawImage(sil, 0, 0);
  for (const r of [OUTLINE_PX * 0.5, OUTLINE_PX]) {
    for (let a = 0; a < 32; a++) {
      const t = (a / 32) * Math.PI * 2;
      ctx.drawImage(sil, Math.cos(t) * r, Math.sin(t) * r);
    }
  }
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
  const maskTex = mkTex(buildMaskCanvas(img, cw, ch));

  // one geometry shared by every layer, so the ripple keeps the slab's thickness intact
  const geo = new THREE.PlaneGeometry(W, H, 56, 24);
  const pos = geo.attributes.position;
  const baseX = Float32Array.from(pos.array.filter((_, i) => i % 3 === 0));
  const baseY = Float32Array.from(pos.array.filter((_, i) => i % 3 === 1));

  const logo = new THREE.Group();   // swayed as a whole
  scene.add(logo);

  // side layers: flat dark blue wherever the (outline-grown) silhouette is opaque
  const sideVert = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const sideFrag = `
    uniform sampler2D map; uniform vec3 tint; varying vec2 vUv;
    void main() {
      if (texture2D(map, vUv).a < 0.5) discard;
      gl_FragColor = vec4(tint, 1.0);
    }`;
  const cBack = new THREE.Color(SIDE_BACK), cFront = new THREE.Color(SIDE_FRONT);

  for (let i = 0; i < LAYERS; i++) {
    const k = i / (LAYERS - 1);     // 0 = back, 1 = front
    const front = i === LAYERS - 1;
    const mat = front
      ? new THREE.MeshBasicMaterial({ map: logoTex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide })
      : new THREE.ShaderMaterial({
          uniforms: { map: { value: maskTex }, tint: { value: cBack.clone().lerp(cFront, Math.pow(k, 3)) } },
          vertexShader: sideVert,
          fragmentShader: sideFrag,
          side: THREE.DoubleSide,
        });
    const m = new THREE.Mesh(geo, mat);
    m.position.z = (k - 0.5) * DEPTH;
    logo.add(m);
  }

  // soft drop shadow behind the slab
  const shadow = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      map: maskTex, alphaTest: 0.5, color: 0x000000,
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
    const distH = (H * 1.14) / 2 / Math.tan(vfov / 2);
    const distW = (W * 1.1) / 2 / (Math.tan(vfov / 2) * camera.aspect);
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

  function frame() {
    requestAnimationFrame(frame);
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
      pos.setZ(i, Math.sin(x * 1.7 + t * 1.9) * 0.07 * edge + Math.sin(y * 2.2 + t * 1.3) * 0.025);
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
    logo.rotation.y = Math.sin(t * 0.85) * 0.38 + exitE * Math.PI * 2;
    logo.rotation.x = Math.sin(t * 0.55 + 1.0) * 0.07;
    logo.rotation.z = Math.sin(t * 0.65) * 0.035 + exitE * 0.5;
    logo.position.y = Math.sin(t * 1.15) * 0.05;

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
