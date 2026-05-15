/**
 * ManageResto – Data Migration Script
 * Migrates all data from Aiven MySQL (old backend) → Supabase PostgreSQL (new backend)
 *
 * ⚠️ Run this ONCE after setting up your Supabase project.
 * Usage: node migrate-to-supabase.js
 *
 * Prerequisites:
 *   npm install mysql2 @supabase/supabase-js dotenv
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const { createClient } = require('@supabase/supabase-js');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Old MySQL (Aiven) — from your .env
const MYSQL_CONFIG = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  ssl: { rejectUnauthorized: false },
};

// New Supabase — fill in after creating your project
const SUPABASE_URL = process.env.SUPABASE_URL || 'REPLACE_WITH_YOUR_SUPABASE_URL';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'REPLACE_WITH_YOUR_SERVICE_ROLE_KEY';

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function migrate() {
  console.log('🚀 ManageResto Migration: MySQL (Aiven) → Supabase PostgreSQL\n');

  if (SUPABASE_URL.includes('REPLACE') || SUPABASE_SERVICE_KEY.includes('REPLACE')) {
    console.error('❌ Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env first.');
    process.exit(1);
  }

  // Connect to MySQL
  console.log(`🔌 Connecting to MySQL at ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}...`);
  const mysql_conn = await mysql.createConnection(MYSQL_CONFIG);
  console.log('✅ MySQL connected.\n');

  // Connect to Supabase (service role key bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // ─── 1. FETCH ALL DATA FROM MYSQL ────────────────────────────────────────
    console.log('📖 Reading data from MySQL...');

    const [mysqlUsers] = await mysql_conn.execute('SELECT * FROM Users ORDER BY id ASC');
    const [mysqlCategories] = await mysql_conn.execute('SELECT * FROM Categories ORDER BY id ASC');
    const [mysqlMenuItems] = await mysql_conn.execute('SELECT * FROM MenuItems ORDER BY id ASC');
    const [mysqlWaiters] = await mysql_conn.execute('SELECT * FROM Waiters ORDER BY id ASC');
    const [mysqlOrders] = await mysql_conn.execute('SELECT * FROM Orders ORDER BY id ASC');
    const [mysqlOrderItems] = await mysql_conn.execute('SELECT * FROM OrderItems ORDER BY id ASC');
    const [mysqlRestoStates] = await mysql_conn.execute('SELECT * FROM RestoStates ORDER BY id ASC');

    console.log(`  Users: ${mysqlUsers.length}`);
    console.log(`  Categories: ${mysqlCategories.length}`);
    console.log(`  MenuItems: ${mysqlMenuItems.length}`);
    console.log(`  Waiters: ${mysqlWaiters.length}`);
    console.log(`  Orders: ${mysqlOrders.length}`);
    console.log(`  OrderItems: ${mysqlOrderItems.length}`);
    console.log(`  RestoStates: ${mysqlRestoStates.length}\n`);

    // ─── 2. MIGRATE USERS (Supabase Auth + Profiles) ─────────────────────────
    console.log('👤 Migrating users to Supabase Auth...');
    const mysqlIdToSupabaseId = new Map(); // Maps old MySQL integer ID → new Supabase UUID

    for (const u of mysqlUsers) {
      try {
        // Check if already exists
        const { data: existing } = await supabase.auth.admin.listUsers();
        const alreadyExists = existing?.users?.find(su => su.email === u.email);

        let userId;

        if (alreadyExists) {
          console.log(`  ⏭  Skipping existing user: ${u.email}`);
          userId = alreadyExists.id;
        } else {
          // Create Supabase Auth user — random temp password (user must reset)
          const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '1!';
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: u.email,
            password: tempPassword,
            email_confirm: true,
          });

          if (authError) {
            console.error(`  ❌ Failed to create auth user ${u.email}: ${authError.message}`);
            continue;
          }
          userId = authData.user.id;
          console.log(`  ✅ Created auth user: ${u.email} → ${userId}`);
        }

        mysqlIdToSupabaseId.set(u.id, userId);

        // Create or update profile
        await supabase.from('profiles').upsert({
          id: userId,
          restaurant_name: u.restaurantName,
          mobile: u.mobile,
          location: u.location || null,
          gst_number: u.gstNumber || null,
        }, { onConflict: 'id' });

      } catch (err) {
        console.error(`  ❌ Error migrating user ${u.email}:`, err.message);
      }
    }

    console.log(`  ✅ ${mysqlIdToSupabaseId.size} users migrated.\n`);

    // ─── 3. MIGRATE CATEGORIES ────────────────────────────────────────────────
    console.log('📂 Migrating categories...');
    const mysqlCatIdToSupabaseCatId = new Map();

    for (const cat of mysqlCategories) {
      const supabaseUserId = mysqlIdToSupabaseId.get(cat.userId);
      if (!supabaseUserId) continue;

      const { data, error } = await supabase.from('categories')
        .insert({ name: cat.name, user_id: supabaseUserId })
        .select('id')
        .single();

      if (!error && data) {
        mysqlCatIdToSupabaseCatId.set(cat.id, data.id);
      }
    }
    console.log(`  ✅ ${mysqlCatIdToSupabaseCatId.size} categories migrated.\n`);

    // ─── 4. MIGRATE MENU ITEMS ────────────────────────────────────────────────
    console.log('🍽️  Migrating menu items...');
    const mysqlItemIdToSupabaseItemId = new Map();

    for (const item of mysqlMenuItems) {
      const supabaseUserId = mysqlIdToSupabaseId.get(item.userId);
      if (!supabaseUserId) continue;

      const { data, error } = await supabase.from('menu_items').insert({
        frontend_id: item.frontendId,
        name: item.name,
        price: item.price,
        type: item.type || 'Veg',
        image: item.image || null,
        category_id: mysqlCatIdToSupabaseCatId.get(item.categoryId) || null,
        available: item.available !== 0,
        user_id: supabaseUserId,
      }).select('id').single();

      if (!error && data) {
        mysqlItemIdToSupabaseItemId.set(item.id, data.id);
      }
    }
    console.log(`  ✅ ${mysqlItemIdToSupabaseItemId.size} menu items migrated.\n`);

    // ─── 5. MIGRATE WAITERS ───────────────────────────────────────────────────
    console.log('🧑 Migrating waiters...');
    let waiterCount = 0;
    for (const w of mysqlWaiters) {
      const supabaseUserId = mysqlIdToSupabaseId.get(w.userId);
      if (!supabaseUserId) continue;
      await supabase.from('waiters').insert({ name: w.name, user_id: supabaseUserId });
      waiterCount++;
    }
    console.log(`  ✅ ${waiterCount} waiters migrated.\n`);

    // ─── 6. MIGRATE ORDERS + ORDER ITEMS ─────────────────────────────────────
    console.log('📦 Migrating orders and order items...');
    let orderCount = 0;
    let orderItemCount = 0;

    for (const order of mysqlOrders) {
      const supabaseUserId = mysqlIdToSupabaseId.get(order.userId);
      if (!supabaseUserId) continue;

      const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
        frontend_id: order.frontendId,
        table_number: order.tableNumber || null,
        waiter_name: order.waiterName || null,
        paid: order.paid === 1,
        total_amount: order.totalAmount || 0,
        user_id: supabaseUserId,
        created_at: order.createdAt,
      }).select('id').single();

      if (orderErr || !newOrder) continue;
      orderCount++;

      // Migrate order items for this order
      const items = mysqlOrderItems.filter(oi => oi.orderId === order.id);
      for (const oi of items) {
        const supabaseMenuItemId = mysqlItemIdToSupabaseItemId.get(oi.menuItemId);
        if (!supabaseMenuItemId) continue;

        await supabase.from('order_items').insert({
          order_id: newOrder.id,
          menu_item_id: supabaseMenuItemId,
          qty: oi.qty,
          status: oi.status || 'Serving',
          price_at_time: oi.priceAtTime || null,
          note: oi.note || null,
        });
        orderItemCount++;
      }
    }
    console.log(`  ✅ ${orderCount} orders, ${orderItemCount} order items migrated.\n`);

    // ─── 7. MIGRATE RESTO STATES (JSON blobs) ────────────────────────────────
    console.log('💾 Migrating resto states (JSON blobs)...');
    let stateCount = 0;

    for (const rs of mysqlRestoStates) {
      const supabaseUserId = mysqlIdToSupabaseId.get(rs.userId);
      if (!supabaseUserId) continue;

      const menu = rs.menu ? JSON.parse(rs.menu) : [];
      const orders = rs.orders ? JSON.parse(rs.orders) : [];
      const waiters = rs.waiters ? JSON.parse(rs.waiters) : [];
      const categories = rs.categories ? JSON.parse(rs.categories) : [];

      await supabase.from('resto_states').upsert({
        user_id: supabaseUserId,
        menu,
        orders,
        waiters,
        categories,
        next_order_id: rs.nextOrderId || 1,
        next_menu_id: rs.nextMenuId || 100,
      }, { onConflict: 'user_id' });

      stateCount++;
    }
    console.log(`  ✅ ${stateCount} resto states migrated.\n`);

    // ─── 8. SUMMARY ───────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════');
    console.log('✅ MIGRATION COMPLETE!');
    console.log('═══════════════════════════════════════');
    console.log(`  Users:       ${mysqlIdToSupabaseId.size}`);
    console.log(`  Categories:  ${mysqlCatIdToSupabaseCatId.size}`);
    console.log(`  Menu Items:  ${mysqlItemIdToSupabaseItemId.size}`);
    console.log(`  Waiters:     ${waiterCount}`);
    console.log(`  Orders:      ${orderCount}`);
    console.log(`  Order Items: ${orderItemCount}`);
    console.log(`  States:      ${stateCount}`);
    console.log('\n⚠️  NOTE: All migrated users will need to reset their passwords.');
    console.log('   They can use "Forgot Password" → OTP flow on the app.\n');

  } finally {
    await mysql_conn.end();
    console.log('🔌 MySQL connection closed.');
  }
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
