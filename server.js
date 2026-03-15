require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// Define Model
const RestoState = sequelize.define('RestoState', {
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
  nextOrderId: { type: DataTypes.INTEGER, defaultValue: 1 },
  nextMenuId: { type: DataTypes.INTEGER, defaultValue: 100 }
});

// Sync Database
sequelize.sync()
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
          console.log(`📦 Loaded ${initialMenu.length} items from data.js`);
        } catch (e) {
          console.error('❌ Could not load data.js:', e.message);
        }
        
        if (initialMenu.length > 0) {
          if (!state) {
            state = await RestoState.create({
              menu: initialMenu,
              orders: [],
              nextOrderId: 1,
              nextMenuId: 100 + initialMenu.length
            });
          } else {
            console.log('🔄 Updating existing empty record (ID: ' + state.id + ') with default menu');
            state.menu = initialMenu;
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
  res.send("ManageResto backend running with MySQL");
});

// Get full state
app.get('/api/state', async (req, res) => {
  try {
    let state = await RestoState.findOne({ order: [['id', 'DESC']] });
    if (!state) {
      // Initialize if empty
      state = await RestoState.create({
        menu: [],
        orders: [],
        nextOrderId: 1,
        nextMenuId: 100
      });
    }
    res.json(state);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch state from MySQL' });
  }
});

// Update full state
app.post('/api/state', async (req, res) => {
  try {
    const { menu, orders, nextOrderId, nextMenuId } = req.body;

    let state = await RestoState.findOne({ order: [['id', 'DESC']] });
    if (!state) {
      state = await RestoState.create({});
    }

    if (menu !== undefined) state.menu = menu;
    if (orders !== undefined) state.orders = orders;
    if (nextOrderId !== undefined) state.nextOrderId = nextOrderId;
    if (nextMenuId !== undefined) state.nextMenuId = nextMenuId;

    await state.save();
    res.json({ success: true, state });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update state in MySQL' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`ManageResto Backend Running! (MySQL)`);
  console.log(`Access the API at http://localhost:${PORT}`);
  console.log(`========================================`);
});
