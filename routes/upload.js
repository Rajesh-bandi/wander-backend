import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import Image from "../models/Image.js";

// Store in memory buffer (not disk) — we save to MongoDB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const router = Router();

// POST /api/upload — upload image, store in MongoDB as base64
router.post("/", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const base64 = req.file.buffer.toString("base64");
    const ext = req.file.originalname.split(".").pop() || "jpg";
    const filename = `${randomUUID()}.${ext}`;

    const image = await Image.create({
      data: base64,
      mimeType: req.file.mimetype,
      filename,
    });

    // Return URL path that maps to /api/images/:id
    const url = `/api/images/${image._id}`;
    res.json({ url, filename });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
