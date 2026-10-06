export function quoteForScreen(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitCents, 0);
}
export function quoteForReceipt(items) {
  let total = 0;
  for (const item of items) total += item.quantity * item.unitCents;
  return { totalCents: total, currency: 'USD' };
}
export function quoteForExport(items) {
  return JSON.stringify({
    totalCents: items.reduce(
      (sum, item) => sum + item.quantity * item.unitCents,
      0,
    ),
    currency: 'USD',
  });
}
