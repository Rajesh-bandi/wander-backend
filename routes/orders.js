import { Router } from "express";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import auth from "../middleware/auth.js";

const router = Router();

// POST /api/orders — place an order
router.post("/", auth, async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    let totalAmount = 0;
    const orderItems = [];
    let currency = "USD"; // Default or could be taken from the first product

    for (const item of items) {
      // Find product and ensure stock
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.productId} not found` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ message: `Not enough stock for ${product.name}` });
      }

      // Update stock
      product.stock -= item.quantity;
      await product.save();

      orderItems.push({
        productId: product._id,
        name: product.name,
        image: product.image,
        priceAtPurchase: product.price,
        quantity: item.quantity,
      });
      totalAmount += product.price * item.quantity;
      currency = product.currency || currency;
    }

    const order = new Order({
      userId: req.userId,
      items: orderItems,
      totalAmount,
      currency,
      shippingAddress: shippingAddress || "",
    });

    await order.save();

    res.status(201).json({ order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/orders/my-orders — my orders
router.get("/my-orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .populate("items.productId", "name image price currency");
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
