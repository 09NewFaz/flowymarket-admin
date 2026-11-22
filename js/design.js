// Editor de diseño: bloques, estilos globales y vista previa en vivo (estilo Marea Alcalina).
import { esc, PALETTES, FONTS, BLOCK_TYPES, BLOCK_CATEGORIES, BENTO_ICONS, createBlock, loadFont, uid } from './common.js';
import { S, saveConfig } from './app.js';
import { ICONS, $, $$, toast, modal, confirmDialog, imageField, bindImageFields } from './ui.js';

const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ED_IC = {
  cloud: SVG('<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/>'),
  mobile: SVG('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>'),
  desktop: SVG('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  reload: SVG('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  more: SVG('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
  back: SVG('<path d="m15 18-6-6 6-6"/>'),
  alignLeft: SVG('<path d="M21 6H3M15 12H3M17 18H3"/>'),
  alignCenter: SVG('<path d="M21 6H3M17 12H7M19 18H5"/>'),
  alignRight: SVG('<path d="M21 6H3M21 12H9M21 18H7"/>'),
  alignJustify: SVG('<path d="M21 6H3M21 12H3M21 18H3"/>'),
  box: SVG('<rect x="4" y="4" width="16" height="16" rx="2"/>'),
};

let draft = null;      // { store, design } en edición
let dirty = false;
let openBlock = null;
let openMenuId = null;
let tab = 'blocks';
let frame = null;
let device = 'mobile';

const clone = (o) => JSON.parse(JSON.stringify(o));

const LEGACY_LABELS = {
  whatsapp: { label: 'Botón de WhatsApp', icon: BLOCK_TYPES.fab.icon },
  divider:  { label: 'Separador', icon: BLOCK_TYPES.spacer.icon },
};
const blockMeta = (type) => BLOCK_TYPES[type] || LEGACY_LABELS[type] || { label: type, icon: ED_IC.box };

export function leaveDesign() {
  if (!dirty) return true;
  if (window.confirm('Tienes cambios sin publicar. ¿Salir y descartarlos?')) { dirty = false; return true; }
  return false;
}
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

export async function renderDesign(main) {
  draft = { store: clone(S.cfg.store), design: clone(S.cfg.design) };
  dirty = false;
  openMenuId = null;
  main.innerHTML = `<div class="editor">
    <section class="ed-panel">
      <div class="ed-top">
        <div class="ed-status">
          <span class="state"><i></i><span data-state>Publicado</span></span>
          <button class="btn ghost sm" data-discard hidden>Descartar</button>
          <button class="btn sm" data-publish disabled>${ED_IC.cloud} Publicar</button>
        </div>
        <div class="ed-tabs" role="tablist">
          <button data-tab="blocks">Bloques</button>
          <button data-tab="global">Global</button>
          <button data-tab="anim">Animaciones</button>
          <button data-tab="preview" class="only-sm">Vista previa</button>
        </div>
      </div>
      <div class="ed-body" id="ed-body"></div>
    </section>
    <section class="ed-preview">
      <div class="pv-bar">
        <button data-device="mobile">${ED_IC.mobile} Móvil</button>
        <button data-device="desktop">${ED_IC.desktop} Escritorio</button>
        <button data-reload title="Recargar vista previa">${ED_IC.reload}</button>
      </div>
      <div class="pv-frame ${device}"><iframe title="Vista previa de la tienda" src="preview/index.html?preview=1"></iframe></div>
    </section>
  </div>`;
  frame = $('.pv-frame iframe', main);
  $$('[data-tab]', main).forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  $$('[data-device]', main).forEach((b) => (b.onclick = () => { device = b.dataset.device; syncDevice(); }));
  $('[data-reload]', main).onclick = () => frame.contentWindow.location.reload();
  $('[data-publish]', main).onclick = publish;
  $('[data-discard]', main).onclick = async () => {
    if (await confirmDialog('¿Descartar todos los cambios sin publicar?', { ok: 'Descartar' })) {
      dirty = false; openBlock = null; renderDesign(main);
    }
  };
  syncDevice();
  setTab(tab === 'preview' ? 'blocks' : tab);
}

window.addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data?.type === 'fm-preview-ready') pushPreview(true);
});

let pvTimer;
function pushPreview(now) {
  clearTimeout(pvTimer);
  const send = () => frame?.contentWindow?.postMessage({ type: 'fm-preview', config: clone(draft) }, location.origin);
  if (now) send(); else pvTimer = setTimeout(send, 90);
}

function syncDevice() {
  $$('[data-device]').forEach((b) => b.classList.toggle('active', b.dataset.device === device));
  const f = $('.pv-frame');
  if (f) f.className = `pv-frame ${device}`;
}

function setTab(t) {
  tab = t;
  $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $('.editor').classList.toggle('show-preview', t === 'preview');
  if (t === 'blocks') renderBlocks();
  if (t === 'global') renderGlobal();
  if (t === 'anim') renderAnimations();
}

function change({ rerender = false } = {}) {
  dirty = true;
  const st = $('.ed-status .state');
  if (st) st.classList.add('dirty');
  const ds = $('[data-state]');
  if (ds) ds.textContent = 'Cambios sin publicar';
  const pub = $('[data-publish]');
  if (pub) pub.disabled = false;
  const disc = $('[data-discard]');
  if (disc) disc.hidden = false;
  pushPreview();
  if (rerender) {
    if (tab === 'global') renderGlobal();
    else if (tab === 'anim') renderAnimations();
    else renderBlocks();
  }
}

async function publish() {
  const btn = $('[data-publish]');
  btn.disabled = true; btn.textContent = 'Publicando…';
  try {
    const store = { ...S.cfg.store, name: draft.store.name, description: draft.store.description, logo: draft.store.logo, favicon: draft.store.favicon || '' };
    if (!store.name.trim()) throw new Error('La tienda necesita un nombre.');
    await saveConfig({ store, design: draft.design });
    dirty = false;
    $('.ed-status .state').classList.remove('dirty');
    $('[data-state]').textContent = 'Publicado';
    $('[data-discard]').hidden = true;
    toast('¡Cambios publicados!', 'ok');
  } catch (err) {
    toast(err.message || 'No se pudo publicar', 'error');
    btn.disabled = false;
  }
  btn.innerHTML = `${ED_IC.cloud} Publicar`;
}

// ================= Bloques =================
const blockName = (b) => {
  if (b.type === 'text' && b.content) return b.content.slice(0, 36);
  if (b.title) return `${blockMeta(b.type).label}: ${b.title}`.slice(0, 42);
  return blockMeta(b.type).label;
};

