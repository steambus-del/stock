// Daily portfolio unrealized gain snapshots.
// Used to calculate daily movement.
//
// Daily Movement = Today's Total Unrealized Gain - Previous Snapshot Total Unrealized Gain
//
// Add one row after each trading day if you want a growing daily history.
// Example:
// { date: "2026-07-08", totalUnrealizedGain: 420.00, totalCost: 15000.00, note: "手动记录" }

window.dailySnapshots = [
    // { date: "2026-07-08", totalUnrealizedGain: 420.00, totalCost: 15000.00, note: "手动记录" }
];
