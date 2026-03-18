async function testUser(email) {
    let res = await fetch('http://127.0.0.1:3000/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            restaurantName: 'Test', email, mobile: Math.random().toString(), password: 'password123'
        })
    });
    
    let data = await res.json();
    if (!data.token) {
        res = await fetch('http://127.0.0.1:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: email, password: 'password123' })
        });
        data = await res.json();
    }
    
    console.log(email, 'token length:', data.token?.length);
    
    // Send state
    const payload = {
        menu: [{id: 1, name: "Dish", price: 10, type: "Veg", category: "Starter"}],
        orders: [], waiters: []
    };

    const stateRes = await fetch('http://127.0.0.1:3000/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + data.token },
        body: JSON.stringify(payload)
    });
    
    console.log(email, 'State Sync:', stateRes.status, await stateRes.text());
}

async function run() {
    await testUser('user1@test.com');
    await testUser('user2@test.com');
}

run().catch(console.error);
