import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  image: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  category: {
    type: String,
    required: true,
    enum: ["backpacks", "accessories", "electronics", "clothing", "camping", "other"],
    default: "other",
  },
  stock: { type: Number, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  reviews: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);
export default Product;
