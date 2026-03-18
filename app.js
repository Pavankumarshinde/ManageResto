// ==========================================
// ManageResto – Main Application Logic (v1.2 - Full Fix)
// ==========================================
console.log("🚀 ManageResto Frontend v1.2 Loading...");
// Detect local vs deployed backend
const API_BASE = "https://manageresto.onrender.com";
let isSyncing = false;
let lastSaveTime = 0;
let fetchController = null;
let saveQueue = [];
let isProcessingQueue = false;
let user = JSON.parse(localStorage.getItem('user')) || null;
let token = localStorage.getItem('token') || null;
let socket = null;

const authHeaders = () => ({
  'Content-Type': 'application/json',
  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
});

function initSocket() {
  if (socket) return;
  if (!user) return;

  socket = io(API_BASE);
  
  socket.on('connect', () => {
    console.log('🔌 Connected to WebSocket');
    socket.emit('join', user.id);
  });

  socket.on('orderUpdated', () => {
    console.log('🔔 Orders updated via socket');
    fetchState(true); // Forced fetch
  });

  socket.on('menuUpdated', () => {
    console.log('🔔 Menu updated via socket');
    fetchState(true);
  });

  socket.on('waiterUpdated', () => {
    console.log('🔔 Waiters updated via socket');
    fetchState(true);
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected');
  });
}

async function fetchState(forced = false) {
  // 🟢 Auth Guard: Only poll if we have a token!
  if (!token) return;

  // If not forced, block if syncing or recently saved
  if (!forced) {
    if (isSyncing || isProcessingQueue || (Date.now() - lastSaveTime < 5000)) return;
  }

  // Abort any previous fetch if still running
  if (fetchController) fetchController.abort();
  fetchController = new AbortController();

  try {
    const res = await fetch(`${API_BASE}/api/state?ts=${Date.now()}`, {
      signal: fetchController.signal,
      headers: authHeaders()
    });

    if (res.status === 401 || res.status === 403) {
      handleLogout();
      return;
    }

    const data = await res.json();

    // Final guard if we started a save while the fetch was returning
    if (!forced && (isSyncing || isProcessingQueue || (Date.now() - lastSaveTime < 5000))) return;

    // 🔴 Update local state
    state.menu = data.menu || [];
    state.orders = data.orders || [];
    state.nextOrderId = data.nextOrderId || 1;
    state.nextMenuId = data.nextMenuId || 100;
    state.waiters = data.waiters || [];

    // 🔴 Re-render UI
    if (currentPage === 'orders') renderOrders();
    if (currentPage === 'menu') renderMenuPage();
    if (currentPage === 'analytics') renderAnalytics();

  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error("Fetch failed", err);
  } finally {
    fetchController = null;
  }
}
let state = {
  menu: [],
  orders: [],
  nextOrderId: 1,
  nextMenuId: 100,

  currentOrderFlow: {
    tableNumber: '',
    waiterName: '',
    items: {},
    editingOrderId: null,
  },
  waiters: [], // Loaded from backend
};

// ===== PERSISTENCE (Node.js API) =====
async function saveState() {
  // Push to queue to prevent concurrent POST races
  saveQueue.push({
    menu: [...state.menu],
    orders: JSON.parse(JSON.stringify(state.orders)),
    nextOrderId: state.nextOrderId,
    nextMenuId: state.nextMenuId,
    waiters: state.waiters
  });

  processSaveQueue();
}

async function processSaveQueue() {
  if (isProcessingQueue) return;
  if (saveQueue.length === 0) return;

  isProcessingQueue = true;
  if (fetchController) fetchController.abort(); // Kill polling

  // Always take the LATEST state from the queue
  const payload = saveQueue[saveQueue.length - 1];
  saveQueue = []; // Clear queue since we have the latest

  try {
    lastSaveTime = Date.now();
    const res = await fetch(`${API_BASE}/api/state`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Save failed');

    // Successful save: Update lastSaveTime to block polls for 5s
    lastSaveTime = Date.now();
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Failed to save state to server', err);
      showToast('⚠️ Sync failed. Retrying...');
      // Re-add payload to retry
      saveQueue.unshift(payload);
    }
  } finally {
    isProcessingQueue = false;
    // If more work added while we were saving, process it
    if (saveQueue.length > 0) {
      setTimeout(processSaveQueue, 100);
    }
  }
}


