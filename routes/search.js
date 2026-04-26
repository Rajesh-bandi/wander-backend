import { Router } from "express";
import User from "../models/User.js";
import Post from "../models/Post.js";
import Plan from "../models/Plan.js";
import auth from "../middleware/auth.js";

const router = Router();

// GET /api/search?q=... — search users, posts, and plans
router.get("/", auth, async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) {
      return res.json({ users: [], posts: [], plans: [] });
    }

    const regex = new RegExp(q, "i");

    // Search users by username, displayName, location
    const users = await User.find({
      $or: [
        { username: regex },
        { displayName: regex },
        { location: regex },
      ],
    })
      .select("username displayName avatar location bio isPremium followers following")
      .limit(20);

    // Search posts by caption, location
    const posts = await Post.find({
      $or: [
        { caption: regex },
        { location: regex },
      ],
    })
      .populate("author", "username displayName avatar location")
      .sort({ createdAt: -1 })
      .limit(20);

    // Search plans by title, destination, description
    const plans = await Plan.find({
      $or: [
        { title: regex },
        { destination: regex },
        { description: regex },
      ],
    })
      .populate("creator", "username displayName avatar")
      .populate("participants", "username displayName avatar")
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ users, posts, plans });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
