import { push, ref, serverTimestamp } from "firebase/database";
import { database } from "./firebase";

export async function reportChat(user, chat, reportData) {
  if (!user?.uid) {
    throw new Error("Usuario no autenticado.");
  }

  if (!reportData?.chatId) {
    throw new Error("Chat no indicado.");
  }

  const cleanPayload = {
    type: "chat",
    source: "chat_page",
    status: "pending",
    chatId: reportData.chatId,
    reporterId: user.uid,
    reporterName: user.displayName || user.email || "Usuario",
    reporterEmail: user.email || "",
    reportedUserId: reportData.reportedUserId || "",
    reportedUserName: reportData.reportedUserName || "Usuario",
    reasonCode: reportData.reasonCode || "other",
    reason: reportData.reason || "Otro motivo",
    detail: String(reportData.detail || "").trim(),
    participants: chat?.participants || {},
    participantNames: chat?.participantNames || {},
    lastMessages: Array.isArray(reportData.lastMessages)
      ? reportData.lastMessages.slice(-8)
      : [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  return push(ref(database, "chatReports"), cleanPayload);
}
