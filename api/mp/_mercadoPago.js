import crypto from "node:crypto";
import { getOptionalEnv, getRequiredEnv } from "./_env.js";

export const MERCADO_PAGO_API_BASE_URL = "https://api.mercadopago.com";

const MERCADO_PAGO_PLANS = {
  plus: {
    id: "plus",
    reason: "TeLoCambio Plus",
    prices: {
      monthly: {
        price: 2990,
        cycleLabel: "Mensual",
        frequency: 1,
        frequencyType: "months",
      },
      annual: {
        price: 29900,
        cycleLabel: "Anual",
        frequency: 12,
        frequencyType: "months",
      },
    },
  },
  premium: {
    id: "premium",
    reason: "TeLoCambio Premium",
    prices: {
      monthly: {
        price: 5990,
        cycleLabel: "Mensual",
        frequency: 1,
        frequencyType: "months",
      },
      annual: {
        price: 59900,
        cycleLabel: "Anual",
        frequency: 12,
        frequencyType: "months",
      },
    },
  },
};

export function getMercadoPagoAccessToken() {
  return getRequiredEnv("MP_ACCESS_TOKEN");
}

export function getSiteUrl() {
  return getRequiredEnv("SITE_URL").replace(/\/+$/, "");
}

export function getMercadoPagoWebhookSecret() {
  return getOptionalEnv("MP_WEBHOOK_SECRET");
}

export function getMercadoPagoPlan(planId, billingCycle = "monthly") {
  const normalizedPlanId = String(planId || "").trim().toLowerCase();
  const normalizedBillingCycle = String(billingCycle || "monthly")
    .trim()
    .toLowerCase();

  const plan = MERCADO_PAGO_PLANS[normalizedPlanId];

  if (!plan) {
    const error = new Error("Plan de Mercado Pago inválido.");
    error.statusCode = 400;
    throw error;
  }

  const cycle = plan.prices[normalizedBillingCycle];

  if (!cycle) {
    const error = new Error("Ciclo de facturación inválido.");
    error.statusCode = 400;
    throw error;
  }

  return {
    id: plan.id,
    reason: plan.reason,
    billingCycle: normalizedBillingCycle,
    cycleLabel: cycle.cycleLabel,
    price: cycle.price,
    frequency: cycle.frequency,
    frequencyType: cycle.frequencyType,
  };
}

export function buildExternalReference({ uid, planId, billingCycle }) {
  return `${uid}:${planId}:${billingCycle}`;
}

export function parseExternalReference(externalReference = "") {
  const [uid, planId, billingCycle] = String(externalReference).split(":");

  return {
    uid: uid || "",
    planId: planId || "",
    billingCycle: billingCycle || "",
  };
}

export function pickSubscriptionSnapshot(subscription = {}) {
  return {
    id: subscription.id || null,
    status: subscription.status || null,
    reason: subscription.reason || null,
    payerEmail: subscription.payer_email || null,
    externalReference: subscription.external_reference || null,
    initPoint: subscription.init_point || null,
    sandboxInitPoint: subscription.sandbox_init_point || null,
    collectorId: subscription.collector_id || null,
    dateCreated: subscription.date_created || null,
    lastModified: subscription.last_modified || null,
    nextPaymentDate: subscription.next_payment_date || null,
    autoRecurring: subscription.auto_recurring || null,
  };
}

export function pickPaymentSnapshot(payment = {}) {
  return {
    id: payment.id || null,
    status: payment.status || null,
    statusDetail: payment.status_detail || null,
    transactionAmount: payment.transaction_amount || null,
    currencyId: payment.currency_id || null,
    payer: payment.payer || null,
    externalReference: payment.external_reference || null,
    dateCreated: payment.date_created || null,
    dateApproved: payment.date_approved || null,
    paymentMethodId: payment.payment_method_id || null,
    paymentTypeId: payment.payment_type_id || null,
  };
}

export async function mercadoPagoFetch(path, options = {}) {
  const accessToken = getMercadoPagoAccessToken();
  const url = `${MERCADO_PAGO_API_BASE_URL}${path}`;

  const {
    idempotencyKey = crypto.randomUUID(),
    headers: customHeaders = {},
    ...fetchOptions
  } = options;

  const useStage = getOptionalEnv("MP_USE_STAGE") === "true";

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Idempotency-Key": idempotencyKey,
      ...(useStage ? { "X-scope": "stage" } : {}),
      ...customHeaders,
    },
  });

  const requestId =
    response.headers.get("x-request-id") ||
    response.headers.get("x-meli-trace-site") ||
    response.headers.get("x-caller-id") ||
    "";

  const rawText = await response.text();

  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = { raw: rawText };
  }

  if (!response.ok) {
    console.error("[Mercado Pago API Error]", {
      path,
      status: response.status,
      requestId,
      idempotencyKey,
      payload,
    });

    const error = new Error(
      payload?.message ||
        payload?.error ||
        `Mercado Pago respondió con error ${response.status}.`
    );

    error.statusCode = response.status;
    error.payload = payload;
    error.requestId = requestId;
    error.idempotencyKey = idempotencyKey;

    throw error;
  }

  return payload;
}