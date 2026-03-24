require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Should be in .env

const http = require('http');
const { Server } = require('socket.io');

const app = express();

const server = http.createServer(app);

// SSE Clients Tracking: Map<userId, res[]>
const sseClients = new Map();

const corsOptions = {
  origin: function (origin, callback) {
    // Allow all origins — frontend can be hosted on Vercel, GitHub Pages, etc.
    callback(null, true);
  },
  credentials: true
};

// Socket.IO MUST be attached before Express so it handles /socket.io/ paths first
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] },
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Express handles non-socket.io requests automatically via http.createServer(app)

const PORT = process.env.PORT || 3000;

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));

// --- Database Config ---
// .trim() on every value guards against copy-paste newlines in Render env vars
const DB_NAME     = (process.env.DB_NAME     || 'manageresto').trim();
const DB_USER     = (process.env.DB_USER     || 'root').trim();
const DB_PASSWORD = (process.env.DB_PASSWORD || '').trim();
const DB_HOST     = (process.env.DB_HOST     || 'localhost').trim();
const DB_PORT     = parseInt((process.env.DB_PORT || '3306').trim(), 10);

console.log(`🔌 Connecting to DB: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);

// --- Models ---
const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql',
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
});
const User = sequelize.define('User', {
  restaurantName: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  mobile: { type: DataTypes.STRING, unique: true, allowNull: false },
  location: { type: DataTypes.STRING },
  password: { type: DataTypes.STRING, allowNull: false },
  migrated: { type: DataTypes.BOOLEAN, defaultValue: false }
});

const Category = sequelize.define('Category', {
  name: { type: DataTypes.STRING, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false }
});

const MenuItem = sequelize.define('MenuItem', {
  frontendId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  name: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  type: { type: DataTypes.ENUM('Veg', 'Non-Veg'), defaultValue: 'Veg' },
  image: { type: DataTypes.STRING },
  categoryId: { type: DataTypes.INTEGER },
  available: { type: DataTypes.BOOLEAN, defaultValue: true },
  userId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  indexes: [ { unique: true, fields: ['userId', 'frontendId'] } ]
});

const Waiter = sequelize.define('Waiter', {
  name: { type: DataTypes.STRING, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false }
});

const Order = sequelize.define('Order', {
  frontendId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  tableNumber: { type: DataTypes.STRING, allowNull: false },
  waiterName: { type: DataTypes.STRING }, // Storing name for history
  paid: { type: DataTypes.BOOLEAN, defaultValue: false },
  totalAmount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  userId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  indexes: [ { unique: true, fields: ['userId', 'frontendId'] } ]
});

const OrderItem = sequelize.define('OrderItem', {
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  menuItemId: { type: DataTypes.INTEGER, allowNull: false },
  qty: { type: DataTypes.INTEGER, defaultValue: 1 },
  status: { type: DataTypes.ENUM('Preparing', 'Prepared', 'Served'), defaultValue: 'Preparing' },
  priceAtTime: { type: DataTypes.DECIMAL(10, 2) }, // Snapshotted price
  note: { type: DataTypes.STRING }
});

// OTP Model for Password Reset
const PasswordResetOTP = sequelize.define('PasswordResetOTP', {
  identifier: { type: DataTypes.STRING, unique: true, allowNull: false }, // Email or Mobile
  otp: { type: DataTypes.STRING, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false }
});

// Legacy model for migration
const RestoState = sequelize.define('RestoState', {
  userId: { type: DataTypes.INTEGER, unique: true },
  menu: { 
    type: DataTypes.TEXT('long'),
    get() { const val = this.getDataValue('menu'); return val ? JSON.parse(val) : []; },
    set(val) { this.setDataValue('menu', JSON.stringify(val)); }
  },
  orders: { 
    type: DataTypes.TEXT('long'),
    get() { const val = this.getDataValue('orders'); return val ? JSON.parse(val) : []; },
    set(val) { this.setDataValue('orders', JSON.stringify(val)); }
  },
  waiters: { 
    type: DataTypes.TEXT('long'),
    get() { const val = this.getDataValue('waiters'); return val ? JSON.parse(val) : []; },
    set(val) { this.setDataValue('waiters', JSON.stringify(val)); }
  },
  categories: {
    type: DataTypes.TEXT('long'),
    get() { const val = this.getDataValue('categories'); return val ? JSON.parse(val) : []; },
    set(val) { this.setDataValue('categories', JSON.stringify(val)); }
  },
  nextOrderId: { type: DataTypes.INTEGER },
  nextMenuId: { type: DataTypes.INTEGER }
});

sequelize.authenticate()
  .then(() => console.log('✅ Database connected'))
  .catch(err => console.error('❌ DB connection error:', err.message));

// Sync Database (table creation/migration) — errors here are logged but don't kill the server
// Removed duplicate sync

// Prevent unhandled DB errors from killing the process
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled rejection (server staying up):', reason?.message || reason);
});

// Relationships
User.hasMany(Category, { foreignKey: 'userId' });
User.hasMany(MenuItem, { foreignKey: 'userId' });
User.hasMany(Waiter, { foreignKey: 'userId' });
User.hasMany(Order, { foreignKey: 'userId' });

Category.hasMany(MenuItem, { foreignKey: 'categoryId' });
MenuItem.belongsTo(Category, { foreignKey: 'categoryId' });

Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });
OrderItem.belongsTo(MenuItem, { foreignKey: 'menuItemId' });

// Sync Database
// --- Migration Helper ---
async function migrateUser(userId) {
  const t = await sequelize.transaction();
  try {
    const user = await User.findByPk(userId, { transaction: t });
    if (!user || user.migrated) {
      await t.rollback();
      return;
    }

    console.log(`🔍 Starting high-speed migration for User ${userId}...`);
    const state = await RestoState.findOne({ where: { userId }, transaction: t });
    if (!state) {
      await user.update({ migrated: true }, { transaction: t });
      await t.commit();
      return;
    }

    const { menu = [], orders = [], waiters = [] } = state;
    console.log(`📊 Migrating: ${menu.length} items, ${orders.length} orders, ${waiters.length} waiters`);

    // 1. Categories
    const categoryNames = [...new Set(menu.map(i => i.category).filter(Boolean))];
    const categoryMap = new Map();
    for (const name of categoryNames) {
      const [cat] = await Category.findOrCreate({ where: { name, userId }, transaction: t });
      categoryMap.set(name, cat.id);
    }

    // 2. Menu Items (Bulk)
    if (menu.length > 0) {
      const menuData = menu.map(item => ({
        frontendId: item.id,
        userId,
        name: item.name,
        price: item.price,
        type: item.type,
        image: item.image,
        categoryId: categoryMap.get(item.category) || null
      }));
      await MenuItem.bulkCreate(menuData, { ignoreDuplicates: true, transaction: t });
    }

    // 3. Waiters (Bulk)
    if (waiters.length > 0) {
      const waiterData = waiters.filter(Boolean).map(name => ({ name, userId }));
      await Waiter.bulkCreate(waiterData, { ignoreDuplicates: true, transaction: t });
    }

    // 4. Orders & Items (Optimized)
    if (orders.length > 0) {
      // Get all menu items for mapping
      const allMenuItems = await MenuItem.findAll({ where: { userId }, transaction: t });
      const itemMap = new Map(allMenuItems.map(m => [m.frontendId, m.id]));

      for (const o of orders) {
        const [order, created] = await Order.findOrCreate({
          where: { frontendId: o.id, userId },
          defaults: {
            tableNumber: o.tableNumber,
            waiterName: o.waiterName,
            paid: o.paid,
            totalAmount: 0, // Will calculate if needed
            createdAt: o.createdAt
          },
          transaction: t
        });

        if (created && o.items && o.items.length > 0) {
          const orderItemsData = o.items.map(item => {
            const dbItemId = itemMap.get(item.menuItemId);
            if (!dbItemId) return null;
            return {
              orderId: order.id,
              menuItemId: dbItemId,
              qty: item.qty,
              status: item.status || 'Served',
              priceAtTime: 0 // Snapshot if needed
            };
          }).filter(Boolean);

          if (orderItemsData.length > 0) {
            await OrderItem.bulkCreate(orderItemsData, { transaction: t });
          }
        }
      }
    }

    await user.update({ migrated: true }, { transaction: t });
    await t.commit();
    console.log(`✅ Migration for User ${userId} complete!`);
  } catch (error) {
    await t.rollback();
    console.error(`❌ Migration failed for User ${userId}:`, error.message);
  }
}

// Request logger middleware
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Sync Database (moved to startServer)

// Socket.io Connection
io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    socket.join(`restaurant:${userId}`);
    console.log(`🔌 Socket joined room: restaurant:${userId}`);
  });
});

// Lightweight health check for Render port-scan
app.get("/", (req, res) => {
  res.status(200).send("ManageResto Backend Active");
});

app.get("/health", (req, res) => res.status(200).json({ status: 'ok' }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "1.2-atomic-sync", socketReady: true });
});

app.get("/favicon.ico", (req, res) => res.sendFile(path.join(__dirname, "backend_icon.svg")));

// --- Auth Endpoints ---
app.post('/api/signup', async (req, res) => {
  try {
    const { restaurantName, email, mobile, location, password } = req.body;
    const existing = await User.findOne({ where: { [Sequelize.Op.or]: [{ email }, { mobile }] } });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ restaurantName, email, mobile, location, password: hashedPassword });

    // Seed initial categories
    const { CATEGORIES } = require('./data.js');
    for (const catName of CATEGORIES) {
      await Category.create({ name: catName, userId: user.id });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user.id, restaurantName, email, mobile, location } });
  } catch (error) {
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    const user = await User.findOne({ where: { [Sequelize.Op.or]: [{ email: login }, { mobile: login }] } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check for migration
    await migrateUser(user.id);

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user.id, restaurantName: user.restaurantName, email: user.email, mobile: user.mobile, location: user.location } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- Forgot Password Endpoints ---
const https = require('https');

// Resend API Helper Function (No SMTP needed, works on Render)
const sendResendEmail = (to, otp) => {
  return new Promise((resolve, reject) => {
    if (!process.env.RESEND_API_KEY) {
      console.log(`📡 Resend API Key missing. Skipping email, OTP is: ${otp}`);
      return resolve(true); 
    }

    const data = JSON.stringify({
      from: 'ManageResto <onboarding@resend.dev>',
      to: [to],
      subject: 'Your OTP for Password Reset',
      html: `
        <div style="font-family: sans-serif; padding: 20px; text-align: center;">
          <h2 style="color: #871f28;">ManageResto</h2>
          <p>Your One-Time Password (OTP) to reset your password is:</p>
          <div style="font-size: 32px; font-weight: bold; color: #1a1616; padding: 10px; border: 1px solid #ddd; display: inline-block;">
            ${otp}
          </div>
          <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">This OTP will expire in 10 minutes.</p>
        </div>
      `
    });

    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(responseBody));
        } else {
          reject(new Error(`Resend Error (${res.statusCode}): ${responseBody}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
};

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body;
    const user = await User.findOne({ where: { [Sequelize.Op.or]: [{ email: identifier }, { mobile: identifier }] } });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 mins

    await PasswordResetOTP.upsert({ identifier, otp, expiresAt }, { where: { identifier } });

    console.log(`🔑 OTP for ${identifier}: ${otp}`);
    console.log(`📤 Attempting to send OTP via Resend API to: ${user.email}...`);

    try {
      const result = await sendResendEmail(user.email, otp);
      console.log(`✅ Email sent successfully via Resend. ID: ${result.id || 'N/A'}`);
    } catch (err) {
      console.error(`❌ Resend API failed for ${user.email}:`, err.message);
    }

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/verify-otp', async (req, res) => {
  try {
    const { identifier, otp } = req.body;
    const record = await PasswordResetOTP.findOne({ where: { identifier, otp } });

    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { identifier, otp, newPassword } = req.body;
    
    // Verify OTP again for safety
    const record = await PasswordResetOTP.findOne({ where: { identifier, otp } });
    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Session expired' });
    }

    const user = await User.findOne({ where: { [Sequelize.Op.or]: [{ email: identifier }, { mobile: identifier }] } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedPassword });

    // Clean up OTP
    await PasswordResetOTP.destroy({ where: { identifier } });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Reset failed' });
  }
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

