"use strict";

/**
 * Prepify Offline Synchronization
 *
 * Stores pending answer updates locally and retries them when online.
 *
 * Queue entries contain:
 * {
 *   id: string,
 *   attemptId: number,
 *   questionId: number,
 *   selectedIndex: number | null,
 *   createdAt: string
 * }
 *
 * Do not store passwords, authentication tokens, or sensitive user details
 * in the offline queue.
 */
(() => {
  const STORAGE_KEY = "prepifyOfflineAnswerQueue";
  const MAX_ATTEMPTS = 5;
  const RETRY_DELAY = 1500;

  let syncing = false;

  function readQueue() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const queue = raw ? JSON.parse(raw) : [];

      return Array.isArray(queue) ? queue : [];
    } catch (error) {
      console.error("[Prepify Offline Sync] Could not read queue.", error);
      return [];
    }
  }

  function writeQueue(queue) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
      return true;
    } catch (error) {
      console.error("[Prepify Offline Sync] Could not save queue.", error);
      return false;
    }
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function validateEntry(entry) {
    return (
      entry &&
      Number.isSafeInteger(Number(entry.attemptId)) &&
      Number(entry.attemptId) > 0 &&
      Number.isSafeInteger(Number(entry.questionId)) &&
      Number(entry.questionId) > 0 &&
      (entry.selectedIndex === null ||
        (Number.isSafeInteger(Number(entry.selectedIndex)) &&
          Number(entry.selectedIndex) >= 0))
    );
  }

  /**
   * Add or replace a pending answer for a question.
   *
   * Replacing an answer prevents the queue from growing with several
   * unsynchronized selections for the same question.
   */
  function queueAnswer(attemptId, questionId, selectedIndex) {
    const entry = {
      id: `${attemptId}:${questionId}`,
      attemptId: Number(attemptId),
      questionId: Number(questionId),
      selectedIndex: selectedIndex === null ? null : Number(selectedIndex),
      createdAt: new Date().toISOString(),
      retries: 0,
    };

    if (!validateEntry(entry)) {
      throw new Error("Invalid offline answer data.");
    }

    const queue = readQueue();
    const existingIndex = queue.findIndex((item) => item.id === entry.id);

    if (existingIndex >= 0) {
      queue[existingIndex] = entry;
    } else {
      queue.push(entry);
    }

    if (!writeQueue(queue)) {
      throw new Error(
        "The browser could not save your answer locally. " +
          "Please check available storage.",
      );
    }

    window.dispatchEvent(
      new CustomEvent("prepify:offline-queue-changed", {
        detail: { count: queue.length },
      }),
    );

    return entry;
  }

  /**
   * Synchronize queued answers with the existing backend API.
   *
   * A failed item remains in the queue. Retry limits prevent endless
   * automatic requests.
   */
  async function sync() {
    if (syncing || !navigator.onLine) {
      return {
        success: false,
        reason: syncing ? "already-syncing" : "offline",
      };
    }

    if (!window.PrepifyAPI || typeof window.PrepifyAPI.put !== "function") {
      return {
        success: false,
        reason: "api-unavailable",
      };
    }

    syncing = true;

    let queue = readQueue();
    let synced = 0;
    const remaining = [];

    try {
      for (const entry of queue) {
        if (!validateEntry(entry)) {
          console.warn(
            "[Prepify Offline Sync] Discarding invalid queue entry.",
          );
          continue;
        }

        if ((entry.retries || 0) >= MAX_ATTEMPTS) {
          remaining.push(entry);
          continue;
        }

        try {
          await window.PrepifyAPI.put(
            `/attempts/${Number(entry.attemptId)}/answer`,
            {
              questionId: Number(entry.questionId),
              selectedIndex: entry.selectedIndex,
            },
          );

          synced++;
        } catch (error) {
          entry.retries = (entry.retries || 0) + 1;
          entry.lastError = String(error?.message || "Sync failed").slice(
            0,
            200,
          );

          remaining.push(entry);

          if (!navigator.onLine) {
            break;
          }

          await wait(RETRY_DELAY);
        }
      }

      // Preserve any items that were not processed after connectivity
      // disappeared while synchronization was in progress.
      const processedIds = new Set(
        queue.slice(0, queue.length - remaining.length).map((item) => item.id),
      );

      for (const item of queue) {
        if (
          !processedIds.has(item.id) &&
          !remaining.some((pending) => pending.id === item.id) &&
          !validateEntry(item)
        ) {
          remaining.push(item);
        }
      }

      writeQueue(remaining);

      window.dispatchEvent(
        new CustomEvent("prepify:offline-sync-complete", {
          detail: {
            synced,
            pending: remaining.length,
          },
        }),
      );

      return {
        success: remaining.length === 0,
        synced,
        pending: remaining.length,
      };
    } finally {
      syncing = false;
    }
  }

  function pendingCount() {
    return readQueue().length;
  }

  function clearQueue() {
    localStorage.removeItem(STORAGE_KEY);
  }

  window.PrepifyOfflineSync = {
    queueAnswer,
    sync,
    pendingCount,
    clearQueue,
  };

  window.addEventListener("online", () => {
    sync().catch((error) => {
      console.error("[Prepify Offline Sync] Automatic sync failed.", error);
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      sync().catch((error) => {
        console.error("[Prepify Offline Sync] Sync failed.", error);
      });
    }
  });
})();