function renderBlocks() {
  const body = $('#ed-body');
  const blocks = draft.design.blocks;

  // Vista de edición enfocada de un bloque (con selector rápido de bloques como Marea Alcalina)
  if (openBlock) {
    const idx = blocks.findIndex((x) => x.id === openBlock);
    if (idx === -1) { openBlock = null; }
    else {
      const b = blocks[idx];
      body.innerHTML = `
        <div class="blk-edit-head">
          <button class="icon-btn" data-back title="Volver a Bloques">${ED_IC.back}</button>
          <select class="blk-switch" data-switch aria-label="Cambiar de bloque">
            ${blocks.map((x) => `<option value="${esc(x.id)}" ${x.id === b.id ? 'selected' : ''}>${esc(blockName(x))}</option>`).join('')}
          </select>
          <button class="icon-btn" data-back title="Cerrar">${ICONS.x}</button>
        </div>
        <div class="blk-edit-body">${blockEditor(b)}</div>`;
      $$('[data-back]', body).forEach((btn) => (btn.onclick = () => { openBlock = null; renderBlocks(); }));
      $('[data-switch]', body).onchange = (e) => { openBlock = e.target.value; renderBlocks(); };
      bindBlockEditor($('.blk-edit-body', body), b, idx);
      return;
    }
  }

  body.innerHTML = `
    <p class="hint" style="margin:0 0 12px">Arrastra los bloques para reordenarlos. Toca uno para editar todas sus opciones.</p>
    <div id="blocks">${blocks.map((b, i) => {
      const meta = blockMeta(b.type);
      const unique = !!BLOCK_TYPES[b.type]?.unique;
      return `<div class="blk ${b.visible === false ? 'off' : ''}" data-i="${i}">
        <div class="b-head">
          <button class="b-handle" title="Arrastrar" aria-label="Mover">${ICONS.grip}</button>
          <button class="b-title" data-open><span class="ic">${meta.icon}</span><span class="nm">${esc(blockName(b))}</span></button>
          <button class="icon-btn" data-up title="Subir" ${i === 0 ? 'disabled' : ''}>${ICONS.up}</button>
          <button class="icon-btn" data-down title="Bajar" ${i === blocks.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>
          <div class="b-more-wrap">
            <button class="icon-btn" data-more="${esc(b.id)}" title="Opciones del bloque">${ED_IC.more}</button>
            ${openMenuId === b.id ? `<div class="b-menu">
              ${!unique ? `<button data-dup>${ICONS.copy} Duplicar</button>` : ''}
              <button data-eye>${b.visible === false ? ICONS.eye : ICONS.eyeOff} ${b.visible === false ? 'Mostrar' : 'Ocultar'}</button>
              ${b.type !== 'catalog' ? `<button class="danger" data-del>${ICONS.trash} Eliminar</button>` : ''}
            </div>` : ''}
          </div>
        </div>
      </div>`;
    }).join('')}</div>
    <button class="add-block" data-add>＋ Agregar bloque</button>`;

  $$('.blk', body).forEach((el) => {
    const i = Number(el.dataset.i);
    const b = blocks[i];
    el.querySelector('[data-open]').onclick = () => { openMenuId = null; openBlock = b.id; renderBlocks(); };
    el.querySelector('[data-up]').onclick = () => move(i, i - 1);
    el.querySelector('[data-down]').onclick = () => move(i, i + 1);
    el.querySelector('[data-more]').onclick = (e) => {
      e.stopPropagation();
      openMenuId = openMenuId === b.id ? null : b.id;
      renderBlocks();
    };
    const dup = el.querySelector('[data-dup]');
    if (dup) dup.onclick = () => {
      const copy = clone(b);
      copy.id = `b-${uid(8)}`;
      blocks.splice(i + 1, 0, copy);
      openMenuId = null;
      change({ rerender: true });
    };
    const eye = el.querySelector('[data-eye]');
    if (eye) eye.onclick = () => { b.visible = b.visible === false; openMenuId = null; change({ rerender: true }); };
    const del = el.querySelector('[data-del]');
    if (del) del.onclick = () => { blocks.splice(i, 1); openMenuId = null; change({ rerender: true }); };

    const handle = el.querySelector('.b-handle');
    handle.addEventListener('mousedown', () => (el.draggable = true));
    handle.addEventListener('mouseup', () => (el.draggable = false));
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(i)); el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); el.draggable = false; });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); el.classList.remove('over');
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (!Number.isNaN(from) && from !== i) move(from, i);
    });
  });

  if (openMenuId) {
    const close = () => { openMenuId = null; renderBlocks(); };
    setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
  }
  $('[data-add]', body).onclick = addBlockMenu;
}

function move(from, to) {
  const blocks = draft.design.blocks;
  if (to < 0 || to >= blocks.length) return;
  const [b] = blocks.splice(from, 1);
  blocks.splice(to, 0, b);
  change({ rerender: true });
}

// ---------- Helpers de formularios para editores de bloques ----------
const swRow = (attr, label, checked, hint = '') => `
  <div class="set-row compact">
    <div><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</div>
    <label class="switch"><input type="checkbox" ${attr} ${checked ? 'checked' : ''}><span class="track"></span></label>
  </div>`;

const colorRow = (attr, label, val) => `
  <div class="color-row" style="margin-bottom:8px">
    <span>${esc(label)}</span>
    <span style="display:flex;gap:6px">
      <input type="color" data-bcolor="${attr}" value="${esc(val || '#000000')}">
      <input class="input hex" data-bhex="${attr}" value="${esc(val || '#000000')}" maxlength="7">
    </span>
  </div>`;

