import { get, ref, serverTimestamp, update } from "firebase/database";
import { database } from "./firebase";

function cleanText(value) {
  return String(value || "").trim();
}

function cleanMoneyAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function getUserDisplayName(user) {
  return user?.displayName || user?.email || "Usuario";
}

function getExchangeOwnerName(exchange) {
  return exchange?.userName || exchange?.ownerName || "Usuario";
}

function normalizeStatus(exchange) {
  return exchange?.status || "active";
}

function assertValidExchange(exchange, label) {
  if (!exchange?.id) {
    throw new Error(`${label} no es válida.`);
  }

  if (normalizeStatus(exchange) !== "active") {
    throw new Error(`${label} debe estar activa para enviar una propuesta.`);
  }
}

function buildProposalId(userId, myExchangeId, otherExchangeId) {
  return [userId, myExchangeId, otherExchangeId]
    .join("_")
    .replace(/[.#$[\]/]/g, "_");
}

function buildDefaultMessage(myExchange, otherExchange) {
  return `Te propongo intercambiar por mi publicación: ${myExchange.offerTitle || myExchange.searchTitle || "mi publicación"}.`;
}

export async function createExchangeProposal(user, data) {
  if (!user?.uid) {
    throw new Error("Debes iniciar sesión para enviar una propuesta.");
  }

  const myExchange = data?.myExchange;
  const otherExchange = data?.otherExchange;

  assertValidExchange(myExchange, "Tu publicación");
  assertValidExchange(otherExchange, "La publicación destino");

  if (myExchange.userId !== user.uid) {
    throw new Error("Solo podés proponer publicaciones propias.");
  }

  if (otherExchange.userId === user.uid) {
    throw new Error("No podés enviarte una propuesta a tu propia publicación.");
  }

  if (!otherExchange.userId) {
    throw new Error("No pudimos identificar al usuario que recibirá la propuesta.");
  }

  const proposalId = buildProposalId(user.uid, myExchange.id, otherExchange.id);
  const proposalRef = ref(database, `interests/${proposalId}`);
  const currentSnapshot = await get(proposalRef);

  if (currentSnapshot.exists()) {
    const currentProposal = currentSnapshot.val() || {};

    if (["pending", "accepted", "completed"].includes(currentProposal.status)) {
      return {
        id: proposalId,
        alreadyExists: true,
        status: currentProposal.status,
      };
    }
  }

  const proposalMessage =
    cleanText(data.proposalMessage) || buildDefaultMessage(myExchange, otherExchange);
  const extraProduct = cleanText(data.extraProduct);
  const extraMoneyEnabled = Boolean(data.extraMoneyEnabled);
  const extraMoneyAmount = extraMoneyEnabled
    ? cleanMoneyAmount(data.extraMoneyAmount)
    : 0;
  const matchScore = Number(data.score || data.matchScore || 0);

  const proposalPayload = {
    id: proposalId,
    type: "proposal",
    status: "pending",

    fromUserId: user.uid,
    fromUserName: getUserDisplayName(user),
    toUserId: otherExchange.userId,
    toUserName: getExchangeOwnerName(otherExchange),

    targetExchangeId: otherExchange.id,
    myExchangeId: myExchange.id,
    otherExchangeId: otherExchange.id,

    mySearchTitle: myExchange.searchTitle || "",
    myOfferTitle: myExchange.offerTitle || "",
    otherSearchTitle: otherExchange.searchTitle || "",
    otherOfferTitle: otherExchange.offerTitle || "",

    proposalMessage,
    extraProduct,
    extraMoneyEnabled,
    extraMoneyAmount,

    matchScore: Number.isFinite(matchScore) ? matchScore : 0,
    score: Number.isFinite(matchScore) ? matchScore : 0,
    reasons: Array.isArray(data.reasons) ? data.reasons : [],
    source: data.source || "proposal_modal",

    chatId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await update(ref(database), {
    [`interests/${proposalId}`]: proposalPayload,
  });

  return {
    id: proposalId,
    alreadyExists: false,
    status: "pending",
  };
}
