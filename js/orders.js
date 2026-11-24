// Pedidos, clientes y estadísticas.
import { sb, esc, money, moneyText, ORDER_STATUSES, ADDRESS_FIELDS, waLink } from './common.js';
import { S, setOrderBadge } from './app.js';
import { ICONS, $, $$, toast, modal, confirmDialog, fmtDate } from './ui.js';

const STATUS_TAG = { Recibido: 'brand', 'En Preparación': 'warn', Listo: 'ok', Entregado: '', Cancelado: 'danger' };
let filter = 'Todos';
let query = '';
let main;

async function loadOrders(limit = 1000) {
  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  S.orders = data;
  return data;
}

const cur = () => S.cfg.store.currency;
const addrText = (o) => [o.address?.text, ...ADDRESS_FIELDS.map((f) => o.address?.[f.key])].filter(Boolean).join(', ');

// ================= Pedidos =================
export async function renderOrders(el) {
  main = el;
  setOrderBadge(0);
  await loadOrders();
  draw();
}

// Si llega un pedido mientras se ve esta sección, refrescar
document.addEventListener('fm:order', async () => {
  if (main?.isConnected && $('[data-orders]', main)) { await loadOrders(); draw(); }
});

function draw() {
  const q = query.trim().toLowerCase();
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, S.orders.filter((o) => o.status === s).length]));
  const list = S.orders.filter((o) => (filter === 'Todos' || o.status === filter)
    && (!q || `${o.num} ${o.customer?.name || ''} ${o.customer?.phone || ''}`.toLowerCase().includes(q)));
  main.innerHTML = `<div class="view" data-orders>
    <div class="view-head"><h1>Pedidos</h1><p>Los pedidos nuevos aparecen aquí al instante.</p></div>
    <div class="toolbar">
      <div class="tabs">${['Todos', ...ORDER_STATUSES].map((s) => `<button data-f="${esc(s)}" class="${filter === s ? 'active' : ''}">${esc(s)}${s !== 'Todos' && counts[s] ? ` · ${counts[s]}` : ''}</button>`).join('')}</div>
      <input class="input" type="search" id="oq" placeholder="Buscar nº, nombre o teléfono" value="${esc(query)}">
    </div>
    <div class="card" style="padding:6px 10px">
      ${list.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th>Entrega</th><th>Total</th><th>Pago</th><th>Estado</th></tr></thead>
        <tbody>${list.map((o) => `<tr class="click" data-o="${esc(o.id)}">
          <td><b>#${esc(o.num)}</b></td>
          <td>${esc(fmtDate(o.created_at))}</td>
          <td>${esc(o.customer?.name || '—')}<br><small class="hint">${esc(o.customer?.phone || '')}</small></td>
          <td>${esc(o.type || '—')}</td>
          <td><b>${money(o.total, cur())}</b></td>
          <td>${o.paid ? '<span class="tag ok">Pagado</span>' : `<span class="tag">${esc(o.pay || 'Pendiente')}</span>`}</td>
          <td><span class="tag ${STATUS_TAG[o.status] || ''}">${esc(o.status)}</span></td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="empty">No hay pedidos aquí todavía.</p>'}
    </div></div>`;
  $$('[data-f]', main).forEach((b) => (b.onclick = () => { filter = b.dataset.f; draw(); }));
  const oq = $('#oq', main);
  oq.oninput = () => { query = oq.value; draw(); const n = $('#oq', main); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  $$('[data-o]', main).forEach((tr) => (tr.onclick = () => openOrder(S.orders.find((o) => o.id === tr.dataset.o))));
}

function openOrder(o) {
  const c = cur();
  const phone = (o.customer?.phone || '').replace(/\D/g, '');
  const m = modal(`Pedido #${o.num}`, `
    <div class="row" style="margin-bottom:14px">
      <div class="field" style="margin:0"><label>Estado</label><select class="status-sel" data-status>
        ${ORDER_STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''} ${o.status === 'Cancelado' && s !== 'Cancelado' ? 'disabled' : ''}>${esc(s)}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label>Pago</label><label class="switch"><input type="checkbox" data-paid ${o.paid ? 'checked' : ''}><span class="track"></span><span class="switch-label">Pago recibido</span></label></div>
    </div>
    <table class="order-items">${(o.items || []).map((i) => `<tr><td><b>${esc(i.q)} × ${esc(i.title)}</b>
      ${i.opts?.length ? `<small>${esc(i.opts.join(', '))}</small>` : ''}${i.note ? `<small>Nota: ${esc(i.note)}</small>` : ''}</td>
      <td>${money(i.price * i.q, c)}</td></tr>`).join('')}</table>
    <div class="sum">
      <div><span>Subtotal</span><span>${money(o.subtotal, c)}</span></div>
      ${Number(o.discount) > 0 ? `<div><span>Descuento${o.promo ? ` (${esc(o.promo)})` : ''}</span><span>−${money(o.discount, c)}</span></div>` : ''}
      ${Number(o.tax) > 0 ? `<div><span>Impuestos</span><span>${money(o.tax, c)}</span></div>` : ''}
      ${Number(o.shipping) > 0 ? `<div><span>Envío</span><span>${money(o.shipping, c)}</span></div>` : ''}
      <div class="total"><span>Total</span><span>${money(o.total, c)}</span></div>
    </div>
    <dl class="kv">
      <dt>Fecha</dt><dd>${esc(new Date(o.created_at).toLocaleString('es'))}</dd>
      <dt>Cliente</dt><dd>${esc(o.customer?.name || '—')}</dd>
      <dt>Teléfono</dt><dd>${esc(o.customer?.phone || '—')}</dd>
      ${o.customer?.email ? `<dt>Correo</dt><dd>${esc(o.customer.email)}</dd>` : ''}
      <dt>Entrega</dt><dd>${esc(o.type || '—')}</dd>
      ${addrText(o) ? `<dt>Dirección</dt><dd>${esc(addrText(o))}</dd>` : ''}
      <dt>Método de pago</dt><dd>${esc(o.pay || '—')}</dd>
      ${(o.answers || []).map((a) => `<dt>${esc(a.q)}</dt><dd>${esc(a.a || '—')}</dd>`).join('')}
    </dl>
    ${phone ? `<div class="post-box">
      <h4>Seguimiento post-venta (WhatsApp)</h4>
      <div class="field" style="margin-bottom:8px"><input class="input" id="otrack" placeholder="Código de seguimiento / nota de despacho (opcional)"></div>
      <div class="post-actions">
        <button type="button" class="btn ghost sm" data-wa-tpl="confirm">Confirmar pedido</button>
        <button type="button" class="btn ghost sm" data-wa-tpl="shipped">Listo / Despachado</button>
        <button type="button" class="btn ghost sm" data-wa-tpl="review">Pedir reseña + cupón</button>
      </div>
    </div>` : ''}`, {
    footer: `<button class="btn ghost" data-delo style="margin-right:auto;color:var(--danger)">Eliminar</button>
      ${phone ? `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(waLink(phone, `Hola ${o.customer?.name || ''}! Te escribimos de ${S.cfg.store.name} por tu pedido #${o.num}.`))}">${ICONS.wa} WhatsApp</a>` : ''}
      <button class="btn" data-dismiss>Cerrar</button>`,
  });
  if (phone) {
    const storeName = S.cfg.store.name || 'la tienda';
    const customerName = o.customer?.name ? ` ${o.customer.name}` : '';
    const transfer = S.cfg.payments?.transferInfo ? `\n\nDatos para transferir:\n${S.cfg.payments.transferInfo}` : '';
    const coupon = S.cfg.checkout?.aftersell?.couponCode;
    $$('[data-wa-tpl]', m).forEach((btn) => (btn.onclick = () => {
      const track = ($('#otrack', m)?.value || '').trim();
      let text = '';
      if (btn.dataset.waTpl === 'confirm') {
        text = `Hola${customerName}! Confirmamos tu pedido #${o.num} en ${storeName} por ${moneyText(o.total, c)}.${o.pay === 'Transferencia' ? transfer : ''}\nCualquier duda nos escribes por aquí.`;
      } else if (btn.dataset.waTpl === 'shipped') {
        text = `Hola${customerName}! Tu pedido #${o.num} de ${storeName} ya está listo${track ? `.\nSeguimiento / detalle: ${track}` : ' para entrega/despacho.'} ¡Gracias por elegirnos!`;
      } else if (btn.dataset.waTpl === 'review') {
        text = `Hola${customerName}! ¿Cómo estuvo tu pedido #${o.num} de ${storeName}? Nos encantaría saber qué te pareció.${coupon ? `\n\nComo agradecimiento, usa el código *${coupon}* en tu próxima compra.` : ''}`;
      }
      window.open(waLink(phone, text), '_blank', 'noopener');
    }));
  }
  const upd = async (patch) => {
    const { data, error } = await sb.from('orders').update(patch).eq('id', o.id).select().single();
    if (error) {
      toast(error.message.includes('pedido_cancelado') ? 'Un pedido cancelado no se puede reactivar.' : error.message, 'error');
      return false;
    }
    Object.assign(o, data);
    draw();
    toast('Pedido actualizado', 'ok');
    return true;
  };
  $('[data-status]', m).onchange = async (e) => {
    const v = e.target.value;
    if (v === 'Cancelado' && !(await confirmDialog('¿Cancelar este pedido? El stock se devolverá y no se podrá reactivar.', { ok: 'Cancelar pedido' }))) {
      e.target.value = o.status; return;
    }
    if (!(await upd({ status: v }))) e.target.value = o.status;
    if (o.status === 'Cancelado') $$('option', e.target).forEach((op) => (op.disabled = op.value !== 'Cancelado'));
  };
  $('[data-paid]', m).onchange = async (e) => { if (!(await upd({ paid: e.target.checked }))) e.target.checked = o.paid; };
  $('[data-delo]', m).onclick = async () => {
    if (!(await confirmDialog(`¿Eliminar el pedido #${o.num}? No se puede deshacer.`))) return;
    const { error } = await sb.from('orders').delete().eq('id', o.id);
    if (error) return toast(error.message, 'error');
    S.orders = S.orders.filter((x) => x.id !== o.id);
    m.close(); draw(); toast('Pedido eliminado');
  };
}

