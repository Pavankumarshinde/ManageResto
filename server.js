require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());



// MySQL Connection using Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      connectTimeout: 10000 // 10 seconds timeout for better error reporting on Render
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
  .then(() => console.log('MySQL Database & tables synced!'))
  .catch(err => console.error('MySQL connection/sync error:', err));

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
