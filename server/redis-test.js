// redis-test.js
const redis = require("redis");

async function testRedis() {
  const client = redis.createClient({
    url: "redis://127.0.0.1:6379",
    socket: { timeout: 10000 },
  });
  try {
    await client.connect();
    console.log("Connected to Redis!");
    const pong = await client.ping();
    console.log("PING ->", pong); // Expect: "PONG"
  } catch (err) {
    console.error("Redis connection error:", err);
  } finally {
    await client.quit();
  }
}

testRedis();
