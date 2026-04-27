import mongoose from "mongoose";

const imageSchema = new mongoose.Schema({
  data: { type: String, required: true },       // base64 encoded
  mimeType: { type: String, required: true },    // e.g. image/png
  filename: { type: String, required: true },
}, { timestamps: true });

const Image = mongoose.model("Image", imageSchema);
export default Image;
