import { filterShifts } from "../services/scannerService.js";
import User from "../models/User.js";
import Shift from "../models/shift.js";
import { scrapeShifts } from "../playwright/scrapeShifts.js";

export const getShifts = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ msg: "User not found" });

    const shifts = await Shift.find({});
    res.json(shifts);

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error fetching shifts" });
  }
};

export const fetchShifts = async (req, res) => {
  const user = req.user;

  const shifts = await scrapeShifts(user);

  res.json(shifts);
};