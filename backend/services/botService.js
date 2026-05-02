import { scrapeShifts } from "../playwright/scrapeShifts.js";
import Shift from "../models/shift.js";
import User from "../models/User.js";
import { notifyNewMatchingShifts } from "./notificationService.js";
import { autoApplyMatchingShifts } from "./autoApplyService.js";

// In-memory job registry  { userId → { timeoutId, isScanning, status, lastRun, intervalSeconds } }
const jobs = {};

/**
 * Start a scanning loop for a user.
 * @param {string} userId
 * @param {number} intervalSeconds - how often to scan
 */
export const startBot = (userId, intervalSeconds = 300) => {
  if (jobs[userId]) {
    clearTimeout(jobs[userId].timeoutId);
  }

  jobs[userId] = {
    timeoutId:       null,
    isScanning:      false,
    status:          "idle",
    intervalSeconds,
    startedAt:       new Date(),
    lastRun:         null,
    lastShiftsFound: 0,
    lastError:       null,
    lastAutoApply:   null,
  };

  console.log(`🚀 [Bot] Started for user ${userId} every ${intervalSeconds} seconds`);

  const runScan = async () => {
    const job = jobs[userId];
    if (!job) return; // stopped

    if (job.isScanning) {
      // Prevent overlapping if previous scan is still running
      job.timeoutId = setTimeout(runScan, 1000);
      return;
    }

    job.isScanning = true;
    job.status  = "scanning";
    job.lastRun = new Date();

    try {
      console.log(`🤖 [Bot] Scanning shifts for user ${userId}...`);
      const shifts = await scrapeShifts(userId);

      // Persist new shifts to DB (upsert by title+location+startTime)
      for (const s of shifts) {
        await Shift.findOneAndUpdate(
          { title: s.title, location: s.location, startTime: s.startTime || s.time },
          { ...s },
          { upsert: true, new: true, returnDocument: 'after' }
        );
      }

      if (jobs[userId]) {
        jobs[userId].lastShiftsFound = shifts.length;
        jobs[userId].status = "idle";
        jobs[userId].lastError = null;
      }
      console.log(`✅ [Bot] ${shifts.length} shifts saved for user ${userId}`);

      const userDoc = await User.findById(userId);
      if (userDoc) {
        await notifyNewMatchingShifts(userDoc, shifts);
        jobs[userId].lastAutoApply = await autoApplyMatchingShifts(userDoc, shifts);
      }
    } catch (err) {
      if (jobs[userId]) {
        jobs[userId].status = "error";
        jobs[userId].lastError = err.message;
      }
      console.error(`❌ [Bot] Scan error for user ${userId}:`, err.message);
    } finally {
      if (jobs[userId]) {
        jobs[userId].isScanning = false;
        // Schedule next run
        jobs[userId].timeoutId = setTimeout(runScan, jobs[userId].intervalSeconds * 1000);
      }
    }
  };

  // Start the first scan immediately
  runScan();
};

/**
 * Stop the scan loop for a user.
 */
export const stopBot = (userId) => {
  if (jobs[userId]) {
    clearTimeout(jobs[userId].timeoutId);
    delete jobs[userId];
    console.log(`🛑 [Bot] Stopped for user ${userId}`);
  }
};

/**
 * Get current bot status for a user.
 */
export const getBotStatus = (userId) => {
  const job = jobs[userId];
  if (!job) return { running: false };
  return {
    running:         true,
    status:          job.status,
    intervalSeconds: job.intervalSeconds,
    startedAt:       job.startedAt,
    lastRun:         job.lastRun,
    lastShiftsFound: job.lastShiftsFound,
    lastError:       job.lastError,
    lastAutoApply:   job.lastAutoApply,
  };
};