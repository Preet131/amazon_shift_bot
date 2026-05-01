import { ImapFlow } from "imapflow";

/**
 * Extracts a 6-digit OTP code from raw email text/HTML.
 */
export const parseOtpFromEmail = (rawBody) => {
  // Strip HTML tags and decode common entities
  const text = rawBody
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, "");

  // Try specific Amazon patterns first, then fall back to any 6-digit block
  const patterns = [
    /verification code[:\s]+(\d{6})/i,
    /one-time (?:password|code)[:\s]+(\d{6})/i,
    /code is[:\s]+(\d{6})/i,
    /\b(\d{6})\b/,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) return m[1];
  }
  return null;
};

/**
 * Connects to the user's IMAP inbox and polls for an Amazon OTP email.
 * Resolves with the 6-digit code string, or throws on timeout.
 *
 * @param {object} user  - Mongoose User document with otpEmail / otpEmailPassword / otpEmailHost
 * @param {number} maxWaitMs - How long to wait (default 90 s)
 */
export const waitForOtp = async (user, maxWaitMs = 90_000) => {
  const config = {
    host: user.otpEmailHost || "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: user.otpEmail || user.email,
      pass: user.otpEmailPassword,
    },
    logger: false,
  };

  console.log(`📧 Connecting to ${config.auth.user} to wait for OTP...`);

  const client = new ImapFlow(config);
  await client.connect();

  const deadline = Date.now() + maxWaitMs;
  const searchSince = new Date(Date.now() - 3 * 60_000); // look at last 3 min

  try {
    while (Date.now() < deadline) {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await client.search(
          { from: "amazon", since: searchSince },
          { uid: true }
        );

        for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
          const body = msg.source.toString("utf-8");
          const otp = parseOtpFromEmail(body);
          if (otp) {
            console.log(`✅ OTP captured: ${otp}`);
            return otp;
          }
        }
      } finally {
        lock.release();
      }

      console.log("🔄 OTP not yet in inbox – retrying in 5 s...");
      await new Promise((r) => setTimeout(r, 5_000));
    }

    throw new Error(`OTP not received within ${maxWaitMs / 1000} s`);
  } finally {
    await client.logout().catch(() => {});
  }
};
