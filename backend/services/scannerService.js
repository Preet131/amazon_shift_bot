export const fetchShifts = async () => {
  // Simulated shifts (replace later with real API/scraping)
  return [
    {
      title: "Warehouse Associate",
      location: "Toronto",
      pay: 20,
      startTime: "9:00 AM",
      endTime: "5:00 PM"
    },
    {
      title: "Sortation Associate",
      location: "Vancouver",
      pay: 18,
      startTime: "6:00 PM",
      endTime: "2:00 AM"
    }
  ];
};

export const filterShifts = (shifts, user) => {
  if (!user.filters) return shifts;
  
  return shifts.filter(shift => {
    let matches = true;
    if (user.filters.city && shift.location !== user.filters.city) matches = false;
    if (user.filters.minPay && shift.pay < user.filters.minPay) matches = false;
    return matches;
  });
};