export const checkEligibility = (user) => {
  // Rule 1: Must have SIN
  if (!user.documents.sin) {
    return {
      status: "not_eligible",
      reason: "SIN required"
    };
  }

  // Rule 2: Visa rules
  if (user.visaStatus === "citizen") {
    return {
      status: "eligible",
      reason: "Citizen"
    };
  }

  if (user.visaStatus === "work_permit" && user.documents.workPermit) {
    return {
      status: "eligible",
      reason: "Valid work permit"
    };
  }

  if (user.visaStatus === "student") {
    return {
      status: "not_eligible",
      reason: "Students not allowed"
    };
  }

  return {
    status: "pending",
    reason: "Incomplete profile"
  };
};