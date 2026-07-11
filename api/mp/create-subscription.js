import {
  getAdminDatabase,
  sendApiError,
  sendMethodNotAllowed,
  verifyFirebaseUser,
} from "./_firebaseAdmin.js";
import {
  buildExternalReference,
  getMercadoPagoPlan,
  getSiteUrl,
  mercadoPagoFetch,
  pickSubscriptionSnapshot,
} from "./_mercadoPago.js";

function getTestPayerEmail() {
  const testPayerEmail = process.env.MP_TEST_PAYER_EMAIL;

  if (!testPayerEmail || testPayerEmail.trim().length === 0) {
    return "";
  }

  return testPayerEmail.trim();
}

function shouldSkipPayerEmail() {
  return process.env.MP_SKIP_PAYER_EMAIL === "true";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendMethodNotAllowed(res);

  try {
    const user = await verifyFirebaseUser(req);
    const { planId, billingCycle } = req.body || {};

    const plan = getMercadoPagoPlan(planId, billingCycle);
    const siteUrl = getSiteUrl();

    const skipPayerEmail = shouldSkipPayerEmail();
    const testPayerEmail = getTestPayerEmail();

    const payerEmail = skipPayerEmail
      ? ""
      : testPayerEmail || user.email || "";

    if (!skipPayerEmail && !payerEmail) {
      return res.status(400).json({
        error:
          "No se pudo definir el pagador de Mercado Pago. El usuario no tiene email y no se configuró MP_TEST_PAYER_EMAIL.",
      });
    }

    const externalReference = buildExternalReference({
      uid: user.uid,
      planId: plan.id,
      billingCycle: plan.billingCycle,
    });

    const subscriptionEndDate = new Date();
    subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 5);

    const body = {
      reason: `${plan.reason} ${plan.cycleLabel}`,
      external_reference: externalReference,
      auto_recurring: {
        frequency: plan.frequency || 1,
        frequency_type: plan.frequencyType,
        end_date: subscriptionEndDate.toISOString(),
        transaction_amount: plan.price,
        currency_id: "ARS",
      },
      back_url: `${siteUrl}/planes?mp=return`,
      status: "pending",
      ...(payerEmail ? { payer_email: payerEmail } : {}),
    };

    console.log("[TeLoCambio MP create subscription payload]", {
      ...body,
      payer_email: body.payer_email || "[sin payer_email]",
    });

    const subscription = await mercadoPagoFetch("/preapproval", {
      method: "POST",
      idempotencyKey: `preapproval-${user.uid}-${plan.id}-${plan.billingCycle}-${Date.now()}`,
      body: JSON.stringify(body),
    });

    const checkoutUrl =
      subscription?.init_point || subscription?.sandbox_init_point || "";

    if (!subscription?.id || !checkoutUrl) {
      return res.status(502).json({
        error:
          "Mercado Pago no devolvió el enlace de checkout de la suscripción.",
      });
    }

    const db = getAdminDatabase();
    const now = new Date().toISOString();

    await db.ref().update({
      [`users/${user.uid}/billing`]: {
        provider: "mercadopago",
        status: "pending",
        requestedPlan: plan.id,
        requestedBillingCycle: plan.billingCycle,
        subscriptionId: subscription.id,
        payerEmail: payerEmail || null,
        skippedPayerEmail: skipPayerEmail,
        isTestPayer: Boolean(testPayerEmail),
        updatedAt: now,
      },
      [`billingSubscriptions/${subscription.id}`]: {
        uid: user.uid,
        planId: plan.id,
        billingCycle: plan.billingCycle,
        price: plan.price,
        currency: "ARS",
        provider: "mercadopago",
        status: subscription.status || "pending",
        externalReference,
        payerEmail: payerEmail || null,
        skippedPayerEmail: skipPayerEmail,
        isTestPayer: Boolean(testPayerEmail),
        initPoint: subscription.init_point || null,
        sandboxInitPoint: subscription.sandbox_init_point || null,
        checkoutUrl,
        createdAt: now,
        updatedAt: now,
        mercadoPago: pickSubscriptionSnapshot(subscription),
      },
    });

    return res.status(200).json({
      initPoint: checkoutUrl,
      subscriptionId: subscription.id,
      status: subscription.status || "pending",
    });
  } catch (error) {
    return sendApiError(res, error);
  }
}