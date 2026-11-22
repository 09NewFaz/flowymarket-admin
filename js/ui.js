// Utilidades de interfaz del panel.
import { sb, BUCKET, esc, uid, publicImageUrl } from './common.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONS = {
  up: svg('<path d="m18 15-6-6-6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M10.7 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"/>'),
  trash: svg('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/>'),
  grip: svg('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  wa: svg('<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5Z"/>'),
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3000);
}

/** Abre un modal. Devuelve el elemento .modal. */
export function modal(title, bodyHtml, { footer = '', wide = false, onClose } = {}) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-x" data-close aria-label="Cerrar">×</button></div>
    <div class="modal-body">${bodyHtml}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  </div>`;
  root.appendChild(wrap);
  const el = wrap.firstElementChild;
  const close = () => { wrap.remove(); onClose?.(); };
  el.close = close;
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  el.querySelector('[data-close]').onclick = close;
  el.querySelectorAll('[data-dismiss]').forEach((b) => (b.onclick = close));
  setTimeout(() => el.querySelector('input,textarea,select')?.focus(), 30);
  return el;
}

// Escape cierra el modal de más arriba
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const all = $$('#modal-root .modal');
  all[all.length - 1]?.close?.();
});

export function confirmDialog(message, { ok = 'Eliminar', danger = true } = {}) {
  return new Promise((resolve) => {
    const m = modal('Confirmar', `<p>${esc(message)}</p>`, {
      footer: `<button class="btn ghost" data-dismiss>Cancelar</button><button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(ok)}</button>`,
      onClose: () => resolve(false),
    });
    m.querySelector('[data-ok]').onclick = () => { resolve(true); m.close(); };
  });
}

/** Reduce la imagen (máx. 1600 px) y la sube al bucket. Devuelve la URL pública. */
export async function uploadImage(file, folder = 'misc') {
  if (!file) return '';
  // Mismos tipos y tamaño que acepta el bucket en Supabase (validación real en el servidor).
  const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!ALLOWED[file.type]) throw new Error('Formato no permitido. Usa JPG, PNG o WebP.');
  if (file.size > 25 * 1024 * 1024) throw new Error('La imagen pesa más de 25 MB.');
  let blob = file;
  let ext = ALLOWED[file.type];
  try {
    // Re-codificar elimina metadatos (EXIF/GPS) y reduce el peso.
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const out = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.86));
    if (out && out.type === 'image/webp') { blob = out; ext = 'webp'; }
  } catch { /* se intenta subir el original */ }
  if (blob.size > 2 * 1024 * 1024) throw new Error('La imagen sigue pesando más de 2 MB. Prueba con una más liviana.');
  const path = `${folder.replace(/[^a-z0-9-]/gi, '')}/${Date.now()}-${uid(6)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || file.type, upsert: false });
  if (error) throw new Error('No se pudo subir la imagen.');
  return publicImageUrl(path);
}

/** Campo de imagen con vista previa, subir y quitar. */
export function imageField(name, url) {
  return `<div class="img-field" data-img-field="${esc(name)}">
    <div class="img-prev">${url ? `<img src="${esc(url)}" alt="">` : '<span>Sin imagen</span>'}</div>
    <div class="img-actions">
      <label class="btn ghost sm"><span data-lbl>${url ? 'Cambiar' : 'Subir imagen'}</span><input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
      <button type="button" class="btn ghost sm" data-remove ${url ? '' : 'hidden'}>Quitar</button>
    </div>
    <input type="hidden" name="${esc(name)}" value="${esc(url || '')}">
  </div>`;
}

/** Conecta los .img-field dentro de root. onChange(name, url) */
export function bindImageFields(root, folder, onChange) {
  $$('[data-img-field]', root).forEach((box) => {
    if (box.dataset.bound) return;
    box.dataset.bound = '1';
    const name = box.dataset.imgField;
    const hidden = box.querySelector('input[type=hidden]');
    const set = (url) => {
      hidden.value = url;
      box.querySelector('.img-prev').innerHTML = url ? `<img src="${esc(url)}" alt="">` : '<span>Sin imagen</span>';
      box.querySelector('[data-lbl]').textContent = url ? 'Cambiar' : 'Subir imagen';
      box.querySelector('[data-remove]').hidden = !url;
      onChange?.(name, url);
    };
    box.querySelector('input[type=file]').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      box.classList.add('loading');
      try { set(await uploadImage(file, folder)); toast('Imagen subida'); }
      catch (err) { toast(err.message || 'No se pudo subir la imagen', 'error'); }
      box.classList.remove('loading');
    };
    box.querySelector('[data-remove]').onclick = () => set('');
  });
}

export const fmtDate = (d) => new Date(d).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function switchHtml(name, checked, label = '') {
  return `<label class="switch"><input type="checkbox" name="${esc(name)}" ${checked ? 'checked' : ''}><span class="track"></span>${label ? `<span class="switch-label">${esc(label)}</span>` : ''}</label>`;
}
