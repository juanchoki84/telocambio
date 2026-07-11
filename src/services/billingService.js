import { auth } from "./firebase";

export const BILLING_CYCLES = Object.freeze({
  MONTHLY: "monthly",
  ANNUAL: "annual",
});

async function getAuthToken() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Necesitás iniciar sesión para continuar.");
  }

  return user.getIdToken();
}

async function postBillingEndpoint(path, payload = {}) {
  const token = await getAuthToken();

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "No pudimos procesar la solicitud de pago.");
  }

  return data;
}

export async function startMercadoPagoSubscription(planId, billingCycle) {
  const data = await postBillingEndpoint("/api/mp/create-subscription", {
    planId,
    billingCycle,
  });

  if (!data?.initPoint) {
    throw new Error("Mercado Pago no devolvió el enlace de checkout.");
  }

  window.location.href = data.initPoint;
  return data;
}

export async function cancelMercadoPagoSubscription() {
  return postBillingEndpoint("/api/mp/cancel-subscription");
}
