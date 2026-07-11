import { push, ref, serverTimestamp } from "firebase/database";
import { database } from "./firebase";

export async function createHelpRequest(user, data) {
  const cleanData = {
    userId: user?.uid || null,
    userEmail: user?.email || data.email || "",
    userName: user?.displayName || data.name || "",
    name: data.name?.trim() || "",
    email: data.email?.trim() || "",
    topic: data.topic || "general",
    priority: data.priority || "normal",
    subject: data.subject?.trim() || "",
    message: data.message?.trim() || "",
    contactPreference: data.contactPreference || "email",
    status: "pending",
    source: "help_page",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  return push(ref(database, "helpRequests"), cleanData);
}