// ================= Clientes =================
export async function renderClients(el) {
  await loadOrders();
  const map = new Map();
  for (const o of S.orders) {
    const phone = (o.customer?.phone || '').replace(/\D/g, '');
    const key = phone || (o.customer?.email || '').toLowerCase() || (o.customer?.name || '').toLowerCase();
    if (!key) continue;
    const c = map.get(key) || { name: '', phone: o.customer?.phone, email: '', orders: 0, spent: 0, last: o.created_at };
    c.name ||= o.customer?.name; c.email ||= o.customer?.email;
    c.orders += 1;
    if (o.status !== 'Cancelado') c.spent += Number(o.total) || 0;
    if (o.created_at > c.last) c.last = o.created_at;
    map.set(key, c);
  }
  const list = [...map.values()].sort((a, b) => b.spent - a.spent);
  const c = cur();
  el.innerHTML = `<div class="view">
    <div class="view-head"><h1>Clientes</h1><p>Se arma automáticamente con los datos de los pedidos.</p></div>
    <div class="card" style="padding:6px 10px">${list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Cliente</th><th>Contacto</th><th>Pedidos</th><th>Total gastado</th><th>Último pedido</th><th></th></tr></thead>
      <tbody>${list.map((x) => `<tr><td><b>${esc(x.name || '—')}</b></td>
        <td>${esc(x.phone || '')}${x.email ? `<br><small class="hint">${esc(x.email)}</small>` : ''}</td>
        <td>${x.orders}</td><td><b>${money(x.spent, c)}</b></td><td>${esc(fmtDate(x.last))}</td>
        <td>${x.phone ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(waLink(x.phone, `Hola ${x.name || ''}!`))}">💬</a>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">Todavía no hay clientes. Aparecerán con el primer pedido.</p>'}</div></div>`;
}

