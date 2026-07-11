import {
  getAdminDatabase,
  sendApiError,
  sendMethodNotAllowed,
  verifyFirebaseUser,
} from "./_firebaseAdmin.js";
import { mercadoPagoFetch } from "./_mercadoPago.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendMethodNotAllowed(res);

  try {
    const user = await verifyFirebaseUser(req);
    const db = getAdminDatabase();
    const billingSnapshot = await db.ref(`users/${user.uid}/billing`).get();
    const billing = billingSnapshot.val() || {};
    const subscriptionId = billing.subscriptionId;
    const now = new Date().toISOString();

    if (!subscriptionId) {
      await db.ref().update({
        [`users/${user.uid}/plan`]: "free",
        [`users/${user.uid}/billing/status`]: "inactive",
        [`users/${user.uid}/billing/updatedAt`]: now,
      });

      return res.status(200).json({ status: "inactive" });
    }

    await mercadoPagoFetch(`/preapproval/${subscriptionId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    });

    await db.ref().update({
      [`users/${user.uid}/plan`]: "free",
      [`users/${user.uid}/billing/status`]: "cancelled",
      [`users/${user.uid}/billing/cancelledAt`]: now,
      [`users/${user.uid}/billing/updatedAt`]: now,
      [`billingSubscriptions/${subscriptionId}/status`]: "cancelled",
      [`billingSubscriptions/${subscriptionId}/cancelledAt`]: now,
      [`billingSubscriptions/${subscriptionId}/updatedAt`]: now,
    });

    return res.status(200).json({ status: "cancelled" });
  } catch (error) {
    return sendApiError(res, error);
  }
}
