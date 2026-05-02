import axios from "axios";
import { refreshAmazonToken } from "./amazonAuthService.js";
import {
  filterShifts,
  normalizeShiftForFilter,
  shiftFingerprint,
} from "./scannerService.js";
import { sendTelegramText } from "./notificationService.js";
import { runPlaywrightAutoApplyFlow } from "../playwright/autoApplyFlow.js";

const CLAIM_RETRIES = 3;
const RETRY_DELAY_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getChecklistMessage() {
  return [
    "Application submitted. Prepare these documents now:",
    "1) Government photo ID",
    "2) SIN document",
    "3) Work authorization document",
    "4) Address history proof (last 5 years)",
    "5) Banking details for payroll (if requested)",
    "Interview prep: review safety basics, shift flexibility, and warehouse readiness.",
  ].join("\n");
}

async function triggerPhoneCallIfConfigured(user, text) {
  const to = user?.autoApplyProfile?.phoneNumber?.trim();
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!to || !sid || !token || !from) return;

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", from);
  form.set("Twiml", `<Response><Say>${text}</Say></Response>`);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`;
  await axios.post(url, form.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    auth: { username: sid, password: token },
    timeout: 10_000,
  });
}

/**
 * Placeholder for full 6-screen apply workflow.
 * Supports env-based API simulation until actual Amazon claim endpoint is mapped.
 */
async function attemptClaim(user, shift) {
  // Local mock mode for deterministic dev/testing.
  if (process.env.USE_MOCK_AMAZON === "true") {
    const key = shiftFingerprint(shift);
    const mod = key.length % 5;
    if (mod === 0) return { statusCode: 409, body: { msg: "Shift already taken" } };
    return { statusCode: 201, body: { msg: "Claimed (mock)" } };
  }

  // Optional direct endpoint integration if user provides it in env.
  const endpoint = process.env.AMAZON_APPLY_ENDPOINT?.trim();
  if (!endpoint) {
    // Default path: execute real Playwright 6-screen flow.
    return runPlaywrightAutoApplyFlow(user, shift);
  }

  const payload = {
    shift,
    profile: {
      gender: user?.autoApplyProfile?.gender,
      workAuthorization: user?.autoApplyProfile?.workAuthorization,
      assessmentReplay: user?.autoApplyProfile?.assessmentReplay || {},
      bgc: {
        sinEncrypted: user?.autoApplyProfile?.sinEncrypted,
        dob: user?.autoApplyProfile?.dob,
        addressHistory: user?.autoApplyProfile?.addressHistory || [],
      },
      interviewPreference: user?.autoApplyProfile?.interviewPreference || "earliest",
      interviewWindow: user?.autoApplyProfile?.interviewWindow || null,
    },
  };

  try {
    const resp = await axios.post(endpoint, payload, {
      headers: { Authorization: `Bearer ${user.amazonAccessToken}` },
      timeout: 20_000,
      validateStatus: () => true,
    });
    return { statusCode: resp.status, body: resp.data };
  } catch (err) {
    if (err.response?.status) {
      return { statusCode: err.response.status, body: err.response.data };
    }
    throw err;
  }
}

async function claimShiftWithRetries(user, shift) {
  for (let attempt = 1; attempt <= CLAIM_RETRIES; attempt += 1) {
    const result = await attemptClaim(user, shift);

    if (result.statusCode === 200 || result.statusCode === 201) {
      return { status: "claimed", statusCode: result.statusCode, attempt };
    }

    if (result.statusCode === 409) {
      return { status: "taken", statusCode: 409, attempt };
    }

    if (result.statusCode === 401) {
      user.amazonAccessToken = await refreshAmazonToken(user._id);
      // Immediate retry path after silent refresh.
      continue;
    }

    if (attempt < CLAIM_RETRIES) await sleep(RETRY_DELAY_MS);
  }

  return { status: "failed", statusCode: 0, attempt: CLAIM_RETRIES };
}

export async function autoApplyMatchingShifts(user, rawShifts) {
  if (!user?.botSettings?.autoApply) return { claimed: 0, taken: 0, failed: 0 };
  if (!Array.isArray(rawShifts) || !rawShifts.length) {
    return { claimed: 0, taken: 0, failed: 0 };
  }

  const matches = filterShifts(rawShifts, user);
  let claimed = 0;
  let taken = 0;
  let failed = 0;

  for (const shift of matches) {
    const normalized = normalizeShiftForFilter(shift);
    const res = await claimShiftWithRetries(user, normalized);

    if (res.status === "claimed") {
      claimed += 1;
      const title = normalized.title || "Shift";
      const location = normalized.location || "Unknown location";
      const pay = normalized.pay != null ? `$${normalized.pay}/hr` : "pay n/a";
      const when = normalized.startTime || normalized.time || "time n/a";
      const successText =
        `Auto-apply success\n${title}\n${location}\n${pay}\n${when}\nHTTP ${res.statusCode}`;
      await sendTelegramText(user, successText);
      await sendTelegramText(user, getChecklistMessage());
      await triggerPhoneCallIfConfigured(
        user,
        "Shift claimed successfully. Check Telegram for your checklist and interview preparation notes."
      );
      continue;
    }

    if (res.status === "taken") {
      taken += 1;
      console.log(
        `ℹ️ [AutoApply] Shift already taken (409): ${normalized.title || "Shift"}`
      );
      continue;
    }

    failed += 1;
    console.warn(
      `⚠️ [AutoApply] Failed to claim shift after retries: ${normalized.title || "Shift"}`
    );
  }

  return { claimed, taken, failed };
}
