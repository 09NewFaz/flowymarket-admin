// ===== FlowyMarket: panel de administración =====
import { sb, esc, withDefaults, safeUrl, STORE_URL } from './common.js';
import { $, $$, toast } from './ui.js';
import { renderDesign, leaveDesign } from './design.js';
import { renderProducts } from './products.js';
import { renderOrders, renderClients, renderStats } from './orders.js';
import { renderDetails, renderCheckout, renderPayments, renderPromos } from './settings.js';

/** Estado compartido del panel */
export const S = {
  user: null,
  cfg: withDefaults({}),
  cats: [],
  prods: [],
  orders: [],
  newOrders: 0,
};

const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ROUTES = [
  { id: 'design',   label: 'Diseño',        icon: I('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.6-9-7.6Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'), render: renderDesign },
  { id: 'products', label: 'Productos',     icon: I('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.3"/>'), render: renderProducts },
  { id: 'orders',   label: 'Pedidos',       icon: I('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>'), render: renderOrders },
  { id: 'clients',  label: 'Clientes',      icon: I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'), render: renderClients },
  { id: 'stats',    label: 'Estadísticas',  icon: I('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>'), render: renderStats },
  { sep: true },
  { id: 'details',  label: 'Detalles',      icon: I('<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>'), render: renderDetails },
  { id: 'checkout', label: 'Checkout',      icon: I('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 8H6.2"/>'), render: renderCheckout },
  { id: 'payments', label: 'Pagos',         icon: I('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>'), render: renderPayments },
  { id: 'promos',   label: 'Promociones',   icon: I('<path d="M9 15 15 9"/><circle cx="9.5" cy="9.5" r="1"/><circle cx="14.5" cy="14.5" r="1"/><path d="M3 12a3 3 0 0 0 0-0V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-2Z"/>'), render: renderPromos },
];

// ---------- Datos ----------
export async function loadConfig() {
  const { data, error } = await sb.from('shop_config').select('store,design,checkout,payments').eq('id', 1).maybeSingle();
  if (error) throw error;
  S.cfg = withDefaults(data || {});
  if (!data) await sb.from('shop_config').insert({ id: 1, store: S.cfg.store, design: S.cfg.design, checkout: {}, payments: {} });
  updateBrand();
}
export async function loadCatalog() {
  const [c, p] = await Promise.all([
    sb.from('categories').select('*').order('position').order('name'),
    sb.from('products').select('*').order('position').order('title'),
  ]);
  if (c.error || p.error) throw c.error || p.error;
  S.cats = c.data;
  S.prods = p.data;
}
/** Guarda una columna de shop_config (store, design, checkout o payments). */
export async function saveConfig(patch) {
  const { error } = await sb.from('shop_config').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) throw error;
  Object.assign(S.cfg, withDefaults({ ...S.cfg, ...patch }));
  updateBrand();
}

function setFavicon(url) {
  if (!url) return;
  document.querySelectorAll('link[rel*="icon"]').forEach((l) => l.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = url;
  document.head.appendChild(link);
}

function updateBrand() {
  const warn = $('[data-wa-warn]');
  if (warn) warn.hidden = !!S.cfg.store.whatsapp;
  const fav = safeUrl(S.cfg.store.favicon || S.cfg.store.logo);
  if (fav) setFavicon(fav);
  const b = $('.brand');
  if (!b) return;
  const logo = safeUrl(S.cfg.store.logo);
  b.innerHTML = `<div class="logo">${logo ? `<img src="${esc(logo)}" alt="">` : I('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>')}</div><span>${esc(S.cfg.store.name)}</span>`;
}

// ---------- Login ----------
function renderLogin(message = '') {
  $('#root').innerHTML = `<div class="login"><form class="login-card" id="login" novalidate>
    <h1>Panel de administración</h1>
    <p class="sub">Inicia sesión para editar tu tienda.</p>
    ${message ? `<div class="error-box">${esc(message)}</div>` : '<div class="error-box" hidden></div>'}
    <div class="field"><label for="email">Correo</label><input id="email" type="email" autocomplete="username" required></div>
    <div class="field"><label for="pass">Contraseña</label><input id="pass" type="password" autocomplete="current-password" required></div>
    <button class="btn block" type="submit">Iniciar sesión</button>
    <button class="link" type="button" data-forgot>¿Olvidaste tu contraseña?</button>
  </form></div>`;
  const form = $('#login');
  const err = form.querySelector('.error-box');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#pass').value });
    if (error) {
      err.textContent = error.message.includes('Invalid') ? 'Correo o contraseña incorrectos.' : error.message;
      err.hidden = false; btn.disabled = false; btn.textContent = 'Iniciar sesión';
    }
  };
  form.querySelector('[data-forgot]').onclick = async () => {
    const email = $('#email').value.trim();
    if (!email) { err.textContent = 'Escribe tu correo y vuelve a tocar "¿Olvidaste tu contraseña?".'; err.hidden = false; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    toast('Te enviamos un correo para restablecer la contraseña', 'ok');
  };
}

function renderNewPassword() {
  $('#root').innerHTML = `<div class="login"><form class="login-card" id="np" novalidate>
    <h1>Nueva contraseña</h1><p class="sub">Elige una contraseña nueva para tu cuenta.</p>
    <div class="error-box" hidden></div>
    <div class="field"><label for="p1">Nueva contraseña</label><input id="p1" type="password" autocomplete="new-password" minlength="8"></div>
    <button class="btn block" type="submit">Guardar</button>
  </form></div>`;
  $('#np').onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#np .error-box');
    const pass = $('#p1').value;
    if (pass.length < 8) { err.textContent = 'Usa al menos 8 caracteres.'; err.hidden = false; return; }
    const { error } = await sb.auth.updateUser({ password: pass });
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    toast('Contraseña actualizada', 'ok');
    history.replaceState(null, '', location.pathname + '#/design');
    boot();
  };
}