// --- Relational API Endpoints ---
const mapStateOutput = (categories, menu, waiters, orders) => {
  const formattedMenu = menu.map(m => {
    const cat = categories.find(c => c.id === m.categoryId);
    return {
      id: m.frontendId,
      name: m.name,
      price: m.price,
      type: m.type,
      image: m.image,
      category: cat ? cat.name : 'Uncategorized',
      available: m.available
    };
  });

  const formattedOrders = orders.map(o => ({
    id: o.frontendId,
    tableNumber: o.tableNumber,
    waiterName: o.waiterName,
    paid: o.paid,
    createdAt: o.createdAt,
    items: o.items.map(i => ({
      menuItemId: i.MenuItem ? i.MenuItem.frontendId : i.menuItemId,
      qty: i.qty,
      status: i.status,
      priceAtTime: i.priceAtTime
    }))
  }));

  return {
    menu: formattedMenu,
    categories: categories.map(c => c.name),
    waiters: waiters.map(w => w.name),
    orders: formattedOrders,
    nextOrderId: formattedOrders.length > 0 ? Math.max(...formattedOrders.map(o => o.id)) + 1 : 1,
    nextMenuId: formattedMenu.length > 0 ? Math.max(...formattedMenu.map(m => m.id)) + 1 : 100
  };
};

