const { MongoClient } = require('mongodb');

let db = null;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("❌ MONGODB_URI is not defined in Railway variables.");
  }

  if (db) return db; // Already connected

  const client = new MongoClient(uri);
  await client.connect();
  db = await client.db("ChitChat"); // default DB from URI
  console.log("Connected to MongoDB");
  return db;
}

function getDB() {
  if (!db) {
    throw new Error("Database not connected. Call connectDB() first.");
  }
  return db;
}

module.exports = { connectDB, getDB };


// const { MongoClient } = require("mongodb");

// const uri = process.env.MONGODB_URI;
// let dbConnection;

// async function connectDB() {
//   if (!uri) {
//     throw new Error("❌ MONGODB_URI is not defined in Railway variables.");
//   }
//   try {
//     const client = await MongoClient.connect(uri, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//     });
//     dbConnection = client.db("ChitChat");
//     console.log("Connected to MongoDB");
//   } catch (error) {
//     console.error("Error connecting to MongoDB:", error);
//     throw error;
//   }
// }

// function getDB() {
//   if (!dbConnection) {
//     throw new Error("Database not connected. Call connectDB() first.");
//   }
//   return dbConnection;
// }

// module.exports = {
//   connectDB,
//   getDB,
// };
