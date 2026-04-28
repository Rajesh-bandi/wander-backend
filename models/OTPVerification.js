import mongoose from "mongoose";

const otpVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  otp: {
    type: String,
    required: true,
  },
  purpose: {
    type: String,
    enum: ["SIGNUP", "RESET_PASSWORD"],
    required: true,
  },
  expiryTime: {
    type: Date,
    required: true,
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  attempts: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Index for faster lookups and auto-cleanup
otpVerificationSchema.index({ email: 1, purpose: 1, isUsed: 1 });
otpVerificationSchema.index({ expiryTime: 1 }, { expireAfterSeconds: 0 });

const OTPVerification = mongoose.model("OTPVerification", otpVerificationSchema);
export default OTPVerification;