async function loadState() {
  if (!user || !token) {
    showAuthUI(true);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/state`, {
      headers: authHeaders()
    });

    if (res.status === 401 || res.status === 403) {
      handleLogout();
      return;
    }

    const data = await res.json();

    state.menu = data.menu && data.menu.length > 0 ? data.menu : (typeof DEFAULT_MENU !== 'undefined' ? DEFAULT_MENU.map(i => ({ ...i })) : []);
    state.orders = data.orders || [];
    state.nextOrderId = data.nextOrderId || 10;
    state.nextMenuId = data.nextMenuId || 100;
    state.waiters = data.waiters && data.waiters.length > 0 ? data.waiters : (typeof WAITERS !== 'undefined' ? [...WAITERS] : []);

    initSocket(); // Initialize real-time updates
    showAuthUI(false);
    updateProfileUI();

  } catch (err) {
    console.error('Failed to load state', err);
    if (token) showToast('Connection error');
  }
}

// --- AUTH UI HELPERS ---
function showAuthUI(show) {
  document.getElementById('landing-page').style.display = show ? 'flex' : 'none';
  document.getElementById('app').style.display = show ? 'none' : 'flex';
  if (!show) navigateTo('orders');
}

window.showAuthForm = function (type) {
  document.querySelector('.landing-hero').style.display = 'none';
  document.getElementById('auth-container').style.display = 'block';
  document.getElementById('form-login').style.display = type === 'login' ? 'block' : 'none';
  document.getElementById('form-signup').style.display = type === 'signup' ? 'block' : 'none';
}

window.hideAuthForm = function () {
  document.getElementById('auth-container').style.display = 'none';
  document.querySelector('.landing-hero').style.display = 'block';
}

window.handleSignup = async function () {
  const restaurantName = document.getElementById('signup-resto-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const mobile = document.getElementById('signup-mobile').value.trim();
  const location = document.getElementById('signup-location').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm-password').value;

  if (!restaurantName || !email || !mobile || !password) { showToast('Please fill all fields'); return; }
  if (password !== confirm) { showToast('Passwords do not match'); return; }
  if (password.length < 8) { showToast('Password too short (min 8)'); return; }

  try {
    const signupUrl = `${API_BASE}/api/signup`;
    console.log('Sending signup to:', signupUrl);

    const res = await fetch(signupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantName, email, mobile, location, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    token = data.token;
    user = data.user;

    showToast(`Welcome, ${restaurantName}!`);
    loadState();
  } catch (err) {
    console.error('Signup Fetch Error:', err);
    showToast(err.message);
  }
}

window.handleLogin = async function () {
  const login = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;

  if (!login || !password) { showToast('Enter credentials'); return; }

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    token = data.token;
    user = data.user;

    showToast('Login successful ✓');
    loadState();
  } catch (err) {
    showToast(err.message);
  }
}

window.handleLogout = function () {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  token = null;
  user = null;
  // Reset state to avoid showing previous user's data
  state.orders = [];
  state.menu = [];
  showAuthUI(true);
  hideAuthForm();
}

function updateProfileUI() {
  if (!user) return;
  document.getElementById('profile-resto-name').textContent = user.restaurantName;
  document.getElementById('profile-location').textContent = user.location || 'Location not set';
  document.getElementById('profile-email').textContent = user.email;
  document.getElementById('profile-mobile').textContent = user.mobile;

  const initials = user.restaurantName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  document.getElementById('profile-initials').textContent = initials;
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
  document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));

  document.getElementById(`page-${page}`).classList.add('active');

  const bottomNav = document.getElementById(`nav-${page}`);
  if (bottomNav) bottomNav.classList.add('active');

  const sideNav = document.getElementById(`side-${page}`);
  if (sideNav) sideNav.classList.add('active');

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
      <div class="order-card-header" style="align-items: flex-start;">
        <div class="order-header-left">
          <h3>Table ${order.tableNumber}</h3>
          <p>WAITER: ${order.waiterName || '--'}</p>
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

  const confirmed = confirm("Have you served all items and received the payment?");
  if (!confirmed) return;

  order.paid = true;
  saveState();
  renderOrders();
  showToast('Order completed & paid ✓');
}

// ==========================================
// NEW ORDER FLOW
// ==========================================
function openNewOrder() {
  state.currentOrderFlow = { tableNumber: '', waiterName: '', items: {}, editingOrderId: null };
  document.getElementById('table-number-input').value = '';
  document.getElementById('waiter-search-input').value = '';
  document.getElementById('selected-waiter-name').value = '';
  renderWaiters('');
  showScreen('screen-table');
}

function proceedToTable() {
  const tableVal = document.getElementById('table-number-input').value.trim();
  const waiterVal = document.getElementById('selected-waiter-name').value.trim();

  if (!tableVal) { showToast('Enter table number'); return; }
  if (!waiterVal) { showToast('Enter waiter name'); return; }

  // Check if table already has an active (unpaid) order
  const existingOrder = state.orders.find(o => o.tableNumber === tableVal && !o.paid);
  if (existingOrder) {
    const confirmAdd = confirm(`Table ${tableVal} already has an active order. Would you like to add items to it instead?`);
    if (confirmAdd) {
      openEditOrder(existingOrder.id);
      return;
    } else {
      // Stay on screen to change table number or cancel
      return;
    }
  }

  state.currentOrderFlow.tableNumber = tableVal;
  state.currentOrderFlow.waiterName = waiterVal;
  openItemSelection();
}


function renderWaiters(q = '') {
  const list = document.getElementById('waiter-options-list');
  if (!list) return;

  const query = q.toLowerCase();
  const filtered = state.waiters.filter(w => w.toLowerCase().includes(query));

  if (filtered.length === 0) {
    list.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">No waiters found</div>`;
    return;
  }

  list.innerHTML = filtered.map(name => `
    <div class="waiter-option ${state.currentOrderFlow.waiterName === name ? 'selected' : ''}" 
         onclick="selectWaiter('${name}')">
      <span style="flex:1;">${name}</span>
      <button class="btn-delete-waiter" onclick="event.stopPropagation(); deleteWaiter('${name}')" title="Delete Waiter">×</button>
    </div>
  `).join('');
}

