const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());

// Initialize database if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  const initialData = {
    menu: [], // Frontend will initialize with DEFAULT_MENU if empty
    orders: [],
    nextOrderId: 1,
    nextMenuId: 100
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

// Read database
function readDB() {
  const data = fs.readFileSync(DB_FILE, 'utf8');
  return JSON.parse(data);
}

// Write database
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.get("/", (req, res) => {
  res.send("ManageResto backend running");
});
// Get full state
app.get('/api/state', (req, res) => {
  try {
    const data = readDB();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read database' });
  }
});

// Update full state
app.post('/api/state', (req, res) => {
  try {
    const { menu, orders, nextOrderId, nextMenuId } = req.body;
    const currentDB = readDB();

    // Only update provided fields to match current state
    if (menu) currentDB.menu = menu;
    if (orders) currentDB.orders = orders;
    if (nextOrderId) currentDB.nextOrderId = nextOrderId;
    if (nextMenuId) currentDB.nextMenuId = nextMenuId;

    writeDB(currentDB);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to write database' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`ManageResto Backend Running!`);
  console.log(`Access the API at http://localhost:${PORT}`);
  console.log(`Other devices on the network can connect to your local IP address.`);
  console.log(`========================================`);
});
