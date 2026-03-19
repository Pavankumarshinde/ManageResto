require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');

const DB_NAME     = (process.env.DB_NAME     || 'manageresto').trim();
const DB_USER     = (process.env.DB_USER     || 'root').trim();
const DB_PASSWORD = (process.env.DB_PASSWORD || '').trim();
const DB_HOST     = (process.env.DB_HOST     || 'localhost').trim();
const DB_PORT     = parseInt((process.env.DB_PORT || '3306').trim(), 10);

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql',
  logging: false
});

const RestoState = sequelize.define('RestoState', {
  userId: { type: DataTypes.INTEGER, unique: true },
  menu: { type: DataTypes.TEXT('long') },
  orders: { type: DataTypes.TEXT('long') },
  waiters: { type: DataTypes.TEXT('long') }
});

async function inspect() {
  try {
    await sequelize.authenticate();
    const state = await RestoState.findOne({ where: { userId: 3 } });
    if (!state) {
      console.log("No state found for User 3");
      return;
    }
    console.log("--- User 3 RestoState ---");
    console.log("Menu Length:", state.menu ? state.menu.length : 0);
    console.log("Orders Length:", state.orders ? state.orders.length : 0);
    console.log("Waiters Length:", state.waiters ? state.waiters.length : 0);
    
    try {
      const menu = JSON.parse(state.menu || '[]');
      console.log("Menu parsed successfully. Item count:", menu.length);
    } catch (e) { console.error("Menu Parse Error:", e.message); }

    try {
      const orders = JSON.parse(state.orders || '[]');
      console.log("Orders parsed successfully. Count:", orders.length);
      if (orders.length > 0) {
        console.log("Sample Order:", JSON.stringify(orders[0]).substring(0, 200));
      }
    } catch (e) { console.error("Orders Parse Error:", e.message); }

  } catch (err) {
    console.error("DIAGNOSTIC ERROR:", err);
  } finally {
    await sequelize.close();
  }
}

inspect();