// ================= Estadísticas =================
export async function renderStats(el) {
  const [orders, stats] = await Promise.all([loadOrders(5000), sb.from('stats').select('visits').eq('id', 1).maybeSingle()]);
  const valid = orders.filter((o) => o.status !== 'Cancelado');
  const revenue = valid.reduce((s, o) => s + Number(o.total || 0), 0);
  const visits = Number(stats.data?.visits || 0);
  const c = cur();

  const days = [...Array(14)].map((_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i));
    return d;
  });
  const perDay = days.map((d) => {
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const list = valid.filter((o) => new Date(o.created_at) >= d && new Date(o.created_at) < next);
    return { d, n: list.length, total: list.reduce((s, o) => s + Number(o.total || 0), 0) };
  });
  const maxDay = Math.max(1, ...perDay.map((x) => x.total));

  const top = new Map();
  for (const o of valid) for (const i of o.items || []) {
    const t = top.get(i.title) || { q: 0, total: 0 };
    t.q += Number(i.q) || 0; t.total += (Number(i.price) || 0) * (Number(i.q) || 0);
    top.set(i.title, t);
  }
  const topList = [...top.entries()].sort((a, b) => b[1].q - a[1].q).slice(0, 8);

  el.innerHTML = `<div class="view">
    <div class="view-head"><h1>Estadísticas</h1></div>
    <div class="stats-grid">
      <div class="stat"><small>Visitas a la tienda</small><b>${visits.toLocaleString('es')}</b></div>
      <div class="stat"><small>Pedidos (sin cancelados)</small><b>${valid.length}</b></div>
      <div class="stat"><small>Ventas totales</small><b>${money(revenue, c)}</b></div>
      <div class="stat"><small>Ticket promedio</small><b>${money(valid.length ? revenue / valid.length : 0, c)}</b></div>
      <div class="stat"><small>Conversión</small><b>${visits ? ((valid.length / visits) * 100).toFixed(1) : '0'}%</b></div>
    </div>
    <div class="card"><h2>Ventas de los últimos 14 días</h2>
      <div class="bars">${perDay.map((x) => `<div class="bar" title="${esc(x.d.toLocaleDateString('es'))}: ${x.n} pedidos, ${esc(money(x.total, c))}">
        <em>${x.n || ''}</em><i style="height:${(x.total / maxDay) * 100}%"></i><span>${x.d.getDate()}/${x.d.getMonth() + 1}</span></div>`).join('')}</div>
    </div>
    <div class="card"><h2>Productos más vendidos</h2>
      ${topList.length ? `<table class="table"><thead><tr><th>Producto</th><th>Unidades</th><th>Ventas</th></tr></thead><tbody>
        ${topList.map(([t, v]) => `<tr><td>${esc(t)}</td><td>${v.q}</td><td>${money(v.total, c)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="empty">Aún no hay ventas.</p>'}
    </div></div>`;
}
