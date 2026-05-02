import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./backend/models/User.js";

dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOne({ email: "Rudrapadhiyar05@gmail.com" });
  console.log("Cookie Data Length:", user.amazonCookies?.length);
  console.log("Raw Cookie Sample:", user.amazonCookies?.substring(0, 100));
  
  if (user.amazonCookies) {
    try {
        const parsed = JSON.parse(user.amazonCookies);
        console.log("Parsed Type:", typeof parsed, Array.isArray(parsed) ? "Array" : "Object");
        if (Array.isArray(parsed)) {
            console.log("Array Length:", parsed.length);
            console.log("First element keys:", Object.keys(parsed[0] || {}));
            console.log("First element name:", parsed[0]?.name);
        }
    } catch(e) {
        console.log("Parse Error:", e.message);
    }
  }
  
  process.exit();
}
check();
