import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, maxlength: 2000 },
}, { timestamps: true });

const chatSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["group", "private"],
    required: true,
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Plan",
    default: null,
  },
  requestStatus: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "accepted",
  },
  closed: {
    type: Boolean,
    default: false,
  },
  messages: [messageSchema],
}, { timestamps: true });

const Chat = mongoose.model("Chat", chatSchema);
export default Chat;