// ---------- Estructura ----------
function renderShell() {
  $('#root').innerHTML = `<div class="shell">
    <header class="topbar">
      <button class="icon-btn menu-btn" data-nav-toggle aria-label="Menú">☰</button>
      <div class="brand"></div>
      <div class="spacer"></div>
      <a class="wa-warn" href="#/details" data-wa-warn hidden>⚠️ <span>Configura tu WhatsApp para recibir pedidos</span></a>
      <a class="btn ghost sm" href="${esc(STORE_URL)}" target="_blank" rel="noopener">Ver tienda ↗</a>
      <button class="btn ghost sm hide-sm" data-logout>Cerrar sesión</button>
    </header>
    <nav class="sidebar">
      ${ROUTES.map((r) => (r.sep ? '<div class="sep"></div>' : `<a class="nav-item" href="#/${r.id}" data-route="${r.id}">${r.icon}<span>${r.label}</span>${r.id === 'orders' ? '<span class="dot" hidden></span>' : ''}</a>`)).join('')}
      <div class="sep"></div>
      <button class="nav-item" data-logout style="border:0;background:none;text-align:left">${I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>')}<span>Cerrar sesión</span></button>
      <div class="user">${esc(S.user.email)}</div>
    </nav>
    <main class="main" id="main"></main>
  </div>`;
  updateBrand();
  $$('[data-logout]').forEach((b) => (b.onclick = async () => { await sb.auth.signOut(); location.hash = ''; }));
  $('[data-nav-toggle]').onclick = () => $('.shell').classList.toggle('nav-open');
}

export function setOrderBadge(n) {
  S.newOrders = n;
  const dot = $('[data-route="orders"] .dot');
  if (dot) { dot.hidden = !n; dot.textContent = n; }
}

let currentRoute = null;
async function route() {
  if (!S.user || !$('#main')) return;
  const id = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'design';
  const r = ROUTES.find((x) => x.id === id) || ROUTES[0];
  if (currentRoute === 'design' && r.id !== 'design' && !leaveDesign()) {
    history.replaceState(null, '', '#/design');
    return;
  }
  currentRoute = r.id;
  $$('.nav-item[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === r.id));
  $('.shell').classList.remove('nav-open');
  const main = $('#main');
  main.scrollTop = 0;
  main.innerHTML = '<div class="boot" style="min-height:50vh"><div class="spinner"></div></div>';
  try {
    await r.render(main);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="view"><div class="error-box">No se pudo cargar esta sección: ${esc(err.message || err)}</div></div>`;
  }
}
window.addEventListener('hashchange', route);

// Pedidos nuevos en tiempo real
let ordersChannel;
function watchOrders() {
  ordersChannel?.unsubscribe();
  ordersChannel = sb.channel('admin-orders')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (p) => {
      toast(`🛎️ Nuevo pedido #${p.new.num}`, 'ok');
      if (currentRoute !== 'orders') setOrderBadge(S.newOrders + 1);
      document.dispatchEvent(new CustomEvent('fm:order', { detail: p.new }));
    })
    .subscribe();
}

// ---------- Inicio ----------
let booted = false;
let booting = null;
function boot() {
  if (!booting) booting = doBoot().finally(() => { booting = null; });
  return booting;
}
async function doBoot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { S.user = null; booted = false; return renderLogin(); }
  if (booted && S.user?.id === session.user.id) return;
  S.user = session.user;
  const { data: isAdmin, error } = await sb.rpc('is_admin');
  if (error || !isAdmin) {
    await sb.auth.signOut();
    return renderLogin('Esta cuenta no tiene permisos de administrador.');
  }
  booted = true;
  try {
    await Promise.all([loadConfig(), loadCatalog()]);
  } catch (err) {
    $('#root').innerHTML = `<div class="login"><div class="login-card"><div class="error-box">No se pudo cargar la tienda: ${esc(err.message)}</div></div></div>`;
    return;
  }
  renderShell();
  watchOrders();
  route();
}

sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') return renderNewPassword();
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(boot, 0);
});
if (!location.hash.includes('type=recovery')) boot();
