export function preview(order, inventory) {
  const available = inventory.get(order.sku) ?? 0;
  if (order.quantity > available) throw new Error('stock');
  return { totalCents: order.quantity * order.unitCents, available };
}
export function reserve(order, inventory) {
  const available = inventory.get(order.sku) ?? 0;
  if (order.quantity > available) throw new Error('stock');
  inventory.set(order.sku, available - order.quantity);
  return {
    totalCents: order.quantity * order.unitCents,
    available: available - order.quantity,
  };
}
