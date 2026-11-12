// All tunable policy numbers live here. Change values, not logic.
export const CONFIG = {
  cooldownDays: 3,          // min days between reminders on one invoice
  maxReminders: 5,          // after this, stop and tell the human to take over
  stageMinDays: { friendly: 1, firm: 7, final: 15, split_offer: 14 },
  friendlyMaxDays: 14,      // friendly tone stops being offered after this
  ladder: { friendly: 1, firm: 2, final: 3 }, // never go backwards on the ladder
  split: {
    minAmount: '100.00',    // don't offer a split below this amount due
    installments: 3,
    firstDueInDays: 7,
    gapDays: 14
  },
  reliableClient: { minPaid: 3, maxLate: 1, maxAvgDaysLate: 7 },
  senderName: process.env.SENDER_NAME || 'Your freelancer'
};
