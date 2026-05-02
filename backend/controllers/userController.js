import User from "../models/User.js";
import { checkEligibility } from "../services/eligibilityService.js";

const profileSelect =
  "-password -amazonPassword -otpEmailPassword -amazonAccessToken -amazonRefreshToken -amazonIdToken -amazonCookies";

function tryExtractNestedToken(rawValue, tokenKind) {
  if (!rawValue || typeof rawValue !== "string") return "";
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") return "";
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== "string") continue;
      const key = k.toLowerCase();
      if (tokenKind === "access" && key.includes("access")) return v;
      if (tokenKind === "refresh" && key.includes("refresh")) return v;
      if (tokenKind === "id" && (key === "idtoken" || key.includes("id_token"))) return v;
    }
  } catch {
    // not JSON, ignore
  }
  return "";
}

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(profileSelect).lean();
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("getProfile:", error);
    res.status(500).json({ msg: "Server error" });
  }
};

// 👉 Update user profile + run eligibility check
export const updateProfile = async (req, res) => {
  try {
    const {
      visaStatus,
      documents,
      sessionJson,
      filters,
      botSettings,
      autoApplyProfile,
    } = req.body;
    const userId = req.user.id;

    // 1. Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // 2. Update fields (only if provided)
    if (visaStatus) user.visaStatus = visaStatus;
    if (documents) user.documents = { ...user.documents, ...documents };
    
    // Process Session JSON
    if (sessionJson) {
      try {
        const session = JSON.parse(sessionJson);
        let foundAccess = "";
        let foundRefresh = "";
        let foundId = "";

        if (session.tokens) {
          // Look for token values in localStorage dump (direct or nested JSON strings).
          for (const [k, v] of Object.entries(session.tokens)) {
            const kl = k.toLowerCase();
            const value = typeof v === "string" ? v.trim() : "";
            if (kl.includes("access") && value) foundAccess = value;
            if (kl.includes("refresh") && value) foundRefresh = value;
            if ((kl === "idtoken" || kl.includes("id_token")) && value) foundId = value;

            if (!foundAccess) foundAccess = tryExtractNestedToken(value, "access");
            if (!foundRefresh) foundRefresh = tryExtractNestedToken(value, "refresh");
            if (!foundId) foundId = tryExtractNestedToken(value, "id");
          }
        }

        if (foundAccess) user.amazonAccessToken = foundAccess;
        if (foundRefresh) user.amazonRefreshToken = foundRefresh;
        if (foundId) user.amazonIdToken = foundId;
        if (foundAccess) {
          // Session JSON usually has no explicit expiry; assume 1h to avoid forced refresh loops.
          user.amazonTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
          user.lastAmazonLogin = new Date();
        }

        if (session.cookies) {
           // Basic cookie format
           user.amazonCookies = JSON.stringify([{ name: "session", value: session.cookies, domain: ".amazon.ca", path: "/" }]);
        }
      } catch (e) {
        console.error("Invalid session JSON provided:", e);
      }
    }
    
    if (filters) {
      user.filters = { ...user.filters, ...filters };
    }

    if (botSettings && typeof botSettings === "object") {
      user.botSettings = { ...user.botSettings, ...botSettings };
    }

    if (autoApplyProfile && typeof autoApplyProfile === "object") {
      user.autoApplyProfile = { ...user.autoApplyProfile, ...autoApplyProfile };
    }

    // 3. Run eligibility logic
    const result = checkEligibility(user);

    user.eligibilityStatus = result.status;
    user.eligibilityReason = result.reason;

    // 4. Save user
    await user.save();

    // 5. Send response
    res.json({
      eligibilityStatus: user.eligibilityStatus,
      eligibilityReason: user.eligibilityReason
    });

  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ msg: "Server error" });
  }
};