// ==========================================
// ManageResto – Main Application Logic
// ==========================================
// Detect local vs deployed backend
const API_BASE =
  window.location.hostname === "https://manageresto-backend-zrrv.onrender.com";

let state = {
  menu: [],
  orders: [],
  nextOrderId: 1,
  nextMenuId: 100,

  currentOrderFlow: {
    tableNumber: '',
    items: {},
    editingOrderId: null,
  },
};

// ===== PERSISTENCE (Node.js API) =====
async function saveState() {
  try {
    await fetch(`${API_BASE}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu: state.menu,
        orders: state.orders,
        nextOrderId: state.nextOrderId,
        nextMenuId: state.nextMenuId
      })
    });
  } catch (err) {
    console.error('Failed to save state to server', err);
  }
}

async function loadState() {
  try {
    const res = await fetch(`${API_BASE}/api/state`);
    if (!res.ok) throw new Error('API down');

    const data = await res.json();

    // If DB is empty on first load, use DEFAULT_MENU
    state.menu = data.menu && data.menu.length > 0 ? data.menu : DEFAULT_MENU.map(i => ({ ...i }));
    state.orders = data.orders || [];
    state.nextOrderId = data.nextOrderId || 10;
    state.nextMenuId = data.nextMenuId || 100;

  } catch (err) {
    console.error('Failed to load state from server, using defaults', err);
    state.menu = DEFAULT_MENU.map(i => ({ ...i }));
    state.orders = [];
  }
}

// ===== HELPERS =====
function formatPrice(p) { return `₹${Number(p).toFixed(2)}`; }

function getMenuItemById(id) { return state.menu.find(m => m.id === id); }

function getOrderTotal(order) {
  return order.items.reduce((sum, i) => {
    const mi = getMenuItemById(i.menuItemId);
    return sum + (mi ? mi.price * i.qty : 0);
  }, 0);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ===== NAVIGATION =====
let currentPage = 'orders';

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.getElementById(`nav-${page}`).classList.add('active');
  currentPage = page;

  if (page === 'orders') renderOrders();
  if (page === 'menu') renderMenuPage();
  if (page === 'analytics') renderAnalytics();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function hideScreen(id) {
  document.getElementById(id).classList.remove('active');
}

// ==========================================
// ORDERS PAGE
// ==========================================
let currentOrderTab = 'active'; // 'active' | 'completed'

function switchOrderTab(tab) {
  currentOrderTab = tab;
  document.getElementById('tab-active').classList.toggle('active', tab === 'active');
  document.getElementById('tab-completed').classList.toggle('active', tab === 'completed');
  renderOrders();
}

function renderOrders() {
  const list = document.getElementById('orders-list');

  const activeOrders = state.orders.filter(o => !o.paid);
  const completedOrders = state.orders.filter(o => o.paid);

  document.getElementById('badge-active').textContent = activeOrders.length;

  const ordersToShow = currentOrderTab === 'active' ? activeOrders : completedOrders;

  if (ordersToShow.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding:80px 20px; color:var(--text-muted)">
      <div style="font-size:48px; margin-bottom:16px;">📋</div>
      <h3 style="font-family:var(--font-serif); font-size:20px; color:#1a1616;">No ${currentOrderTab} orders</h3>
      <p style="font-size:14px; margin-top:4px;">When you get new orders, they'll appear here.</p>
    </div>`;
    return;
  }

  list.innerHTML = ordersToShow.map(o => renderOrderCard(o)).join('');
}

function renderOrderCard(order) {
  const isCompleted = order.paid;
  const time = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const itemRows = order.items.map((item, idx) => {
    const mi = getMenuItemById(item.menuItemId);
    if (!mi) return '';

    // In completed tab, just show text. In active, show toggle if not complete
    let actionHtml;
    if (isCompleted) {
      actionHtml = `<span class="status-text served">SERVED</span>`;
    } else {
      const isServed = item.status === 'Served';
      actionHtml = `
        <span class="status-text ${isServed ? 'served' : 'preparing'}">${isServed ? 'SERVED' : 'PREPARING'}</span>
        <label class="toggle-switch">
          <input type="checkbox" ${isServed ? 'checked' : ''} onchange="toggleItemStatus(${order.id}, ${idx})">
          <span class="toggle-slider"></span>
        </label>
      `;
    }

    return `
      <div class="order-item-row">
        <div>
          <span style="color:var(--text-muted); font-weight:700; font-size:13px;">${item.qty}×</span> 
          <span class="order-item-name" style="margin-left:4px;">${mi.name}</span>
        </div>
        <div class="order-item-right">
          ${actionHtml}
        </div>
      </div>
    `;
  }).join('');

  const total = formatPrice(getOrderTotal(order));

  let paymentHtml = '';
  if (!isCompleted) {
    const allServed = order.items.every(i => i.status === 'Served');
    paymentHtml = `
      <div style="text-align:right;">
        <div style="display:flex; align-items:center; gap:8px; justify-content:flex-end;">
          <span class="status-text ${allServed ? 'paid' : 'unpaid'}">${allServed ? 'PAYMENT READY' : 'UNPAID'}</span>
          <label class="toggle-switch unpaid" style="${!allServed ? 'opacity:0.5; pointer-events:none;' : ''}">
            <input type="checkbox" ${order.paid ? 'checked' : ''} onchange="togglePayment(${order.id})">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
          ${allServed ? 'Swipe to complete' : 'Serve all items to enable payment'}
        </div>
      </div>
    `;
  } else {
    paymentHtml = `<div class="order-header-right paid-pill">PAID</div>`;
  }

  return `
    <div class="card order-card ${isCompleted ? 'completed' : ''}" id="order-${order.id}">
      <div class="order-card-header">
        <div class="order-header-left">
          <h3>Table ${order.tableNumber}</h3>
          <p>ORDER #${order.id} • ${time}</p>
        </div>
        ${paymentHtml}
      </div>

      <div class="order-divider"></div>

      <div style="margin-bottom:20px;">
        ${itemRows}
      </div>

      <div class="order-divider"></div>

      <div class="order-footer">
        <div>
          <div class="order-total-label">${isCompleted ? 'Total' : 'Total Amount'}</div>
          <div class="order-total-value">${total}</div>
        </div>
        ${!isCompleted ? `<button class="btn btn-soft" style="height:40px; border-radius:12px;" onclick="openEditOrder(${order.id})">Add Items</button>` : ''}
      </div>
    </div>
  `;
}

function toggleItemStatus(orderId, itemIdx) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const item = order.items[itemIdx];
  item.status = item.status === 'Preparing' ? 'Served' : 'Preparing';
  saveState();
  renderOrders();
}

