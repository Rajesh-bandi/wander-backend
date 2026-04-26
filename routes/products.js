import { Router } from "express";
import Product from "../models/Product.js";
import auth from "../middleware/auth.js";

const router = Router();

// GET /api/products — list all active products
router.get("/", async (req, res) => {
  try {
    const products = await Product.find({ active: true }).sort({ createdAt: -1 });
    res.json({ products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/products/:id — single product
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("reviews.author", "username displayName avatar");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/products/:id/review — add a review
router.post("/:id/review", auth, async (req, res) => {
  try {
    const { rating, text } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: "Rating 1-5 required" });

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Check if user already reviewed
    const existing = product.reviews.find((r) => r.author.toString() === req.userId);
    if (existing) {
      existing.rating = rating;
      existing.text = text || "";
    } else {
      product.reviews.push({ author: req.userId, rating, text: text || "" });
    }

    // Recalculate average
    const total = product.reviews.reduce((sum, r) => sum + r.rating, 0);
    product.rating = Math.round((total / product.reviews.length) * 10) / 10;
    product.reviewCount = product.reviews.length;

    await product.save();
    const updated = await Product.findById(req.params.id)
      .populate("reviews.author", "username displayName avatar");
    res.json({ product: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
