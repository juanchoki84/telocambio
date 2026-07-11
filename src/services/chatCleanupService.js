import { get, ref, serverTimestamp, update } from "firebase/database";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { database, storage } from "./firebase";

function isParticipant(user, proposal) {
  if (!user?.uid || !proposal) return false;
  return proposal.fromUserId === user.uid || proposal.toUserId === user.uid;
}

function getChatIdFromProposal(proposal) {
  return proposal?.chatId || proposal?.id || "";
}

function getStoragePathFromGsUrl(value) {
  if (typeof value !== "string" || !value.startsWith("gs://")) return "";
  return value.replace(/^gs:\/\/[^/]+\//, "");
}

function getAttachmentPath(attachment) {
  if (!attachment) return "";

  return (
    attachment.path ||
    attachment.fullPath ||
    attachment.storagePath ||
    getStoragePathFromGsUrl(attachment.url) ||
    getStoragePathFromGsUrl(attachment.downloadUrl) ||
    getStoragePathFromGsUrl(attachment.gsUrl) ||
    ""
  );
}

function collectAttachmentPaths(messagesSnapshot) {
  const paths = [];

  if (!messagesSnapshot.exists()) return paths;

  messagesSnapshot.forEach((childSnapshot) => {
    const message = childSnapshot.val() || {};

    const directPath = getAttachmentPath(message.attachment);
    if (directPath) paths.push(directPath);

    if (Array.isArray(message.attachments)) {
      message.attachments.forEach((attachment) => {
        const path = getAttachmentPath(attachment);
        if (path) paths.push(path);
      });
    }
  });

  return Array.from(new Set(paths));
}

function getParticipantIds(proposal, chatData) {
  return Array.from(
    new Set(
      [
        proposal?.fromUserId,
        proposal?.toUserId,
        ...Object.keys(chatData?.participants || {}),
      ].filter(Boolean)
    )
  );
}

async function deleteStoragePaths(paths) {
  if (!paths.length) {
    return {
      deletedCount: 0,
      failedPaths: [],
    };
  }

  const results = await Promise.allSettled(
    paths.map((path) => deleteObject(storageRef(storage, path)))
  );

  const failedPaths = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;

    const code = result.reason?.code || "";

    if (code === "storage/object-not-found") return;

    failedPaths.push(paths[index]);
  });

  return {
    deletedCount: paths.length - failedPaths.length,
    failedPaths,
  };
}

export async function cleanupChatResources(user, proposal) {
  if (!isParticipant(user, proposal)) {
    throw new Error("No tenés permisos para eliminar este chat.");
  }

  const chatId = getChatIdFromProposal(proposal);

  if (!chatId) {
    return {
      chatId: "",
      deletedAttachmentCount: 0,
      failedAttachmentCount: 0,
    };
  }

  const [chatSnapshot, messagesSnapshot] = await Promise.all([
    get(ref(database, `chats/${chatId}`)),
    get(ref(database, `chatMessages/${chatId}`)),
  ]);

  const chatData = chatSnapshot.exists() ? chatSnapshot.val() || {} : {};
  const participantIds = getParticipantIds(proposal, chatData);
  const attachmentPaths = collectAttachmentPaths(messagesSnapshot);
  const storageResult = await deleteStoragePaths(attachmentPaths);

  const updates = {
    [`chats/${chatId}`]: null,
    [`chatMessages/${chatId}`]: null,
    [`interests/${proposal.id}/chatDeletedAt`]: serverTimestamp(),
    [`interests/${proposal.id}/chatDeletedBy`]: user.uid,
  };

  participantIds.forEach((participantId) => {
    updates[`userChats/${participantId}/${chatId}`] = null;
  });

  if (storageResult.failedPaths.length > 0) {
    updates[`chatCleanupWarnings/${chatId}`] = {
      chatId,
      proposalId: proposal.id || "",
      failedPaths: storageResult.failedPaths,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      reason: "storage-delete-failed",
    };
  }

  await update(ref(database), updates);

  if (storageResult.failedPaths.length > 0) {
    throw new Error(
      "El chat se eliminó de Realtime Database, pero algunos adjuntos no pudieron borrarse de Storage."
    );
  }

  return {
    chatId,
    deletedAttachmentCount: storageResult.deletedCount,
    failedAttachmentCount: storageResult.failedPaths.length,
  };
}