function togglePayment(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.paid = true; // One way trip to completed for demo
  saveState();
  renderOrders();
  showToast('Order completed & paid ✓');
}

// ==========================================
// NEW ORDER FLOW
// ==========================================
function openNewOrder() {
  state.currentOrderFlow = { tableNumber: '', items: {}, editingOrderId: null };
  document.getElementById('table-number-input').value = '';
  showScreen('screen-table');
}

function proceedToTable() {
  const val = document.getElementById('table-number-input').value.trim();
  if (!val) { showToast('Enter table number'); return; }
  state.currentOrderFlow.tableNumber = val;
  openItemSelection();
}

function openItemSelection() {
  document.getElementById('item-select-table-title').textContent = `Table ${state.currentOrderFlow.tableNumber}`;
  document.getElementById('order-item-search').value = '';
  renderOrderCategories('All');
  renderOrderItems('', 'All');
  updateSummaryBar();
  showScreen('screen-items');
}

function renderOrderCategories(activeCat) {
  const cats = ['All', ...CATEGORIES];
  const html = cats.map(c =>
    `<div class="pill-option ${activeCat === c ? 'active' : ''}" style="font-size:13px; padding:6px 16px; border-radius:16px; flex-shrink:0;" onclick="selectOrderCat('${c}')">${c}</div>`
  ).join('');
  document.getElementById('order-cat-pills').innerHTML = html;
  document.getElementById('order-cat-pills').dataset.active = activeCat;
}

