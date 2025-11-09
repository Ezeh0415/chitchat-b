// redisClient.js
const { createClient } = require("redis");

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PWD,
});

client.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

let isConnected = false;

async function connectRedis() {
  if (!isConnected) {
    try {
      await client.connect();
      isConnected = true;
      console.log("✅ Connected to Redis Cloud");
    } catch (err) {
      console.error("❌ Failed to connect to Redis Cloud:", err);
      // Optional: retry logic or exit
    }
  }
}

connectRedis();

module.exports = client;


// await client.set("foo", "bar");
// const result = await client.get("foo");
// console.log(result); // >>> bar

// import { createClient } from "redis";

// const client = createClient({
//   socket: {
//     host: process.env.REDIS_HOST || "localhost",
//     port: process.env.REDIS_PORT || 6379,
//   },
//   password: process.env.REDIS_PWD || undefined,
// });

// client.on("error", (err) => console.error("Redis Client Error:", err));

// (async () => {
//   try {
//     await client.connect();
//     console.log("✅ Connected to Redis");
//   } catch (err) {
//     console.error("❌ Failed to connect to Redis:", err);
//   }
// })();

// export default client;
