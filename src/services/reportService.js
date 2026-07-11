import { database } from "./firebase";
import { push, ref, serverTimestamp, set } from "firebase/database";

function getReportSnapshot(exchange) {
  return {
    publicationId: exchange.id,
    publicationOwnerId: exchange.userId || "",
    publicationOwnerName: exchange.userName || "Usuario",
    offerTitle: exchange.offerTitle || "",
    offerCategory: exchange.offerCategory || "",
    offerState: exchange.offerState || "",
    searchTitle: exchange.searchTitle || "",
    location: exchange.location || null,
    zone: exchange.zone || "",
    status: exchange.status || "",
    coverMedia: exchange.coverMedia || exchange.offerMedia?.[0] || null,
    mediaCount: Number(exchange.offerMediaCount || exchange.offerMedia?.length || 0),
  };
}

export async function reportPublication(user, exchange, { reason, source = "dashboard" }) {
  if (!user) {
    throw new Error("Debes iniciar sesión para denunciar una publicación.");
  }

  if (!exchange?.id) {
    throw new Error("No se pudo identificar la publicación denunciada.");
  }

  const cleanReason = String(reason || "").trim();

  if (cleanReason.length < 4) {
    throw new Error("Agregá un motivo para la denuncia.");
  }

  const reportsRef = ref(database, "publicationReports");
  const newReportRef = push(reportsRef);

  const report = {
    id: newReportRef.key,
    publicationId: exchange.id,
    publicationOwnerId: exchange.userId || "",
    reporterId: user.uid,
    reporterName: user.displayName || user.email || "Usuario",
    reporterEmail: user.email || "",
    reason: cleanReason,
    source,
    status: "pending",
    createdAt: serverTimestamp(),
    reviewedAt: null,
    reviewedBy: null,
    actionTaken: "",
    publicationSnapshot: getReportSnapshot(exchange),
  };

  await set(newReportRef, report);

  return report;
}