window.selectOrderCat = function (cat) {
  renderOrderCategories(cat);
  renderOrderItems(document.getElementById('order-item-search').value, cat);
}

function renderOrderItems(search, category) {
  const container = document.getElementById('order-item-list');
  let items = state.menu;

  if (search) items = items.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  if (category && category !== 'All') items = items.filter(m => m.category === category);

  container.innerHTML = items.map(m => {
    const qty = state.currentOrderFlow.items[m.id] || 0;

    // Icon fallback based on category
    let emoji = '🍲';
    if (m.category.includes('Starter')) emoji = '🍗';
    if (m.category.includes('Bread')) emoji = '🫓';
    if (m.category.includes('Biryani') || m.category.includes('Rice')) emoji = '🍚';
    if (m.category.includes('Dessert')) emoji = '🍨';
    if (m.category.includes('Beverage')) emoji = '🥤';
    if (m.category.includes('Curry')) emoji = '🍛';

    let imgHtml = m.image
      ? `<img src="${m.image}" style="width:100%;height:100%;object-fit:cover;border-radius:14px">`
      : emoji;

    return `
      <div class="card" style="padding:16px; margin-bottom:12px; display:flex; align-items:center; gap:16px; border-radius:16px;">
        <div class="menu-item-icon" style="width:50px; height:50px; font-size:24px;">${imgHtml}</div>
        <div class="menu-item-info">
          <h4 style="font-size:15px; margin-bottom:4px;">${m.name}</h4>
          <div style="font-family:var(--font-serif); font-size:16px; font-weight:800; color:#1a1616;">${formatPrice(m.price)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px; background:var(--bg-app); border-radius:24px; padding:4px;">
          <button style="width:32px; height:32px; border-radius:50%; border:none; background:white; font-size:18px; color:var(--text-muted); cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.05);" onclick="adjustQty(${m.id}, -1)">-</button>
          <span style="font-size:15px; font-weight:800; min-width:20px; text-align:center;">${qty}</span>
          <button style="width:32px; height:32px; border-radius:50%; border:none; background:var(--primary); color:white; font-size:18px; cursor:pointer;" onclick="adjustQty(${m.id}, 1)">+</button>
        </div>
      </div>
    `;
  }).join('');
}

window.adjustQty = function (id, delta) {
  const cur = state.currentOrderFlow.items[id] || 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) delete state.currentOrderFlow.items[id];
  else state.currentOrderFlow.items[id] = next;

  const search = document.getElementById('order-item-search').value;
  const cat = document.getElementById('order-cat-pills').dataset.active;
  renderOrderItems(search, cat);
  updateSummaryBar();
}

function updateSummaryBar() {
  let qty = 0, total = 0;
  Object.entries(state.currentOrderFlow.items).forEach(([id, q]) => {
    const item = getMenuItemById(parseInt(id));
    if (item) { qty += q; total += item.price * q; }
  });
  document.getElementById('summary-qty').textContent = qty;
  document.getElementById('summary-total').textContent = formatPrice(total);
}

