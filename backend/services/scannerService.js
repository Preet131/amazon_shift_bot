/** Extract numeric hourly pay from scraped DB/text values. */
export function normalizePay(pay) {
  if (pay == null || pay === "") return null;
  if (typeof pay === "number" && !Number.isNaN(pay)) return pay;
  const s = String(pay).replace(/[^\d.]/g, "");
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

export function normalizeShiftForFilter(shift) {
  const loc = shift.location != null ? String(shift.location).trim() : "";
  const title = shift.title != null ? String(shift.title).trim() : "";
  const pay = normalizePay(shift.pay);
  const startTime = shift.startTime || shift.time || "";
  const endTime = shift.endTime || "";
  return { ...shift, location: loc, title, pay, startTime, endTime };
}

/** Stable key for deduping notifications across scans. */
export function shiftFingerprint(shift) {
  const n = normalizeShiftForFilter(shift);
  return [
    n.title.toLowerCase(),
    n.location.toLowerCase(),
    String(n.startTime).toLowerCase().trim(),
  ].join("¦");
}

export function shiftMatchesUserFilters(shiftNorm, user) {
  const f = user?.filters;
  if (!f) return true;

  if (f.city && String(f.city).trim()) {
    const city = String(f.city).trim().toLowerCase();
    const loc = shiftNorm.location.toLowerCase();
    if (!loc.includes(city)) return false;
  }

  if (f.minPay != null && Number(f.minPay) > 0) {
    const min = Number(f.minPay);
    if (shiftNorm.pay == null || shiftNorm.pay < min) return false;
  }

  return true;
}

export const filterShifts = (shifts, user) => {
  if (!user?.filters || (!user.filters.city && !(user.filters.minPay > 0))) {
    return shifts.map(normalizeShiftForFilter);
  }
  return shifts
    .map(normalizeShiftForFilter)
    .filter((s) => shiftMatchesUserFilters(s, user));
};

export const fetchShifts = async () => {
  return [
    {
      title: "Warehouse Associate",
      location: "Toronto",
      pay: 20,
      startTime: "9:00 AM",
      endTime: "5:00 PM",
    },
    {
      title: "Sortation Associate",
      location: "Vancouver",
      pay: 18,
      startTime: "6:00 PM",
      endTime: "2:00 AM",
    },
  ];
};
