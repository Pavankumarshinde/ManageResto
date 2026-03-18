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
  password: { type: DataTypes.STRING, allowNull: false }
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
  status: { type: DataTypes.ENUM('Preparing', 'Served'), defaultValue: 'Preparing' },
  priceAtTime: { type: DataTypes.DECIMAL(10, 2) } // Snapshotted price
});

// Legacy model for migration
const RestoState = sequelize.define('RestoState', {
  userId: { type: DataTypes.INTEGER, unique: true },
  menu: { type: DataTypes.TEXT('long') },
  orders: { type: DataTypes.TEXT('long') },
  waiters: { type: DataTypes.TEXT('long') },
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
  const state = await RestoState.findOne({ where: { userId } });
  if (!state) return;

  console.log(`📦 Migrating data for User ${userId}...`);

  const menu = JSON.parse(state.menu || '[]');
  const orders = JSON.parse(state.orders || '[]');
  const waiters = JSON.parse(state.waiters || '[]');

  // 1. Categories & Menu Items
  const categories = [...new Set(menu.map(item => item.category))];
  for (const catName of categories) {
    const [cat] = await Category.findOrCreate({ where: { name: catName, userId } });
    const catItems = menu.filter(item => item.category === catName);
    for (const item of catItems) {
      await MenuItem.findOrCreate({
        where: { frontendId: item.id, userId },
        defaults: {
          name: item.name,
          price: item.price,
          type: item.type,
          image: item.image,
          categoryId: cat.id
        }
      });
    }
  }

  // 2. Waiters
  for (const waiterName of waiters) {
    await Waiter.findOrCreate({ where: { name: waiterName, userId } });
  }

  // 3. Orders
  for (const o of orders) {
    const [order] = await Order.findOrCreate({
      where: { frontendId: o.id, userId },
      defaults: {
        tableNumber: o.tableNumber,
        waiterName: o.waiterName,
        paid: o.paid,
        createdAt: o.createdAt
      }
    });

    for (const item of o.items) {
      const mi = await MenuItem.findOne({ where: { frontendId: item.menuItemId, userId } });
      if (!mi) continue;
      await OrderItem.create({
        orderId: order.id,
        menuItemId: mi.id,
        qty: item.qty,
        status: item.status,
        priceAtTime: mi.price
      });
    }
  }

  // Delete legacy state after successful migration
  // await state.destroy(); 
  console.log(`✅ Migration for User ${userId} complete.`);
}

// Request logger middleware
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Sync Database
sequelize.sync({ alter: true }).then(() => {
  console.log('✅ MySQL Relational Database synced!');
});

// Socket.io Connection
io.on('connection', (socket) => {
  socket.on('join', (userId) => {
    socket.join(`restaurant:${userId}`);
    console.log(`🔌 Socket joined room: restaurant:${userId}`);
  });
});

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>ManageResto Backend</title>
        <link rel="icon" href="/favicon.ico" type="image/svg+xml">
        <style>
          body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f8f9fa; margin: 0; }
          .icon { width: 120px; height: 120px; margin-bottom: 24px; }
          h1 { color: #871f28; font-size: 24px; }
          p { color: #6c757d; }
          .status { color: #28a745; font-weight: bold; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="icon">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" rx="20" fill="#871f28"/>
            <path d="M30 30h40v10H30zM30 45h40v10H30zM30 60h40v10H30z" fill="white"/>
            <circle cx="75" cy="25" r="10" fill="#ffc107"/>
          </svg>
        </div>
        <h1>ManageResto Scaled Backend v1.0</h1>
        <p>Relational DB + WebSockets Enabled</p>
        <div class="status">● System Scalable & Ready</div>
      </body>
    </html>
  `);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "1.0-scaled", socketReady: true });
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

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
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
      category: cat ? cat.name : 'Uncategorized'
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

// Get State (Full snapshot)
app.get('/api/state', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const categories = await Category.findAll({ where: { userId } });
    const menu = await MenuItem.findAll({ where: { userId } });
    const waiters = await Waiter.findAll({ where: { userId } });
    const orders = await Order.findAll({
      where: { userId },
      include: [{ model: OrderItem, as: 'items', include: [MenuItem] }],
      order: [['createdAt', 'DESC']]
    });

    res.json(mapStateOutput(categories, menu, waiters, orders));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch state' });
  }
});

// Update Full State (Legacy compatibility - maps to relational)
app.post('/api/state', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { menu, orders, waiters } = req.body;

    if (menu && menu.length > 0) {
      const uniqueCats = [...new Set(menu.map(i => i.category))];
      const categoryMap = {};
      for (const catName of uniqueCats) {
        if (!catName) continue;
        const [cat] = await Category.findOrCreate({ where: { name: catName, userId } });
        categoryMap[catName] = cat.id;
      }

      const menuData = menu.map(item => ({
        userId,
        frontendId: item.id,
        name: item.name,
        price: item.price,
        type: item.type,
        image: item.image,
        categoryId: categoryMap[item.category]
      }));
      
      await MenuItem.bulkCreate(menuData, {
        updateOnDuplicate: ["name", "price", "type", "image", "categoryId"]
      });
    }

    if (waiters && Array.isArray(waiters)) {
      await Waiter.destroy({ where: { userId } });
      if (waiters.length > 0) {
        const waiterData = waiters.map(name => ({ name, userId }));
        await Waiter.bulkCreate(waiterData);
      }
    }

    if (orders && orders.length > 0) {
      const orderData = orders.map(o => ({
        userId,
        frontendId: o.id,
        tableNumber: o.tableNumber,
        waiterName: o.waiterName,
        paid: !!o.paid,
        createdAt: o.createdAt || new Date()
      }));

      await Order.bulkCreate(orderData, {
        updateOnDuplicate: ["tableNumber", "waiterName", "paid", "createdAt"]
      });

      const orderFrontendIds = orders.map(o => o.id);
      const dbOrders = await Order.findAll({ 
        where: { userId, frontendId: orderFrontendIds }, 
        attributes: ['id', 'frontendId'] 
      });
      
      const orderMap = {};
      const orderDbIds = [];
      dbOrders.forEach(o => { 
        orderMap[o.frontendId] = o.id; 
        orderDbIds.push(o.id);
      });

      if (orderDbIds.length > 0) {
        await OrderItem.destroy({ where: { orderId: orderDbIds } });
      }

      const dbMenuItems = await MenuItem.findAll({ 
        where: { userId }, 
        attributes: ['id', 'frontendId'] 
      });
      const menuMap = {};
      dbMenuItems.forEach(m => { menuMap[m.frontendId] = m.id; });

      const itemsToCreate = [];
      for (const o of orders) {
        const dbOrderId = orderMap[o.id];
        if (!dbOrderId || !o.items) continue;
        
        for (const item of o.items) {
          const dbMenuId = menuMap[item.menuItemId];
          if (dbMenuId) {
            itemsToCreate.push({
              orderId: dbOrderId,
              menuItemId: dbMenuId,
              qty: item.qty || 1,
              status: item.status || 'Preparing',
              priceAtTime: item.priceAtTime || 0
            });
          }
        }
      }

      if (itemsToCreate.length > 0) {
        await OrderItem.bulkCreate(itemsToCreate);
      }
    }

    // ✅ 🔥 FETCH LATEST STATE (IMPORTANT)
    const categories = await Category.findAll({ where: { userId } });
    const updatedMenu = await MenuItem.findAll({ where: { userId } });
    const updatedWaiters = await Waiter.findAll({ where: { userId } });
    const updatedOrders = await Order.findAll({
      where: { userId },
      include: [{ model: OrderItem, as: 'items', include: [MenuItem] }],
      order: [['createdAt', 'DESC']]
    });

    const fullState = mapStateOutput(categories, updatedMenu, updatedWaiters, updatedOrders);

    // ✅ 🔥 SINGLE SOURCE OF TRUTH EVENT
    io.to(`restaurant:${userId}`).emit('stateUpdated', fullState);

    res.json({ success: true });

  } catch (error) {
    console.error('Update Error:', error);
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📡 ManageResto Scaled Backend v1.0 Running on port ${PORT}`);
});
