import { Router } from "express";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import auth from "../middleware/auth.js";

const router = Router();

// POST /api/orders — place an order
router.post("/", auth, async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ message: "Cart is empty" });

    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) return res.status(404).json({ message: `Product ${item.productId} not found` });
      if (product.stock < item.qty) return res.status(400).json({ message: `${product.name} is out of stock` });

      product.stock -= item.qty;
      await product.save();

      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.image,
        price: product.price,
        qty: item.qty,
      });
      total += product.price * item.qty;
    }

    const order = await Order.create({
      user: req.userId,
      items: orderItems,
      total,
      shippingAddress: shippingAddress || "",
    });

    res.status(201).json({ order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/orders — my orders
router.get("/", auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .populate("items.product", "name image price");
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
