import { Router } from "express";
import Plan from "../models/Plan.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import auth from "../middleware/auth.js";
import { createNotification } from "../lib/socket.js";

const router = Router();

// GET /api/plans — get all plans (auto-update expired statuses)
router.get("/", async (req, res) => {
  try {
    // Auto-complete expired plans & close their group chats
    const now = new Date();
    const expiredPlans = await Plan.find({ endDate: { $lt: now }, status: { $ne: "completed" } });
    if (expiredPlans.length > 0) {
      const expiredPlanIds = expiredPlans.map((p) => p._id);
      await Plan.updateMany(
        { _id: { $in: expiredPlanIds } },
        { $set: { status: "completed" } }
      );
      // Close group chats for expired plans
      await Chat.updateMany(
        { plan: { $in: expiredPlanIds }, closed: { $ne: true } },
        { $set: { closed: true } }
      );
    }
    // Auto-activate plans that have started
    await Plan.updateMany(
      { startDate: { $lte: now }, endDate: { $gte: now }, status: "upcoming" },
      { $set: { status: "active" } }
    );

    const plans = await Plan.find()
      .sort({ createdAt: -1 })
      .populate("creator", "username displayName avatar location")
      .populate("participants", "username displayName avatar location");

    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/plans/:id — get plan details
router.get("/:id", async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id)
      .populate("creator", "username displayName avatar location")
      .populate("participants", "username displayName avatar location")
      .populate("pendingRequests", "username displayName avatar location");

    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/plans — create a plan
router.post("/", auth, async (req, res) => {
  try {
    const { title, description, destination, coverImage, startDate, endDate, maxParticipants, budget } = req.body;

    if (!title || !destination || !startDate || !endDate) {
      return res.status(400).json({ message: "Title, destination, and dates are required" });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (start < now) {
      return res.status(400).json({ message: "Start date must be in the future" });
    }
    if (end <= start) {
      return res.status(400).json({ message: "End date must be after start date" });
    }

    const plan = await Plan.create({
      creator: req.userId,
      title, description, destination, coverImage,
      startDate: start, endDate: end, maxParticipants, budget,
      participants: [req.userId],
      status: "upcoming",
    });

    // Auto-create a group chat for this plan
    await Chat.create({
      type: "group",
      participants: [req.userId],
      plan: plan._id,
    });

    const populated = await plan.populate("creator", "username displayName avatar location");
    res.status(201).json({ plan: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/plans/:id/request — request to join a plan
router.post("/:id/request", auth, async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    // Block joining expired/completed plans
    if (plan.status === "completed" || new Date() > plan.endDate) {
      return res.status(400).json({ message: "This plan has ended and is no longer accepting members" });
    }

    if (plan.participants.includes(req.userId)) {
      return res.status(400).json({ message: "Already a participant" });
    }
    if (plan.pendingRequests.includes(req.userId)) {
      return res.status(400).json({ message: "Request already pending" });
    }
    if (plan.participants.length >= plan.maxParticipants) {
      return res.status(400).json({ message: "Plan is full" });
    }

    plan.pendingRequests.push(req.userId);
    await plan.save();

    // Notify plan creator
    const requester = await User.findById(req.userId, "displayName");
    await createNotification({
      recipientId: plan.creator,
      senderId: req.userId,
      type: "plan_request",
      planId: plan._id,
      text: `${requester.displayName} wants to join "${plan.title}"`,
    });

    res.json({ message: "Join request sent" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/plans/:id/accept/:userId — accept a join request
router.post("/:id/accept/:userId", auth, async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (plan.creator.toString() !== req.userId) {
      return res.status(403).json({ message: "Only the creator can accept requests" });
    }

    const requestIndex = plan.pendingRequests.indexOf(req.params.userId);
    if (requestIndex === -1) {
      return res.status(400).json({ message: "No pending request from this user" });
    }

    plan.pendingRequests.splice(requestIndex, 1);
    plan.participants.push(req.params.userId);
    await plan.save();

    // Add user to the group chat
    await Chat.findOneAndUpdate(
      { plan: plan._id },
      { $addToSet: { participants: req.params.userId } }
    );

    // Notify the accepted user
    await createNotification({
      recipientId: req.params.userId,
      senderId: req.userId,
      type: "plan_accepted",
      planId: plan._id,
      text: `Your request to join "${plan.title}" was accepted!`,
    });

    res.json({ message: "Request accepted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/plans/:id/reject/:userId — reject a join request
router.post("/:id/reject/:userId", auth, async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (plan.creator.toString() !== req.userId) {
      return res.status(403).json({ message: "Only the creator can reject requests" });
    }

    plan.pendingRequests.pull(req.params.userId);
    await plan.save();

    res.json({ message: "Request rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/plans/:id — edit plan (creator only)
router.put("/:id", auth, async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    if (plan.creator.toString() !== req.userId) {
      return res.status(403).json({ message: "Only the creator can edit this plan" });
    }

    const { title, description, destination, coverImage, startDate, endDate, maxParticipants, budget, currency } = req.body;

    // Validate dates if provided
    const newStart = startDate ? new Date(startDate) : plan.startDate;
    const newEnd = endDate ? new Date(endDate) : plan.endDate;

    if (newEnd <= newStart) {
      return res.status(400).json({ message: "End date must be after start date" });
    }

    // Validate maxParticipants if provided
    if (maxParticipants !== undefined) {
      if (maxParticipants < plan.participants.length) {
        return res.status(400).json({
          message: `Cannot set max participants below current participant count (${plan.participants.length})`,
        });
      }
      if (maxParticipants < 2 || maxParticipants > 50) {
        return res.status(400).json({ message: "Max participants must be between 2 and 50" });
      }
    }

    if (title !== undefined) plan.title = title.trim();
    if (description !== undefined) plan.description = description;
    if (destination !== undefined) plan.destination = destination.trim();
    if (coverImage !== undefined) plan.coverImage = coverImage;
    if (startDate !== undefined) plan.startDate = newStart;
    if (endDate !== undefined) plan.endDate = newEnd;
    if (maxParticipants !== undefined) plan.maxParticipants = maxParticipants;
    if (budget !== undefined) plan.budget = budget;
    if (currency !== undefined) plan.currency = currency;

    await plan.save();

    const updated = await Plan.findById(req.params.id)
      .populate("creator", "username displayName avatar location")
      .populate("participants", "username displayName avatar location")
      .populate("pendingRequests", "username displayName avatar location");

    res.json({ plan: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/plans/:planId/participants/:userId — remove participant (creator only)
router.delete("/:planId/participants/:userId", auth, async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    if (plan.creator.toString() !== req.userId) {
      return res.status(403).json({ message: "Only the creator can remove participants" });
    }

    // Cannot remove the creator
    if (req.params.userId === plan.creator.toString()) {
      return res.status(400).json({ message: "Cannot remove the plan creator" });
    }

    // Check if user is a participant
    if (!plan.participants.includes(req.params.userId)) {
      return res.status(400).json({ message: "User is not a participant in this plan" });
    }

    // Remove from participants
    plan.participants = plan.participants.filter(
      (p) => p.toString() !== req.params.userId
    );
    await plan.save();

    // Remove from group chat
    await Chat.findOneAndUpdate(
      { plan: plan._id },
      { $pull: { participants: req.params.userId } }
    );

    // Notify the removed user
    await createNotification({
      recipientId: req.params.userId,
      senderId: req.userId,
      type: "plan_removed",
      planId: plan._id,
      text: `You were removed from "${plan.title}"`,
    });

    const updated = await Plan.findById(req.params.planId)
      .populate("creator", "username displayName avatar location")
      .populate("participants", "username displayName avatar location")
      .populate("pendingRequests", "username displayName avatar location");

    res.json({ plan: updated, message: "Participant removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
