import cron from "node-cron";
import { scrapeShifts } from "../playwright/scrapeShifts.js";
import Shift from "../models/shift.js";

// In-memory job registry  { userId → { task, status, lastRun, interval } }
const jobs = {};

/**
 * Start a cron-based scan loop for a user.
 * @param {string} userId
 * @param {number} intervalMinutes - how often to scan (default 5)
 */
export const startBot = (userId, intervalMinutes = 5) => {
  if (jobs[userId]) {
    jobs[userId].task.stop();
  }

  const cronExpr = `*/${intervalMinutes} * * * *`;

  const task = cron.schedule(cronExpr, async () => {
    console.log(`🤖 [Bot] Scanning shifts for user ${userId}...`);
    jobs[userId].status  = "scanning";
    jobs[userId].lastRun = new Date();

    try {
      const shifts = await scrapeShifts(userId);

      // Persist new shifts to DB (upsert by title+location+startTime)
      for (const s of shifts) {
        await Shift.findOneAndUpdate(
          { title: s.title, location: s.location, startTime: s.startTime || s.time },
          { ...s },
          { upsert: true, new: true }
        );
      }

      jobs[userId].lastShiftsFound = shifts.length;
      jobs[userId].status = "idle";
      console.log(`✅ [Bot] ${shifts.length} shifts saved for user ${userId}`);
    } catch (err) {
      jobs[userId].status = "error";
      jobs[userId].lastError = err.message;
      console.error(`❌ [Bot] Scan error for user ${userId}:`, err.message);
    }
  });

  jobs[userId] = {
    task,
    status:          "idle",
    intervalMinutes,
    startedAt:       new Date(),
    lastRun:         null,
    lastShiftsFound: 0,
    lastError:       null,
  };

  console.log(`🚀 [Bot] Started for user ${userId} every ${intervalMinutes} min`);
};

/**
 * Stop the scan loop for a user.
 */
export const stopBot = (userId) => {
  if (jobs[userId]) {
    jobs[userId].task.stop();
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
    intervalMinutes: job.intervalMinutes,
    startedAt:       job.startedAt,
    lastRun:         job.lastRun,
    lastShiftsFound: job.lastShiftsFound,
    lastError:       job.lastError,
  };
};