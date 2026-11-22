// Detalles, checkout, pagos y promociones.
import { sb, esc, money, uid, ADDRESS_FIELDS, ORDER_TYPES } from './common.js';
import { S, saveConfig, loadConfig } from './app.js';
import { ICONS, $, $$, toast, modal, confirmDialog, imageField, bindImageFields, switchHtml } from './ui.js';

const saveBar = '<div class="sticky-save"><button class="btn" data-save>Guardar cambios</button></div>';

async function doSave(btn, patch, msg = 'Cambios guardados') {
  btn.disabled = true;
  try { await saveConfig(patch); toast(msg, 'ok'); }
  catch (err) { toast(err.message || 'No se pudo guardar', 'error'); }
  btn.disabled = false;
}
const checked = (root, name) => $(`[name="${name}"]`, root).checked;

// ================= Detalles =================
export async function renderDetails(el) {
  await loadConfig();
  const s = S.cfg.store;
  el.innerHTML = `<div class="view">
    <div class="view-head"><h1>Detalles de la tienda</h1></div>
    <div class="card">
      <div class="field"><label for="sname">Nombre *</label><input id="sname" maxlength="80" value="${esc(s.name)}"></div>
      <div class="field"><label for="sdesc">Descripción</label><textarea id="sdesc" rows="4" maxlength="600">${esc(s.description)}</textarea><small>Aparece en la sección de presentación.</small></div>
      <div class="field"><label>Logo</label>${imageField('logo', s.logo)}</div>
    </div>
    <div class="card"><h2>Contacto y moneda</h2>
      <div class="row">
        <div class="field"><label for="swa">WhatsApp para recibir pedidos</label><input id="swa" type="tel" maxlength="20" placeholder="Ej: 5491122334455" value="${esc(s.whatsapp)}">
          <small>Con código de país, sin + ni espacios.</small></div>
        <div class="field"><label for="scur">Símbolo de moneda</label><input id="scur" maxlength="5" value="${esc(s.currency)}"></div>
      </div>
    </div>
    ${saveBar}</div>`;
  bindImageFields(el, 'store');
  $('[data-save]', el).onclick = (e) => {
    const name = $('#sname', el).value.trim();
    if (!name) return toast('La tienda necesita un nombre', 'error');
    const whatsapp = $('#swa', el).value.replace(/\D/g, '');
    if (whatsapp && whatsapp.length < 8) return toast('El número de WhatsApp parece incompleto', 'error');
    doSave(e.target, { store: { ...S.cfg.store, name, description: $('#sdesc', el).value.trim(), whatsapp,
      currency: $('#scur', el).value.trim() || '$', logo: $('[name=logo]', el).value } });
  };
}