function sendToKitchen() {
  const { tableNumber, items, editingOrderId } = state.currentOrderFlow;
  const entries = Object.entries(items);
  if (entries.length === 0) { showToast('Add items first'); return; }

  if (editingOrderId) {
    const o = state.orders.find(x => x.id === editingOrderId);
    if (o) {
      entries.forEach(([id, qty]) => {
        const existing = o.items.find(i => i.menuItemId === parseInt(id));
        if (existing) existing.qty += qty;
        else o.items.push({ menuItemId: parseInt(id), qty, status: 'Preparing' });
      });
    }
    showToast('Items added to order ✓');
  } else {
    state.orders.unshift({
      id: state.nextOrderId++,
      tableNumber,
      items: entries.map(([id, qty]) => ({ menuItemId: parseInt(id), qty, status: 'Preparing' })),
      paid: false,
      createdAt: new Date().toISOString()
    });
    showToast('Sent to Kitchen 🍳');
  }

  saveState();
  hideScreen('screen-items');
  hideScreen('screen-table');
  navigateTo('orders');
}

function openEditOrder(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  state.currentOrderFlow = { tableNumber: o.tableNumber, items: {}, editingOrderId: id };
  openItemSelection();
}


// ==========================================
// MENU CONFIG
// ==========================================
let editingMenuId = null;

function renderMenuPage() {
  const q = document.getElementById('menu-search').value.toLowerCase();
  const list = document.getElementById('menu-list');
  let items = state.menu;
  if (q) items = items.filter(i => i.name.toLowerCase().includes(q));

  document.getElementById('menu-count-badge').textContent = `${items.length} Items`;

  list.innerHTML = items.map(m => {
    // Emoji fallback
    let emoji = '🍲';
    if (m.category.includes('Starter')) emoji = '🍗';
    if (m.category.includes('Bread')) emoji = '🫓';
    if (m.category.includes('Drinks')) emoji = '🥤';
    if (m.category.includes('Dessert')) emoji = '🍨';
    if (m.category.includes('Curry') || m.category.includes('Course')) emoji = '🍛';

    let imgHtml = m.image
      ? `<img src="${m.image}" style="width:100%;height:100%;object-fit:cover;border-radius:14px">`
      : emoji;

    return `
      <div class="card menu-item-row" style="padding:16px;">
        <div class="menu-item-icon">${imgHtml}</div>
        <div class="menu-item-info">
          <h4>${m.name}</h4>
          <div class="price">${formatPrice(m.price)}</div>
          <div class="tags">
            ${m.type === 'Veg' ? '🌿 <span class="veg">Veg</span>' : '🥩 <span class="non-veg">Non-Veg</span>'} 
            <span style="color:var(--text-muted)">• ${m.category}</span>
          </div>
        </div>
        <button class="menu-item-edit" onclick="openMenuForm(${m.id})">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
        </button>
      </div>
    `;
  }).join('');
}

function openMenuForm(id = null) {
  editingMenuId = id;
  const m = id ? getMenuItemById(id) : null;

  document.getElementById('menu-form-title').textContent = m ? 'Edit Menu Item' : 'Add Menu Item';
  document.getElementById('form-item-name').value = m ? m.name : '';
  document.getElementById('form-item-price').value = m ? m.price : '';
  document.getElementById('form-item-desc').value = '';

  const cat = m ? m.category : CATEGORIES[0];
  document.getElementById('form-item-category-pills').innerHTML = CATEGORIES.map(c =>
    `<div class="pill-option ${cat === c ? 'active' : ''}" onclick="setMenuFormCat(this, '${c}')">${c}</div>`
  ).join('');
  document.getElementById('form-item-category-pills').dataset.val = cat;

  setDietToggle(m ? m.type : 'Veg');

  showScreen('screen-menu-form');
}

window.setMenuFormCat = function (el, val) {
  document.querySelectorAll('#form-item-category-pills .pill-option').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('form-item-category-pills').dataset.val = val;
}

function setDietToggle(type) {
  const veg = document.getElementById('diet-veg');
  const non = document.getElementById('diet-nonveg');
  if (type === 'Veg') {
    veg.classList.add('active'); non.classList.remove('active');
    veg.dataset.selected = 'true'; non.dataset.selected = 'false';
  } else {
    non.classList.add('active'); veg.classList.remove('active');
    veg.dataset.selected = 'false'; non.dataset.selected = 'true';
  }
}

