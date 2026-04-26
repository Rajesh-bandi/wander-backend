import mongoose from "mongoose";

const planSchema = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    default: "",
    maxlength: 2000,
  },
  destination: {
    type: String,
    required: true,
  },
  coverImage: {
    type: String,
    default: "",
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function (v) {
        return v > this.startDate;
      },
      message: "End date must be after start date",
    },
  },
  maxParticipants: {
    type: Number,
    default: 4,
    min: 2,
    max: 50,
  },
  budget: {
    type: Number,
    default: 0,
    min: 0,
  },
  currency: {
    type: String,
    default: "USD",
  },
  status: {
    type: String,
    enum: ["upcoming", "active", "completed"],
    default: "upcoming",
  },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  pendingRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

// Virtual: check if plan is expired
planSchema.virtual("isExpired").get(function () {
  return new Date() > this.endDate;
});

// Ensure virtuals show in JSON
planSchema.set("toJSON", { virtuals: true });
planSchema.set("toObject", { virtuals: true });

const Plan = mongoose.model("Plan", planSchema);
export default Plan;
