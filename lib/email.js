import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

export async function sendOTPEmail(email, otp, purpose) {
  const subject = purpose === "SIGNUP"
    ? "Verify your Wander account"
    : "Reset your Wander password";

  const actionText = purpose === "SIGNUP"
    ? "verify your email address"
    : "reset your password";

  const html = `
    <div style="font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 28px; font-weight: 700; color: #1a1a2e; margin: 0; font-family: Georgia, serif;">Wander</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Your travel community</p>
      </div>

      <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 16px; padding: 32px; text-align: center; border: 1px solid #e2e8f0;">
        <h2 style="font-size: 20px; font-weight: 600; color: #1a1a2e; margin: 0 0 8px;">${subject}</h2>
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">
          Use the code below to ${actionText}. This code expires in <strong style="color: #1a1a2e;">5 minutes</strong>.
        </p>

        <div style="background: #ffffff; border-radius: 12px; padding: 16px 24px; display: inline-block; letter-spacing: 8px; font-size: 32px; font-weight: 700; color: #1a1a2e; border: 2px dashed #e2e8f0;">
          ${otp}
        </div>
      </div>

      <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #f1f5f9;">
        <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin: 0;">
          If you didn't request this code, you can safely ignore this email. Someone might have entered your email by mistake.
          <br/><br/>
          &copy; ${new Date().getFullYear()} Wander. All rights reserved.
        </p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"Wander" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 OTP email sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send OTP email to ${email}:`, error.message);
    throw new Error("Failed to send verification email. Please try again.");
  }
}
