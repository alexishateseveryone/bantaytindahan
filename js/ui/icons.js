// Bootstrap Icons, pixelated.
// Every emoji in the UI is swapped for a Bootstrap Icon (jsDelivr CDN). The SVG is rasterised onto a tiny 16x16 canvas,
// the soft edges are snapped to hard pixels, and the result is shown with image-rendering:pixelated, so the icons match the pixel-art look.
// If an icon can't be loaded (offline / unknown name) the original emoji comes back as plain text.
// Drop-in replacement for the helpers main.js used to import from ./ui/pixel.js, plus pxIcon(name, color).

const BI = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/';
const GRID = 16;   // pixel grid of every icon
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// emoji -> [bootstrap icon, colour]. Colours are mid-tones that read on both the dark HUD and the light receipt.
const MAP = {
  '🧾': ['receipt', '#cfd8ea'], '💵': ['cash-stack', '#3fcf6a'], '💰': ['cash-coin', '#f2b705'], '💳': ['credit-card-fill', '#4a7bd0'],
  '🔊': ['volume-up-fill', '#fff7e0'], '🔇': ['volume-mute-fill', '#fff7e0'], '🎵': ['music-note-beamed', '#9b6bd6'],
  '📦': ['box-seam-fill', '#d9a066'], '🛒': ['cart-fill', '#ff9a4a'], '🗄': ['archive-fill', '#aab2c0'], '🏧': ['bank', '#4a7bd0'],
  '▶': ['play-fill', '#5a3a00'], '◀': ['caret-left-fill', '#5a3a00'], '✔': ['check-lg', '#06482d'], '✖': ['x-lg', '#3a3a44'], '⏫': ['chevron-double-up', '#3fae5a'],
  '☀': ['sun-fill', '#ffc233'], '🌆': ['sunset-fill', '#ff9a4a'], '🌅': ['sunrise-fill', '#ffc233'], '🌙': ['moon-fill', '#cfd8ff'],
  '🔓': ['unlock-fill', '#ffc233'], '🔒': ['lock-fill', '#e08a2a'], '😕': ['emoji-frown', '#f2b705'], '😄': ['emoji-smile-fill', '#f2b705'],
  '🎯': ['bullseye', '#ff5a5f'], '🏍': ['bicycle', '#ff5a5f'], '🌪': ['tornado', '#9ba5b8'], '🔥': ['fire', '#ff7a2e'], '💣': ['exclamation-octagon-fill', '#ff5a5f'],
  '⚡': ['lightning-charge-fill', '#f2b705'], '📜': ['file-earmark-text-fill', '#c9a063'], '🏠': ['house-fill', '#e08a2a'],
  '🛠': ['tools', '#8a94a8'], '🔧': ['wrench-adjustable', '#8a94a8'], '🔩': ['nut-fill', '#8a94a8'], '⚙': ['gear-fill', '#8a94a8'], '🔄': ['arrow-repeat', '#4a90e2'],
  '💪': ['hand-thumbs-up-fill', '#f2b705'], '✨': ['stars', '#f2b705'], '🔫': ['crosshair', '#8a94a8'], '🚪': ['door-closed-fill', '#a0703f'],
  '🥫': ['database-fill', '#d9534f'], '🌶': ['fire', '#e0463e'], '🫧': ['droplet-half', '#4aa8ff'], '🧊': ['snow', '#8fd3f4'], '❄': ['snow', '#8fd3f4'],
  '⏱': ['stopwatch-fill', '#8a94a8'], '🍴': ['fork-knife', '#e8a33d'], '🌭': ['fork-knife', '#e8a33d'], '🟡': ['circle-fill', '#f2c94c'],
  '🥛': ['cup-fill', '#9fd8ee'], '🍬': ['gift-fill', '#ff7aa2'], '🍭': ['balloon-fill', '#ff7aa2'], '🍾': ['cup-straw', '#d6262b'], '⛲': ['droplet-fill', '#4aa8ff'],
  '🌀': ['hurricane', '#8fb4e8'], '🍉': ['basket-fill', '#e0463e'], '🗿': ['trophy-fill', '#aab2c0'], '🚰': ['droplet-fill', '#4aa8ff'], '💦': ['droplet-half', '#4aa8ff'],
  '🍩': ['record-circle', '#ff7aa2'], '🍯': ['droplet-fill', '#d99a14'], '🥣': ['cup-hot-fill', '#e0a458'], '🧻': ['receipt-cutoff', '#8fb4e8'],
  '📏': ['rulers', '#8a94a8'], '🛡': ['shield-fill', '#4a90e2'], '🪞': ['window', '#8fd3f4'], '☕': ['cup-hot-fill', '#a0703f'], '🫙': ['piggy-bank-fill', '#f08a9a'],
  '📈': ['graph-up-arrow', '#3fae5a'], '⚠': ['exclamation-triangle-fill', '#f2b705'], '🎟': ['ticket-perforated-fill', '#e08a2a'], '🏷': ['tag-fill', '#ff7a2e'],
  '📐': ['bounding-box', '#8a94a8'], '🚬': ['fire', '#d62828'], '🧹': ['brush-fill', '#f2c94c'], '🥤': ['cup-straw', '#2fb6a6'], '🍹': ['cup-straw', '#d6262b'],
  '🍲': ['cup-hot-fill', '#8e96a8'], '🚧': ['cone-striped', '#f2994a'], '🍎': ['apple', '#e0463e'], '📱': ['phone-fill', '#cfd8ea'],
};
const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?|[\u{1F3FB}-\u{1F3FF}])*/gu;
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);
const lookup = e => MAP[e.replace(/️/g, '')];

