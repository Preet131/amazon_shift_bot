import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { botStart, botStop, botStatus } from "../controllers/botController.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/start",  botStart);   // { intervalMinutes?: number }
router.post("/stop",   botStop);
router.get("/status",  botStatus);

export default router;
