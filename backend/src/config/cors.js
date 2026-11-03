"use strict";

const cors = require("cors");
const { config } = require("./environment");

const allowedOrigins = [...new Set([
  ...config.frontendUrls,
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
])];

function buildCors() {
  return cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  });
}

module.exports = { buildCors };
