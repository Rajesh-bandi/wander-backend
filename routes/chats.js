import { Router } from "express";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import auth from "../middleware/auth.js";

const router = Router();

// GET /api/chats — get all chats for the current user
router.get("/", auth, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.userId })
      .populate("participants", "username displayName avatar location")
      .populate("plan", "title destination")
      .populate("messages.author", "username displayName avatar")
      .sort({ updatedAt: -1 });

    res.json({ chats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/chats/private/:userId — start a private chat (premium required, starts as pending)
router.post("/private/:userId", auth, async (req, res) => {
  try {
    if (req.params.userId === req.userId) {
      return res.status(400).json({ message: "Cannot chat with yourself" });
    }

    // Premium check
    const currentUser = await User.findById(req.userId);
    if (!currentUser.isPremium) {
      return res.status(403).json({ message: "Premium subscription required to start private chats" });
    }

    // Check if a private chat already exists
    const existing = await Chat.findOne({
      type: "private",
      participants: { $all: [req.userId, req.params.userId] },
    }).populate("participants", "username displayName avatar location");
    if (existing) return res.json({ chat: existing });

    // Create as pending — other user must accept
    const chat = await Chat.create({
      type: "private",
      participants: [req.userId, req.params.userId],
      requestStatus: "pending",
      messages: [{
        author: req.userId,
        text: `${currentUser.displayName} wants to start a conversation.`,
      }],
    });

    const populated = await chat.populate("participants", "username displayName avatar location");
    res.status(201).json({ chat: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/chats/:id/message — send a message (only if chat is accepted, or sender is initiator)
router.post("/:id/message", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Message text is required" });

    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (chat.closed) return res.status(403).json({ message: "This chat is closed — the plan has ended" });
    if (!chat.participants.includes(req.userId)) {
      return res.status(403).json({ message: "Not a participant" });
    }

    // For private chats, only allow messages if accepted (or if it's a group chat)
    if (chat.type === "private" && chat.requestStatus !== "accepted") {
      // Allow the initiator to send the first message
      const isInitiator = chat.messages.length > 0 && chat.messages[0].author.toString() === req.userId;
      if (!isInitiator) {
        return res.status(403).json({ message: "Chat request must be accepted before you can send messages" });
      }
    }

    chat.messages.push({ author: req.userId, text });
    await chat.save();

    const updated = await Chat.findById(req.params.id)
      .populate("messages.author", "username displayName avatar");

    res.json({ messages: updated.messages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/chats/:id/accept — accept a chat request
router.post("/:id/accept", auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (!chat.participants.includes(req.userId)) {
      return res.status(403).json({ message: "Not a participant" });
    }

    chat.requestStatus = "accepted";
    await chat.save();

    res.json({ message: "Chat request accepted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/chats/:id/reject — reject a chat request
router.post("/:id/reject", auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    chat.requestStatus = "rejected";
    await chat.save();

    res.json({ message: "Chat request rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
