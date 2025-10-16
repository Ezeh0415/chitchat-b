// app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const Routes = require("./Routes/Routes");

const app = express();
const server = http.createServer(app);

const allowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

// CORS middleware for Express
app.use(express.json({ limit: "70mb" }));
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Handle preflight OPTIONS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Attach routes
app.use(Routes);

// Export app and server (not io)
module.exports = { app, server };
