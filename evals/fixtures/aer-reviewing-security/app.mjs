import path from 'node:path';
export function readInvoice(invoices, actor, id) {
  return invoices.get(id);
}
export function downloadPath(root, userPath) {
  return path.resolve(root, userPath);
}
export function refreshSession(session, now) {
  return { ...session, expiresAt: now + 60000 };
}
