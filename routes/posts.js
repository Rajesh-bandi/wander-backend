import { Router } from "express";
import Post from "../models/Post.js";
import User from "../models/User.js";
import auth from "../middleware/auth.js";
import { createNotification } from "../lib/socket.js";

const router = Router();

// Helper to populate comments fully
const COMMENT_POPULATE = [
  { path: "comments.author", select: "username displayName avatar" },
  { path: "comments.replies.author", select: "username displayName avatar" },
];

// GET /api/posts — get all posts (feed)
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("author", "username displayName avatar location")
      .populate(COMMENT_POPULATE);

    const total = await Post.countDocuments();
    res.json({ posts, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/posts/user/:userId — get posts by a specific user
router.get("/user/:userId", async (req, res) => {
  try {
    const posts = await Post.find({ author: req.params.userId })
      .sort({ createdAt: -1 })
      .populate("author", "username displayName avatar location")
      .populate(COMMENT_POPULATE);
    res.json({ posts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/posts/saved — get user's saved posts
router.get("/saved", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const posts = await Post.find({ _id: { $in: user.savedPosts } })
      .sort({ createdAt: -1 })
      .populate("author", "username displayName avatar location")
      .populate(COMMENT_POPULATE);
    res.json({ posts, savedIds: user.savedPosts.map(String) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/posts/explore — trending / discover posts
router.get("/explore", async (req, res) => {
  try {
    const { tag, location, sort } = req.query;
    const filter = {};
    if (tag) filter.tags = { $in: [tag] };
    if (location) filter.location = { $regex: location, $options: "i" };

    let sortObj = { createdAt: -1 };
    if (sort === "popular") sortObj = { likesCount: -1 };

    const posts = await Post.find(filter)
      .sort(sortObj)
      .limit(50)
      .populate("author", "username displayName avatar location")
      .populate(COMMENT_POPULATE);

    // Get trending tags
    const allPosts = await Post.find({}, "tags location").limit(500);
    const tagCount = {};
    const locationCount = {};
    allPosts.forEach(p => {
      (p.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
      if (p.location) { locationCount[p.location] = (locationCount[p.location] || 0) + 1; }
    });
    const trendingTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([tag, count]) => ({ tag, count }));
    const trendingLocations = Object.entries(locationCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([location, count]) => ({ location, count }));

    res.json({ posts, trendingTags, trendingLocations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/posts/:id — get single post (tracks unique views)
router.get("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { views: req.userId } },
      { new: true }
    )
      .populate("author", "username displayName avatar location")
      .populate("likes", "username displayName avatar")
      .populate(COMMENT_POPULATE);
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json({ post });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/posts/:id — edit own post
router.put("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.author.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }
    const { caption, location, tags } = req.body;
    if (caption !== undefined) post.caption = caption;
    if (location !== undefined) post.location = location;
    if (tags !== undefined) post.tags = tags;
    await post.save();
    const updated = await Post.findById(req.params.id)
      .populate("author", "username displayName avatar location")
      .populate(COMMENT_POPULATE);
    res.json({ post: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/posts — create a post
router.post("/", auth, async (req, res) => {
  try {
    const { image, caption, location, tags } = req.body;
    if (!image) return res.status(400).json({ message: "Image is required" });
    const post = await Post.create({ author: req.userId, image, caption, location, tags: tags || [] });
    const populated = await post.populate("author", "username displayName avatar location");
    res.status(201).json({ post: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/posts/:id/like — toggle like
router.post("/:id/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const index = post.likes.indexOf(req.userId);
    if (index > -1) { post.likes.splice(index, 1); } else { post.likes.push(req.userId); }
    await post.save();
    // Notify post owner on like
    if (index === -1) {
      createNotification({ recipientId: post.author, senderId: req.userId, type: "like", postId: post._id, text: "liked your post" });
    }
    res.json({ likes: post.likes.length, liked: index === -1 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/posts/:id/comment — add comment
// POST /api/posts/:id/comment — add comment
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Comment text is required" });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    post.comments.push({ author: req.userId, text });
    await post.save();
    // Notify post owner
    createNotification({ recipientId: post.author, senderId: req.userId, type: "comment", postId: post._id, text: `commented: "${text.substring(0, 50)}"` });
    const updated = await Post.findById(req.params.id).populate(COMMENT_POPULATE);
    res.json({ comments: updated.comments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/posts/:postId/comment/:commentId — delete own comment
router.delete("/:postId/comment/:commentId", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    // Allow comment author or post author to delete
    if (comment.author.toString() !== req.userId && post.author.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }
    post.comments.pull(req.params.commentId);
    await post.save();
    const updated = await Post.findById(req.params.postId).populate(COMMENT_POPULATE);
    res.json({ comments: updated.comments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/posts/:postId/comment/:commentId/like — toggle like on comment
router.post("/:postId/comment/:commentId/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    const idx = comment.likes.indexOf(req.userId);
    if (idx > -1) { comment.likes.splice(idx, 1); } else { comment.likes.push(req.userId); }
    await post.save();
    res.json({ likes: comment.likes.length, liked: idx === -1 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/posts/:postId/comment/:commentId/reply — add reply to comment
router.post("/:postId/comment/:commentId/reply", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Reply text is required" });
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    comment.replies.push({ author: req.userId, text });
    await post.save();
    const updated = await Post.findById(req.params.postId).populate(COMMENT_POPULATE);
    res.json({ comments: updated.comments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/posts/:id — delete own post
router.delete("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.author.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }
    await post.deleteOne();
    res.json({ message: "Post deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/posts/:id/bookmark — toggle bookmark
router.post("/:id/bookmark", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const idx = user.savedPosts.indexOf(req.params.id);
    if (idx === -1) {
      user.savedPosts.push(req.params.id);
    } else {
      user.savedPosts.splice(idx, 1);
    }
    await user.save();
    res.json({ saved: idx === -1, savedPosts: user.savedPosts.map(String) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
