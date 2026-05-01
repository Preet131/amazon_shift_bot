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
    shiftTypes: [String]
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
  otpEmailHost: { type: String, default: "imap.gmail.com" }
});

export default mongoose.model("User", userSchema);