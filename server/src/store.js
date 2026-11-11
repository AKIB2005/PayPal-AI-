// In-memory state (fine for a demo; resets on restart).
export function createStore() {
  return {
    reminders: new Map(),   // invoiceId -> [{ sentAt, stage }]
    rejections: new Map(),  // `${id}|${reminderCount}|${asOf}` -> { at }
    decisions: new Map(),   // cache key -> decision
    seenEvents: new Set(),  // webhook event ids already processed
    audit: []               // newest first
  };
}
