import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: {
    type: String,
    enum: ["like", "comment", "follow", "reply", "chat_message", "chat_request", "plan_request", "plan_accepted"],
    required: true,
  },
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
  chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  text: { type: String, default: "" },
  read: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
