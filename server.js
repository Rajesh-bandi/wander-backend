import "dotenv/config";
import express from "express";
import { createServer } from "http";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import postRoutes from "./routes/posts.js";
import planRoutes from "./routes/plans.js";
import chatRoutes from "./routes/chats.js";
import uploadRoutes from "./routes/upload.js";
import searchRoutes from "./routes/search.js";
import adminRoutes from "./routes/admin.js";
import notificationRoutes from "./routes/notifications.js";
import productRoutes from "./routes/products.js";
import orderRoutes from "./routes/orders.js";
import { initSocket } from "./lib/socket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Init Socket.IO
initSocket(httpServer);

// Middleware
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "10mb" }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Connect DB and start server
connectDB().then(async () => {
  const { seedAdmin } = await import("./config/seedAdmin.js");
  await seedAdmin();

  httpServer.listen(PORT, () => {
    console.log(`🚀 Wander API running on http://localhost:${PORT}`);
    console.log(`📡 Socket.IO enabled for real-time notifications & chat`);
  });
});