// ---- icon factory: fetch the svg, paint it on a GRIDxGRID canvas, snap every pixel to solid / empty, cache the data URL ----
const cache = new Map();
function icon(name, color) {
  const key = name + '|' + color;
  if (cache.has(key)) return cache.get(key);
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const p = fetch(BI + name + '.svg').then(r => { if (!r.ok) throw new Error(name); return r.text(); }).then(svg => new Promise((ok, no) => {
    const im = new Image(); im.onload = () => ok(im); im.onerror = no;
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/currentColor/g, color));
  })).then(im => {
    const c = document.createElement('canvas'); c.width = c.height = GRID;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, GRID, GRID);
    const d = g.getImageData(0, 0, GRID, GRID), px = d.data;
    for (let i = 0; i < px.length; i += 4) { const on = px[i + 3] > 105; px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = on ? 255 : 0; }
    g.putImageData(d, 0, 0); return c.toDataURL();
  });
  cache.set(key, p); p.catch(() => cache.delete(key));
  return p;
}

// emoji we couldn't load an icon for: put the emoji back as plain text (marked, so the observer leaves it alone)
window.__ico = img => {
  const s = document.createElement('span'); s.setAttribute('data-noicon', ''); s.textContent = img.alt || ''; img.replaceWith(s);
};
function hydrate(img) {
  if (img.dataset.bh) return; img.dataset.bh = '1';
  icon(img.dataset.bi, img.dataset.bc || '#ffffff').then(u => { img.src = u; }).catch(() => window.__ico(img));
}
const tag = (name, color, alt = '', cls = '') => `<img class="pxe ${cls}" alt="${alt}" data-bi="${name}" data-bc="${color}" src="${BLANK}" draggable="false">`;

export const pxIcon = (name, color = '#fff7e0', cls = '') => tag(name, color, '', cls);
export const pxEmoji = e => { const m = lookup(e); return m ? tag(m[0], m[1], e) : e; };
// emoji inside an HTML string -> icon <img> (text only: attributes inside tags are left alone)
export const pxText = s => String(s).replace(new RegExp('<[^>]*>|' + EMOJI.source, 'gu'), m => m[0] === '<' ? m : pxEmoji(m));
// innerHTML with icons; skips the write when nothing changed (no flicker on the 4x/second refresh)
export const setHTML = (el, html) => {
  const h = pxText(html);
  if (el.__h !== h) { el.__h = h; el.innerHTML = h; }
};

// ---- safety net: anything that lands in the page as plain text (textContent, template strings, Sara's typing...) is converted too ----
function convertText(tn) {
  const p = tn.parentNode; if (!p || SKIP.has(p.nodeName) || (p.hasAttribute && p.hasAttribute('data-noicon'))) return;
  const t = tn.nodeValue; if (!t || !/\p{Extended_Pictographic}/u.test(t)) return;
  const frag = document.createDocumentFragment(); let last = 0, changed = false;
  t.replace(EMOJI, (m, i) => {
    const mp = lookup(m); if (!mp) return m;
    if (i > last) frag.append(t.slice(last, i));
    const im = document.createElement('img'); im.className = 'pxe'; im.alt = m; im.src = BLANK; im.draggable = false;
    im.dataset.bi = mp[0]; im.dataset.bc = mp[1]; frag.append(im); hydrate(im);
    last = i + m.length; changed = true; return m;
  });
  if (!changed) return;
  if (last < t.length) frag.append(t.slice(last));
  p.replaceChild(frag, tn);
}
function walk(root) {
  if (root.nodeType === 3) { convertText(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName) || root.hasAttribute('data-noicon')) return;
  if (root.matches('img[data-bi]')) hydrate(root);
  root.querySelectorAll('img[data-bi]').forEach(hydrate);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
  while (w.nextNode()) list.push(w.currentNode);
  list.forEach(convertText);
}
let started = false;
export function pxifyStatic() {
  document.querySelectorAll('img[data-emoji]').forEach(i => {
    if (i.dataset.bi) return; const m = lookup(i.dataset.emoji); if (!m) return;
    i.classList.add('pxe'); i.alt = i.dataset.emoji; i.dataset.bi = m[0]; i.dataset.bc = m[1]; i.src = BLANK;
  });
  if (started) return; started = true;
  walk(document.body);
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') convertText(m.target); else m.addedNodes.forEach(walk); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
}
