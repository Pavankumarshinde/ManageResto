require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Should be in .env

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Global Error Handler for JSON parsing
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('❌ JSON Parsing Error:', err.message);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  next();
});

// Debug Middleware: Log all requests
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Validate Environment Variables
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error('❌ CRITICAL ERROR: Missing required environment variables:', missingVars.join(', '));
  console.error('Please ensure these are set in your Render dashboard or .env file.');
} else {
  console.log(`📡 Attempting to connect to DB at: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
}

// MySQL Connection using Sequelize
const sequelize = new Sequelize(
  (process.env.DB_NAME || '').trim(),
  (process.env.DB_USER || '').trim(),
  (process.env.DB_PASSWORD || '').trim(),
  {
    host: (process.env.DB_HOST || '').trim(),
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      connectTimeout: 10000,
      ssl: {
        rejectUnauthorized: false
      }
    }
  }
);

// Define User Model
const User = sequelize.define('User', {
  restaurantName: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  mobile: { type: DataTypes.STRING, unique: true, allowNull: false },
  location: { type: DataTypes.STRING },
  password: { type: DataTypes.STRING, allowNull: false }
});

// Define RestoState Model
const RestoState = sequelize.define('RestoState', {
  userId: { 
    type: DataTypes.INTEGER,
    unique: true, // Every user has exactly one state
    references: { model: User, key: 'id' }
  },
  menu: {
    type: DataTypes.TEXT('long'),
    get() {
      const val = this.getDataValue('menu');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('menu', JSON.stringify(val));
    }
  },
  orders: {
    type: DataTypes.TEXT('long'),
    get() {
      const val = this.getDataValue('orders');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('orders', JSON.stringify(val));
    }
  },
  waiters: {
    type: DataTypes.TEXT('long'),
    get() {
      const val = this.getDataValue('waiters');
      return val ? JSON.parse(val) : [];
    },
    set(val) {
      this.setDataValue('waiters', JSON.stringify(val));
    }
  },
  nextOrderId: { type: DataTypes.INTEGER, defaultValue: 1 },
  nextMenuId: { type: DataTypes.INTEGER, defaultValue: 100 }
});

// Define Associations
User.hasOne(RestoState, { foreignKey: 'userId', onDelete: 'CASCADE' });
RestoState.belongsTo(User, { foreignKey: 'userId' });

// Sync Database
sequelize.sync({ alter: true })
  .then(async () => {
    console.log('✅ MySQL Database & tables synced!');

    try {
      let state = await RestoState.findOne({ order: [['id', 'DESC']] });
      const menuIsEmpty = !state || (Array.isArray(state.menu) && state.menu.length === 0);

      if (menuIsEmpty) {
        console.log('🌱 Seeding initial state because menu is empty...');
        let initialMenu = [];
        try {
          const data = require('./data.js');
          initialMenu = data.DEFAULT_MENU || [];
          initialWaiters = data.WAITERS || [];
          console.log(`📦 Loaded ${initialMenu.length} items and ${initialWaiters.length} waiters from data.js`);
        } catch (e) {
          console.error('❌ Could not load data.js:', e.message);
        }

        if (initialMenu.length > 0) {
          if (!state) {
            state = await RestoState.create({
              menu: initialMenu,
              orders: [],
              waiters: initialWaiters,
              nextOrderId: 1,
              nextMenuId: 100 + initialMenu.length
            });
          } else {
            console.log('🔄 Updating existing empty record (ID: ' + state.id + ') with default menu');
            state.menu = initialMenu;
            if (initialWaiters.length > 0) state.waiters = initialWaiters;
            state.nextMenuId = 100 + initialMenu.length;
            await state.save();
          }
          console.log('✅ Seeding complete.');
        } else {
          console.log('⚠️ No items to seed.');
        }
      } else {
        console.log(`📊 Database already has ${state.menu.length} menu items.`);
      }
    } catch (dbErr) {
      console.error('❌ Error during seeding check:', dbErr.message);
    }
  })
  .catch(err => {
    console.error('❌ MySQL connection/sync error:', err.name, err.message);
    if (err.parent) console.error('Parent Error:', err.parent.message);
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
        <h1>ManageResto Backend v7</h1>
        <p>Final Auth Fix - System Ready</p>
      </body>
    </html>
  `);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "7.0", timestamp: new Date() });
});

app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "backend_icon.svg"));
});

app.get("/favicon.png", (req, res) => {
  res.sendFile(path.join(__dirname, "favicon.png")); // Keep PNG for frontend compatibility
});

// --- Auth Middleware ---
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

// --- Auth Endpoints ---
app.post('/api/signup', async (req, res) => {
  console.log('📝 Received Signup Request:', req.body);
  try {
    const { restaurantName, email, mobile, location, password } = req.body;
    
    if (!password) return res.status(400).json({ error: 'Password is required' });

    // Check if user exists
    const existing = await User.findOne({ where: { [Sequelize.Op.or]: [{ email }, { mobile }] } });
    if (existing) {
      console.log('⚠️ Signup failed: User already exists');
      return res.status(400).json({ error: 'User with this email or mobile already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ restaurantName, email, mobile, location, password: hashedPassword });
    
    console.log('✅ User created:', user.id);
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user.id, restaurantName, email, mobile, location } });
  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({ error: 'Signup failed', details: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { login, password } = req.body; // login can be email or mobile
    const user = await User.findOne({ 
      where: { [Sequelize.Op.or]: [{ email: login }, { mobile: login }] } 
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user.id, restaurantName: user.restaurantName, email: user.email, mobile: user.mobile, location: user.location } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get full state
app.get('/api/state', authenticateToken, async (req, res) => {
  try {
    let state = await RestoState.findOne({ where: { userId: req.user.id } });
    if (!state) {
      state = await RestoState.create({
        userId: req.user.id,
        menu: [],
        orders: [],
        waiters: [],
        nextOrderId: 1,
        nextMenuId: 100
      });
    }
    res.json(state);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch state' });
  }
});

// Update full state
app.post('/api/state', authenticateToken, async (req, res) => {
  try {
    const { menu, orders, nextOrderId, nextMenuId, waiters } = req.body;
    let state = await RestoState.findOne({ where: { userId: req.user.id } });
    
    if (!state) {
      state = await RestoState.create({ userId: req.user.id });
    }

    if (menu !== undefined) state.menu = menu;
    if (orders !== undefined) state.orders = orders;
    if (nextOrderId !== undefined) state.nextOrderId = nextOrderId;
    if (nextMenuId !== undefined) state.nextMenuId = nextMenuId;
    if (waiters !== undefined) state.waiters = waiters;

    await state.save();
    res.json({ success: true, state });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update state' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`ManageResto Backend v6 Running! (MySQL)`);
  console.log(`Access the API at http://localhost:${PORT}`);
  console.log(`========================================`);
});

// Catch-all for 404s
app.use((req, res) => {
  console.log(`🚫 404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found', path: req.url });
});
