import { Router } from "express";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import auth from "../middleware/auth.js";

const router = Router();

// POST /api/reviews/:productId — add a verified purchase review
router.post("/:productId", auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const { productId } = req.params;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating between 1 and 5 is required" });
    }

    // Check if the product exists
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Verify purchase
    const hasPurchased = await Order.exists({
      userId: req.userId,
      "items.productId": productId,
      status: { $in: ["confirmed", "shipped", "delivered", "pending"] } // Assuming any order counts, but we can refine to 'delivered' later
    });

    if (!hasPurchased) {
      return res.status(403).json({ message: "Purchase required to review this product" });
    }

    // Check if user already reviewed
    const existingReview = product.reviews.find((r) => r.author.toString() === req.userId);
    if (existingReview) {
      return res.status(400).json({ message: "Already reviewed this product" });
    }

    // Add review
    product.reviews.push({ 
      author: req.userId, 
      rating, 
      text: comment || "" 
    });

    // Recalculate average
    const total = product.reviews.reduce((sum, r) => sum + r.rating, 0);
    product.rating = Math.round((total / product.reviews.length) * 10) / 10;
    product.reviewCount = product.reviews.length;

    await product.save();
    
    const updatedProduct = await Product.findById(productId)
      .populate("reviews.author", "username displayName avatar");
      
    res.status(201).json({ message: "Review added successfully", product: updatedProduct });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
