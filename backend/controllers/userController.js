import User from "../models/User.js";
import { checkEligibility } from "../services/eligibilityService.js";

// 👉 Update user profile + run eligibility check
export const updateProfile = async (req, res) => {
  try {
    const { visaStatus, documents, amazonEmail, amazonPassword } = req.body;
    const userId = req.user.id;

    // 1. Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // 2. Update fields (only if provided)
    if (visaStatus) user.visaStatus = visaStatus;
    if (documents) user.documents = { ...user.documents, ...documents };
    if (amazonEmail) user.amazonEmail = amazonEmail;
    if (amazonPassword) user.amazonPassword = amazonPassword;

    // 3. Run eligibility logic
    const result = checkEligibility(user);

    user.eligibilityStatus = result.status;
    user.eligibilityReason = result.reason;

    // 4. Save user
    await user.save();

    // 5. Send response
    res.json({
      eligibilityStatus: user.eligibilityStatus,
      eligibilityReason: user.eligibilityReason
    });

  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ msg: "Server error" });
  }
};