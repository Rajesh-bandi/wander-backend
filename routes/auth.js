import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import OTPVerification from "../models/OTPVerification.js";
import auth from "../middleware/auth.js";
import { authLimiter, otpSendLimiter, otpVerifyLimiter, passwordResetLimiter } from "../middleware/rateLimiter.js";
import { sendOTPEmail } from "../lib/email.js";

const router = Router();

// ─── Helpers ────────────────────────────────────────────

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function validatePassword(password) {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special character";
  return null;
}

async function createAndSendOTP(email, purpose) {
  // Invalidate any existing unused OTPs for this email + purpose
  await OTPVerification.updateMany(
    { email, purpose, isUsed: false },
    { $set: { isUsed: true } }
  );

  const otp = generateOTP();
  const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await OTPVerification.create({ email, otp, purpose, expiryTime });
  await sendOTPEmail(email, otp, purpose);

  return otp;
}

// ─── POST /api/auth/register ────────────────────────────
// Creates user with isVerified=false, sends OTP
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { username, email, password, displayName, location, mobile, address, coordinates } = req.body;

    if (!username || !email || !password || !displayName) {
      return res.status(400).json({ message: "Username, email, password, and display name are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const existingUser = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] });
    if (existingUser) {
      return res.status(400).json({
        message: existingUser.email === email.toLowerCase() ? "Email already registered" : "Username already taken",
      });
    }

    const user = await User.create({
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      password,
      displayName: displayName.trim(),
      location: location || "",
      mobile: mobile || "",
      address: address || "",
      coordinates: coordinates || { lat: null, lng: null },
      isVerified: false,
    });

    // Send OTP for email verification
    await createAndSendOTP(user.email, "SIGNUP");

    // Issue token but user is NOT verified yet
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.status(201).json({
      token,
      user,
      message: "Account created! Please verify your email with the OTP sent.",
      requiresVerification: true,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── POST /api/auth/send-otp ────────────────────────────
// Resend OTP (for signup verification or password reset)
router.post("/send-otp", otpSendLimiter, async (req, res) => {
  try {
    const { email, purpose } = req.body;

    if (!email || !purpose) {
      return res.status(400).json({ message: "Email and purpose are required" });
    }

    if (!["SIGNUP", "RESET_PASSWORD"].includes(purpose)) {
      return res.status(400).json({ message: "Invalid purpose" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (purpose === "SIGNUP") {
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(404).json({ message: "No account found with this email" });
      }
      if (user.isVerified) {
        return res.status(400).json({ message: "Email is already verified" });
      }
    }

    if (purpose === "RESET_PASSWORD") {
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(404).json({ message: "No account found with this email" });
      }
    }

    await createAndSendOTP(normalizedEmail, purpose);

    res.json({ message: "OTP sent to your email" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── POST /api/auth/verify-otp ──────────────────────────
// Verify OTP for signup email verification
router.post("/verify-otp", otpVerifyLimiter, async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;

    if (!email || !otp || !purpose) {
      return res.status(400).json({ message: "Email, OTP, and purpose are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const otpRecord = await OTPVerification.findOne({
      email: normalizedEmail,
      purpose,
      isUsed: false,
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({ message: "No valid OTP found. Please request a new one." });
    }

    // Check attempts
    if (otpRecord.attempts >= 5) {
      otpRecord.isUsed = true;
      await otpRecord.save();
      return res.status(400).json({ message: "Too many failed attempts. Please request a new OTP." });
    }

    // Increment attempts
    otpRecord.attempts += 1;
    await otpRecord.save();

    // Check expiry
    if (new Date() > otpRecord.expiryTime) {
      otpRecord.isUsed = true;
      await otpRecord.save();
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    // Check OTP match
    if (otpRecord.otp !== otp) {
      return res.status(400).json({ message: `Invalid OTP. ${5 - otpRecord.attempts} attempt(s) remaining.` });
    }

    // Mark OTP as used
    otpRecord.isUsed = true;
    await otpRecord.save();

    // If signup verification, mark user as verified
    if (purpose === "SIGNUP") {
      const user = await User.findOneAndUpdate(
        { email: normalizedEmail },
        { isVerified: true },
        { new: true }
      );
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
      return res.json({
        message: "Email verified successfully!",
        verified: true,
        token,
        user,
      });
    }

    // For RESET_PASSWORD, return a reset token (short-lived)
    if (purpose === "RESET_PASSWORD") {
      const resetToken = jwt.sign(
        { email: normalizedEmail, purpose: "RESET_PASSWORD" },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
      );
      return res.json({
        message: "OTP verified. You may now reset your password.",
        verified: true,
        resetToken,
      });
    }

    res.json({ message: "OTP verified", verified: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── POST /api/auth/login ───────────────────────────────
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in",
        requiresVerification: true,
        email: user.email,
      });
    }

    if (user.suspended) {
      return res.status(403).json({ message: "Your account has been suspended. Contact support for help." });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── POST /api/auth/forgot-password ─────────────────────
router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: "If an account exists with this email, you will receive an OTP." });
    }

    await createAndSendOTP(normalizedEmail, "RESET_PASSWORD");

    res.json({ message: "If an account exists with this email, you will receive an OTP." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── POST /api/auth/verify-reset-otp ────────────────────
// Alias for verify-otp with RESET_PASSWORD purpose
router.post("/verify-reset-otp", otpVerifyLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const otpRecord = await OTPVerification.findOne({
      email: normalizedEmail,
      purpose: "RESET_PASSWORD",
      isUsed: false,
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({ message: "No valid OTP found. Please request a new one." });
    }

    if (otpRecord.attempts >= 5) {
      otpRecord.isUsed = true;
      await otpRecord.save();
      return res.status(400).json({ message: "Too many failed attempts. Please request a new OTP." });
    }

    otpRecord.attempts += 1;
    await otpRecord.save();

    if (new Date() > otpRecord.expiryTime) {
      otpRecord.isUsed = true;
      await otpRecord.save();
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    if (otpRecord.otp !== otp) {
      return res.status(400).json({ message: `Invalid OTP. ${5 - otpRecord.attempts} attempt(s) remaining.` });
    }

    otpRecord.isUsed = true;
    await otpRecord.save();

    const resetToken = jwt.sign(
      { email: normalizedEmail, purpose: "RESET_PASSWORD" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    res.json({
      message: "OTP verified. You may now reset your password.",
      verified: true,
      resetToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── POST /api/auth/reset-password ──────────────────────
router.post("/reset-password", passwordResetLimiter, async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ message: "Reset token and new password are required" });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: "Invalid or expired reset token. Please start over." });
    }

    if (decoded.purpose !== "RESET_PASSWORD") {
      return res.status(400).json({ message: "Invalid reset token" });
    }

    const user = await User.findOne({ email: decoded.email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password reset successfully. You can now log in with your new password." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── POST /api/auth/change-password ─────────────────────
// Authenticated user changing password
router.post("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from current password" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── POST /api/auth/delete-account ──────────────────────
// Soft-delete account with re-authentication
router.post("/delete-account", auth, async (req, res) => {
  try {
    const { password, confirmation } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required to delete your account" });
    }

    if (confirmation !== "DELETE") {
      return res.status(400).json({ message: 'Please type "DELETE" to confirm account deletion' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Re-authenticate
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    // Soft delete: mark user as deleted
    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    // Remove user from others' followers/following
    await User.updateMany(
      { followers: user._id },
      { $pull: { followers: user._id } }
    );
    await User.updateMany(
      { following: user._id },
      { $pull: { following: user._id } }
    );

    // Remove user from plan participants and pending requests
    const Plan = (await import("../models/Plan.js")).default;
    await Plan.updateMany(
      { participants: user._id },
      { $pull: { participants: user._id } }
    );
    await Plan.updateMany(
      { pendingRequests: user._id },
      { $pull: { pendingRequests: user._id } }
    );

    // Remove user from chat participants
    const Chat = (await import("../models/Chat.js")).default;
    await Chat.updateMany(
      { participants: user._id },
      { $pull: { participants: user._id } }
    );

    // Note: Posts are kept but author will show as "Deleted User" since user.isDeleted=true
    // Plans created by user are NOT deleted — ownership could be transferred manually

    res.json({ message: "Account deleted successfully. We're sorry to see you go." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── GET /api/auth/me — get current user + following IDs ──
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({
      user,
      followingIds: user.following.map((id) => id.toString()),
      savedPostIds: (user.savedPosts || []).map((id) => id.toString()),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
