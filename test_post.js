const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

async function run() {
    const res = await fetch('http://127.0.0.1:3000/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            restaurantName: 'Test',
            email: 'test@test.com',
            mobile: '1234567890',
            password: 'password123'
        })
    });
    
    // if already exists, try login
    let data = await res.json();
    if (!data.token) {
        const loginRes = await fetch('http://127.0.0.1:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: 'test@test.com', password: 'password123' })
        });
        data = await loginRes.json();
    }

    const token = data.token;
    console.log('Got token:', token);
    
    // Now trigger the POST state
    const payload = {
        menu: [{id: 1, name: "Dish", price: 10, type: "Veg", category: "Starter"}],
        orders: [{
            id: 1,
            tableNumber: "1",
            waiterName: "Waiter",
            paid: false,
            createdAt: new Date().toISOString(),
            items: [{ menuItemId: 1, qty: 1, status: "Served", priceAtTime: 10 }]
        }],
        waiters: ["Waiter"],
        nextOrderId: 2,
        nextMenuId: 2
    };

    const stateRes = await fetch('http://127.0.0.1:3000/api/state', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(payload)
    });
    
    console.log('Status:', stateRes.status);
    console.log('Body:', await stateRes.text());
}

run().catch(console.error);
