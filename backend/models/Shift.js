import mongoose from "mongoose";

const shiftSchema = new mongoose.Schema({
  title: String,
  location: String,
  pay: Number,
  startTime: String,
  endTime: String
});

export default mongoose.model("Shift", shiftSchema);