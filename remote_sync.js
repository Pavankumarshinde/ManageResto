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
  logging: console.log
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
  waiterName: { type: DataTypes.STRING },
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
  priceAtTime: { type: DataTypes.DECIMAL(10, 2) }
});

const User = sequelize.define('User', {
  restaurantName: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  mobile: { type: DataTypes.STRING, unique: true, allowNull: false },
  location: { type: DataTypes.STRING },
  password: { type: DataTypes.STRING, allowNull: false }
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

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Connected to remote DB');
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    await sequelize.sync({ force: true });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Force sync complete! Remote DB is clean.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
