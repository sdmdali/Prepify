"use strict";

/**
 * Prepify Utilities
 * Reusable helper functions for the existing frontend.
 */
(() => {
  const PrepifyUtils = {
    /**
     * Find an element using a CSS selector.
     */
    $(selector, parent = document) {
      return parent.querySelector(selector);
    },

    /**
     * Find multiple elements using a CSS selector.
     */
    $$(selector, parent = document) {
      return Array.from(parent.querySelectorAll(selector));
    },

    /**
     * Escape HTML-sensitive characters.
     */
    escapeHTML(value) {
      const element = document.createElement("span");
      element.textContent = String(value ?? "");
      return element.innerHTML;
    },

    /**
     * Format a date for display.
     */
    formatDate(value, options = {}) {
      if (!value) return "Not available";

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "Invalid date";
      }

      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        ...options,
      }).format(date);
    },

    /**
     * Format a duration in seconds as MM:SS or HH:MM:SS.
     */
    formatDuration(totalSeconds) {
      const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));

      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = seconds % 60;

      const pad = (value) => String(value).padStart(2, "0");

      if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
      }

      return `${pad(minutes)}:${pad(remainingSeconds)}`;
    },

    /**
     * Validate an email address.
     */
    isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? "").trim());
    },

    /**
     * Convert a value into a safe integer.
     */
    toInteger(value, fallback = 0) {
      const number = Number(value);

      return Number.isSafeInteger(number) ? number : fallback;
    },

    /**
     * Read JSON from browser storage safely.
     */
    readJSON(key, fallback = null, storage = sessionStorage) {
      try {
        const value = storage.getItem(key);

        return value === null ? fallback : JSON.parse(value);
      } catch (error) {
        console.warn(`[Prepify] Could not read storage key "${key}".`, error);

        return fallback;
      }
    },

    /**
     * Save JSON to browser storage safely.
     */
    writeJSON(key, value, storage = sessionStorage) {
      try {
        storage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.error(`[Prepify] Could not save storage key "${key}".`, error);

        return false;
      }
    },

    /**
     * Remove a value from browser storage safely.
     */
    removeStorage(key, storage = sessionStorage) {
      try {
        storage.removeItem(key);
        return true;
      } catch (error) {
        console.error(
          `[Prepify] Could not remove storage key "${key}".`,
          error,
        );

        return false;
      }
    },

    /**
     * Display a message in an existing element.
     */
    showMessage(elementOrSelector, message, type = "info") {
      const element =
        typeof elementOrSelector === "string"
          ? document.querySelector(elementOrSelector)
          : elementOrSelector;

      if (!element) return false;

      element.textContent = String(message ?? "");
      element.dataset.messageType = type;
      element.setAttribute("role", type === "error" ? "alert" : "status");

      return true;
    },

    /**
     * Debounce frequent events such as search input.
     */
    debounce(callback, delay = 300) {
      let timeoutId;

      return function (...args) {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
          callback.apply(this, args);
        }, delay);
      };
    },

    /**
     * Generate a local identifier for client-side tracking.
     * This is not an authentication token or security credential.
     */
    createLocalId() {
      if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
      ) {
        return crypto.randomUUID();
      }

      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    },

    /**
     * Check whether the browser currently reports a network connection.
     */
    isOnline() {
      return navigator.onLine;
    },
  };

  window.PrepifyUtils = PrepifyUtils;
})();
