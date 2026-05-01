import express from "express";
import { getShifts } from "../controllers/shiftController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/get-shifts", authMiddleware, getShifts);

export default router;