import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "./firebase";

function sanitizeFileName(fileName) {
  return String(fileName || "imagen-chat")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

export function uploadChatImageFile(
  user,
  chatId,
  file,
  onProgress = () => {},
  participantIds = []
) {
  if (!user?.uid) {
    throw new Error("Usuario no autenticado.");
  }

  if (!chatId) {
    throw new Error("Chat no indicado.");
  }

  if (!file?.type?.startsWith("image/")) {
    throw new Error("Solo se pueden adjuntar imágenes.");
  }

  const cleanParticipantIds = Array.from(
    new Set([user.uid, ...(participantIds || [])].filter(Boolean))
  ).slice(0, 2);

  const safeName = sanitizeFileName(file.name);
  const path = `chatAttachments/${chatId}/${user.uid}/${Date.now()}-${safeName}`;
  const fileRef = ref(storage, path);

  const uploadTask = uploadBytesResumable(fileRef, file, {
    contentType: file.type,
    customMetadata: {
      chatId,
      ownerId: user.uid,
      participantA: cleanParticipantIds[0] || user.uid,
      participantB: cleanParticipantIds[1] || "",
      originalName: file.name || "imagen-chat",
    },
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        onProgress(progress);
      },
      reject,
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);

        resolve({
          type: "image",
          url,
          path,
          name: file.name || "Imagen adjunta",
          size: file.size || 0,
          contentType: file.type || "image/jpeg",
        });
      }
    );
  });
}
