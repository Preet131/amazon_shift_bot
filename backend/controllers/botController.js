import { startBot, stopBot, getBotStatus } from "../services/botService.js";
import User from "../models/User.js";

// POST /api/bot/start
export const botStart = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user.amazonAccessToken)
      return res.status(400).json({
        msg: "Amazon session not set up. Call POST /api/amazon-auth/login first.",
      });

    const intervalMinutes = parseInt(req.body.intervalMinutes) || 5;
    startBot(userId, intervalMinutes);

    res.json({ msg: `Bot started. Scanning every ${intervalMinutes} minute(s).` });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// POST /api/bot/stop
export const botStop = (req, res) => {
  stopBot(req.user.id);
  res.json({ msg: "Bot stopped." });
};

// GET /api/bot/status
export const botStatus = (req, res) => {
  const status = getBotStatus(req.user.id);
  res.json(status);
};
