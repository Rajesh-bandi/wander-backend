import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Notification from "../models/Notification.js";

let io;
const userSockets = new Map(); // userId -> Set<socketId>

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // Auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;

    // Track user's sockets
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);

    // Join a personal room for targeted notifications
    socket.join(`user:${userId}`);

    // Join chat rooms
    socket.on("join_chat", (chatId) => {
      socket.join(`chat:${chatId}`);
    });

    // Leave chat room
    socket.on("leave_chat", (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    // Handle chat message
    socket.on("chat_message", (data) => {
      // Broadcast to chat room (excluding sender)
      socket.to(`chat:${data.chatId}`).emit("new_message", {
        chatId: data.chatId,
        message: data.message,
        sender: data.sender,
      });
    });

    // Typing indicator
    socket.on("typing", (data) => {
      socket.to(`chat:${data.chatId}`).emit("user_typing", {
        chatId: data.chatId,
        userId,
        username: data.username,
      });
    });

    socket.on("stop_typing", (data) => {
      socket.to(`chat:${data.chatId}`).emit("user_stop_typing", {
        chatId: data.chatId,
        userId,
      });
    });

    socket.on("disconnect", () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) userSockets.delete(userId);
      }
    });
  });

  return io;
}

export function getIO() {
  return io;
}

// Create and emit a notification in real-time
export async function createNotification({ recipientId, senderId, type, postId, chatId, planId, text }) {
  // Don't notify yourself
  if (recipientId.toString() === senderId.toString()) return null;

  try {
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type,
      post: postId || undefined,
      chat: chatId || undefined,
      plan: planId || undefined,
      text: text || "",
    });

    // Populate and emit via socket
    const populated = await Notification.findById(notification._id)
      .populate("sender", "username displayName avatar")
      .populate("post", "image caption");

    if (io) {
      io.to(`user:${recipientId.toString()}`).emit("notification", populated);
    }

    return populated;
  } catch (err) {
    console.error("Notification error:", err);
    return null;
  }
}
