import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const users = await mongoose.connection.collection('users').find({}).toArray();
  console.log("Users in DB:");
  users.forEach(u => console.log(`- ${u.email} (ID: ${u._id})`));
  process.exit(0);
});
