// Pixel-art helpers for the DOM UI: turns any emoji into a crisp pixelated sprite (no antialiasing),
// so icons match the pixel font and the low-res 3D view.
const cache = new Map();
const FONTS = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

export function pxEmoji(ch, n = 16) {
  const key = ch + n;
  if (cache.has(key)) return cache.get(key);
  let url = '';
  try {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.font = `${Math.round(n * 0.8)}px ${FONTS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff7e0';
    x.fillText(ch + '\uFE0F', n / 2, n / 2 + n * 0.06);
    const im = x.getImageData(0, 0, n, n), d = im.data;
    for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i + 3] > 110 ? 255 : 0;   // hard edges = pixels
    x.putImageData(im, 0, 0); url = c.toDataURL();
  } catch (e) { /* canvas unavailable: leave blank */ }
  cache.set(key, url); return url;
}

const EMOJI = /\p{Extended_Pictographic}\uFE0F?/gu;
// replace every emoji in an HTML string with a pixel sprite <img>
export const pxText = html => String(html).replace(EMOJI, m => `<img class="pxe" alt="" src="${pxEmoji(m.replace(/\uFE0F/g, ''))}">`);
export const setHTML = (el, html) => { el.innerHTML = pxText(html); };
// static <img data-emoji="🧾"> placeholders in index.html
export function pxifyStatic(root = document) {
  root.querySelectorAll('img[data-emoji]').forEach(i => { i.src = pxEmoji(i.dataset.emoji); i.classList.add('pxe'); });
}
