"use strict";

const express = require("express");
const helmet = require("helmet");
const { buildCors } = require("./config/cors");
const rl = require("./middleware/rateLimit");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(buildCors());
  app.use(express.json({ limit: "6mb" }));

  app.use("/api", rl.general, routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