// ================= Checkout =================
export async function renderCheckout(el) {
  await loadConfig();
  const ck = { askName: true, askPhone: true, addr: {}, questions: [], ...S.cfg.checkout };
  const questions = Array.isArray(ck.questions) ? [...ck.questions] : [];
  el.innerHTML = `<div class="view">
    <div class="view-head"><h1>Checkout</h1><p>Configura qué datos se piden al confirmar un pedido.</p></div>
    <div class="card">
      <div class="set-row"><div><b>Pausar pedidos</b><small>La tienda se ve, pero no acepta pedidos.</small></div>${switchHtml('paused', ck.paused)}</div>
    </div>
    <div class="card"><h2>Formas de entrega</h2>
      <div class="set-row"><div><b>${ORDER_TYPES[0].label}</b></div>${switchHtml('pickup', ck.pickup)}</div>
      <div class="set-row"><div><b>${ORDER_TYPES[1].label}</b><small>Costo de envío fijo (0 = gratis)</small></div>
        <div style="display:flex;gap:12px;align-items:center"><input class="input" id="dprice" type="number" min="0" step="0.01" style="width:110px" value="${Number(ck.deliveryPrice) || 0}">${switchHtml('delivery', ck.delivery)}</div></div>
      <div class="set-row"><div><b>${ORDER_TYPES[2].label}</b><small>Para restaurantes o locales.</small></div>${switchHtml('table', ck.table)}</div>
    </div>
    <div class="card"><h2>Datos del cliente</h2>
      <div class="set-row"><b>Pedir nombre</b>${switchHtml('askName', ck.askName !== false)}</div>
      <div class="set-row"><b>Pedir teléfono</b>${switchHtml('askPhone', ck.askPhone !== false)}</div>
      <div class="set-row"><b>Pedir correo</b>${switchHtml('askEmail', ck.askEmail)}</div>
    </div>
    <div class="card"><h2>Dirección de entrega</h2>
      <table class="table"><thead><tr><th>Campo</th><th>Mostrar</th><th>Obligatorio</th></tr></thead><tbody>
      ${ADDRESS_FIELDS.map((f) => `<tr><td>${esc(f.label)}</td>
        <td><label class="chk"><input type="checkbox" data-addr="${f.key}" data-i="0" ${ck.addr?.[f.key]?.[0] ? 'checked' : ''}></label></td>
        <td><label class="chk"><input type="checkbox" data-addr="${f.key}" data-i="1" ${ck.addr?.[f.key]?.[1] ? 'checked' : ''}></label></td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="card"><h2>Impuestos</h2>
      <div class="set-row"><div><b>Cobrar impuesto</b><small>Se suma al total del pedido.</small></div>
        <div style="display:flex;gap:12px;align-items:center"><input class="input" id="taxpct" type="number" min="0" max="100" step="0.1" style="width:90px" value="${Number(ck.taxPct) || 0}"> %${switchHtml('taxOn', ck.taxOn)}</div></div>
    </div>
    <div class="card"><div class="card-head"><h2>Preguntas adicionales</h2>${switchHtml('questionsOn', ck.questionsOn, 'Activar')}</div>
      <div id="qs"></div><button class="btn ghost sm" data-addq>＋ Pregunta</button></div>
    ${saveBar}</div>`;

  const drawQs = () => {
    const box = $('#qs', el);
    box.innerHTML = questions.length ? questions.map((q, i) => `<div class="opt-item" style="grid-template-columns:1fr auto auto" data-q="${i}">
      <input class="input" maxlength="200" placeholder="Ej: ¿A qué hora lo retiras?" value="${esc(q.text || '')}">
      <label class="chk"><input type="checkbox" ${q.required ? 'checked' : ''}> Obligatoria</label>
      <button class="icon-btn" data-rmq aria-label="Quitar">×</button></div>`).join('') : '<p class="hint">Sin preguntas.</p>';
    $$('[data-q]', box).forEach((row) => {
      const q = questions[Number(row.dataset.q)];
      $('input.input', row).oninput = (e) => (q.text = e.target.value);
      $('input[type=checkbox]', row).onchange = (e) => (q.required = e.target.checked);
      $('[data-rmq]', row).onclick = () => { questions.splice(Number(row.dataset.q), 1); drawQs(); };
    });
  };
  drawQs();
  $('[data-addq]', el).onclick = () => { questions.push({ text: '', required: false }); drawQs(); };

  $('[data-save]', el).onclick = (e) => {
    if (!checked(el, 'pickup') && !checked(el, 'delivery') && !checked(el, 'table')) return toast('Activa al menos una forma de entrega', 'error');
    const addr = {};
    for (const f of ADDRESS_FIELDS) {
      const show = $(`[data-addr="${f.key}"][data-i="0"]`, el).checked;
      addr[f.key] = [show, show && $(`[data-addr="${f.key}"][data-i="1"]`, el).checked];
    }
    doSave(e.target, { checkout: {
      ...S.cfg.checkout,
      paused: checked(el, 'paused'), pickup: checked(el, 'pickup'), delivery: checked(el, 'delivery'), table: checked(el, 'table'),
      deliveryPrice: Math.max(Number($('#dprice', el).value) || 0, 0),
      askName: checked(el, 'askName'), askPhone: checked(el, 'askPhone'), askEmail: checked(el, 'askEmail'),
      addr,
      taxOn: checked(el, 'taxOn'), taxPct: Math.min(Math.max(Number($('#taxpct', el).value) || 0, 0), 100),
      questionsOn: checked(el, 'questionsOn'),
      questions: questions.map((q) => ({ text: (q.text || '').trim(), required: !!q.required })).filter((q) => q.text),
    } });
  };
}

// ================= Pagos =================
export async function renderPayments(el) {
  await loadConfig();
  const pm = S.cfg.payments;
  el.innerHTML = `<div class="view">
    <div class="view-head"><h1>Pagos</h1><p>Métodos que el cliente puede elegir. No hay cobros en línea: marcas el pago como recibido desde cada pedido.</p></div>
    <div class="card">
      <div class="set-row"><div><b>Efectivo</b></div>${switchHtml('cash', pm.cash)}</div>
      <div class="set-row"><div><b>Transferencia</b><small>Se muestran los datos al confirmar el pedido.</small></div>${switchHtml('transfer', pm.transfer)}</div>
      <div class="field" style="margin-top:10px"><label for="tinfo">Datos para transferir</label>
        <textarea id="tinfo" rows="4" maxlength="500" placeholder="Banco, alias, CBU/CVU, titular…">${esc(pm.transferInfo || '')}</textarea></div>
      <div class="set-row"><div><b>Otro método</b><small>Ej: Mercado Pago, tarjeta al recibir…</small></div>${switchHtml('custom', pm.custom)}</div>
      <div class="field" style="margin-top:10px"><label for="cname">Nombre del otro método</label><input id="cname" maxlength="40" value="${esc(pm.customName || '')}"></div>
    </div>
    ${saveBar}</div>`;
  $('[data-save]', el).onclick = (e) => {
    const custom = checked(el, 'custom');
    const customName = $('#cname', el).value.trim();
    if (custom && !customName) return toast('Escribe el nombre del otro método', 'error');
    doSave(e.target, { payments: { ...S.cfg.payments, cash: checked(el, 'cash'), transfer: checked(el, 'transfer'),
      transferInfo: $('#tinfo', el).value.trim(), custom, customName } });
  };
}

// ================= Promociones =================
export async function renderPromos(el) {
  const { data, error } = await sb.from('promos').select('*').order('code');
  if (error) throw error;
  const c = S.cfg.store.currency;
  el.innerHTML = `<div class="view">
    <div class="view-head"><h1>Promociones</h1><button class="btn" data-new>＋ Código</button>
      <p>Códigos de descuento que el cliente escribe al confirmar. El descuento se valida en el servidor.</p></div>
    <div class="card" style="padding:6px 10px">${data.length ? `<table class="table">
      <thead><tr><th>Código</th><th>Descuento</th><th>Activo</th><th></th></tr></thead><tbody>
      ${data.map((p) => `<tr data-code="${esc(p.code)}"><td><b>${esc(p.code)}</b></td>
        <td>${p.type === 'pct' ? `${Number(p.value)}%` : money(p.value, c)}</td>
        <td><label class="switch"><input type="checkbox" data-act ${p.active ? 'checked' : ''}><span class="track"></span></label></td>
        <td style="text-align:right"><button class="icon-btn danger" data-del title="Eliminar">${ICONS.trash}</button></td></tr>`).join('')}
      </tbody></table>` : '<p class="empty">No tienes códigos de descuento.</p>'}</div></div>`;

  $('[data-new]', el).onclick = () => {
    const m = modal('Nuevo código', `
      <div class="field"><label for="pcode">Código</label><div style="display:flex;gap:8px"><input id="pcode" class="input" maxlength="40" placeholder="Ej: BIENVENIDA2026"><button type="button" class="btn ghost" data-gen>Generar</button></div><small>Mínimo 6 caracteres: letras, números o guiones. Los códigos cortos son fáciles de adivinar.</small></div>
      <div class="row">
        <div class="field"><label for="ptype">Tipo</label><select id="ptype"><option value="pct">Porcentaje (%)</option><option value="fix">Monto fijo (${esc(c)})</option></select></div>
        <div class="field"><label for="pval">Valor</label><input id="pval" type="number" min="0" step="0.01"></div>
      </div>`, { footer: '<button class="btn ghost" data-dismiss>Cancelar</button><button class="btn" data-ok>Crear</button>' });
    $('[data-gen]', m).onclick = () => { $('#pcode', m).value = uid(10).toUpperCase(); };
    $('[data-ok]', m).onclick = async () => {
      const code = $('#pcode', m).value.trim().toUpperCase();
      const type = $('#ptype', m).value;
      const value = Number($('#pval', m).value);
      if (!/^[A-Za-z0-9_-]{6,40}$/.test(code)) return toast('Usa entre 6 y 40 letras, números o guiones', 'error');
      if (!(value > 0) || (type === 'pct' && value > 100)) return toast('El valor no es válido', 'error');
      const { error: e } = await sb.from('promos').insert({ code, type, value, active: true });
      if (e) return toast(e.message.includes('duplicate') ? 'Ese código ya existe' : e.message, 'error');
      m.close(); toast('Código creado', 'ok'); renderPromos(el);
    };
  };
  $$('[data-code]', el).forEach((tr) => {
    const code = tr.dataset.code;
    $('[data-act]', tr).onchange = async (e) => {
      const { error: er } = await sb.from('promos').update({ active: e.target.checked }).eq('code', code);
      if (er) { toast(er.message, 'error'); e.target.checked = !e.target.checked; }
    };
    $('[data-del]', tr).onclick = async () => {
      if (!(await confirmDialog(`¿Eliminar el código ${code}?`))) return;
      const { error: er } = await sb.from('promos').delete().eq('code', code);
      if (er) return toast(er.message, 'error');
      renderPromos(el);
    };
  });
}
