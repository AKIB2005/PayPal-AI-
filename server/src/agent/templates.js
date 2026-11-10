// Fallback + mock message templates. Placeholders are filled in code, never by the LLM.
export const PLACEHOLDERS = ['clientName', 'invoiceNumber', 'amountDue', 'dueDate', 'daysOverdue', 'splitPlan', 'senderName'];

const T = {
  friendly: {
    subject: 'Quick reminder: invoice {{invoiceNumber}}',
    body: 'Hi {{clientName}},\n\nJust a friendly nudge that invoice {{invoiceNumber}} ({{amountDue}}) was due on {{dueDate}}. If it has already been paid, please ignore this note. Otherwise, you can pay using the link on the invoice.\n\nThanks so much,\n{{senderName}}'
  },
  firm: {
    subject: 'Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue',
    body: 'Hi {{clientName}},\n\nInvoice {{invoiceNumber}} for {{amountDue}} was due on {{dueDate}} and is now {{daysOverdue}} days overdue. Please arrange payment this week, or reply to let me know if there is a problem I can help with.\n\nRegards,\n{{senderName}}'
  },
  final: {
    subject: 'Final notice: invoice {{invoiceNumber}}',
    body: 'Hi {{clientName}},\n\nThis is a final reminder that invoice {{invoiceNumber}} for {{amountDue}} is {{daysOverdue}} days overdue. Please pay within 5 days or contact me to agree a plan. After that I will need to pause further work.\n\nRegards,\n{{senderName}}'
  },
  split_offer: {
    subject: 'A payment plan for invoice {{invoiceNumber}}',
    body: 'Hi {{clientName}},\n\nInvoice {{invoiceNumber}} ({{amountDue}}) is {{daysOverdue}} days overdue. If paying in one go is difficult, I am happy to split it:\n\n{{splitPlan}}\n\nYou can pay the first installment using the link on the invoice. Let me know if this works for you.\n\nThanks,\n{{senderName}}'
  }
};

export function template(stage) {
  const t = T[stage];
  if (!t) throw new Error(`No template for stage: ${stage}`);
  return { ...t };
}

export function reasoningFor(f, stage) {
  const hist = f.reliableClient ? 'a reliable payment history, so a softer approach is likely enough' : 'no strong history of paying on time';
  const why = {
    friendly: `Only ${f.daysOverdue} day(s) overdue and the client has ${hist}; a light nudge is proportionate.`,
    firm: `${f.daysOverdue} days overdue with ${f.priorReminders} earlier reminder(s); time to be clearer about expectations.`,
    final: `${f.daysOverdue} days overdue after ${f.priorReminders} reminder(s); a final notice sets a clear deadline.`,
    split_offer: `${f.daysOverdue} days overdue; a pre-approved payment plan is more likely to get paid than another demand.`
  };
  return why[stage];
}