function saveMenuItem() {
  const name = document.getElementById('form-item-name').value.trim();
  const price = Number(document.getElementById('form-item-price').value);
  const cat = document.getElementById('form-item-category-pills').dataset.val;
  const type = document.getElementById('diet-veg').dataset.selected === 'true' ? 'Veg' : 'Non-Veg';

  if (!name) { showToast('Name is required'); return; }
  if (!price) { showToast('Valid price required'); return; }

  if (editingMenuId) {
    const m = getMenuItemById(editingMenuId);
    m.name = name; m.price = price; m.category = cat; m.type = type;
    showToast('Saved successfully');
  } else {
    state.menu.unshift({
      id: state.nextMenuId++, name, price, category: cat, type, image: null
    });
    showToast('Added to menu');
  }

  saveState();
  hideScreen('screen-menu-form');
  renderMenuPage();
}

// ==========================================
// ANALYTICS
// ==========================================
function renderAnalytics() {
  const today = new Date().toDateString();
  const orders = state.orders.filter(o => new Date(o.createdAt).toDateString() === today);

  document.getElementById('metric-orders').textContent = orders.length;
  document.getElementById('metric-revenue').textContent = formatPrice(orders.reduce((sum, o) => sum + getOrderTotal(o), 0));

  let counts = {};
  state.orders.forEach(o => o.items.forEach(i => counts[i.menuItemId] = (counts[i.menuItemId] || 0) + i.qty));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  if (top) {
    const mi = getMenuItemById(parseInt(top[0]));
    document.getElementById('mo-name').textContent = mi.name;
    document.getElementById('mo-count').textContent = `${top[1]} ordered`;
    document.getElementById('mo-progress').style.width = Math.min((top[1] / 20) * 100, 100) + '%';
  }

  // Calendar render (dummy for UI)
  const days = document.getElementById('cal-grid-content');
  let dHtml = '';
  // Sun row headers included in HTML, append days
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => dHtml += `<div class="cal-day-name">${d}</div>`);
  for (let i = 0; i < 4; i++) dHtml += `<div class="cal-day empty"></div>`;
  for (let i = 1; i <= 31; i++) dHtml += `<div class="cal-day ${i === 12 ? 'today' : ''}">${i}</div>`;
  days.innerHTML = dHtml;
}


// INIT
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  navigateTo('orders');

  document.getElementById('nav-orders').addEventListener('click', () => navigateTo('orders'));
  document.getElementById('nav-menu').addEventListener('click', () => navigateTo('menu'));
  document.getElementById('nav-analytics').addEventListener('click', () => navigateTo('analytics'));

  document.getElementById('btn-new-order').addEventListener('click', openNewOrder);
  document.getElementById('btn-back-table').addEventListener('click', () => hideScreen('screen-table'));
  document.getElementById('btn-proceed-table').addEventListener('click', proceedToTable);

  document.getElementById('btn-back-items').addEventListener('click', () => hideScreen('screen-items'));
  document.getElementById('btn-send-kitchen').addEventListener('click', sendToKitchen);
  document.getElementById('order-item-search').addEventListener('input', e => {
    renderOrderItems(e.target.value, document.getElementById('order-cat-pills').dataset.active);
  });

  document.getElementById('btn-add-menu-item').addEventListener('click', () => openMenuForm());
  document.getElementById('btn-back-menu-form').addEventListener('click', () => hideScreen('screen-menu-form'));
  document.getElementById('menu-form-btn').addEventListener('click', saveMenuItem);
  document.getElementById('menu-search').addEventListener('input', renderMenuPage);

  document.getElementById('diet-veg').addEventListener('click', () => setDietToggle('Veg'));
  document.getElementById('diet-nonveg').addEventListener('click', () => setDietToggle('Non-Veg'));
});
