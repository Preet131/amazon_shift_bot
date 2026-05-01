import mongoose from "mongoose";
import Shift from "../models/shift.js";

await Shift.create([
  {
    title: "Warehouse Associate",
    location: "Toronto",
    pay: 20,
    startTime: "09:00",
    endTime: "17:00"
  }
]);