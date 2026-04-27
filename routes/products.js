import { Router } from "express";
import Product from "../models/Product.js";
import auth from "../middleware/auth.js";

const router = Router();

// GET /api/products — list all active products
router.get("/", async (req, res) => {
  try {
    const products = await Product.find({ active: true })
      .sort({ createdAt: -1 })
      .populate("reviews.author", "username displayName avatar");
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



export default router;
