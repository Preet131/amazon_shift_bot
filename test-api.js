const testApi = async () => {
  const baseUrl = "http://localhost:3000";
  let testsPassed = 0;
  let testsTotal = 3;

  console.log("🚀 Starting API Tests...\n");

  // 1. Test Server Root
  try {
    const rootRes = await fetch(baseUrl);
    const rootText = await rootRes.text();
    if (rootRes.ok && rootText.includes('<!DOCTYPE html>')) {
      console.log("✅ Server is up — serving frontend at GET /");
      testsPassed++;
    } else {
      console.log("❌ GET / failed. Expected HTML, got:", rootText.slice(0,100));
    }
  } catch (err) {
    console.log("❌ GET / failed. Is the server running? Error:", err.message);
  }

  // 2. Test Register
  let testEmail = `test_${Date.now()}@example.com`;
  try {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "password123" })
    });
    
    if (regRes.ok) {
      const data = await regRes.json();
      if (data.email === testEmail) {
        console.log(`✅ POST /api/auth/register works (User created: ${testEmail})`);
        testsPassed++;
      } else {
        console.log("❌ Register API didn't return the expected user data:", data);
      }
    } else {
      console.log(`❌ Register API failed with status ${regRes.status}:`, await regRes.text());
    }
  } catch (err) {
    console.log("❌ POST /api/auth/register failed. Is MongoDB connected? Error:", err.message);
  }

  // 3. Test Login
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "password123" })
    });

    if (loginRes.ok) {
      const data = await loginRes.json();
      if (data.token && data.user) {
         console.log("✅ POST /api/auth/login works (Token received)");
         testsPassed++;
      } else {
         console.log("❌ Login API didn't return token/user:", data);
      }
    } else {
      console.log(`❌ Login API failed with status ${loginRes.status}:`, await loginRes.text());
    }
  } catch (err) {
    console.log("❌ POST /api/auth/login failed. Error:", err.message);
  }

  console.log(`\n📊 Results: ${testsPassed}/${testsTotal} tests passed.`);
  if (testsPassed === testsTotal) {
    console.log("🎉 All good! You can safely proceed to the next phase.");
  } else {
    console.log("⚠️ Some tests failed. Please fix the issues before proceeding.");
  }
};

testApi();
