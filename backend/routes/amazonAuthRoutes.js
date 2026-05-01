import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  amazonLogin,
  getTokenStatus,
  forceRefresh,
  setKioskPin,
  setOtpEmailConfig,
} from "../controllers/amazonAuthController.js";

const router = express.Router();

// All routes require the user to be logged into our own app first
router.use(authMiddleware);

router.post("/login",         amazonLogin);       // Playwright login → store tokens
router.get("/status",         getTokenStatus);    // Check token health
router.post("/refresh",       forceRefresh);      // Force silent token refresh
router.post("/set-pin",       setKioskPin);       // Save kiosk PIN
router.post("/set-otp-email", setOtpEmailConfig); // Save IMAP config for OTP

export default router;
