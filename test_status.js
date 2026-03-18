// Using built-in fetch (Node.js 18+)

async function testStatus() {
  const loginRes = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'test@test.com', password: 'password123' })
  });
  const data = await loginRes.json();
  const token = data.token;
  console.log('Got token:', token);

  const statusRes = await fetch('http://localhost:3000/api/status', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  console.log('Status Header:', statusRes.status);
  const statusBody = await statusRes.json();
  console.log('Status Body:', statusBody);
}

testStatus().catch(console.error);