// SSE Endpoint for real-time sync
app.get('/api/sync/events', authenticateToken, (req, res) => {
  const userId = req.user.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Add to tracking
  if (!sseClients.has(userId)) sseClients.set(userId, []);
  sseClients.get(userId).push(res);

  console.log(`🔌 SSE Connected: User ${userId} (Total: ${sseClients.get(userId).length})`);

  // Send initial connected message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Heartbeat to keep connection alive on Render (every 25s)
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const clients = sseClients.get(userId) || [];
    const index = clients.indexOf(res);
    if (index !== -1) clients.splice(index, 1);
    if (clients.length === 0) sseClients.delete(userId);
    console.log(`❌ SSE Disconnected: User ${userId}`);
  });
});

// Update broadcast helper
function broadcastState(userId, state) {
  const clients = sseClients.get(userId);
  if (clients) {
    const data = JSON.stringify({ type: 'stateUpdated', state });
    clients.forEach(client => {
      client.write(`data: ${data}\n\n`);
    });
  }
}

// Get Status (Legacy/Fallback)
app.get('/api/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`🔍 [Status Check] User ${userId} requested status`);
    // We use the User model's updatedAt as a version stamp
    const user = await User.findByPk(userId, { attributes: ['updatedAt'] });
    res.json({ lastUpdated: user.updatedAt });
  } catch (error) {
    console.error('Status Error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

// --- Sync API Endpoints ---
// Get State (Full snapshot from RestoState)
app.get('/api/state', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    let state = await RestoState.findOne({ where: { userId } });
    
    if (!state) {
      // Fallback: If no RestoState, try to generate it from relational data (migration)
      const categories = await Category.findAll({ where: { userId } });
      const menu = await MenuItem.findAll({ where: { userId } });
      const waiters = await Waiter.findAll({ where: { userId } });
      const orders = await Order.findAll({
        where: { userId },
        include: [{ model: OrderItem, as: 'items', include: [MenuItem] }],
        order: [['createdAt', 'DESC']]
      });
      
      const initialData = mapStateOutput(categories, menu, waiters, orders);
      state = await RestoState.create({
        userId,
        menu: initialData.menu,
        orders: initialData.orders,
        waiters: initialData.waiters,
        nextOrderId: initialData.nextOrderId,
        nextMenuId: initialData.nextMenuId,
        categories: initialData.categories
      });
    }
    
    res.json(state);
  } catch (error) {
    console.error('Fetch State Error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

// Global Sync Lock – prevents concurrent DB writes for the same user
const saveLocks = new Map();

// SSE Broadcast utility
// Update State (Atomic update to RestoState)
app.post('/api/state', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { menu, orders, nextOrderId, nextMenuId, waiters, categories } = req.body;

    let state = await RestoState.findOne({ where: { userId } });
    if (!state) {
      state = await RestoState.create({ userId });
    }

    // Atomic update of the JSON fields
    const updates = {};
    if (menu !== undefined) updates.menu = menu;
    if (orders !== undefined) updates.orders = orders;
    if (nextOrderId !== undefined) updates.nextOrderId = nextOrderId;
    if (nextMenuId !== undefined) updates.nextMenuId = nextMenuId;
    if (waiters !== undefined) updates.waiters = waiters;
    if (categories !== undefined) updates.categories = categories;

    // Use a lock to prevent concurrent saves for the same user
    if (saveLocks.get(userId)) {
      return res.status(429).json({ error: 'Update already in progress' });
    }
    saveLocks.set(userId, true);

    try {
      await state.update(updates);
    } finally {
      saveLocks.delete(userId);
    }

    // Convert to plan object before broadcasting to save memory/time
    const stateObj = state.toJSON();

    // ✅ Broadcast to all devices via SSE
    broadcastState(userId, stateObj);

    // ✅ Single source of truth event (Legacy sockets)
    io.to(`restaurant:${userId}`).emit('stateUpdated', stateObj);

    res.json({ success: true, state: stateObj });

    // 🚀 Background Task: Sync back to relational DB for analytics/reliability
    // This happens asynchronously so the client doesn't wait
    setImmediate(async () => {
      try {
        // Simple logic to keep relational DB in sync if needed
        // For now, we prioritize the JSON RestoState for the client's "syncing" request
      } catch (e) { console.error('Background Sync Error:', e); }
    });

  } catch (error) {
    console.error('Update State Error:', error);
    res.status(500).json({ error: 'Failed to update state' });
  }
});

// 404 handler – must be AFTER all routes
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler – catches errors thrown in route handlers
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function patchSchema() {
  console.log('🩹 Checking for missing columns...');
  try {
    // Add 'categories' to RestoStates if missing
    try { 
      await sequelize.query("ALTER TABLE `RestoStates` ADD COLUMN `categories` LONGTEXT;"); 
      console.log('✅ Added categories to RestoStates'); 
    } catch(e) { /* ignore if already exists */ }
    
    // Add 'note' to OrderItems if missing
    try { 
      await sequelize.query("ALTER TABLE `OrderItems` ADD COLUMN `note` VARCHAR(255);"); 
      console.log('✅ Added note to OrderItems'); 
    } catch(e) { }

    // Add 'available' to MenuItems if missing
    try { 
      await sequelize.query("ALTER TABLE `MenuItems` ADD COLUMN `available` TINYINT(1) DEFAULT 1;"); 
      console.log('✅ Added available to MenuItems'); 
    } catch(e) { }

  } catch (err) {
    console.warn('⚠️ Patch error:', err.message);
  }
}

async function startServer() {
  try {
    console.log('🔄 Syncing database (Safe mode)...');
    // sync() without alter:true is safe. It creates tables that don't exist yet.
    await sequelize.sync();
    
    // Manually add missing columns that syncing might miss/fail on
    await patchSchema();
    
    console.log('✅ Database schema ready!');
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`📡 ManageResto Scaled Backend v1.2 Running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
  }
}

startServer();
