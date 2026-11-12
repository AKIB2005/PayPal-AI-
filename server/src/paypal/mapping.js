// Maps a PayPal Invoicing v2 invoice object to Nudge's invoice shape (see AGENTS.md).
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

export function mapInvoice(pp) {
  const d = pp.detail || {};
  const rec = pp.primary_recipients?.[0]?.billing_info || {};
  const person = [rec.name?.given_name, rec.name?.surname].filter(Boolean).join(' ');
  const clientName = rec.business_name || person || rec.email_address || 'Client';
  const total = num(pp.amount?.value);
  const due = num(pp.due_amount?.value);
  const paid = total !== null && due !== null ? Math.max(total - due, 0) : 0;
  return {
    id: pp.id,
    number: d.invoice_number || pp.id,
    clientId: rec.email_address || clientName,
    clientName,
    status: pp.status || 'UNKNOWN',
    amount: { currency: pp.amount?.currency_code || d.currency_code || 'USD', value: total === null ? '0.00' : total.toFixed(2) },
    paidAmount: paid.toFixed(2),
    dueDate: d.payment_term?.due_date || d.invoice_date || null,
    partialPayment: pp.configuration?.partial_payment || null
  };
}
