import { InvalidWebhookSignatureError, WebhookSignatureValidator } from "mercadopago";
import { getAdminDatabase, sendApiError, sendMethodNotAllowed } from "./_firebaseAdmin.js";
import {
  mercadoPagoFetch,
  parseExternalReference,
  pickPaymentSnapshot,
  pickSubscriptionSnapshot,
} from "./_mercadoPago.js";

function getHeader(req, name) {
  const lowerName = name.toLowerCase();
  return req.headers[name] || req.headers[lowerName] || "";
}

function getQueryValue(req, key) {
  const value = req.query?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function getDataId(req) {
  return (
    getQueryValue(req, "data.id") ||
    getQueryValue(req, "data_id") ||
    req.body?.data?.id ||
    req.body?.id ||
    null
  );
}

function getEventId(req) {
  return req.body?.id || `${req.body?.type || req.body?.topic || "event"}-${getDataId(req)}-${Date.now()}`;
}

function getEventType(req) {
  return req.body?.type || req.body?.topic || req.body?.action || "unknown";
}

function shouldActivatePlan(status) {
  return status === "authorized" || status === "active";
}

function shouldDowngradeToFree(status) {
  return ["cancelled", "paused", "inactive"].includes(status);
}

async function markEventReceived(db, req) {
  const eventId = getEventId(req);
  const eventRef = db.ref(`billingWebhookEvents/${eventId}`);
  const existing = await eventRef.get();

  if (existing.exists()) {
    return { eventId, duplicated: true };
  }

  await eventRef.set({
    receivedAt: new Date().toISOString(),
    type: getEventType(req),
    dataId: getDataId(req),
    action: req.body?.action || null,
    liveMode: req.body?.live_mode ?? null,
  });

  return { eventId, duplicated: false };
}

async function syncSubscription(db, subscriptionId) {
  const subscription = await mercadoPagoFetch(`/preapproval/${subscriptionId}`, {
    method: "GET",
  });

  const existingSnapshot = await db.ref(`billingSubscriptions/${subscriptionId}`).get();
  const existing = existingSnapshot.val() || {};
  const parsedReference = parseExternalReference(subscription.external_reference);

  const uid = existing.uid || parsedReference?.uid;
  const planId = existing.planId || parsedReference?.planId;
  const billingCycle = existing.billingCycle || parsedReference?.billingCycle;
  const status = subscription.status || "unknown";
  const now = new Date().toISOString();

  if (!uid || !planId) {
    await db.ref(`billingSubscriptions/${subscriptionId}`).update({
      status,
      updatedAt: now,
      syncWarning: "No se pudo vincular la suscripción con un usuario de TeLoCambio.",
      mercadoPago: pickSubscriptionSnapshot(subscription),
    });

    return { synced: false, reason: "missing-user-or-plan" };
  }

  const updates = {
    [`billingSubscriptions/${subscriptionId}/uid`]: uid,
    [`billingSubscriptions/${subscriptionId}/planId`]: planId,
    [`billingSubscriptions/${subscriptionId}/billingCycle`]: billingCycle || null,
    [`billingSubscriptions/${subscriptionId}/status`]: status,
    [`billingSubscriptions/${subscriptionId}/updatedAt`]: now,
    [`billingSubscriptions/${subscriptionId}/lastSyncedAt`]: now,
    [`billingSubscriptions/${subscriptionId}/mercadoPago`]: pickSubscriptionSnapshot(subscription),
    [`users/${uid}/billing/provider`]: "mercadopago",
    [`users/${uid}/billing/status`]: status,
    [`users/${uid}/billing/subscriptionId`]: subscriptionId,
    [`users/${uid}/billing/planId`]: planId,
    [`users/${uid}/billing/billingCycle`]: billingCycle || null,
    [`users/${uid}/billing/nextPaymentDate`]: subscription.next_payment_date || null,
    [`users/${uid}/billing/updatedAt`]: now,
  };

  if (shouldActivatePlan(status)) {
    updates[`users/${uid}/plan`] = planId;
  }

  if (shouldDowngradeToFree(status)) {
    updates[`users/${uid}/plan`] = "free";
  }

  await db.ref().update(updates);

  return { synced: true, uid, planId, status };
}

async function syncPayment(db, paymentId) {
  const payment = await mercadoPagoFetch(`/v1/payments/${paymentId}`, {
    method: "GET",
  });

  const parsedReference = parseExternalReference(payment.external_reference);
  const now = new Date().toISOString();

  await db.ref(`billingPayments/${paymentId}`).update({
    uid: parsedReference?.uid || null,
    planId: parsedReference?.planId || null,
    billingCycle: parsedReference?.billingCycle || null,
    updatedAt: now,
    mercadoPago: pickPaymentSnapshot(payment),
  });

  return {
    synced: true,
    uid: parsedReference?.uid || null,
    planId: parsedReference?.planId || null,
    status: payment.status || "unknown",
  };
}

function validateWebhookSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;

  if (!secret) {
    console.warn("MP_WEBHOOK_SECRET no está configurado. Se omite validación de firma.");
    return;
  }

  WebhookSignatureValidator.validate({
    xSignature: getHeader(req, "x-signature"),
    xRequestId: getHeader(req, "x-request-id"),
    dataId: getDataId(req),
    secret,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendMethodNotAllowed(res);

  try {
    try {
      validateWebhookSignature(req);
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        return res.status(401).json({ error: "Firma de Mercado Pago inválida." });
      }
      throw error;
    }

    const db = getAdminDatabase();
    const { eventId, duplicated } = await markEventReceived(db, req);

    if (duplicated) {
      return res.status(200).json({ received: true, duplicated: true });
    }

    const type = getEventType(req);
    const dataId = getDataId(req);
    let result = { synced: false, reason: "unhandled-event" };

    if (!dataId) {
      result = { synced: false, reason: "missing-data-id" };
    } else if (type === "subscription_preapproval" || String(type).includes("preapproval")) {
      result = await syncSubscription(db, dataId);
    } else if (type === "payment") {
      result = await syncPayment(db, dataId);
    }

    await db.ref(`billingWebhookEvents/${eventId}`).update({
      processedAt: new Date().toISOString(),
      result,
    });

    return res.status(200).json({ received: true, result });
  } catch (error) {
    return sendApiError(res, error);
  }
}
