import { Router } from "express";
import User from "../models/User.js";
import auth from "../middleware/auth.js";
import { createNotification } from "../lib/socket.js";

const router = Router();

// GET /api/users/:username — get user profile
router.get("/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({
      user: {
        ...user.toJSON(),
        followersCount: user.followers.length,
        followingCount: user.following.length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/users/:username/followers — get followers list
router.get("/:username/followers", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .populate("followers", "username displayName avatar location isPremium");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ users: user.followers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/users/:username/following — get following list
router.get("/:username/following", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .populate("following", "username displayName avatar location isPremium");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ users: user.following });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/users/profile — update own profile
router.put("/profile", auth, async (req, res) => {
  try {
    const { displayName, bio, location, avatar, coverImage, isPremium } = req.body;
    const update = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (bio !== undefined) update.bio = bio;
    if (location !== undefined) update.location = location;
    if (avatar !== undefined) update.avatar = avatar;
    if (coverImage !== undefined) update.coverImage = coverImage;
    if (isPremium !== undefined) update.isPremium = isPremium;

    const user = await User.findByIdAndUpdate(
      req.userId,
      update,
      { new: true, runValidators: true }
    );
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/users/:id/follow — toggle follow (premium required to follow)
router.post("/:id/follow", auth, async (req, res) => {
  try {
    if (req.params.id === req.userId) {
      return res.status(400).json({ message: "Cannot follow yourself" });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    const currentUser = await User.findById(req.userId);
    const isFollowing = currentUser.following.includes(req.params.id);

    // Premium required to follow (unfollow is always allowed)
    if (!isFollowing && !currentUser.isPremium) {
      return res.status(403).json({ message: "Premium subscription required to follow users" });
    }

    if (isFollowing) {
      currentUser.following.pull(req.params.id);
      targetUser.followers.pull(req.userId);
    } else {
      currentUser.following.push(req.params.id);
      targetUser.followers.push(req.userId);
    }

    await currentUser.save();
    await targetUser.save();

    // Notify on follow
    if (!isFollowing) {
      createNotification({ recipientId: req.params.id, senderId: req.userId, type: "follow", text: "started following you" });
    }

    res.json({ following: !isFollowing });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
