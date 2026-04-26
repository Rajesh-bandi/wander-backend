import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Post from "../models/Post.js";
import Plan from "../models/Plan.js";
import Chat from "../models/Chat.js";
import Product from "../models/Product.js";
import Notification from "../models/Notification.js";
import adminAuth from "../middleware/adminAuth.js";

const router = Router();

// ─── Auth ───
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (!user.isAdmin) return res.status(403).json({ message: "Not an admin account" });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "12h" });
    res.json({ token, user });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ─── Dashboard Stats ───
router.get("/stats", adminAuth, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, totalPosts, totalPlans, totalChats, totalProducts,
      premiumUsers, suspendedUsers, newUsersMonth, newPostsMonth,
      newUsersWeek, recentUsers, totalNotifications] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Plan.countDocuments(),
      Chat.countDocuments(),
      Product.countDocuments(),
      User.countDocuments({ isPremium: true }),
      User.countDocuments({ suspended: true }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Post.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      User.find().sort({ createdAt: -1 }).limit(5).select("username displayName avatar createdAt isPremium isAdmin suspended"),
      Notification.countDocuments(),
    ]);

    // Revenue estimate (premium users × $9.99/mo)
    const monthlyRevenue = premiumUsers * 9.99;
    const annualRevenue = monthlyRevenue * 12;

    // Growth data (last 7 days)
    const growthData = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(); dayStart.setDate(dayStart.getDate() - i); dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      const users = await User.countDocuments({ createdAt: { $gte: dayStart, $lt: dayEnd } });
      const posts = await Post.countDocuments({ createdAt: { $gte: dayStart, $lt: dayEnd } });
      growthData.push({ date: dayStart.toISOString().slice(0,10), users, posts });
    }

    res.json({
      totalUsers, totalPosts, totalPlans, totalChats, totalProducts,
      premiumUsers, suspendedUsers, newUsersMonth, newPostsMonth, newUsersWeek,
      recentUsers, totalNotifications,
      monthlyRevenue: monthlyRevenue.toFixed(2),
      annualRevenue: annualRevenue.toFixed(2),
      growthData,
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ─── User Management ───
router.get("/users", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const q = req.query.q || "";
    const filter = q ? { $or: [
      { username: new RegExp(q, "i") },
      { displayName: new RegExp(q, "i") },
      { email: new RegExp(q, "i") },
    ]} : {};

    const [users, total] = await Promise.all([
      User.find(filter).select("-password").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, pages: Math.ceil(total / limit) });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

router.put("/users/:id", adminAuth, async (req, res) => {
  try {
    const { isPremium, isAdmin, bio, displayName, suspended, suspendedReason } = req.body;
    const update = {};
    if (isPremium !== undefined) {
      update.isPremium = isPremium;
      if (isPremium) update.premiumSince = new Date();
    }
    if (isAdmin !== undefined) update.isAdmin = isAdmin;
    if (bio !== undefined) update.bio = bio;
    if (displayName !== undefined) update.displayName = displayName;
    if (suspended !== undefined) {
      update.suspended = suspended;
      update.suspendedReason = suspended ? (suspendedReason || "Suspended by admin") : "";
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

router.delete("/users/:id", adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    await Promise.all([
      Post.deleteMany({ author: userId }),
      Plan.deleteMany({ creator: userId }),
      Chat.updateMany({}, { $pull: { participants: userId } }),
      User.updateMany({}, { $pull: { followers: userId, following: userId } }),
      Notification.deleteMany({ $or: [{ sender: userId }, { recipient: userId }] }),
    ]);
    await User.findByIdAndDelete(userId);
    res.json({ message: "User deleted" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ─── Product Management ───
router.get("/products", adminAuth, async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json({ products });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

router.post("/products", adminAuth, async (req, res) => {
  try {
    const { name, description, image, price, category, stock, featured } = req.body;
    if (!name || !image || price === undefined) {
      return res.status(400).json({ message: "Name, image, and price are required" });
    }
    const product = await Product.create({ name, description, image, price, category, stock, featured });
    res.status(201).json({ product });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

router.put("/products/:id", adminAuth, async (req, res) => {
  try {
    const { name, description, image, price, category, stock, featured, active } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (image !== undefined) update.image = image;
    if (price !== undefined) update.price = price;
    if (category !== undefined) update.category = category;
    if (stock !== undefined) update.stock = stock;
    if (featured !== undefined) update.featured = featured;
    if (active !== undefined) update.active = active;
    const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ product });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

router.delete("/products/:id", adminAuth, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ─── Post Management ───
router.get("/posts", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const [posts, total] = await Promise.all([
      Post.find().populate("author", "username displayName avatar").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Post.countDocuments(),
    ]);
    res.json({ posts, total, pages: Math.ceil(total / limit) });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

router.delete("/posts/:id", adminAuth, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "Post deleted" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ─── Plan Management ───
router.get("/plans", adminAuth, async (req, res) => {
  try {
    const plans = await Plan.find().populate("creator", "username displayName avatar").sort({ createdAt: -1 });
    res.json({ plans });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

router.delete("/plans/:id", adminAuth, async (req, res) => {
  try {
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ message: "Plan deleted" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ─── Revenue / Subscription ───
router.get("/revenue", adminAuth, async (req, res) => {
  try {
    const premiumUsers = await User.find({ isPremium: true })
      .select("username displayName avatar email isPremium premiumSince createdAt")
      .sort({ premiumSince: -1 });

    const total = premiumUsers.length;
    const monthlyRevenue = total * 9.99;

    // Monthly breakdown (last 6 months)
    const monthlyBreakdown = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const subs = await User.countDocuments({ isPremium: true, premiumSince: { $gte: monthStart, $lt: monthEnd } });
      monthlyBreakdown.push({
        month: monthStart.toLocaleString("en-US", { month: "short", year: "numeric" }),
        newSubscribers: subs,
        revenue: (subs * 9.99).toFixed(2),
      });
    }

    res.json({ premiumUsers, total, monthlyRevenue: monthlyRevenue.toFixed(2), monthlyBreakdown });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

export default router;
