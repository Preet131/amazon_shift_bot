import User from "../models/User.js";
import { loginAndStoreTokens, ensureValidToken } from "../services/amazonAuthService.js";

// POST /api/amazon-auth/login
// Triggers Playwright login once, captures + stores tokens.
export const amazonLogin = async (req, res) => {
  try {
    const tokens = await loginAndStoreTokens(req.user.id);
    res.json({
      msg: "Amazon login successful. Tokens stored.",
      hasAccessToken:  !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
    });
  } catch (err) {
    console.error("Amazon login error:", err.message);
    res.status(500).json({ msg: err.message });
  }
};

// GET /api/amazon-auth/status
// Returns token health without exposing the actual token value.
export const getTokenStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "amazonAccessToken amazonRefreshToken amazonTokenExpiresAt lastAmazonLogin"
    );
    const now = new Date();
    res.json({
      hasAccessToken:  !!user.amazonAccessToken,
      hasRefreshToken: !!user.amazonRefreshToken,
      tokenExpiresAt:  user.amazonTokenExpiresAt,
      isExpired:       user.amazonTokenExpiresAt
                         ? user.amazonTokenExpiresAt < now
                         : true,
      lastLogin:       user.lastAmazonLogin,
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// POST /api/amazon-auth/refresh
// Silent refresh — call this on a schedule or before scraping.
export const forceRefresh = async (req, res) => {
  try {
    await ensureValidToken(req.user.id);
    res.json({ msg: "Token refreshed successfully." });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// POST /api/amazon-auth/set-pin
// Stores the kiosk PIN for user reference.
export const setKioskPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ msg: "pin is required" });
    await User.findByIdAndUpdate(req.user.id, { kioskPin: pin });
    res.json({ msg: "Kiosk PIN saved." });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// POST /api/amazon-auth/set-otp-email
// Saves the IMAP config used to auto-read OTP codes.
export const setOtpEmailConfig = async (req, res) => {
  try {
    const { otpEmail, otpEmailPassword, otpEmailHost } = req.body;
    if (!otpEmail || !otpEmailPassword)
      return res.status(400).json({ msg: "otpEmail and otpEmailPassword are required" });

    await User.findByIdAndUpdate(req.user.id, {
      otpEmail,
      otpEmailPassword,
      otpEmailHost: otpEmailHost || "imap.gmail.com",
    });
    res.json({ msg: "OTP email config saved." });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
