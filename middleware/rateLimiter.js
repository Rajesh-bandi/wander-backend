import rateLimit from "express-rate-limit";

// General auth rate limiter - 5 requests per minute
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: "Too many attempts. Please try again in a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP send rate limiter - 3 requests per 2 minutes
export const otpSendLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  max: 3,
  message: { message: "Too many OTP requests. Please wait before requesting another." },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP verify rate limiter - 5 attempts per 5 minutes
export const otpVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { message: "Too many verification attempts. Please request a new OTP." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password reset rate limiter - 3 per hour
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { message: "Too many password reset attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
