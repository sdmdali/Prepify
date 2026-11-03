'use strict';
const { config } = require('./environment');

let clientFactory = null; // injectable for tests
let cached = null;

function setClientFactory(fn) { clientFactory = fn; cached = null; }
function isConfigured() { return Boolean(clientFactory) || Boolean(config.ai.apiKey); }

/** Lazily create the SDK client so the server starts without a key. */
function getClient() {
  if (!isConfigured()) return null;
  if (!cached) {
    if (clientFactory) cached = clientFactory();
    else {
      const { GoogleGenAI } = require('@google/genai');
      cached = new GoogleGenAI({ apiKey: config.ai.apiKey });
    }
  }
  return cached;
}
module.exports = { getClient, isConfigured, setClientFactory };
