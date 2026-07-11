import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { storage } from "./firebase";

const MAX_FILES = 8;
const MAX_FILE_SIZE_MB = 80;
const ALLOWED_TYPES = ["image/", "video/"];

function sanitizeFileName(fileName) {
  return fileName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getFileType(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

function getFileExtension(fileName, fallback = "mp4") {
  const cleanName = String(fileName || "");
  const parts = cleanName.split(".");
  const extension = parts.length > 1 ? parts.pop() : "";

  return extension ? extension.toLowerCase() : fallback;
}

function createMediaId(index) {
  const uniqueId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;

  return `media-${uniqueId}`;
}

function validateFiles(files) {
  if (files.length > MAX_FILES) {
    throw new Error(`Podés subir hasta ${MAX_FILES} archivos por publicación.`);
  }

  files.forEach((file) => {
    const isAllowed = ALLOWED_TYPES.some((type) => file.type.startsWith(type));

    if (!isAllowed) {
      throw new Error("Solo se permiten imágenes y videos.");
    }

    const fileSizeMb = file.size / 1024 / 1024;

    if (fileSizeMb > MAX_FILE_SIZE_MB) {
      throw new Error(
        `El archivo ${file.name} supera el límite de ${MAX_FILE_SIZE_MB}MB.`
      );
    }
  });
}

function buildOriginalFilePath({ userId, exchangeId, mediaId, file }) {
  const safeName = sanitizeFileName(file.name || "archivo");
  const extension = getFileExtension(
    safeName,
    file.type.startsWith("video/") ? "mp4" : "jpg"
  );

  const baseName = safeName.replace(/\.[^/.]+$/, "") || "archivo";
  const finalFileName = `${mediaId}-${baseName}.${extension}`;

  return `exchangeMedia/${userId}/${exchangeId}/originals/${finalFileName}`;
}

function uploadSingleFile({
  user,
  exchangeId,
  file,
  index,
  totalBytes,
  uploadedBefore,
  onProgress,
}) {
  return new Promise((resolve, reject) => {
    const type = getFileType(file);
    const mediaId = createMediaId(index);
    const filePath = buildOriginalFilePath({
      userId: user.uid,
      exchangeId,
      mediaId,
      file,
    });

    const fileRef = ref(storage, filePath);

    const uploadTask = uploadBytesResumable(fileRef, file, {
      contentType: file.type,
      customMetadata: {
        userId: user.uid,
        exchangeId,
        mediaId,
        originalName: file.name,
        mediaType: type,
      },
    });

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        if (!onProgress || !totalBytes) return;

        const currentTotal = uploadedBefore + snapshot.bytesTransferred;
        const progress = Math.round((currentTotal / totalBytes) * 100);

        onProgress(Math.min(progress, 100));
      },
      (error) => {
        reject(error);
      },
      async () => {
        const originalUrl = await getDownloadURL(uploadTask.snapshot.ref);

        if (type === "video") {
          resolve({
            mediaId,
            type: "video",
            status: "processing",
            url: "",
            downloadUrl: "",
            path: "",
            originalUrl,
            originalDownloadUrl: originalUrl,
            originalPath: filePath,
            originalFullPath: uploadTask.snapshot.ref.fullPath,
            fullPath: "",
            bucket: uploadTask.snapshot.ref.bucket,
            name: file.name,
            contentType: "video/mp4",
            originalContentType: file.type,
            size: file.size,
            uploadedAt: Date.now(),
          });

          return;
        }

        resolve({
          mediaId,
          type: "image",
          status: "ready",
          url: originalUrl,
          downloadUrl: originalUrl,
          path: filePath,
          fullPath: uploadTask.snapshot.ref.fullPath,
          originalUrl,
          originalDownloadUrl: originalUrl,
          originalPath: filePath,
          originalFullPath: uploadTask.snapshot.ref.fullPath,
          bucket: uploadTask.snapshot.ref.bucket,
          name: file.name,
          contentType: file.type,
          size: file.size,
          uploadedAt: Date.now(),
        });
      }
    );
  });
}

export async function uploadExchangeMediaFiles(
  user,
  files,
  onProgress,
  exchangeId
) {
  if (!user) {
    throw new Error("Debes iniciar sesión para subir archivos.");
  }

  if (!exchangeId) {
    throw new Error(
      "No se puede subir multimedia sin exchangeId. Primero hay que preparar la publicación."
    );
  }

  const filesArray = Array.from(files || []);

  if (filesArray.length === 0) {
    return [];
  }

  validateFiles(filesArray);

  const totalBytes = filesArray.reduce((total, file) => total + file.size, 0);
  let uploadedBefore = 0;
  const uploadedFiles = [];

  for (const [index, file] of filesArray.entries()) {
    const uploadedFile = await uploadSingleFile({
      user,
      exchangeId,
      file,
      index,
      totalBytes,
      uploadedBefore,
      onProgress,
    });

    uploadedBefore += file.size;
    uploadedFiles.push(uploadedFile);
  }

  if (onProgress) {
    onProgress(100);
  }

  return uploadedFiles;
}

function getStoragePathFromGsUrl(value) {
  if (typeof value !== "string" || !value.startsWith("gs://")) return "";
  return value.replace(/^gs:\/\/[^/]+\//, "");
}

function buildStorageRefFromPath(path) {
  if (!path) return null;
  return ref(storage, path);
}

function buildStorageRefs(media) {
  const paths = [
    media?.path,
    media?.fullPath,
    media?.originalPath,
    media?.originalFullPath,
    getStoragePathFromGsUrl(media?.url),
    getStoragePathFromGsUrl(media?.downloadUrl),
    getStoragePathFromGsUrl(media?.originalUrl),
    getStoragePathFromGsUrl(media?.originalDownloadUrl),
    getStoragePathFromGsUrl(media?.gsUrl),
  ].filter(Boolean);

  const uniquePaths = Array.from(new Set(paths));

  return uniquePaths.map(buildStorageRefFromPath).filter(Boolean);
}

export async function deleteExchangeMediaFiles(mediaFiles = []) {
  const filesArray = Array.from(mediaFiles || []);

  if (filesArray.length === 0) {
    return;
  }

  const refs = filesArray.flatMap(buildStorageRefs);

  if (refs.length === 0) {
    return;
  }

  const deletions = refs.map(async (fileRef) => {
    try {
      await deleteObject(fileRef);
    } catch (error) {
      if (error?.code === "storage/object-not-found") {
        return;
      }

      console.error("No pudimos eliminar archivo de Storage:", error);
    }
  });

  await Promise.all(deletions);
}
