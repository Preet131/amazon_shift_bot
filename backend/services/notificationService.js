import axios from "axios";
import User from "../models/User.js";
import {
  normalizeShiftForFilter,
  shiftFingerprint,
  shiftMatchesUserFilters,
} from "./scannerService.js";

const MAX_FINGERPRINTS = 400;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegramHtml(chatId, html) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, reason: "no_token" };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await axios.post(
    url,
    {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    },
    { timeout: 15_000 }
  );
  return { ok: true };
}

export async function sendTelegramText(user, text) {
  const chatId = user?.botSettings?.notifyTelegramId?.trim();
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!chatId || !token) return;
  try {
    await sendTelegramHtml(chatId, escapeHtml(text));
  } catch (err) {
    console.error("[sendTelegramText] Telegram error:", err.response?.data || err.message);
  }
}

/**
 * After a scan: notify Telegram once per batch for shifts matching city + min pay
 * that this user has not been notified about yet.
 */
export async function notifyNewMatchingShifts(userDoc, shiftsFromScan) {
  const chatId = userDoc.botSettings?.notifyTelegramId?.trim();
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!chatId || !token || !Array.isArray(shiftsFromScan) || !shiftsFromScan.length) {
    return;
  }

  const hasFilter =
    (userDoc.filters?.city && String(userDoc.filters.city).trim()) ||
    (userDoc.filters?.minPay != null && Number(userDoc.filters.minPay) > 0);
  if (!hasFilter) return;

  const prev = userDoc.notifiedShiftFingerprints || [];
  const seen = new Set(prev.map(String));

  const fresh = [];
  for (const raw of shiftsFromScan) {
    const norm = normalizeShiftForFilter(raw);
    if (!shiftMatchesUserFilters(norm, userDoc)) continue;
    const fp = shiftFingerprint(raw);
    if (seen.has(fp)) continue;
    seen.add(fp);
    fresh.push({ norm, fp });
  }

  if (!fresh.length) return;

  const blocks = fresh.map(
    ({ norm }) =>
      `• <b>${escapeHtml(norm.title || "Shift")}</b>\n` +
      `  📍 ${escapeHtml(norm.location || "—")}\n` +
      `  💵 ${norm.pay != null ? `$${escapeHtml(String(norm.pay))}/hr` : "—"}\n` +
      `  🕐 ${escapeHtml(norm.startTime || "—")}`
  );

  const html =
    `🔔 <b>New shifts matching your filters</b>\n\n` + blocks.join("\n\n");

  try {
    await sendTelegramHtml(chatId, html);
    const merged = [...prev, ...fresh.map((f) => f.fp)].slice(-MAX_FINGERPRINTS);
    await User.updateOne({ _id: userDoc._id }, { $set: { notifiedShiftFingerprints: merged } });
  } catch (err) {
    console.error("[notifyNewMatchingShifts] Telegram error:", err.response?.data || err.message);
  }
}

/** Legacy / manual hook — logs + optional Telegram if configured */
export const sendNotification = async (user, message) => {
  console.log(`\n=============================================`);
  console.log(`🛎️ NOTIFICATION FOR ${user.email}`);
  console.log(`---------------------------------------------`);
  console.log(message);
  console.log(`=============================================\n`);

  await sendTelegramText(user, message);
};
