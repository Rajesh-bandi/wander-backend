import User from "../models/User.js";

/**
 * Seeds a default admin user if no admin exists in the database.
 * This runs once on server startup — if any admin already exists, it skips.
 *
 * Default admin credentials:
 *   Email:    admin@wander.travel
 *   Password: admin123
 *
 * Change these immediately in production!
 */
export async function seedAdmin() {
  try {
    const existingAdmin = await User.findOne({ isAdmin: true });
    if (existingAdmin) {
      console.log(`👤 Admin exists: @${existingAdmin.username} (${existingAdmin.email})`);
      return;
    }

    // No admin found — create default one
    const admin = await User.create({
      username: "admin",
      email: "admin@wander.travel",
      password: "admin123",
      displayName: "Admin",
      bio: "Platform administrator",
      isAdmin: true,
      isPremium: true,
    });

    console.log(`✅ Default admin created!`);
    console.log(`   Email:    admin@wander.travel`);
    console.log(`   Password: admin123`);
    console.log(`   ⚠️  Change this password in production!`);
  } catch (error) {
    // If admin user already exists with that email/username, that's fine
    if (error.code === 11000) {
      // Duplicate key — make that existing user an admin
      const user = await User.findOne({ $or: [{ email: "admin@wander.travel" }, { username: "admin" }] });
      if (user && !user.isAdmin) {
        user.isAdmin = true;
        user.isPremium = true;
        await user.save();
        console.log(`✅ Made existing user @${user.username} an admin`);
      }
    } else {
      console.error("Admin seed error:", error.message);
    }
  }
}
