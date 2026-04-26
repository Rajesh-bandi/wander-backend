// Run this script to make a user an admin:
// node scripts/make-admin.js <email>

import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/make-admin.js <email>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const user = await User.findOne({ email });

if (!user) {
  console.error(`❌ No user found with email: ${email}`);
  process.exit(1);
}

user.isAdmin = true;
await user.save();
console.log(`✅ ${user.displayName} (@${user.username}) is now an admin!`);
process.exit(0);