window.addNewWaiter = async function () {
  const name = prompt("Enter new waiter name:");
  if (!name || !name.trim()) return;

  const trimmedName = name.trim();
  const exists = state.waiters.some(w => w.toLowerCase() === trimmedName.toLowerCase());

  if (exists) {
    showToast("Waiter already exists");
    return;
  }

  state.waiters.push(trimmedName);
  await saveState();
  renderWaiters(document.getElementById('waiter-search-input').value);
  showToast(`Added ${trimmedName}`);
}

window.deleteWaiter = async function (name) {
  // Check if waiter has ANY history in orders
  const hasHistory = state.orders.some(o => o.waiterName === name);

  if (hasHistory) {
    alert(`Cannot delete ${name}: This waiter has order history.`);
    return;
  }

  if (!confirm(`Are you sure you want to delete ${name}?`)) return;

  state.waiters = state.waiters.filter(w => w !== name);
  await saveState();
  if (state.currentOrderFlow.waiterName === name) {
    state.currentOrderFlow.waiterName = '';
    document.getElementById('selected-waiter-name').value = '';
    document.getElementById('waiter-search-input').value = '';
  }
  renderWaiters(document.getElementById('waiter-search-input').value);
  showToast(`Deleted ${name}`);
}

window.selectWaiter = function (name) {
  state.currentOrderFlow.waiterName = name;
  document.getElementById('selected-waiter-name').value = name;
  document.getElementById('waiter-search-input').value = name;
  renderWaiters(name);
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
  const cats = ['All', 'Veg', 'Non-Veg', ...CATEGORIES];
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

  if (category && category !== 'All') {
    if (category === 'Veg') items = items.filter(m => m.type === 'Veg');
    else if (category === 'Non-Veg') items = items.filter(m => m.type === 'Non-Veg');
    else items = items.filter(m => m.category === category);
  }

  container.innerHTML = items.map(m => {
    const qty = state.currentOrderFlow.items[m.id] || 0;

    // Icon fallback based on category
    let emoji = '🍽️'; // Default

    const cat = (m.category || '').toLowerCase();

    if (cat.includes('tandoori')) emoji = '🔥';
    else if (cat.includes('starter')) emoji = '🥗';
    else if (cat.includes('soup')) emoji = '🍲';
    else if (cat.includes('biryani')) emoji = '🍛';
    else if (cat.includes('rice') || cat.includes('noodle')) emoji = '🍜';
    else if (cat.includes('bread')) emoji = '🫓';
    else if (cat.includes('beverage') || cat.includes('drink')) emoji = '🥤';
    else if (cat.includes('veg')) emoji = '🌿';
    else if (cat.includes('non-veg')) emoji = '🥩';
    else if (cat.includes('dessert')) emoji = '🍰';
    else if (cat.includes('curry')) emoji = '🍛';

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
  const { tableNumber, waiterName, items, editingOrderId } = state.currentOrderFlow;
  const entries = Object.entries(items);
  if (entries.length === 0) { showToast('Add items first'); return; }

  const confirmMsg = editingOrderId
    ? "Are you sure? Items added to this order cannot be cancelled once sent."
    : "Are you sure? Items sent to the kitchen can't be cancelled. Are you sure?";

  if (!window.confirm(confirmMsg)) return;

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
      waiterName,
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
  state.currentOrderFlow = { tableNumber: o.tableNumber, waiterName: o.waiterName || '', items: {}, editingOrderId: id };
  openItemSelection();
}


// ==========================================
// MENU CONFIG
// ==========================================
let editingMenuId = null;
let currentMenuCategory = 'All';

function renderMenuPage() {
  const searchInput = document.getElementById('menu-search');
  const q = searchInput ? searchInput.value.toLowerCase() : '';
  const list = document.getElementById('menu-list');
  if (!list) return;

  let items = state.menu || [];

  if (q) items = items.filter(i => i.name.toLowerCase().includes(q));

  if (currentMenuCategory !== 'All') {
    if (currentMenuCategory === 'Veg') items = items.filter(m => m.type === 'Veg');
    else if (currentMenuCategory === 'Non-Veg') items = items.filter(m => m.type === 'Non-Veg');
    else items = items.filter(i => i.category === currentMenuCategory);
  }

  document.getElementById('menu-count-badge').textContent = `${items.length} Items`;

  renderMenuCategories();

  list.innerHTML = items.map(m => {
    // Emoji fallback
    let emoji = '🍽️'; // All / Default

    const cat = (m.category || '').toLowerCase();

    if (cat.includes('tandoori')) emoji = '🔥';        // Tandoori Starter
    else if (cat.includes('starter')) emoji = '🥗';     // Starter
    else if (cat.includes('soup')) emoji = '🍲';        // Soup
    else if (cat.includes('biryani')) emoji = '🍛';     // Biryani
    else if (cat.includes('rice') || cat.includes('noodle')) emoji = '🍜'; // Rice & Noodles
    else if (cat.includes('bread')) emoji = '🫓';       // Breads
    else if (cat.includes('drink') || cat.includes('beverage')) emoji = '🥤'; // Beverage
    else if (cat.includes('veg')) emoji = '🌿';         // Veg
    else if (cat.includes('non-veg')) emoji = '🥩';     // Non-Veg
    else if (cat.includes('dessert')) emoji = '🍰';     // Dessert
    else if (cat.includes('curry') || cat.includes('course')) emoji = '🍛'; // Curry

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

function renderMenuCategories() {
  const container = document.getElementById('menu-cat-pills');
  if (!container) return;

  const cats = ['All', 'Veg', 'Non-Veg', ...CATEGORIES];
  container.innerHTML = cats.map(c =>
    `<div class="pill-option ${currentMenuCategory === c ? 'active' : ''}" 
          style="font-size:13px; padding:6px 16px; border-radius:16px; flex-shrink:0;" 
          onclick="selectMenuCategory('${c}')">${c}</div>`
  ).join('');
}

window.selectMenuCategory = function (cat) {
  currentMenuCategory = cat;
  renderMenuPage();
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

  // Toggle delete button visibility
  const delBtn = document.getElementById('btn-delete-menu-item');
  if (delBtn) delBtn.style.display = id ? 'block' : 'none';

  showScreen('screen-menu-form');
}

window.setMenuFormCat = function (el, val) {
  document.querySelectorAll('#form-item-category-pills .pill-option').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('form-item-category-pills').dataset.val = val;
}

window.setDietToggle = function (type) {
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

  const confirmMsg = editingMenuId
    ? "Are you sure you want to save changes to this menu item?"
    : "Are you sure you want to add this new item to the menu?";

  if (!window.confirm(confirmMsg)) return;

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

function deleteMenuItem() {
  if (!editingMenuId) return;

  const m = getMenuItemById(editingMenuId);
  const confirmMsg = `Are you sure you want to delete "${m ? m.name : 'this item'}" from the menu? This cannot be undone.`;

  if (!window.confirm(confirmMsg)) return;

  state.menu = state.menu.filter(item => item.id !== editingMenuId);

  saveState();
  hideScreen('screen-menu-form');
  renderMenuPage();
  showToast('Item deleted from menu');
}

// ==========================================
// ANALYTICS
// ==========================================
let selectedDate = new Date();

function renderAnalytics() {
  const paidOrders = state.orders.filter(o => o.paid);

  // 1. Day Metrics (for selectedDate)
  const selDayStr = selectedDate.toDateString();
  const selDayOrders = paidOrders.filter(o => new Date(o.createdAt).toDateString() === selDayStr);
  const selDayRevenue = selDayOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);

  // 2. Month Metrics (for selectedDate's month)
  const selMonth = selectedDate.getMonth();
  const selYear = selectedDate.getFullYear();
  const monthOrders = paidOrders.filter(o => {
    const d = new Date(o.createdAt);
    return d.getMonth() === selMonth && d.getFullYear() === selYear;
  });
  const monthRevenue = monthOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);

  // 3. Global Metrics
  const totalRevenue = paidOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
  const avgOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

  // Update UI
  document.getElementById('metric-orders').textContent = selDayOrders.length;
  document.getElementById('metric-revenue').textContent = formatPrice(selDayRevenue);
  document.getElementById('metric-month-revenue').textContent = formatPrice(monthRevenue);
  document.getElementById('metric-aov').textContent = formatPrice(avgOrderValue);
  document.getElementById('metric-total-revenue').textContent = formatPrice(totalRevenue);

  // Updated Month/Year Header
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  document.getElementById('cal-month-text').textContent = months[selMonth];
  document.getElementById('cal-year-text').textContent = selYear;

  // Most Ordered (Item) - Only from paid orders (All-time or could be specific to selected date/month, sticking to all-time for consistency)
  let counts = {};
  paidOrders.forEach(o => o.items.forEach(i => counts[i.menuItemId] = (counts[i.menuItemId] || 0) + i.qty));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  if (top) {
    const mi = getMenuItemById(parseInt(top[0]));
    if (mi) {
      document.getElementById('mo-name').textContent = mi.name;
      document.getElementById('mo-count').textContent = `${top[1]} ordered`;
      document.getElementById('mo-progress').style.width = Math.min((top[1] / 20) * 100, 100) + '%';
    }
  } else {
    document.getElementById('mo-name').textContent = '--';
    document.getElementById('mo-count').textContent = '0 ordered';
    document.getElementById('mo-progress').style.width = '0%';
  }

  // Calendar render (Live for current month)
  const grid = document.getElementById('cal-grid-content');
  let html = '';
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => html += `<div class="cal-day-name">${d}</div>`);

  // Calculate first day and days in month
  const firstDay = new Date(selYear, selMonth, 1).getDay();
  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
  const today = new Date();

  // Padding
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

  // Days
  for (let i = 1; i <= daysInMonth; i++) {
    const isToday = today.getDate() === i && today.getMonth() === selMonth && today.getFullYear() === selYear;
    const isSelected = selectedDate.getDate() === i && selectedDate.getMonth() === selMonth && selectedDate.getFullYear() === selYear;

    html += `<div class="cal-day ${isToday ? 'today' : ''} ${isSelected ? 'active' : ''}" 
                  onclick="selectAnalyticsDate(${i})">${i}</div>`;
  }
  grid.innerHTML = html;

  // 4. Waiter Performance (Selected Month)
  const waiterList = document.getElementById('waiter-performance-list');
  if (waiterList) {
    const waiterCounts = {};

    // Group monthly orders by waiterName
    monthOrders.forEach(o => {
      const name = o.waiterName || 'Unknown';
      waiterCounts[name] = (waiterCounts[name] || 0) + 1;
    });

    const topWaiters = Object.entries(waiterCounts).sort((a, b) => b[1] - a[1]);

    if (topWaiters.length > 0) {
      waiterList.innerHTML = topWaiters.map(([name, count]) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:10px; border-bottom:1px solid var(--border);">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:50%; background:var(--primary-soft); display:flex; align-items:center; justify-content:center; font-size:16px;">👤</div>
            <div>
              <div style="font-weight:700; color:var(--text-primary); font-size:15px;">${name}</div>
              <div style="font-size:12px; color:var(--text-muted);">This Month</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:16px; font-weight:800; color:var(--success);">${count}</div>
            <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Orders</div>
          </div>
        </div>
      `).join('');
    } else {
      waiterList.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:14px;">No completed orders for this month yet.</div>`;
    }
  }
}

window.selectAnalyticsDate = function (day) {
  selectedDate.setDate(day);
  renderAnalytics();
}

// Month Navigation
window.changeAnalyticsMonth = function (delta) {
  selectedDate.setMonth(selectedDate.getMonth() + delta);
  renderAnalytics();
}


// ==========================================
// SPLASH SCREEN & TYPEWRITER
// ==========================================
function startSplashScreen() {
  const text = "ManageResto is a restaurant management application designed for waiters, managers, and owners to streamline daily operations.";
  const container = document.getElementById('typewriter-text');
  const progressBar = document.getElementById('splash-bar');
  let i = 0;

  function type() {
    if (i < text.length) {
      container.textContent += text.charAt(i);
      i++;
      setTimeout(type, 35);
    }
  }

  // Start typing
  type();

  // Progress Bar Animation (10 seconds)
  const duration = 10000;
  const interval = 100;
  let elapsed = 0;

  const progressInterval = setInterval(() => {
    elapsed += interval;
    const progress = Math.min((elapsed / duration) * 100, 100);
    progressBar.style.width = `${progress}%`;

    if (elapsed >= duration) {
      clearInterval(progressInterval);
      const splash = document.getElementById('splash-screen');
      splash.classList.add('fade-out');
      setTimeout(() => splash.remove(), 800);
    }
  }, interval);
}

// Theme Toggle
async function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

// INIT
document.addEventListener('DOMContentLoaded', async () => {
  startSplashScreen();
  await initTheme();
  loadState();

  // Navigation
  navigateTo('orders');

  document.getElementById('nav-orders').addEventListener('click', () => navigateTo('orders'));
  document.getElementById('nav-menu').addEventListener('click', () => navigateTo('menu'));
  document.getElementById('nav-analytics').addEventListener('click', () => navigateTo('analytics'));
  document.getElementById('nav-profile').addEventListener('click', () => navigateTo('profile'));
  document.getElementById('side-profile').addEventListener('click', () => navigateTo('profile'));

  document.getElementById('btn-new-order').addEventListener('click', openNewOrder);
  document.getElementById('btn-back-table').addEventListener('click', () => hideScreen('screen-table'));
  document.getElementById('btn-proceed-table-arrow').addEventListener('click', proceedToTable);

  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

  const waiterSearch = document.getElementById('waiter-search-input');
  if (waiterSearch) {
    waiterSearch.addEventListener('input', (e) => renderWaiters(e.target.value));
    waiterSearch.addEventListener('focus', () => {
      if (waiterSearch.value === state.currentOrderFlow.waiterName) {
        renderWaiters(''); // Show all on focus if already selected
      }
    });
  }

  const btnAddWaiter = document.getElementById('btn-add-waiter');
  if (btnAddWaiter) {
    btnAddWaiter.addEventListener('click', addNewWaiter);
  }

  document.getElementById('btn-back-items').addEventListener('click', () => hideScreen('screen-items'));
  document.getElementById('btn-send-kitchen').addEventListener('click', sendToKitchen);
  document.getElementById('order-item-search').addEventListener('input', e => {
    renderOrderItems(e.target.value, document.getElementById('order-cat-pills').dataset.active);
  });

  document.getElementById('btn-add-menu-item').addEventListener('click', () => openMenuForm());
  document.getElementById('btn-back-menu-form').addEventListener('click', () => hideScreen('screen-menu-form'));
  document.getElementById('menu-form-btn').addEventListener('click', saveMenuItem);
  document.getElementById('btn-delete-menu-item').addEventListener('click', deleteMenuItem);
  document.getElementById('menu-search').addEventListener('input', renderMenuPage);

  document.getElementById('diet-veg').addEventListener('click', () => setDietToggle('Veg'));
  document.getElementById('diet-nonveg').addEventListener('click', () => setDietToggle('Non-Veg'));
});
