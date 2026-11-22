// Editor de diseño: bloques, estilos globales y vista previa en vivo.
import { esc, PALETTES, FONTS, BLOCK_TYPES, loadFont, uid } from './common.js';
import { S, saveConfig } from './app.js';
import { ICONS, $, $$, toast, modal, confirmDialog, imageField, bindImageFields } from './ui.js';

let draft = null;      // { store, design } en edición
let dirty = false;
let openBlock = null;
let tab = 'blocks';
let frame = null;
let device = 'mobile';

const clone = (o) => JSON.parse(JSON.stringify(o));

export function leaveDesign() {
  if (!dirty) return true;
  if (window.confirm('Tienes cambios sin publicar. ¿Salir y descartarlos?')) { dirty = false; return true; }
  return false;
}
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

export async function renderDesign(main) {
  draft = { store: clone(S.cfg.store), design: clone(S.cfg.design) };
  dirty = false;
  main.innerHTML = `<div class="editor">
    <section class="ed-panel">
      <div class="ed-top">
        <div class="ed-status">
          <span class="state"><i></i><span data-state>Publicado</span></span>
          <button class="btn ghost sm" data-discard hidden>Descartar</button>
          <button class="btn sm" data-publish disabled>☁ Publicar</button>
        </div>
        <div class="ed-tabs" role="tablist">
          <button data-tab="blocks">Bloques</button>
          <button data-tab="global">Global</button>
          <button data-tab="preview" class="only-sm">Vista previa</button>
        </div>
      </div>
      <div class="ed-body" id="ed-body"></div>
    </section>
    <section class="ed-preview">
      <div class="pv-bar">
        <button data-device="mobile">📱 Móvil</button>
        <button data-device="desktop">🖥️ Escritorio</button>
        <button data-reload title="Recargar vista previa">⟳</button>
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
      dirty = false; renderDesign(main);
    }
  };
  syncDevice();
  setTab(tab === 'preview' ? 'blocks' : tab);
}

// La vista previa avisa cuando está lista para recibir el borrador
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
}

function change({ rerender = false } = {}) {
  dirty = true;
  const st = $('.ed-status .state');
  st.classList.add('dirty');
  $('[data-state]').textContent = 'Cambios sin publicar';
  $('[data-publish]').disabled = false;
  $('[data-discard]').hidden = false;
  pushPreview();
  if (rerender) (tab === 'global' ? renderGlobal : renderBlocks)();
}

async function publish() {
  const btn = $('[data-publish]');
  btn.disabled = true; btn.textContent = 'Publicando…';
  try {
    const store = { ...S.cfg.store, name: draft.store.name, description: draft.store.description, logo: draft.store.logo };
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
  btn.textContent = '☁ Publicar';
}

// ================= Bloques =================
const blockName = (b) => {
  if (b.type === 'text' && b.content) return b.content.slice(0, 40);
  return BLOCK_TYPES[b.type]?.label || b.type;
};

function renderBlocks() {
  const body = $('#ed-body');
  const blocks = draft.design.blocks;
  body.innerHTML = `
    <p class="hint" style="margin:0 0 12px">Arrastra los bloques para cambiar el orden. Toca uno para editarlo.</p>
    <div id="blocks">${blocks.map((b, i) => `
      <div class="blk ${b.visible === false ? 'off' : ''}" data-i="${i}">
        <div class="b-head">
          <button class="b-handle" title="Arrastrar" aria-label="Mover">${ICONS.grip}</button>
          <button class="b-title" data-toggle><span class="ic">${BLOCK_TYPES[b.type]?.icon || '▫️'}</span><span class="nm">${esc(blockName(b))}</span></button>
          <button class="icon-btn" data-up title="Subir" ${i === 0 ? 'disabled' : ''}>${ICONS.up}</button>
          <button class="icon-btn" data-down title="Bajar" ${i === blocks.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>
          <button class="icon-btn" data-eye title="${b.visible === false ? 'Mostrar' : 'Ocultar'}">${b.visible === false ? ICONS.eyeOff : ICONS.eye}</button>
        </div>
        ${openBlock === b.id ? `<div class="b-body">${blockEditor(b)}</div>` : ''}
      </div>`).join('')}
    </div>
    <button class="add-block" data-add>＋ Agregar bloque</button>`;

  $$('.blk', body).forEach((el) => {
    const i = Number(el.dataset.i);
    const b = blocks[i];
    el.querySelector('[data-toggle]').onclick = () => { openBlock = openBlock === b.id ? null : b.id; renderBlocks(); };
    el.querySelector('[data-eye]').onclick = () => { b.visible = b.visible === false; change({ rerender: true }); };
    el.querySelector('[data-up]').onclick = () => move(i, i - 1);
    el.querySelector('[data-down]').onclick = () => move(i, i + 1);
    // arrastrar y soltar
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
    const bb = el.querySelector('.b-body');
    if (bb) bindBlockEditor(bb, b, i);
  });
  $('[data-add]', body).onclick = addBlockMenu;
}

function move(from, to) {
  const blocks = draft.design.blocks;
  if (to < 0 || to >= blocks.length) return;
  const [b] = blocks.splice(from, 1);
  blocks.splice(to, 0, b);
  change({ rerender: true });
}

function blockEditor(b) {
  const d = draft.design;
  const del = b.type !== 'catalog' ? '<button class="btn ghost sm" data-del style="color:var(--danger)">Eliminar bloque</button>' : '';
  switch (b.type) {
    case 'hero': return `
      <div class="field"><label>Nombre de la tienda</label><input data-k="store.name" maxlength="80" value="${esc(draft.store.name)}"></div>
      <div class="field"><label>Descripción</label><textarea data-k="store.description" rows="4" maxlength="600">${esc(draft.store.description)}</textarea></div>
      <div class="field"><label>Logo</label>${imageField('logo', draft.store.logo)}</div>
      <div class="field"><label>Imagen de fondo</label>${imageField('heroImage', d.hero.image)}<small>Si no subes una, se usa un degradado con tu color primario.</small></div>
      <div class="field"><label>Opacidad de superposición</label><div class="range"><input type="range" min="0" max="90" step="5" data-k="design.hero.overlay" value="${Number(d.hero.overlay) || 0}"><output>${Number(d.hero.overlay) || 0}%</output></div></div>
      <div class="field"><label>Tinte</label><div class="choice">
        <button data-set="design.hero.tint" data-v="dark" class="${d.hero.tint !== 'light' ? 'active' : ''}">Oscuro</button>
        <button data-set="design.hero.tint" data-v="light" class="${d.hero.tint === 'light' ? 'active' : ''}">Claro</button></div></div>
      ${del}`;
    case 'catalog': return `
      <div class="field"><label>Diseño de productos</label><div class="choice">
        <button data-set="design.layout" data-v="list" class="${d.layout !== 'grid' ? 'active' : ''}">☰ Lista</button>
        <button data-set="design.layout" data-v="grid" class="${d.layout === 'grid' ? 'active' : ''}">▦ Cuadrícula</button></div></div>
      <p class="hint">Los productos y categorías se editan en la sección <a href="#/products">Productos</a>.</p>`;
    case 'cart': return `<p class="hint">Muestra el botón flotante del carrito para que tus clientes armen su pedido. Si lo ocultas, la tienda funciona como catálogo sin pedidos.</p>${del}`;
    case 'text': return `<div class="field"><label>Texto</label><textarea data-b="content" rows="5" maxlength="2000">${esc(b.content || '')}</textarea></div>${del}`;
    case 'image': return `
      <div class="field"><label>Imagen</label>${imageField('blockImage', b.image)}</div>
      <div class="field"><label>Enlace al tocar (opcional)</label><input data-b="link" placeholder="https://…" value="${esc(b.link || '')}"></div>
      <div class="field"><label>Texto alternativo</label><input data-b="alt" maxlength="120" value="${esc(b.alt || '')}"></div>${del}`;
    case 'whatsapp': return `
      <div class="field"><label>Texto del botón</label><input data-b="label" maxlength="60" value="${esc(b.label || 'Escríbenos por WhatsApp')}"></div>
      <div class="field"><label>Mensaje inicial</label><input data-b="message" maxlength="200" value="${esc(b.message || 'Hola! Tengo una consulta')}"></div>
      ${S.cfg.store.whatsapp ? '' : '<p class="hint">⚠️ Agrega tu número en <a href="#/details">Detalles</a> para que aparezca el botón.</p>'}${del}`;
    case 'divider': return `<p class="hint">Una línea para separar secciones.</p>${del}`;
    default: return del;
  }
}

function setPath(path, value) {
  const keys = path.split('.');
  let o = draft;
  while (keys.length > 1) o = o[keys.shift()];
  o[keys[0]] = value;
}

function bindBlockEditor(root, b, i) {
  $$('[data-k]', root).forEach((inp) => {
    inp.addEventListener('input', () => {
      const v = inp.type === 'range' ? Number(inp.value) : inp.value;
      setPath(inp.dataset.k, v);
      const out = inp.parentElement.querySelector('output');
      if (out) out.textContent = `${v}%`;
      change();
    });
  });
  $$('[data-b]', root).forEach((inp) => {
    inp.addEventListener('input', () => {
      b[inp.dataset.b] = inp.value;
      if (inp.dataset.b === 'content') root.closest('.blk').querySelector('.nm').textContent = blockName(b);
      change();
    });
  });
  $$('[data-set]', root).forEach((btn) => (btn.onclick = () => { setPath(btn.dataset.set, btn.dataset.v); change({ rerender: true }); }));
  bindImageFields(root, 'design', (name, url) => {
    if (name === 'logo') draft.store.logo = url;
    if (name === 'heroImage') draft.design.hero.image = url;
    if (name === 'blockImage') b.image = url;
    change();
  });
  const del = $('[data-del]', root);
  if (del) del.onclick = () => { draft.design.blocks.splice(i, 1); openBlock = null; change({ rerender: true }); };
}

function addBlockMenu() {
  const have = new Set(draft.design.blocks.map((b) => b.type));
  const m = modal('Agregar bloque', `<div class="add-menu">${Object.entries(BLOCK_TYPES).map(([type, t]) =>
    `<button data-type="${type}" ${t.unique && have.has(type) ? 'disabled title="Ya está en la página"' : ''}><span style="font-size:20px">${t.icon}</span>${esc(t.label)}</button>`).join('')}</div>`);
  $$('[data-type]', m).forEach((btn) => (btn.onclick = () => {
    const type = btn.dataset.type;
    const b = { id: `b-${uid(8)}`, type, visible: true };
    if (type === 'text') b.content = 'Escribe aquí tu texto…';
    draft.design.blocks.push(b);
    openBlock = b.id;
    m.close();
    change({ rerender: true });
    setTimeout(() => $('#ed-body').scrollTo({ top: 1e6, behavior: 'smooth' }), 50);
  }));
}

// ================= Global =================
function renderGlobal() {
  const d = draft.design;
  const body = $('#ed-body');
  FONTS.forEach(loadFont);
  body.innerHTML = `
    <div class="ed-section"><h4>Paletas de colores</h4><div class="palettes">
      ${PALETTES.map((p) => `<button class="palette ${d.palette === p.id ? 'active' : ''}" data-pal="${p.id}">
        <div class="sw" style="background:${p.secondary};color:${p.text};border:1px solid #0001">Aa<span style="width:14px;height:14px;border-radius:50%;background:${p.primary};margin-left:8px"></span></div>
        <small>${esc(p.name)}</small></button>`).join('')}
    </div></div>
    <div class="ed-section"><h4>Colores</h4><div class="colors">
      ${[['primary', 'Color primario (botones)'], ['secondary', 'Color secundario (fondos)'], ['text', 'Color terciario (textos)']].map(([k, l]) => `
        <div class="color-row"><span>${l}</span><span style="display:flex;gap:6px">
          <input type="color" data-color="${k}" value="${esc(d.colors[k])}" aria-label="${l}">
          <input class="input hex" data-hex="${k}" value="${esc(d.colors[k])}" maxlength="7"></span></div>`).join('')}
    </div></div>
    <div class="ed-section"><h4>Fuente</h4><div class="fonts">
      ${FONTS.map((f) => `<button class="font ${d.font === f ? 'active' : ''}" data-font="${esc(f)}"><b style="font-family:'${esc(f)}'">Aa</b><small>${esc(f)}</small></button>`).join('')}
    </div></div>
    <div class="ed-section"><h4>Esquinas</h4><div class="choice">
      ${[['square', 'Rectas'], ['semi', 'Semi redondeadas'], ['round', 'Redondeadas']].map(([v, l]) => `<button data-corners="${v}" class="${d.corners === v ? 'active' : ''}">${l}</button>`).join('')}
    </div></div>
    <div class="ed-section"><h4>Fondo de la página</h4>
      <div class="choice" style="margin-bottom:12px">
        <button data-bg="color" class="${d.background.type !== 'image' ? 'active' : ''}">Color</button>
        <button data-bg="image" class="${d.background.type === 'image' ? 'active' : ''}">Imagen</button>
      </div>
      ${d.background.type === 'image' ? `
        <div class="field">${imageField('bgImage', d.background.image)}</div>
        <div class="field"><label>Opacidad de superposición</label><div class="range"><input type="range" min="0" max="90" step="5" data-bgov value="${Number(d.background.overlay) || 0}"><output>${Number(d.background.overlay) || 0}%</output></div></div>
        <div class="field"><label>Tinte</label><div class="choice">
          <button data-bgtint="dark" class="${d.background.tint !== 'light' ? 'active' : ''}">Oscuro</button>
          <button data-bgtint="light" class="${d.background.tint === 'light' ? 'active' : ''}">Claro</button></div></div>`
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
  bindImageFields(body, 'design', (_, url) => { d.background.image = url; change(); });
}
