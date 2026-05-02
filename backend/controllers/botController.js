import { startBot, stopBot, getBotStatus } from "../services/botService.js";
import User from "../models/User.js";

// POST /api/bot/start
export const botStart = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.amazonAccessToken) {
      return res.status(400).json({ msg: "Amazon account not connected." });
    }

    // Default to 300s (5m) if not provided
    const intervalSeconds = req.body.intervalSeconds || (req.body.intervalMinutes ? req.body.intervalMinutes * 60 : 300);
    
    startBot(req.user.id, intervalSeconds);
    
    res.json({ msg: "Bot started successfully.", intervalSeconds });
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
