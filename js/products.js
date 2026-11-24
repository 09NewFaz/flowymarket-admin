// Productos y categorías.
import { sb, esc, money, safeUrl, slugId } from './common.js';
import { S, loadCatalog } from './app.js';
import { ICONS, $, $$, toast, modal, confirmDialog, imageField, bindImageFields, uploadImage, switchHtml } from './ui.js';

const UNLIMITED = 99999;
let query = '';
let main;

const tagIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9a2 2 0 0 0 2.82 0l7-7a2 2 0 0 0 0-2.82ZM6.5 8A1.5 1.5 0 1 1 6.5 5a1.5 1.5 0 0 1 0 3Z"/></svg>';

export async function renderProducts(el) {
  main = el;
  await loadCatalog();
  draw();
}

function draw() {
  const cur = S.cfg.store.currency;
  const q = query.trim().toLowerCase();
  const match = (p) => !q || `${p.title} ${p.description}`.toLowerCase().includes(q);
  const groups = [...S.cats.map((c) => ({ ...c, items: S.prods.filter((p) => p.category_id === c.id && match(p)) })),
    { id: null, name: 'Sin categoría', items: S.prods.filter((p) => !S.cats.some((c) => c.id === p.category_id) && match(p)) }]
    .filter((g) => g.id || g.items.length);

  main.innerHTML = `<div class="view">
    <div class="view-head"><h1>Productos</h1>
      <button class="btn ghost" data-export-csv>Exportar CSV</button>
      <button class="btn ghost" data-import-csv>Importar CSV</button>
      <button class="btn ghost" data-new-cat>＋ Categoría</button>
      <button class="btn" data-new-prod>＋ Producto</button>
      <p>${S.prods.length} productos en ${S.cats.length} categorías.</p>
    </div>

    <div class="card">
      <div class="card-head"><h2>Categorías</h2></div>
      ${S.cats.length ? S.cats.map((c, i) => `<div class="p-row" data-cat="${esc(c.id)}">
        <div class="info"><b>${esc(c.name)}</b><small>${S.prods.filter((p) => p.category_id === c.id).length} productos</small></div>
        <div class="actions">
          <button class="icon-btn" data-cup title="Subir" ${i === 0 ? 'disabled' : ''}>${ICONS.up}</button>
          <button class="icon-btn" data-cdown title="Bajar" ${i === S.cats.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>
          <button class="icon-btn" data-cedit title="Renombrar">${ICONS.edit}</button>
          <button class="icon-btn danger" data-cdel title="Eliminar">${ICONS.trash}</button>
        </div></div>`).join('') : '<p class="empty">Aún no tienes categorías.</p>'}
    </div>

    <div class="card">
      <div class="toolbar"><input class="input" type="search" id="pq" placeholder="Buscar productos…" value="${esc(query)}"></div>
      ${groups.map((g) => `<div class="cat-group"><h3>${esc(g.name)}</h3>
        ${g.items.length ? g.items.map((p, i) => {
          const img = safeUrl(p.img);
          const offer = p.offer != null && Number(p.offer) < Number(p.price);
          return `<div class="p-row ${p.hidden ? 'is-hidden' : ''}" data-prod="${esc(p.id)}">
            <div class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : tagIcon}</div>
            <div class="info"><b>${esc(p.title)}</b>
              <small>${offer ? `${money(p.offer, cur)} <s>${money(p.price, cur)}</s>` : money(p.price, cur)}
              ${p.stock === 0 ? ' · <span class="tag danger">Agotado</span>' : p.stock < UNLIMITED ? ` · Stock ${p.stock}` : ''}
              ${p.hidden ? ' · <span class="tag">Oculto</span>' : ''}${!p.cart ? ' · <span class="tag warn">Solo catálogo</span>' : ''}
              ${(p.options || []).length ? ` · <span class="tag brand">${p.options.length} opciones</span>` : ''}</small></div>
            <div class="actions">
              ${q ? '' : `<button class="icon-btn" data-up title="Subir" ${i === 0 ? 'disabled' : ''}>${ICONS.up}</button>
              <button class="icon-btn" data-down title="Bajar" ${i === g.items.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>`}
              <button class="icon-btn" data-vis title="${p.hidden ? 'Mostrar' : 'Ocultar'}">${p.hidden ? ICONS.eyeOff : ICONS.eye}</button>
              <button class="icon-btn" data-dup title="Duplicar">${ICONS.copy}</button>
              <button class="icon-btn" data-edit title="Editar">${ICONS.edit}</button>
              <button class="icon-btn danger" data-del title="Eliminar">${ICONS.trash}</button>
            </div></div>`;
        }).join('') : '<p class="empty" style="padding:12px">Sin productos.</p>'}
      </div>`).join('') || '<p class="empty">No hay productos todavía.</p>'}
    </div>
  </div>`;

  $('[data-export-csv]', main).onclick = exportCsv;
  $('[data-import-csv]', main).onclick = openImportCsv;
  $('[data-new-cat]', main).onclick = () => editCategory();
  $('[data-new-prod]', main).onclick = () => editProduct();
  const pq = $('#pq', main);
  pq.oninput = () => { query = pq.value; draw(); const n = $('#pq', main); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };

  $$('[data-cat]', main).forEach((row) => {
    const c = S.cats.find((x) => x.id === row.dataset.cat);
    const i = S.cats.indexOf(c);
    $('[data-cedit]', row).onclick = () => editCategory(c);
    $('[data-cup]', row).onclick = () => reorder('categories', S.cats, i, i - 1);
    $('[data-cdown]', row).onclick = () => reorder('categories', S.cats, i, i + 1);
    $('[data-cdel]', row).onclick = async () => {
      const n = S.prods.filter((p) => p.category_id === c.id).length;
      if (!(await confirmDialog(`¿Eliminar la categoría "${c.name}"?${n ? ` Sus ${n} productos quedarán "Sin categoría".` : ''}`))) return;
      const { error } = await sb.from('categories').delete().eq('id', c.id);
      if (error) return toast(error.message, 'error');
      toast('Categoría eliminada'); await refresh();
    };
  });

  $$('[data-prod]', main).forEach((row) => {
    const p = S.prods.find((x) => x.id === row.dataset.prod);
    const siblings = S.prods.filter((x) => x.category_id === p.category_id);
    const i = siblings.indexOf(p);
    $('[data-edit]', row).onclick = () => editProduct(p);
    row.querySelector('.info').onclick = () => editProduct(p);
    row.querySelector('.info').style.cursor = 'pointer';
    $('[data-up]', row)?.addEventListener('click', () => reorder('products', siblings, i, i - 1));
    $('[data-down]', row)?.addEventListener('click', () => reorder('products', siblings, i, i + 1));
    $('[data-vis]', row).onclick = async () => {
      const { error } = await sb.from('products').update({ hidden: !p.hidden }).eq('id', p.id);
      if (error) return toast(error.message, 'error');
      await refresh();
    };
    $('[data-dup]', row).onclick = async () => {
      const copy = { ...p, id: slugId(p.title), title: `${p.title} (copia)`.slice(0, 200), position: siblings.length };
      delete copy.updated_at;
      const { error } = await sb.from('products').insert(copy);
      if (error) return toast(error.message, 'error');
      toast('Producto duplicado'); await refresh();
    };
    $('[data-del]', row).onclick = async () => {
      if (!(await confirmDialog(`¿Eliminar "${p.title}"? Esta acción no se puede deshacer.`))) return;
      const { error } = await sb.from('products').delete().eq('id', p.id);
      if (error) return toast(error.message, 'error');
      toast('Producto eliminado'); await refresh();
    };
  });
}

async function refresh() { await loadCatalog(); draw(); }

async function reorder(table, list, from, to) {
  if (to < 0 || to >= list.length) return;
  const arr = [...list];
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
  const results = await Promise.all(arr.map((it, pos) => (it.position === pos ? null : sb.from(table).update({ position: pos }).eq('id', it.id))));
  const err = results.find((r) => r?.error);
  if (err) toast(err.error.message, 'error');
  await refresh();
}

// ---------- Categoría ----------
function editCategory(c) {
  const m = modal(c ? 'Renombrar categoría' : 'Nueva categoría', `
    <div class="field"><label for="cname">Nombre</label><input id="cname" maxlength="80" value="${esc(c?.name || '')}"></div>`,
  { footer: '<button class="btn ghost" data-dismiss>Cancelar</button><button class="btn" data-save>Guardar</button>' });
  const save = async () => {
    const name = $('#cname', m).value.trim();
    if (!name) return toast('Escribe un nombre', 'error');
    const { error } = c
      ? await sb.from('categories').update({ name }).eq('id', c.id)
      : await sb.from('categories').insert({ id: slugId(name), name, position: S.cats.length });
    if (error) return toast(error.message, 'error');
    m.close(); toast('Categoría guardada', 'ok'); await refresh();
  };
  $('[data-save]', m).onclick = save;
  $('#cname', m).onkeydown = (e) => { if (e.key === 'Enter') save(); };
}

// ---------- Producto ----------
function editProduct(p) {
  const isNew = !p;
  const d = p ? JSON.parse(JSON.stringify(p)) : {
    title: '', description: '', price: '', offer: null, category_id: S.cats[0]?.id || null,
    hidden: false, stock: UNLIMITED, cart: true, img: '', imgs: [], options: [],
  };
  if (!Array.isArray(d.options)) d.options = [];
  if (!Array.isArray(d.imgs)) d.imgs = [];

  const m = modal(isNew ? 'Nuevo producto' : 'Editar producto', `<form id="pform" novalidate>
    <div class="field"><label for="ptitle">Nombre *</label><input id="ptitle" maxlength="200" value="${esc(d.title)}"></div>
    <div class="field"><label for="pdesc">Descripción</label><textarea id="pdesc" rows="3" maxlength="3000">${esc(d.description)}</textarea></div>
    <div class="row">
      <div class="field"><label for="pprice">Precio (CLP) *</label><input id="pprice" type="number" min="0" step="1" inputmode="numeric" value="${esc(d.price)}"><small>Pon 0 si cada opción tiene su propio precio final (no se sumará).</small></div>
      <div class="field"><label for="poffer">Precio de oferta (CLP)</label><input id="poffer" type="number" min="0" step="1" inputmode="numeric" placeholder="Opcional" value="${d.offer == null ? '' : esc(Math.round(Number(d.offer)))}"></div>
      <div class="field"><label for="pcat">Categoría</label><select id="pcat">
        <option value="">Sin categoría</option>
        ${S.cats.map((c) => `<option value="${esc(c.id)}" ${c.id === d.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select></div>
    </div>
    <div class="field"><label>Imagen principal</label>${imageField('img', d.img)}</div>
    <div class="field"><label>Más imágenes <small>(hasta 10)</small></label><div class="gallery-edit" id="gal"></div></div>
    <div class="card" style="padding:4px 14px;box-shadow:none">
      <div class="set-row"><div><b>Visible en la tienda</b><small>Si lo ocultas, nadie lo ve.</small></div>${switchHtml('visible', !d.hidden)}</div>
      <div class="set-row"><div><b>Se puede pedir</b><small>Si lo apagas, se muestra solo como catálogo.</small></div>${switchHtml('cart', d.cart)}</div>
      <div class="set-row"><div><b>Stock ilimitado</b><small>Apágalo para controlar unidades.</small></div>${switchHtml('unlimited', d.stock >= UNLIMITED)}</div>
      <div class="set-row" id="stock-row" ${d.stock >= UNLIMITED ? 'hidden' : ''}><div><b>Unidades disponibles</b></div><input class="input" id="pstock" type="number" min="0" max="99998" style="width:110px" value="${d.stock >= UNLIMITED ? 10 : d.stock}"></div>
    </div>
    <div class="field" style="margin-top:16px"><label>Opciones <small>(talle, color, tamaño, extras…)</small></label><div id="opts"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn ghost sm" data-add-group>＋ Grupo de opciones</button>
        <button type="button" class="btn ghost sm" data-preset-decant>＋ Plantilla Decants (3ml / 5ml / 10ml)</button>
        <button type="button" class="btn ghost sm" data-preset-combo>＋ Plantilla Promo Combo 2x</button>
      </div></div>
    <div class="error-box" hidden></div>
  </form>`, {
    wide: true,
    footer: `${isNew ? '' : '<button class="btn ghost" data-delp style="margin-right:auto;color:var(--danger)">Eliminar</button>'}
      <button class="btn ghost" data-dismiss>Cancelar</button><button class="btn" data-save>${isNew ? 'Crear producto' : 'Guardar cambios'}</button>`,
  });

  bindImageFields(m, 'products', (_, url) => { d.img = url; });
  $('[name=unlimited]', m).onchange = (e) => { $('#stock-row', m).hidden = e.target.checked; };

  // galería
  const drawGallery = () => {
    const g = $('#gal', m);
    g.innerHTML = d.imgs.map((u, i) => `<div class="g-item"><img src="${esc(safeUrl(u))}" alt=""><button type="button" data-rm="${i}" aria-label="Quitar">×</button></div>`).join('')
      + (d.imgs.length < 10 ? '<label class="g-add" title="Agregar imagen">＋<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label>' : '');
    $$('[data-rm]', g).forEach((b) => (b.onclick = () => { d.imgs.splice(Number(b.dataset.rm), 1); drawGallery(); }));
    const inp = $('input[type=file]', g);
    if (inp) inp.onchange = async () => {
      const files = [...inp.files].slice(0, 10 - d.imgs.length);
      g.style.opacity = '.5';
      for (const f of files) {
        try { d.imgs.push(await uploadImage(f, 'products')); } catch (err) { toast(err.message, 'error'); }
      }
      g.style.opacity = '';
      drawGallery();
    };
  };
  drawGallery();

  // opciones
  const drawOpts = () => {
    const box = $('#opts', m);
    box.innerHTML = d.options.map((g, gi) => `<div class="opt-group-edit" data-g="${gi}">
      <div class="g-head">
        <input class="input" data-gt placeholder="Nombre del grupo (ej: Talle)" maxlength="80" value="${esc(g.title || '')}">
        <label class="chk"><input type="checkbox" data-greq ${g.required ? 'checked' : ''}> Obligatorio</label>
        <label class="chk"><input type="checkbox" data-gmulti ${g.multi ? 'checked' : ''}> Elegir varias</label>
        <button type="button" class="icon-btn danger" data-gdel title="Quitar grupo">${ICONS.trash}</button>
      </div>
      ${(g.items || []).map((it, ii) => `<div class="opt-item" data-ii="${ii}">
        <input class="input" data-it placeholder="Opción (ej: M)" maxlength="120" value="${esc(it.title || '')}">
        <input class="input" data-ip type="number" min="0" step="1" placeholder="+ precio" value="${Number(it.price) > 0 ? esc(Math.round(Number(it.price))) : ''}">
        <label class="chk"><input type="checkbox" data-iav ${it.available !== false ? 'checked' : ''}> Disponible</label>
        <button type="button" class="icon-btn" data-idel title="Quitar">×</button>
      </div>`).join('')}
      <button type="button" class="btn ghost sm" data-iadd>＋ Opción</button>
    </div>`).join('');
    $$('[data-g]', box).forEach((ge) => {
      const g = d.options[Number(ge.dataset.g)];
      $('[data-gt]', ge).oninput = (e) => (g.title = e.target.value);
      $('[data-greq]', ge).onchange = (e) => (g.required = e.target.checked);
      $('[data-gmulti]', ge).onchange = (e) => (g.multi = e.target.checked);
      $('[data-gdel]', ge).onclick = () => { d.options.splice(Number(ge.dataset.g), 1); drawOpts(); };
      $('[data-iadd]', ge).onclick = () => { g.items.push({ title: '', price: 0, available: true }); drawOpts(); };
      $$('[data-ii]', ge).forEach((ie) => {
        const it = g.items[Number(ie.dataset.ii)];
        $('[data-it]', ie).oninput = (e) => (it.title = e.target.value);
        $('[data-ip]', ie).oninput = (e) => (it.price = Number(e.target.value) || 0);
        $('[data-iav]', ie).onchange = (e) => (it.available = e.target.checked);
        $('[data-idel]', ie).onclick = () => { g.items.splice(Number(ie.dataset.ii), 1); drawOpts(); };
      });
    });
  };
  drawOpts();
  $('[data-add-group]', m).onclick = () => { d.options.push({ title: '', required: false, multi: false, items: [{ title: '', price: 0, available: true }] }); drawOpts(); };
  $('[data-preset-decant]', m).onclick = () => {
    d.options.push({
      title: 'Tamaño', required: true, multi: false,
      items: [
        { title: '3ml', price: 0, available: true },
        { title: '5ml', price: 0, available: true },
        { title: '10ml', price: 0, available: true },
      ],
    });
    drawOpts();
    toast('Agregado grupo Tamaño (ajusta los "+ precio" si corresponde)');
  };
  $('[data-preset-combo]', m).onclick = () => {
    const names = S.prods
      .filter((x) => x.id !== d.id && !/promo|combo|pack/i.test(x.title))
      .map((x) => x.title.replace(/^decant\s+/i, '').replace(/\s+\d+\s*ml$/i, '').trim())
      .filter((v, idx, arr) => v && arr.indexOf(v) === idx)
      .slice(0, 12);
    const items = (names.length ? names : ['Aroma 1', 'Aroma 2']).map((title) => ({ title, price: 0, available: true }));
    d.options.push(
      { title: '1er Perfume', required: true, multi: false, items: items.map((x) => ({ ...x })) },
      { title: '2do Perfume', required: true, multi: false, items: items.map((x) => ({ ...x })) },
    );
    drawOpts();
    toast('Agregados 2 selectores de perfume para tu promo combo');
  };

  const delBtn = $('[data-delp]', m);
  if (delBtn) delBtn.onclick = async () => {
    if (!(await confirmDialog(`¿Eliminar "${p.title}"?`))) return;
    const { error } = await sb.from('products').delete().eq('id', p.id);
    if (error) return toast(error.message, 'error');
    m.close(); toast('Producto eliminado'); await refresh();
  };

  $('[data-save]', m).onclick = async () => {
    const err = $('.error-box', m);
    const fail = (msg) => { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
    err.hidden = true;
    const title = $('#ptitle', m).value.trim();
    const price = Number($('#pprice', m).value);
    const offerRaw = $('#poffer', m).value.trim();
    const offer = offerRaw === '' ? null : Number(offerRaw);
    if (!title) return fail('El producto necesita un nombre.');
    if ($('#pprice', m).value === '' || !(price >= 0)) return fail('Escribe un precio válido.');
    if (offer != null && !(offer >= 0)) return fail('El precio de oferta no es válido.');
    const unlimited = $('[name=unlimited]', m).checked;
    const stock = unlimited ? UNLIMITED : Math.min(Math.max(parseInt($('#pstock', m).value, 10) || 0, 0), 99998);
    const options = d.options
      .map((g) => ({ title: (g.title || '').trim(), required: !!g.required, multi: !!g.multi,
        items: (g.items || []).filter((i) => (i.title || '').trim()).map((i) => ({ title: i.title.trim(), price: Math.max(Number(i.price) || 0, 0), available: i.available !== false })) }))
      .filter((g) => g.items.length);
    if (options.some((g) => !g.title)) return fail('Ponle nombre a cada grupo de opciones.');

    const row = {
      title, price, offer, stock, options,
      description: $('#pdesc', m).value.trim(),
      category_id: $('#pcat', m).value || null,
      hidden: !$('[name=visible]', m).checked,
      cart: $('[name=cart]', m).checked,
      img: $('[name=img]', m).value,
      imgs: d.imgs,
      updated_at: new Date().toISOString(),
    };
    const btn = $('[data-save]', m);
    btn.disabled = true;
    let error;
    if (isNew) {
      row.id = slugId(title);
      row.position = S.prods.filter((x) => x.category_id === row.category_id).length;
      ({ error } = await sb.from('products').insert(row));
    } else {
      if (row.category_id !== p.category_id) row.position = S.prods.filter((x) => x.category_id === row.category_id).length;
      ({ error } = await sb.from('products').update(row).eq('id', p.id));
    }
    btn.disabled = false;
    if (error) return fail(error.message);
    m.close();
    toast(isNew ? 'Producto creado' : 'Cambios guardados', 'ok');
    await refresh();
  };
}

// ---------- Exportar / Importar CSV (compatible con Excel) ----------
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function exportCsv() {
  const catName = (id) => S.cats.find((c) => c.id === id)?.name || '';
  const headers = ['id', 'categoria', 'titulo', 'descripcion', 'precio', 'oferta', 'stock', 'oculto', 'pedible', 'imagen', 'imagenes'];
  const rows = S.prods.map((p) => [
    p.id,
    catName(p.category_id),
    p.title,
    p.description || '',
    Math.round(Number(p.price) || 0),
    p.offer == null ? '' : Math.round(Number(p.offer)),
    p.stock >= UNLIMITED ? 'ilimitado' : p.stock,
    p.hidden ? 'si' : 'no',
    p.cart === false ? 'no' : 'si',
    p.img || '',
    Array.isArray(p.imgs) ? p.imgs.join('|') : '',
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `productos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast(`Exportados ${S.prods.length} productos a CSV`, 'ok');
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === sep) {
      row.push(cell); cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

function openImportCsv() {
  const m = modal('Importar productos desde CSV / Excel', `
    <p class="hint" style="margin:0 0 12px">Sube un archivo <b>.csv</b> (puedes exportar el actual, editarlo en Excel y volver a subirlo). Si una fila tiene un <b>id</b> existente, actualiza el producto; si no, crea uno nuevo.</p>
    <div class="field"><label for="csvfile">Archivo CSV</label><input id="csvfile" type="file" accept=".csv,text/csv"></div>
    <p class="hint">Columnas soportadas: <code>id, categoria, titulo, descripcion, precio, oferta, stock, oculto, pedible, imagen, imagenes</code> (separa varias URLs en <code>imagenes</code> con <code>|</code>)</p>
    <div class="error-box" hidden></div>`, {
    footer: '<button class="btn ghost" data-dismiss>Cancelar</button><button class="btn" data-run>Importar</button>',
  });

  $('[data-run]', m).onclick = async () => {
    const err = $('.error-box', m);
    err.hidden = true;
    const file = $('#csvfile', m).files[0];
    if (!file) { err.textContent = 'Selecciona un archivo .csv primero.'; err.hidden = false; return; }
    const btn = $('[data-run]', m);
    btn.disabled = true; btn.textContent = 'Importando…';
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('El archivo no tiene filas de productos.');
      const head = rows[0].map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
      const idx = (names) => names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
      const cId = idx(['id']);
      const cCat = idx(['categoria', 'category']);
      const cTitle = idx(['titulo', 'nombre', 'title', 'producto']);
      const cDesc = idx(['descripcion', 'description']);
      const cPrice = idx(['precio', 'price']);
      const cOffer = idx(['oferta', 'precio_oferta', 'offer']);
      const cStock = idx(['stock']);
      const cHidden = idx(['oculto', 'hidden']);
      const cCart = idx(['pedible', 'carrito', 'cart']);
      const cImg = idx(['imagen', 'img']);
      const cImgs = idx(['imagenes', 'imgs', 'galeria']);
      const cOpts = idx(['opciones', 'options']);
      const cDel = idx(['eliminar', 'delete']);
      const hasOnlyIdAndImgs = cId >= 0 && (cImg >= 0 || cImgs >= 0 || cDel >= 0) && (cTitle < 0 || cPrice < 0);
      if (!hasOnlyIdAndImgs && (cTitle < 0 || cPrice < 0)) throw new Error('Faltan las columnas obligatorias "titulo" y "precio".');

      const catByName = new Map(S.cats.map((c) => [c.name.trim().toLowerCase(), c.id]));
      const prodById = new Map(S.prods.map((p) => [p.id, p]));
      let created = 0; let updated = 0; let deleted = 0;

      for (const r of rows.slice(1)) {
        const existingId = cId >= 0 ? (r[cId] || '').trim() : '';
        if (cDel >= 0 && /^(si|sí|true|1|yes)$/i.test(String(r[cDel] || '').trim())) {
          if (existingId && prodById.has(existingId)) {
            const { error } = await sb.from('products').delete().eq('id', existingId);
            if (!error) { prodById.delete(existingId); deleted++; }
          }
          continue;
        }
        const imgUrl = cImg >= 0 ? safeUrl((r[cImg] || '').trim()) : '';
        const extraImgs = cImgs >= 0
          ? String(r[cImgs] || '').split('|').map((u) => safeUrl(u.trim())).filter(Boolean).slice(0, 10)
          : null;
        let parsedOpts = null;
        if (cOpts >= 0 && (r[cOpts] || '').trim()) {
          try {
            const j = JSON.parse(r[cOpts]);
            if (Array.isArray(j)) parsedOpts = j;
          } catch { /* ignore invalid json */ }
        }

        if (hasOnlyIdAndImgs) {
          if (!existingId || !prodById.has(existingId)) continue;
          const imgPatch = { updated_at: new Date().toISOString() };
          if (cImg >= 0 && imgUrl) imgPatch.img = imgUrl;
          if (extraImgs && extraImgs.length) imgPatch.imgs = extraImgs;
          if (parsedOpts) imgPatch.options = parsedOpts;
          const { error } = await sb.from('products').update(imgPatch).eq('id', existingId);
          if (!error) updated++;
          continue;
        }

        const title = (r[cTitle] || '').trim().slice(0, 200);
        const price = Number(String(r[cPrice] || '').replace(/[^\d.-]/g, ''));
        if (!title || Number.isNaN(price) || price < 0) continue;

        let catId = null;
        if (cCat >= 0 && (r[cCat] || '').trim()) {
          const cn = r[cCat].trim();
          const key = cn.toLowerCase();
          if (catByName.has(key)) catId = catByName.get(key);
          else {
            const newId = slugId(cn);
            const { error: ce } = await sb.from('categories').insert({ id: newId, name: cn.slice(0, 80), position: catByName.size });
            if (!ce) { catByName.set(key, newId); catId = newId; }
          }
        }

        const rawOffer = cOffer >= 0 ? String(r[cOffer] || '').replace(/[^\d.-]/g, '') : '';
        const offer = rawOffer !== '' && Number(rawOffer) >= 0 && Number(rawOffer) < price ? Number(rawOffer) : null;
        const rawStock = cStock >= 0 ? String(r[cStock] || '').trim().toLowerCase() : '';
        const stock = !rawStock || rawStock === 'ilimitado' ? UNLIMITED : Math.max(0, Math.min(99998, parseInt(rawStock, 10) || 0));
        const hidden = cHidden >= 0 ? /^(si|sí|true|1|yes)$/i.test(String(r[cHidden] || '').trim()) : false;
        const cart = cCart >= 0 ? !/^(no|false|0)$/i.test(String(r[cCart] || '').trim()) : true;
        const description = cDesc >= 0 ? (r[cDesc] || '').trim().slice(0, 3000) : '';

        const patch = {
          title, description, price, offer, category_id: catId, stock, hidden, cart,
          updated_at: new Date().toISOString(),
        };
        if (cImg >= 0 && imgUrl) patch.img = imgUrl;
        if (extraImgs && extraImgs.length) patch.imgs = extraImgs;
        if (parsedOpts) patch.options = parsedOpts;
        if (existingId && prodById.has(existingId)) {
          const { error } = await sb.from('products').update(patch).eq('id', existingId);
          if (!error) updated++;
        } else {
          const { error } = await sb.from('products').insert({
            ...patch, id: slugId(title), img: imgUrl || '', imgs: extraImgs || [], options: parsedOpts || [], position: S.prods.length + created,
          });
          if (!error) created++;
        }
      }
      m.close();
      toast(`CSV importado: ${created} nuevos, ${updated} actualizados${deleted ? `, ${deleted} eliminados` : ''}`, 'ok');
      await refresh();
    } catch (e) {
      err.textContent = e.message || 'No se pudo importar el CSV.';
      err.hidden = false;
      btn.disabled = false; btn.textContent = 'Importar';
    }
  };
}
