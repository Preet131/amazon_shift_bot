import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: String,
  password: String,

  // Amazon credentials
  amazonEmail: String,
  amazonPassword: String,

  // Eligibility fields
  visaStatus: {
    type: String,
    enum: ["citizen", "work_permit", "student", "unknown"],
    default: "unknown"
  },

  documents: {
    sin: { type: Boolean, default: false },
    workPermit: { type: Boolean, default: false }
  },

  eligibilityStatus: {
    type: String,
    enum: ["pending", "eligible", "not_eligible"],
    default: "pending"
  },

  eligibilityReason: {
    type: String,
    default: ""
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  // Shift search preferences
  filters: {
    city: String,
    minPay: Number,
    shiftTypes: [String],
    preferredTiming: {
      type: String,
      enum: ["flexible", "morning", "afternoon", "night", "overnight"],
      default: "flexible"
    }
  },

  // Bot execution settings
  botSettings: {
    autoApply: { type: Boolean, default: false },
    notifyEmail: { type: String, default: "" },
    notifyTelegramId: { type: String, default: "" }
  },

  // Auto-apply form data and replay payloads
  autoApplyProfile: {
    gender: { type: String, default: "" },
    workAuthorization: { type: String, default: "" },
    assessmentReplay: { type: mongoose.Schema.Types.Mixed, default: {} },
    sinEncrypted: { type: String, default: "" },
    dob: { type: String, default: "" }, // yyyy-mm-dd
    addressHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
    interviewPreference: {
      type: String,
      enum: ["earliest", "preferred_window"],
      default: "earliest"
    },
    interviewWindow: {
      start: { type: String, default: "" },
      end: { type: String, default: "" }
    },
    phoneNumber: { type: String, default: "" }
  },

  // Amazon session tokens (captured from login)
  amazonAccessToken: String,
  amazonRefreshToken: String,
  amazonIdToken: String,
  amazonCookies: String,            // JSON-serialized cookies
  amazonTokenExpiresAt: Date,
  lastAmazonLogin: Date,

  // Kiosk PIN (for reference only, not login)
  kioskPin: String,

  // OTP email inbox config (IMAP)
  otpEmail: String,
  otpEmailPassword: String,
  otpEmailHost: { type: String, default: "imap.gmail.com" },

  /** Dedupe Telegram alerts: fingerprints of shifts already notified */
  notifiedShiftFingerprints: { type: [String], default: [] }
});

export default mongoose.model("User", userSchema);