function blockEditor(b) {
  const d = draft.design;
  const del = b.type !== 'catalog' ? '<div class="blk-foot"><button class="btn ghost sm" data-del style="color:var(--danger)">Eliminar bloque</button></div>' : '';

  switch (b.type) {
    case 'hero': {
      const h = d.hero;
      const bgType = h.type || (h.image ? 'image' : 'color');
      return `
        <div class="ed-group"><h5>Ajustes de Fondo</h5>
          <div class="field"><label>Tipo de Fondo</label>
            <select data-ks="design.hero.type">
              <option value="color" ${bgType === 'color' ? 'selected' : ''}>Color / Degradado</option>
              <option value="image" ${bgType === 'image' ? 'selected' : ''}>Imagen</option>
              <option value="video" ${bgType === 'video' ? 'selected' : ''}>Video</option>
            </select>
          </div>
          ${bgType === 'image' ? `<div class="field"><label>Imagen de Fondo</label>${imageField('heroImage', h.image)}</div>` : ''}
          ${bgType === 'video' ? `<div class="field"><label>URL del Video (MP4 / WebM)</label><input data-k="design.hero.video" placeholder="https://…/video.mp4" value="${esc(h.video || '')}"></div>` : ''}
          ${bgType !== 'color' ? `
            <div class="field"><label>Opacidad de Superposición</label>
              <div class="range"><input type="range" min="0" max="100" step="10" data-k="design.hero.overlay" value="${Number(h.overlay) || 0}"><output>${Number(h.overlay) || 0}%</output></div>
            </div>
            <div class="field"><label>Tinte de Superposición</label><div class="choice">
              <button data-set="design.hero.tint" data-v="dark" class="${h.tint !== 'light' ? 'active' : ''}">Aa Oscuro</button>
              <button data-set="design.hero.tint" data-v="light" class="${h.tint === 'light' ? 'active' : ''}">Aa Claro</button>
            </div></div>` : ''}
        </div>
        <div class="ed-group"><h5>Ajustes de Contenido</h5>
          <div class="field"><label>Título *</label><input data-k="store.name" maxlength="80" value="${esc(draft.store.name)}"></div>
          <div class="field"><label>Subtítulo</label><textarea data-k="store.description" rows="4" maxlength="600">${esc(draft.store.description)}</textarea></div>
          <div class="field"><label>Alineación del Texto</label>
            <select data-ks="design.hero.align">
              <option value="left" ${h.align === 'left' ? 'selected' : ''}>Izquierda</option>
              <option value="center" ${!h.align || h.align === 'center' ? 'selected' : ''}>Centro</option>
              <option value="right" ${h.align === 'right' ? 'selected' : ''}>Derecha</option>
            </select>
          </div>
          <div class="field"><label>Color del Texto</label>
            <div class="color-row">
              <span>Color</span>
              <span style="display:flex;gap:6px">
                <input type="color" data-kcolor="design.hero.textColor" value="${esc(h.textColor || '#ffffff')}">
                <input class="input hex" data-khex="design.hero.textColor" value="${esc(h.textColor || '#ffffff')}" maxlength="7">
              </span>
            </div>
          </div>
          <div class="field"><label>Logo</label>${imageField('logo', draft.store.logo)}</div>
          <div class="field"><label>Imagen de Presentación (Opcional)</label>${imageField('heroFg', h.fgImage || '')}</div>
        </div>
        <div class="ed-group"><h5>Botón de llamada a la acción (Opcional)</h5>
          <div class="field"><label>Texto del botón</label><input data-k="design.hero.ctaText" maxlength="60" placeholder="Ej: Ver catálogo" value="${esc(h.ctaText || '')}"></div>
          <div class="field"><label>Tipo de Acción</label>
            <select data-ks="design.hero.ctaType">
              <option value="url" ${h.ctaType !== 'scroll' ? 'selected' : ''}>URL</option>
              <option value="scroll" ${h.ctaType === 'scroll' ? 'selected' : ''}>Desplazar a Sección</option>
            </select>
          </div>
          ${h.ctaType === 'scroll' ? `
            <div class="field"><label>Sección destino</label>
              <select data-ks="design.hero.ctaBlock">
                ${draft.design.blocks.filter((x) => x.id !== b.id).map((x) => `<option value="${esc(x.id)}" ${h.ctaBlock === x.id ? 'selected' : ''}>${esc(blockName(x))}</option>`).join('')}
              </select>
            </div>` : `
            <div class="field"><label>URL de llamada a la acción</label><input data-k="design.hero.ctaUrl" placeholder="https://example.com" value="${esc(h.ctaUrl || '')}"></div>`}
        </div>
        <div class="ed-group"><h5>Ajustes de Diseño</h5>
          <div class="field"><label>Tamaño</label>
            <select data-ks="design.hero.size">
              <option value="sm" ${h.size === 'sm' ? 'selected' : ''}>Pequeño</option>
              <option value="md" ${!h.size || h.size === 'md' ? 'selected' : ''}>Mediano</option>
              <option value="lg" ${h.size === 'lg' ? 'selected' : ''}>Grande</option>
              <option value="xl" ${h.size === 'xl' ? 'selected' : ''}>Extra Grande</option>
            </select>
          </div>
          ${swRow('data-kchk="design.hero.fullHeight"', 'Altura Completa de la Sección', !!h.fullHeight)}
        </div>
        ${del}`;
    }

    case 'catalog': {
      const tpl = b.template || d.layout || 'list';
      return `
        <div class="ed-group"><h5>Plantilla</h5>
          <div class="field"><label>Estilo de Plantilla</label>
            <select data-bs="template">
              <option value="list" ${tpl === 'list' ? 'selected' : ''}>Lista</option>
              <option value="grid" ${tpl === 'grid' ? 'selected' : ''}>Parrilla Moderna (Sin Espacios)</option>
              <option value="glass" ${tpl === 'glass' ? 'selected' : ''}>Glassmorfismo</option>
              <option value="classic" ${tpl === 'classic' ? 'selected' : ''}>Clásico</option>
            </select>
          </div>
        </div>
        <div class="ed-group"><h5>Filtrar por Categoría</h5>
          ${swRow('data-bchk="showCategories"', 'Filtrar por Categoría', b.showCategories !== false)}
          ${swRow('data-bchk="showSearch"', 'Mostrar Barra de Búsqueda', b.showSearch !== false)}
          ${swRow('data-bchk="showSortFilter"', 'Mostrar Ordenar y Filtrar', b.showSortFilter !== false)}
        </div>
        <div class="ed-group"><h5>Opciones de Visualización</h5>
          ${swRow('data-bchk="showTitle"', 'Mostrar Título', b.showTitle !== false)}
          ${swRow('data-bchk="showPrice"', 'Mostrar Precio', b.showPrice !== false)}
          ${swRow('data-bchk="showDescription"', 'Mostrar Descripción', b.showDescription !== false)}
          ${swRow('data-bchk="showExternalLink"', 'Mostrar Enlace Externo', !!b.showExternalLink)}
          ${swRow('data-bchk="showCartButton"', 'Habilitar Botón de Carrito', b.showCartButton !== false)}
        </div>
        <p class="hint">Los productos y categorías se gestionan en <a href="#/products">Gestionar Productos y Categorías</a>.</p>`;
    }

    case 'cart': return `
      <div class="ed-group"><h5>Visualización</h5>
        ${swRow('data-bchk="showCount"', 'Mostrar contador de artículos', b.showCount !== false)}
        ${swRow('data-bchk="showTotal"', 'Mostrar precio total', b.showTotal !== false)}
        ${swRow('data-bchk="sidePanel"', 'Pago en panel lateral (escritorio)', !!b.sidePanel, 'En escritorio, el carrito se abre en un panel lateral deslizante.')}
      </div>
      <div class="ed-group"><h5>Posición y Estilo</h5>
        <div class="field"><label>Posición</label>
          <select data-bs="position">
            <option value="bottom-right" ${!b.position || b.position === 'bottom-right' ? 'selected' : ''}>Abajo Derecha</option>
            <option value="bottom-left" ${b.position === 'bottom-left' ? 'selected' : ''}>Abajo Izquierda</option>
            <option value="top-right" ${b.position === 'top-right' ? 'selected' : ''}>Arriba Derecha</option>
            <option value="top-left" ${b.position === 'top-left' ? 'selected' : ''}>Arriba Izquierda</option>
            <option value="middle-right" ${b.position === 'middle-right' ? 'selected' : ''}>Centro Derecha</option>
            <option value="middle-left" ${b.position === 'middle-left' ? 'selected' : ''}>Centro Izquierda</option>
          </select>
        </div>
        <div class="field"><label>Tamaño</label>
          <select data-bs="size">
            <option value="sm" ${b.size === 'sm' ? 'selected' : ''}>Pequeño</option>
            <option value="md" ${!b.size || b.size === 'md' ? 'selected' : ''}>Mediano</option>
            <option value="lg" ${b.size === 'lg' ? 'selected' : ''}>Grande</option>
          </select>
        </div>
        <div class="field"><label>Animación</label>
          <select data-bs="animation">
            <option value="none" ${!b.animation || b.animation === 'none' ? 'selected' : ''}>Ninguna</option>
            <option value="pulse" ${b.animation === 'pulse' ? 'selected' : ''}>Pulso</option>
            <option value="bounce" ${b.animation === 'bounce' ? 'selected' : ''}>Rebote</option>
            <option value="scale" ${b.animation === 'scale' ? 'selected' : ''}>Escala</option>
          </select>
        </div>
        ${swRow('data-bchk="customColors"', 'Personalizar Colores', !!b.customColors)}
        ${b.customColors ? `
          <div style="margin-top:10px">
            ${colorRow('bgColor', 'Color de Fondo', b.bgColor || '#4f46e5')}
            ${colorRow('iconColor', 'Color del Icono', b.iconColor || '#ffffff')}
            ${colorRow('labelColor', 'Color de la Etiqueta', b.labelColor || '#ffffff')}
          </div>` : ''}
      </div>
      <p class="hint">Configura entregas y pagos en <a href="#/checkout">Checkout</a> y <a href="#/payments">Pagos</a>.</p>
      ${del}`;

    case 'text': return `
      <div class="field"><label>Formato</label>
        <div class="fmt-bar">
          ${[['left', ED_IC.alignLeft], ['center', ED_IC.alignCenter], ['right', ED_IC.alignRight], ['justify', ED_IC.alignJustify]].map(([v, ic]) =>
            `<button type="button" data-bset="align" data-v="${v}" class="${(b.align || 'center') === v ? 'active' : ''}" title="${v}">${ic}</button>`).join('')}
          <span class="fmt-sep"></span>
          <button type="button" data-btog="bold" class="${b.bold ? 'active' : ''}" title="Negrita"><b>B</b></button>
          <button type="button" data-btog="italic" class="${b.italic ? 'active' : ''}" title="Cursiva"><i>I</i></button>
          <button type="button" data-btog="underline" class="${b.underline ? 'active' : ''}" title="Subrayado"><u>U</u></button>
          <span class="fmt-sep"></span>
          <select data-bs="size" class="fmt-sel" aria-label="Tamaño">
            <option value="sm" ${b.size === 'sm' ? 'selected' : ''}>Pequeño</option>
            <option value="md" ${!b.size || b.size === 'md' ? 'selected' : ''}>Mediano</option>
            <option value="lg" ${b.size === 'lg' ? 'selected' : ''}>Grande</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Contenido</label><textarea data-b="content" rows="6" maxlength="2000">${esc(b.content || '')}</textarea></div>
      ${del}`;

    case 'image': return `
      <div class="field"><label>Imagen</label>${imageField('blockImage', b.image)}</div>
      <div class="field"><label>Leyenda (opcional)</label><input data-b="caption" maxlength="200" value="${esc(b.caption || '')}"></div>
      <div class="field"><label>Enlace al tocar (opcional)</label><input data-b="link" placeholder="https://…" value="${esc(b.link || '')}"></div>
      <div class="field"><label>Texto alternativo</label><input data-b="alt" maxlength="120" value="${esc(b.alt || '')}"></div>
      ${del}`;

    case 'carousel': return `
      <div class="field"><label>Título del carrusel</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
      <div class="field"><label>Categoría a mostrar</label>
        <select data-bs="categoryId">
          <option value="" ${!b.categoryId ? 'selected' : ''}>Todos los productos</option>
          ${(S.cats || []).map((c) => `<option value="${esc(c.id)}" ${b.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      ${swRow('data-bchk="showPrice"', 'Mostrar precio', b.showPrice !== false)}
      ${del}`;

    case 'bio': return `
      <div class="field"><label>Foto de perfil</label>${imageField('blockImage', b.image)}</div>
      <div class="field"><label>Nombre / Título</label><input data-b="name" maxlength="80" value="${esc(b.name || '')}"></div>
      <div class="field"><label>Subtítulo / Rol</label><input data-b="role" maxlength="80" value="${esc(b.role || '')}"></div>
      <div class="field"><label>Descripción</label><textarea data-b="description" rows="4" maxlength="600">${esc(b.description || '')}</textarea></div>
      <div class="field"><label>Alineación</label>
        <div class="choice">
          <button data-bset="align" data-v="left" class="${b.align === 'left' ? 'active' : ''}">Izquierda</button>
          <button data-bset="align" data-v="center" class="${!b.align || b.align === 'center' ? 'active' : ''}">Centro</button>
        </div>
      </div>
      ${del}`;

    case 'promo': return `
      <div class="field"><label>Etiqueta</label><input data-b="badge" maxlength="30" placeholder="OFERTA" value="${esc(b.badge || '')}"></div>
      <div class="field"><label>Título</label><input data-b="title" maxlength="100" value="${esc(b.title || '')}"></div>
      <div class="field"><label>Subtítulo</label><textarea data-b="subtitle" rows="2" maxlength="300">${esc(b.subtitle || '')}</textarea></div>
      <div class="field"><label>Código de cupón (opcional)</label><input data-b="code" maxlength="30" placeholder="EJ: FLOWY10" value="${esc(b.code || '')}"></div>
      <div class="row">
        <div class="field"><label>Texto del botón</label><input data-b="ctaText" maxlength="40" value="${esc(b.ctaText || '')}"></div>
        <div class="field"><label>Enlace</label><input data-b="ctaUrl" placeholder="#catalog o https://…" value="${esc(b.ctaUrl || '')}"></div>
      </div>
      ${swRow('data-bchk="customColors"', 'Colores personalizados', !!b.customColors)}
      ${b.customColors ? `<div style="margin-top:8px">${colorRow('bgColor', 'Fondo', b.bgColor || '#ff758c')}${colorRow('textColor', 'Texto', b.textColor || '#ffffff')}</div>` : ''}
      ${del}`;

    case 'youtube': return `
      <div class="field"><label>Título (opcional)</label><input data-b="title" maxlength="100" value="${esc(b.title || '')}"></div>
      <div class="field"><label>URL o ID de YouTube</label><input data-b="url" placeholder="https://www.youtube.com/watch?v=…" value="${esc(b.url || '')}"><small>Pega el enlace completo o el ID del video.</small></div>
      ${del}`;

    case 'map': return `
      <div class="field"><label>Título</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
      <div class="field"><label>Dirección o lugar (Google Maps)</label><input data-b="query" placeholder="Ej: Av. Providencia 1234, Santiago" value="${esc(b.query || '')}"></div>
      <div class="field"><label>Altura (px)</label><input type="number" min="180" max="500" data-b="height" value="${Number(b.height) || 280}"></div>
      ${del}`;

    case 'form': {
      const fields = Array.isArray(b.fields) ? b.fields : [];
      return `
        <div class="field"><label>Título</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
        <div class="field"><label>Descripción</label><textarea data-b="description" rows="2" maxlength="300">${esc(b.description || '')}</textarea></div>
        <div class="field"><label>Texto del botón</label><input data-b="buttonText" maxlength="50" value="${esc(b.buttonText || 'Enviar por WhatsApp')}"></div>
        <div class="ed-group"><h5>Campos</h5>
          ${fields.map((f, fi) => `<div class="list-item-ed">
            <div class="row">
              <input class="input" data-arr="fields.${fi}.label" placeholder="Etiqueta" value="${esc(f.label || '')}">
              <select class="input" data-arrs="fields.${fi}.type">
                <option value="text" ${f.type === 'text' ? 'selected' : ''}>Texto</option>
                <option value="email" ${f.type === 'email' ? 'selected' : ''}>Correo</option>
                <option value="tel" ${f.type === 'tel' ? 'selected' : ''}>Teléfono</option>
                <option value="textarea" ${f.type === 'textarea' ? 'selected' : ''}>Texto largo</option>
              </select>
            </div>
            <div class="item-actions">
              <label class="chk"><input type="checkbox" data-arrchk="fields.${fi}.required" ${f.required ? 'checked' : ''}> Obligatorio</label>
              <button class="btn ghost sm" data-arrdel="fields:${fi}">Eliminar</button>
            </div>
          </div>`).join('')}
          <button class="btn ghost sm" data-arradd="fields">＋ Agregar campo</button>
        </div>
        ${del}`;
    }

    case 'social': {
      const items = Array.isArray(b.items) ? b.items : [];
      const nets = ['instagram', 'tiktok', 'facebook', 'x', 'youtube', 'whatsapp', 'email', 'web'];
      return `
        <div class="field"><label>Título (opcional)</label><input data-b="title" maxlength="60" value="${esc(b.title || '')}"></div>
        <div class="field"><label>Alineación</label><div class="choice">
          <button data-bset="align" data-v="left" class="${b.align === 'left' ? 'active' : ''}">Izquierda</button>
          <button data-bset="align" data-v="center" class="${!b.align || b.align === 'center' ? 'active' : ''}">Centro</button>
          <button data-bset="align" data-v="right" class="${b.align === 'right' ? 'active' : ''}">Derecha</button>
        </div></div>
        <div class="ed-group"><h5>Redes</h5>
          ${items.map((it, ii) => `<div class="list-item-ed">
            <div class="row">
              <select class="input" data-arrs="items.${ii}.network">${nets.map((n) => `<option value="${n}" ${it.network === n ? 'selected' : ''}>${n.toUpperCase()}</option>`).join('')}</select>
              <input class="input" data-arr="items.${ii}.url" placeholder="https://… o @usuario" value="${esc(it.url || '')}">
            </div>
            <div class="item-actions"><button class="btn ghost sm" data-arrdel="items:${ii}">Eliminar</button></div>
          </div>`).join('')}
          <button class="btn ghost sm" data-arradd="social">＋ Agregar red</button>
        </div>
        ${del}`;
    }

    case 'links': {
      const items = Array.isArray(b.items) ? b.items : [];
      return `
        <div class="field"><label>Título (opcional)</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
        <div class="ed-group"><h5>Botones</h5>
          ${items.map((it, ii) => `<div class="list-item-ed">
            <input class="input" data-arr="items.${ii}.title" placeholder="Título del botón" value="${esc(it.title || '')}" style="margin-bottom:6px">
            <input class="input" data-arr="items.${ii}.subtitle" placeholder="Subtítulo (opcional)" value="${esc(it.subtitle || '')}" style="margin-bottom:6px">
            <input class="input" data-arr="items.${ii}.url" placeholder="https://… o #catalog" value="${esc(it.url || '')}" style="margin-bottom:6px">
            <input class="input" data-arr="items.${ii}.image" placeholder="URL de ícono/imagen (opcional)" value="${esc(it.image || '')}">
            <div class="item-actions"><button class="btn ghost sm" data-arrdel="items:${ii}">Eliminar</button></div>
          </div>`).join('')}
          <button class="btn ghost sm" data-arradd="links">＋ Agregar enlace</button>
        </div>
        ${del}`;
    }

    case 'fab': return `
      <div class="field"><label>Tipo de contacto</label>
        <select data-bs="channel">
          <option value="whatsapp" ${!b.channel || b.channel === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
          <option value="phone" ${b.channel === 'phone' ? 'selected' : ''}>Teléfono</option>
          <option value="email" ${b.channel === 'email' ? 'selected' : ''}>Correo</option>
          <option value="url" ${b.channel === 'url' ? 'selected' : ''}>Enlace personalizado</option>
        </select>
      </div>
      <div class="field"><label>Número / Correo / URL</label><input data-b="value" placeholder="${b.channel === 'email' ? 'hola@tienda.com' : b.channel === 'url' ? 'https://…' : '+56912345678 (vacío = WhatsApp de la tienda)'}" value="${esc(b.value || '')}"></div>
      ${!b.channel || b.channel === 'whatsapp' ? `<div class="field"><label>Mensaje inicial</label><input data-b="message" maxlength="200" value="${esc(b.message || 'Hola! Tengo una consulta')}"></div>` : ''}
      <div class="field"><label>Etiqueta (opcional)</label><input data-b="label" maxlength="30" placeholder="Ej: Escríbenos" value="${esc(b.label || '')}"></div>
      <div class="field"><label>Posición</label>
        <select data-bs="position">
          <option value="bottom-left" ${!b.position || b.position === 'bottom-left' ? 'selected' : ''}>Abajo Izquierda</option>
          <option value="bottom-right" ${b.position === 'bottom-right' ? 'selected' : ''}>Abajo Derecha</option>
          <option value="top-left" ${b.position === 'top-left' ? 'selected' : ''}>Arriba Izquierda</option>
          <option value="top-right" ${b.position === 'top-right' ? 'selected' : ''}>Arriba Derecha</option>
        </select>
      </div>
      ${colorRow('color', 'Color del botón', b.color || '#25d366')}
      ${del}`;

    case 'whatsapp': return `
      <div class="field"><label>Texto del botón</label><input data-b="label" maxlength="60" value="${esc(b.label || 'Escríbenos por WhatsApp')}"></div>
      <div class="field"><label>Mensaje inicial</label><input data-b="message" maxlength="200" value="${esc(b.message || 'Hola! Tengo una consulta')}"></div>
      ${del}`;

    case 'testimonials': {
      const items = Array.isArray(b.items) ? b.items : [];
      return `
        <div class="field"><label>Título</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
        <div class="ed-group"><h5>Reseñas</h5>
          ${items.map((it, ii) => `<div class="list-item-ed">
            <div class="row" style="margin-bottom:6px">
              <input class="input" data-arr="items.${ii}.author" placeholder="Nombre" value="${esc(it.author || '')}">
              <input class="input" data-arr="items.${ii}.role" placeholder="Rol / fecha" value="${esc(it.role || '')}">
            </div>
            <select class="input" data-arrs="items.${ii}.rating" style="margin-bottom:6px">
              ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${Number(it.rating || 5) === n ? 'selected' : ''}>${'★'.repeat(n)} (${n})</option>`).join('')}
            </select>
            <textarea class="input" rows="2" data-arr="items.${ii}.text" placeholder="Reseña…">${esc(it.text || '')}</textarea>
            <div class="item-actions"><button class="btn ghost sm" data-arrdel="items:${ii}">Eliminar</button></div>
          </div>`).join('')}
          <button class="btn ghost sm" data-arradd="testimonials">＋ Agregar testimonio</button>
        </div>
        ${del}`;
    }

    case 'faq': {
      const items = Array.isArray(b.items) ? b.items : [];
      return `
        <div class="field"><label>Título</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
        <div class="ed-group"><h5>Preguntas</h5>
          ${items.map((it, ii) => `<div class="list-item-ed">
            <input class="input" data-arr="items.${ii}.q" placeholder="Pregunta" value="${esc(it.q || '')}" style="margin-bottom:6px">
            <textarea class="input" rows="2" data-arr="items.${ii}.a" placeholder="Respuesta">${esc(it.a || '')}</textarea>
            <div class="item-actions"><button class="btn ghost sm" data-arrdel="items:${ii}">Eliminar</button></div>
          </div>`).join('')}
          <button class="btn ghost sm" data-arradd="faq">＋ Agregar pregunta</button>
        </div>
        ${del}`;
    }

    case 'gallery': {
      const items = Array.isArray(b.items) ? b.items : [];
      return `
        <div class="field"><label>Título</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
        <div class="field"><label>Diseño</label>
          <select data-bs="layout">
            <option value="grid" ${!b.layout || b.layout === 'grid' ? 'selected' : ''}>Cuadrícula</option>
            <option value="masonry" ${b.layout === 'masonry' ? 'selected' : ''}>Mosaico</option>
            <option value="carousel" ${b.layout === 'carousel' ? 'selected' : ''}>Carrusel</option>
          </select>
        </div>
        <div class="ed-group"><h5>Imágenes</h5>
          ${items.map((it, ii) => `<div class="list-item-ed">
            ${it.url ? `<img src="${esc(it.url)}" alt="" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:6px">` : ''}
            <input class="input" data-arr="items.${ii}.url" placeholder="URL de imagen" value="${esc(it.url || '')}" style="margin-bottom:6px">
            <input class="input" data-arr="items.${ii}.caption" placeholder="Leyenda (opcional)" value="${esc(it.caption || '')}">
            <div class="item-actions"><button class="btn ghost sm" data-arrdel="items:${ii}">Eliminar</button></div>
          </div>`).join('')}
          <div class="field" style="margin-top:8px"><label>Subir nueva imagen</label>${imageField('galleryAdd', '')}</div>
          <button class="btn ghost sm" data-arradd="gallery">＋ Agregar por URL</button>
        </div>
        ${del}`;
    }

    case 'hours': {
      const days = Array.isArray(b.days) ? b.days : [];
      return `
        <div class="field"><label>Título</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
        <div class="ed-group"><h5>Días</h5>
          ${days.map((dy, di) => `<div class="list-item-ed" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <b style="min-width:80px">${esc(dy.day)}</b>
            <input class="input" style="flex:1;min-width:110px" data-arr="days.${di}.hours" placeholder="09:00 - 18:00" value="${esc(dy.hours || '')}" ${dy.closed ? 'disabled' : ''}>
            <label class="chk"><input type="checkbox" data-arrchk="days.${di}.closed" ${dy.closed ? 'checked' : ''}> Cerrado</label>
          </div>`).join('')}
        </div>
        <div class="field"><label>Nota adicional (opcional)</label><input data-b="note" maxlength="160" value="${esc(b.note || '')}"></div>
        ${del}`;
    }

    case 'footer': {
      const links = Array.isArray(b.links) ? b.links : [];
      return `
        <div class="field"><label>Descripción</label><textarea data-b="description" rows="2" maxlength="300">${esc(b.description || '')}</textarea></div>
        <div class="row">
          <div class="field"><label>Teléfono</label><input data-b="phone" value="${esc(b.phone || '')}"></div>
          <div class="field"><label>Correo</label><input data-b="email" value="${esc(b.email || '')}"></div>
        </div>
        <div class="field"><label>Dirección</label><input data-b="address" value="${esc(b.address || '')}"></div>
        <div class="field"><label>Texto de copyright (opcional)</label><input data-b="copyright" placeholder="© 2026 Mi Tienda" value="${esc(b.copyright || '')}"></div>
        <div class="ed-group"><h5>Enlaces rápidos</h5>
          ${links.map((lk, li) => `<div class="list-item-ed">
            <div class="row">
              <input class="input" data-arr="links.${li}.label" placeholder="Texto" value="${esc(lk.label || '')}">
              <input class="input" data-arr="links.${li}.url" placeholder="https://… o #catalog" value="${esc(lk.url || '')}">
            </div>
            <div class="item-actions"><button class="btn ghost sm" data-arrdel="links:${li}">Eliminar</button></div>
          </div>`).join('')}
          <button class="btn ghost sm" data-arradd="footerLinks">＋ Agregar enlace</button>
        </div>
        ${del}`;
    }

    case 'spacer':
    case 'divider': return `
      <div class="field"><label>Altura</label>
        <div class="choice">
          <button data-bset="size" data-v="sm" class="${b.size === 'sm' ? 'active' : ''}">Pequeño</button>
          <button data-bset="size" data-v="md" ${!b.size || b.size === 'md' ? 'class="active"' : ''}>Mediano</button>
          <button data-bset="size" data-v="lg" class="${b.size === 'lg' ? 'active' : ''}">Grande</button>
        </div>
      </div>
      ${swRow('data-bchk="line"', 'Mostrar línea divisoria', b.type === 'divider' ? true : b.line !== false)}
      ${del}`;

    case 'bento': {
      const items = Array.isArray(b.items) ? b.items : [];
      const icKeys = Object.entries(BENTO_ICONS);
      return `
        <div class="field"><label>Título</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
        <div class="ed-group"><h5>Tarjetas</h5>
          ${items.map((it, ii) => `<div class="list-item-ed">
            <div class="row" style="margin-bottom:6px">
              <select class="input" data-arrs="items.${ii}.icon">
                ${icKeys.map(([k, v]) => `<option value="${k}" ${(it.icon || 'sparkles') === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
              </select>
              <input class="input" data-arr="items.${ii}.title" placeholder="Título" value="${esc(it.title || '')}">
            </div>
            <textarea class="input" rows="2" data-arr="items.${ii}.desc" placeholder="Descripción">${esc(it.desc || '')}</textarea>
            <div class="item-actions"><button class="btn ghost sm" data-arrdel="items:${ii}">Eliminar</button></div>
          </div>`).join('')}
          <button class="btn ghost sm" data-arradd="bento">＋ Agregar característica</button>
        </div>
        ${del}`;
    }

    case 'stats': {
      const items = Array.isArray(b.items) ? b.items : [];
      return `
        <div class="field"><label>Título (opcional)</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
        <div class="ed-group"><h5>Métricas</h5>
          ${items.map((it, ii) => `<div class="list-item-ed">
            <div class="row">
              <input class="input" data-arr="items.${ii}.value" placeholder="Ej: +500" value="${esc(it.value || '')}">
              <input class="input" data-arr="items.${ii}.label" placeholder="Ej: Clientes felices" value="${esc(it.label || '')}">
            </div>
            <div class="item-actions"><button class="btn ghost sm" data-arrdel="items:${ii}">Eliminar</button></div>
          </div>`).join('')}
          <button class="btn ghost sm" data-arradd="stats">＋ Agregar métrica</button>
        </div>
        ${del}`;
    }

    case 'pricing': {
      const plans = Array.isArray(b.plans) ? b.plans : [];
      return `
        <div class="field"><label>Título</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
        ${swRow('data-bchk="showToggle"', 'Selector mensual / anual', b.showToggle !== false)}
        <div class="ed-group"><h5>Planes</h5>
          ${plans.map((pl, pi) => `<div class="list-item-ed">
            <input class="input" data-arr="plans.${pi}.name" placeholder="Nombre del plan" value="${esc(pl.name || '')}" style="margin-bottom:6px">
            <div class="row" style="margin-bottom:6px">
              <input class="input" data-arr="plans.${pi}.monthly" placeholder="Precio mensual" value="${esc(pl.monthly || '')}">
              <input class="input" data-arr="plans.${pi}.yearly" placeholder="Precio anual" value="${esc(pl.yearly || '')}">
            </div>
            <input class="input" data-arr="plans.${pi}.desc" placeholder="Descripción breve" value="${esc(pl.desc || '')}" style="margin-bottom:6px">
            <textarea class="input" rows="3" data-arr="plans.${pi}.features" placeholder="Una característica por línea">${esc(pl.features || '')}</textarea>
            <div class="row" style="margin-top:6px">
              <input class="input" data-arr="plans.${pi}.ctaText" placeholder="Texto botón" value="${esc(pl.ctaText || '')}">
              <input class="input" data-arr="plans.${pi}.ctaUrl" placeholder="URL botón" value="${esc(pl.ctaUrl || '')}">
            </div>
            <div class="item-actions">
              <label class="chk"><input type="checkbox" data-arrchk="plans.${pi}.featured" ${pl.featured ? 'checked' : ''}> Destacado</label>
              <button class="btn ghost sm" data-arrdel="plans:${pi}">Eliminar</button>
            </div>
          </div>`).join('')}
          <button class="btn ghost sm" data-arradd="pricing">＋ Agregar plan</button>
        </div>
        ${del}`;
    }

    case 'popup': return `
      <div class="field"><label>Disparador</label>
        <select data-bs="trigger">
          <option value="load" ${!b.trigger || b.trigger === 'load' ? 'selected' : ''}>Al cargar la página</option>
          <option value="scroll" ${b.trigger === 'scroll' ? 'selected' : ''}>Al hacer scroll (50%)</option>
          <option value="exit" ${b.trigger === 'exit' ? 'selected' : ''}>Intención de salida</option>
          <option value="button" ${b.trigger === 'button' ? 'selected' : ''}>Al hacer clic en botón</option>
        </select>
      </div>
      ${(!b.trigger || b.trigger === 'load') ? `<div class="field"><label>Retraso (segundos)</label><input type="number" min="0" max="60" data-b="delay" value="${Number(b.delay) || 3}"></div>` : ''}
      ${b.trigger === 'button' ? `<div class="field"><label>Texto del botón disparador</label><input data-b="buttonLabel" value="${esc(b.buttonLabel || 'Ver promoción')}"></div>` : ''}
      <div class="field"><label>Imagen (opcional)</label>${imageField('blockImage', b.image || '')}</div>
      <div class="field"><label>Título</label><input data-b="title" maxlength="80" value="${esc(b.title || '')}"></div>
      <div class="field"><label>Mensaje</label><textarea data-b="text" rows="3" maxlength="500">${esc(b.text || '')}</textarea></div>
      <div class="row">
        <div class="field"><label>Botón CTA</label><input data-b="ctaText" maxlength="40" value="${esc(b.ctaText || '')}"></div>
        <div class="field"><label>Enlace CTA</label><input data-b="ctaUrl" placeholder="#catalog o https://…" value="${esc(b.ctaUrl || '')}"></div>
      </div>
      ${del}`;

    default: return del;
  }
}

function setPath(path, value) {
  const keys = path.split('.');
  let o = draft;
  while (keys.length > 1) {
    const k = keys.shift();
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[keys[0]] = value;
}

const NEW_ITEMS = {
  fields: () => ({ label: 'Nuevo campo', type: 'text', required: false }),
  social: () => ({ network: 'instagram', url: '' }),
  links: () => ({ title: 'Nuevo enlace', subtitle: '', url: '', image: '' }),
  testimonials: () => ({ author: 'Cliente', role: '', rating: 5, text: 'Excelente servicio.' }),
  faq: () => ({ q: '¿Nueva pregunta?', a: 'Respuesta aquí.' }),
  gallery: () => ({ url: '', caption: '' }),
  footerLinks: () => ({ label: 'Enlace', url: '#top' }),
  bento: () => ({ icon: 'sparkles', title: 'Característica', desc: 'Descripción breve.' }),
  stats: () => ({ value: '100%', label: 'Métrica' }),
  pricing: () => ({ name: 'Nuevo Plan', monthly: '$19', yearly: '$190', desc: '', features: 'Beneficio 1', ctaText: 'Elegir', ctaUrl: '', featured: false }),
};

function bindBlockEditor(root, b, i) {
  // Inputs ligados a draft.*
  $$('[data-k]', root).forEach((inp) => {
    inp.addEventListener('input', () => {
      const v = inp.type === 'range' || inp.type === 'number' ? Number(inp.value) : inp.value;
      setPath(inp.dataset.k, v);
      const out = inp.parentElement.querySelector('output');
      if (out) out.textContent = `${v}%`;
      change();
    });
  });
  $$('[data-ks]', root).forEach((sel) => {
    sel.addEventListener('change', () => { setPath(sel.dataset.ks, sel.value); change({ rerender: true }); });
  });
  $$('[data-kchk]', root).forEach((chk) => {
    chk.addEventListener('change', () => { setPath(chk.dataset.kchk, chk.checked); change({ rerender: true }); });
  });
  $$('[data-kcolor]', root).forEach((inp) => {
    inp.addEventListener('input', () => {
      setPath(inp.dataset.kcolor, inp.value);
      const hex = $(`[data-khex="${inp.dataset.kcolor}"]`, root);
      if (hex) hex.value = inp.value;
      change();
    });
  });
  $$('[data-khex]', root).forEach((inp) => {
    inp.addEventListener('input', () => {
      const v = inp.value.trim();
      if (!/^#[0-9a-f]{6}$/i.test(v)) return;
      setPath(inp.dataset.khex, v);
      const col = $(`[data-kcolor="${inp.dataset.khex}"]`, root);
      if (col) col.value = v;
      change();
    });
  });

  // Inputs ligados al bloque b.*
  $$('[data-b]', root).forEach((inp) => {
    inp.addEventListener('input', () => {
      b[inp.dataset.b] = inp.type === 'number' ? Number(inp.value) : inp.value;
      change();
    });
  });
  $$('[data-bs]', root).forEach((sel) => {
    sel.addEventListener('change', () => {
      b[sel.dataset.bs] = sel.value;
      if (b.type === 'catalog' && sel.dataset.bs === 'template') draft.design.layout = sel.value;
      change({ rerender: true });
    });
  });
  $$('[data-bchk]', root).forEach((chk) => {
    chk.addEventListener('change', () => { b[chk.dataset.bchk] = chk.checked; change({ rerender: true }); });
  });
  $$('[data-bset]', root).forEach((btn) => (btn.onclick = () => { b[btn.dataset.bset] = btn.dataset.v; change({ rerender: true }); }));
  $$('[data-btog]', root).forEach((btn) => (btn.onclick = () => { b[btn.dataset.btog] = !b[btn.dataset.btog]; change({ rerender: true }); }));
  $$('[data-bcolor]', root).forEach((inp) => {
    inp.addEventListener('input', () => {
      b[inp.dataset.bcolor] = inp.value;
      const hex = $(`[data-bhex="${inp.dataset.bcolor}"]`, root);
      if (hex) hex.value = inp.value;
      change();
    });
  });
  $$('[data-bhex]', root).forEach((inp) => {
    inp.addEventListener('input', () => {
      const v = inp.value.trim();
      if (!/^#[0-9a-f]{6}$/i.test(v)) return;
      b[inp.dataset.bhex] = v;
      const col = $(`[data-bcolor="${inp.dataset.bhex}"]`, root);
      if (col) col.value = v;
      change();
    });
  });
  $$('[data-set]', root).forEach((btn) => (btn.onclick = () => { setPath(btn.dataset.set, btn.dataset.v); change({ rerender: true }); }));

  // Arrays dentro del bloque (items, fields, days, links, plans)
  const setArr = (spec, val) => {
    const [arrKey, idxStr, prop] = spec.split('.');
    if (Array.isArray(b[arrKey]) && b[arrKey][Number(idxStr)]) b[arrKey][Number(idxStr)][prop] = val;
  };
  $$('[data-arr]', root).forEach((inp) => inp.addEventListener('input', () => { setArr(inp.dataset.arr, inp.value); change(); }));
  $$('[data-arrs]', root).forEach((sel) => sel.addEventListener('change', () => { setArr(sel.dataset.arrs, sel.value); change({ rerender: true }); }));
  $$('[data-arrchk]', root).forEach((chk) => chk.addEventListener('change', () => { setArr(chk.dataset.arrchk, chk.checked); change({ rerender: true }); }));
  $$('[data-arrdel]', root).forEach((btn) => (btn.onclick = () => {
    const [arrKey, idxStr] = btn.dataset.arrdel.split(':');
    if (Array.isArray(b[arrKey])) b[arrKey].splice(Number(idxStr), 1);
    change({ rerender: true });
  }));
  $$('[data-arradd]', root).forEach((btn) => (btn.onclick = () => {
    const kind = btn.dataset.arradd;
    const arrKey = kind === 'fields' ? 'fields' : kind === 'footerLinks' ? 'links' : kind === 'pricing' ? 'plans' : 'items';
    if (!Array.isArray(b[arrKey])) b[arrKey] = [];
    b[arrKey].push(NEW_ITEMS[kind]());
    change({ rerender: true });
  }));

  bindImageFields(root, 'design', (name, url) => {
    if (name === 'logo') draft.store.logo = url;
    if (name === 'heroImage') draft.design.hero.image = url;
    if (name === 'heroFg') draft.design.hero.fgImage = url;
    if (name === 'blockImage') b.image = url;
    if (name === 'galleryAdd' && url) {
      if (!Array.isArray(b.items)) b.items = [];
      b.items.push({ url, caption: '' });
      change({ rerender: true });
      return;
    }
    change();
  });

  const del = $('[data-del]', root);
  if (del) del.onclick = () => { draft.design.blocks.splice(i, 1); openBlock = null; change({ rerender: true }); };
}

function addBlockMenu() {
  const have = new Set(draft.design.blocks.map((b) => b.type));
  let cat = 'Todos los Bloques';
  let query = '';

  const m = modal('Agregar Bloque', `
    <div class="add-search"><input class="input" id="blk-q" placeholder="Buscar bloques…" autocomplete="off"></div>
    <div class="add-cats" id="blk-cats"></div>
    <div class="add-grid" id="blk-grid"></div>`, { wide: true });

  const draw = () => {
    const q = query.trim().toLowerCase();
    $('#blk-cats', m).innerHTML = BLOCK_CATEGORIES.map((c) =>
      `<button type="button" class="${c === cat ? 'active' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
    const list = Object.entries(BLOCK_TYPES).filter(([, t]) => {
      if (cat !== 'Todos los Bloques' && !t.cats.includes(cat)) return false;
      if (q && !`${t.label} ${t.desc}`.toLowerCase().includes(q)) return false;
      return true;
    });
    $('#blk-grid', m).innerHTML = list.length ? list.map(([type, t]) => {
      const disabled = t.unique && have.has(type);
      return `<button type="button" class="add-card" data-type="${type}" ${disabled ? 'disabled title="Ya está en la página"' : ''}>
        <span class="add-ic">${t.icon}</span>
        <span><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></span>
      </button>`;
    }).join('') : '<p class="empty" style="grid-column:1/-1">No se encontraron bloques.</p>';

    $$('[data-c]', m).forEach((btn) => (btn.onclick = () => { cat = btn.dataset.c; draw(); }));
    $$('[data-type]', m).forEach((btn) => (btn.onclick = () => {
      const b = createBlock(btn.dataset.type);
      draft.design.blocks.push(b);
      openBlock = b.id;
      m.close();
      change({ rerender: true });
    }));
  };
  $('#blk-q', m).addEventListener('input', (e) => { query = e.target.value; draw(); });
  draw();
}

// ================= Global =================
function renderGlobal() {
  const d = draft.design;
  const body = $('#ed-body');
  FONTS.forEach(loadFont);
  body.innerHTML = `
    <div class="ed-section"><h4>Logo e ícono de la pestaña</h4>
      <div class="field"><label>Logo de la tienda</label>${imageField('globalLogo', draft.store.logo)}<small>Aparece en la presentación y en la pantalla de bienvenida.</small></div>
      <div class="field"><label>Ícono de la pestaña del navegador (Favicon)</label>${imageField('globalFavicon', draft.store.favicon || '')}<small>La imagen que aparece en la pestaña del navegador en lugar de la bolsa. Si lo dejas vacío, usa el logo.</small></div>
    </div>
    <div class="ed-section"><h4>Paletas de Colores</h4><div class="palettes">
      ${PALETTES.map((p) => `<button class="palette ${d.palette === p.id ? 'active' : ''}" data-pal="${p.id}">
        <div class="sw" style="background:${p.secondary};color:${p.text};border:1px solid #0001">Aa<span style="width:14px;height:14px;border-radius:50%;background:${p.primary};margin-left:8px"></span></div>
        <small>${esc(p.name)}</small></button>`).join('')}
    </div></div>
    <div class="ed-section"><h4>Colores</h4><div class="colors">
      ${[['primary', 'Color primario (CTA)'], ['secondary', 'Color secundario (Fondos)'], ['text', 'Color terciario (Textos)']].map(([k, l]) => `
        <div class="color-row"><span>${l}</span><span style="display:flex;gap:6px">
          <input type="color" data-color="${k}" value="${esc(d.colors[k])}" aria-label="${l}">
          <input class="input hex" data-hex="${k}" value="${esc(d.colors[k])}" maxlength="7"></span></div>`).join('')}
    </div></div>
    <div class="ed-section"><h4>Fuente</h4><div class="fonts">
      ${FONTS.map((f) => `<button class="font ${d.font === f ? 'active' : ''}" data-font="${esc(f)}"><b style="font-family:'${esc(f)}'">Aa</b><small>${esc(f)}</small></button>`).join('')}
    </div></div>
    <div class="ed-section"><h4>Esquinas</h4><p class="hint" style="margin:-4px 0 10px">Ajusta el redondeo de las esquinas.</p><div class="choice">
      ${[['square', 'Rectas'], ['semi', 'Semi redondeadas'], ['round', 'Redondeadas']].map(([v, l]) => `<button data-corners="${v}" class="${d.corners === v ? 'active' : ''}">${l}</button>`).join('')}
    </div></div>
    <div class="ed-section"><h4>Fondo</h4>
      <div class="choice" style="margin-bottom:12px">
        <button data-bg="color" class="${d.background.type !== 'image' && d.background.type !== 'video' ? 'active' : ''}">Color</button>
        <button data-bg="image" class="${d.background.type === 'image' ? 'active' : ''}">Imagen</button>
        <button data-bg="video" class="${d.background.type === 'video' ? 'active' : ''}">Video</button>
      </div>
      ${d.background.type === 'image' ? `
        <div class="field">${imageField('bgImage', d.background.image)}</div>
        <div class="field"><label>Opacidad de superposición</label><div class="range"><input type="range" min="0" max="100" step="10" data-bgov value="${Number(d.background.overlay) || 0}"><output>${Number(d.background.overlay) || 0}%</output></div></div>
        <div class="field"><label>Tinte de superposición</label><div class="choice">
          <button data-bgtint="dark" class="${d.background.tint !== 'light' ? 'active' : ''}">Aa Oscuro</button>
          <button data-bgtint="light" class="${d.background.tint === 'light' ? 'active' : ''}">Aa Claro</button></div></div>`
        : d.background.type === 'video' ? `
        <div class="field"><label>URL del Video (MP4 / WebM)</label><input data-bgvid placeholder="https://…/fondo.mp4" value="${esc(d.background.video || '')}"></div>
        <div class="field"><label>Opacidad de superposición</label><div class="range"><input type="range" min="0" max="100" step="10" data-bgov value="${Number(d.background.overlay) || 0}"><output>${Number(d.background.overlay) || 0}%</output></div></div>
        <div class="field"><label>Tinte de superposición</label><div class="choice">
          <button data-bgtint="dark" class="${d.background.tint !== 'light' ? 'active' : ''}">Aa Oscuro</button>
          <button data-bgtint="light" class="${d.background.tint === 'light' ? 'active' : ''}">Aa Claro</button></div></div>`
        : '<p class="hint">El fondo usa tu color secundario.</p>'}
    </div>`;

  $$('[data-pal]', body).forEach((b) => (b.onclick = () => {
    const p = PALETTES.find((x) => x.id === b.dataset.pal);
    d.palette = p.id;
    d.colors = { primary: p.primary, secondary: p.secondary, text: p.text };
    change({ rerender: true });
  }));
  const setColor = (k, v) => {
    if (!/^#[0-9a-f]{6}$/i.test(v)) return;
    d.colors[k] = v.toLowerCase();
    d.palette = 'custom';
    $(`[data-color="${k}"]`, body).value = v;
    $(`[data-hex="${k}"]`, body).value = v;
    $$('.palette', body).forEach((x) => x.classList.remove('active'));
    change();
  };
  $$('[data-color]', body).forEach((inp) => inp.addEventListener('input', () => setColor(inp.dataset.color, inp.value)));
  $$('[data-hex]', body).forEach((inp) => inp.addEventListener('input', () => setColor(inp.dataset.hex, inp.value.trim())));
  $$('[data-font]', body).forEach((b) => (b.onclick = () => { d.font = b.dataset.font; change({ rerender: true }); }));
  $$('[data-corners]', body).forEach((b) => (b.onclick = () => { d.corners = b.dataset.corners; change({ rerender: true }); }));
  $$('[data-bg]', body).forEach((b) => (b.onclick = () => { d.background.type = b.dataset.bg; change({ rerender: true }); }));
  $$('[data-bgtint]', body).forEach((b) => (b.onclick = () => { d.background.tint = b.dataset.bgtint; change({ rerender: true }); }));
  const ov = $('[data-bgov]', body);
  if (ov) ov.addEventListener('input', () => { d.background.overlay = Number(ov.value); ov.nextElementSibling.textContent = `${ov.value}%`; change(); });
  const vid = $('[data-bgvid]', body);
  if (vid) vid.addEventListener('input', () => { d.background.video = vid.value.trim(); change(); });
  bindImageFields(body, 'design', (name, url) => {
    if (name === 'globalLogo') draft.store.logo = url;
    else if (name === 'globalFavicon') draft.store.favicon = url;
    else d.background.image = url;
    change();
  });
}

// ================= Animaciones =================
function renderAnimations() {
  const d = draft.design;
  d.animations = {
    intro: 'none', entrance: 'none', productAnim: 'none', hover: 'none',
    heroMotion: 'none', ambient: 'none', scrollBar: false, speed: 'normal',
    ...(d.animations || {}),
  };
  const a = d.animations;
  const body = $('#ed-body');
  const sel = (key, opts) => opts.map(([v, l]) => `<option value="${v}" ${a[key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('');

  body.innerHTML = `
    <p class="hint" style="margin:0 0 12px">Personaliza los efectos al entrar, al hacer scroll, en productos y el ambiente visual de tu tienda.</p>
    <button type="button" class="btn sm block" data-replay-anim style="margin-bottom:14px">Probar animaciones en vista previa</button>

    <div class="ed-group"><h5>Pantalla de bienvenida (al entrar)</h5>
      <div class="field"><label>Estilo de intro</label>
        <select data-anim="intro">${sel('intro', [
          ['none', 'Ninguna'],
          ['logo-fade', 'Logo con aparición suave'],
          ['logo-zoom', 'Zoom cinematográfico del logo'],
          ['curtain', 'Cortina hacia arriba'],
          ['split', 'Puertas abiertas (Split)'],
          ['circle', 'Revelado circular (Iris)'],
          ['shimmer', 'Destello de luz en logo'],
          ['ripple', 'Pulso con anillos expansivos'],
          ['brand-wipe', 'Barrido con color primario'],
        ])}</select>
      </div>
    </div>

    <div class="ed-group"><h5>Entrada de secciones y bloques</h5>
      <div class="field"><label>Animación al cargar y al hacer scroll</label>
        <select data-anim="entrance">${sel('entrance', [
          ['none', 'Ninguna'],
          ['fade', 'Aparecer suave (Fade)'],
          ['slide-up', 'Deslizar desde abajo'],
          ['slide-down', 'Deslizar desde arriba'],
          ['slide-left', 'Deslizar desde la izquierda'],
          ['slide-right', 'Deslizar desde la derecha'],
          ['zoom', 'Zoom suave hacia afuera'],
          ['zoom-out', 'Zoom desde grande'],
          ['blur', 'Desenfocar a nítido'],
          ['flip', 'Giro 3D suave (Flip)'],
          ['bounce', 'Rebote elástico (Pop)'],
        ])}</select>
      </div>
      <div class="field"><label>Velocidad general</label>
        <div class="choice">
          <button data-anim-speed="fast" class="${a.speed === 'fast' ? 'active' : ''}">Rápida</button>
          <button data-anim-speed="normal" class="${!a.speed || a.speed === 'normal' ? 'active' : ''}">Normal</button>
          <button data-anim-speed="slow" class="${a.speed === 'slow' ? 'active' : ''}">Suave</button>
        </div>
      </div>
    </div>

    <div class="ed-group"><h5>Catálogo y tarjetas de producto</h5>
      <div class="field"><label>Efecto en productos</label>
        <select data-anim="productAnim">${sel('productAnim', [
          ['none', 'Ninguno'],
          ['cascade', 'Cascada escalonada al aparecer'],
          ['img-zoom', 'Zoom suave en foto al pasar el mouse'],
          ['shine', 'Destello diagonal al pasar el mouse'],
          ['tilt', 'Inclinación sutil al pasar el mouse'],
          ['badge-pulse', 'Pulso suave en etiquetas de oferta'],
        ])}</select>
      </div>
      <div class="field"><label>Efecto Hover en tarjetas y botones</label>
        <select data-anim="hover">${sel('hover', [
          ['none', 'Ninguno'],
          ['lift', 'Elevar con sombra'],
          ['scale', 'Escala suave'],
          ['glow', 'Brillo con color primario'],
          ['border', 'Borde iluminado'],
          ['btn-shine', 'Barrido de brillo en botones'],
          ['pop', 'Rebote suave al pasar el mouse'],
        ])}</select>
      </div>
    </div>

    <div class="ed-group"><h5>Portada (Hero) y ambiente</h5>
      <div class="field"><label>Movimiento en el Hero</label>
        <select data-anim="heroMotion">${sel('heroMotion', [
          ['none', 'Ninguno'],
          ['ken-burns', 'Zoom lento en imagen (Ken Burns)'],
          ['float', 'Flotar suave en logo e imagen'],
          ['gradient-flow', 'Degradado animado vivo'],
          ['cta-pulse', 'Latido suave en botón CTA'],
          ['hero-stagger', 'Título y subtítulo escalonados'],
        ])}</select>
      </div>
      <div class="field"><label>Efecto ambiental de fondo</label>
        <select data-anim="ambient">${sel('ambient', [
          ['none', 'Ninguno'],
          ['particles', 'Partículas suaves flotantes'],
          ['bubbles', 'Burbujas delicadas subiendo'],
          ['sparkles', 'Destellos / estrellas sutiles'],
          ['petals', 'Pétalos / nieve cayendo'],
          ['aurora', 'Aurora suave con tu color'],
        ])}</select>
      </div>
      ${swRow('data-anim-chk="scrollBar"', 'Barra de progreso de lectura', !!a.scrollBar, 'Muestra una línea fina arriba que avanza al bajar por la tienda.')}
    </div>`;

  const replay = () => {
    pushPreview(true);
    setTimeout(() => frame?.contentWindow?.postMessage({ type: 'fm-replay-anim' }, location.origin), 130);
  };
  $$('[data-anim]', body).forEach((el) => el.addEventListener('change', () => {
    a[el.dataset.anim] = el.value;
    change();
    if (el.dataset.anim === 'intro' || el.dataset.anim === 'entrance' || el.dataset.anim === 'productAnim' || el.dataset.anim === 'heroMotion') replay();
  }));
  $$('[data-anim-speed]', body).forEach((btn) => (btn.onclick = () => {
    a.speed = btn.dataset.animSpeed;
    change({ rerender: true });
    replay();
  }));
  $$('[data-anim-chk]', body).forEach((chk) => chk.addEventListener('change', () => {
    a[chk.dataset.animChk] = chk.checked;
    change();
  }));
  $('[data-replay-anim]', body).onclick = replay;
}
