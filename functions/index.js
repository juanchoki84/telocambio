const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getStorage } = require("firebase-admin/storage");
const { logger } = require("firebase-functions");
const { execFile } = require("child_process");
const { promisify } = require("util");
const crypto = require("crypto");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");

initializeApp();

const execFileAsync = promisify(execFile);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFirebaseDownloadUrl(bucketName, filePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    filePath
  )}?alt=media&token=${token}`;
}

async function fileExists(bucket, filePath) {
  if (!filePath) return false;

  const [exists] = await bucket.file(filePath).exists();
  return exists;
}

async function findMediaEntry(db, exchangeId, mediaId, filePath) {
  const snapshot = await db.ref(`exchanges/${exchangeId}/offerMedia`).get();

  if (!snapshot.exists()) {
    return {
      offerMedia: null,
      mediaKey: null,
      media: null,
    };
  }

  const offerMedia = snapshot.val();

  const entries = Array.isArray(offerMedia)
    ? offerMedia.map((item, index) => [index, item])
    : Object.entries(offerMedia || {});

  const targetEntry = entries.find(([, media]) => {
    return media?.mediaId === mediaId || media?.originalPath === filePath;
  });

  if (!targetEntry) {
    return {
      offerMedia,
      mediaKey: null,
      media: null,
    };
  }

  return {
    offerMedia,
    mediaKey: targetEntry[0],
    media: targetEntry[1],
  };
}

async function waitForMediaEntry(db, exchangeId, mediaId, filePath) {
  // Menos espera = menos costo si el evento llega antes de que RTDB termine de guardar.
  // En condiciones normales, la publicación aparece en pocos segundos.
  const maxAttempts = 12;
  const delayMs = 1500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await findMediaEntry(db, exchangeId, mediaId, filePath);

    if (result.mediaKey !== null && result.media) {
      if (attempt > 1) {
        logger.info("Media item encontrado después de esperar RTDB", {
          exchangeId,
          mediaId,
          attempt,
        });
      }

      return result;
    }

    logger.info("Esperando que la publicación exista en RTDB", {
      exchangeId,
      mediaId,
      filePath,
      attempt,
      maxAttempts,
    });

    await sleep(delayMs);
  }

  return {
    offerMedia: null,
    mediaKey: null,
    media: null,
  };
}

async function markMediaAsError(db, uid, exchangeId, mediaKey, message) {
  if (mediaKey === null || mediaKey === undefined) return;

  const errorPayload = {
    status: "error",
    processingError: message || "No pudimos convertir el video.",
    updatedAt: Date.now(),
  };

  await db.ref().update({
    [`exchanges/${exchangeId}/offerMedia/${mediaKey}`]: errorPayload,
    [`userExchanges/${uid}/${exchangeId}/offerMedia/${mediaKey}`]: errorPayload,
  });
}

exports.processExchangeVideo = onObjectFinalized(
  {
    region: "us-east1",
    timeoutSeconds: 420,
    memory: "1GiB",
    cpu: 1,
    minInstances: 0,
    maxInstances: 1,
    concurrency: 1,
  },
  async (event) => {
    const object = event.data;
    const filePath = object.name || "";
    const contentType = object.contentType || "";
    const bucketName = object.bucket;

    if (!filePath.includes("/originals/")) return;
    if (!contentType.startsWith("video/")) return;
    if (filePath.includes("/processed/")) return;

    const match = filePath.match(
      /^exchangeMedia\/([^/]+)\/([^/]+)\/originals\/([^/]+)$/
    );

    if (!match) {
      logger.warn("Path de video no válido", { filePath });
      return;
    }

    const [, uid, exchangeId, originalFileName] = match;

    const mediaId = object.metadata?.mediaId || path.parse(originalFileName).name;

    const bucket = getStorage().bucket(bucketName);
    const db = getDatabase();

    const inputPath = path.join(os.tmpdir(), originalFileName);
    const outputFileName = `${mediaId}-web.mp4`;
    const outputPath = path.join(os.tmpdir(), outputFileName);

    const processedStoragePath = `exchangeMedia/${uid}/${exchangeId}/processed/${outputFileName}`;

    try {
      const { offerMedia, mediaKey, media } = await waitForMediaEntry(
        db,
        exchangeId,
        mediaId,
        filePath
      );

      if (mediaKey === null || !media) {
        logger.warn(
          "No encontramos el media item para actualizar después de esperar RTDB",
          {
            exchangeId,
            mediaId,
            filePath,
          }
        );
        return;
      }

      if (media.status === "ready" && media.path === processedStoragePath) {
        logger.info("El video ya estaba procesado", {
          exchangeId,
          mediaId,
          processedStoragePath,
        });
        return;
      }

      const alreadyProcessed = await fileExists(bucket, processedStoragePath);

      if (alreadyProcessed && media.url) {
        logger.info("El archivo procesado ya existía y RTDB ya tenía URL", {
          exchangeId,
          mediaId,
          processedStoragePath,
        });
        return;
      }

      await bucket.file(filePath).download({ destination: inputPath });

      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        inputPath,

        // 720p máximo para bajar tiempo de conversión, Storage y transferencia.
        // Si el video ya es menor a 720px de alto, no lo agranda.
        "-vf",
        "scale='if(gt(ih,720),-2,iw)':'if(gt(ih,720),720,ih)'",

        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-profile:v",
        "main",
        "-level",
        "4.0",
        "-pix_fmt",
        "yuv420p",

        "-c:a",
        "aac",
        "-b:a",
        "96k",

        "-movflags",
        "+faststart",

        outputPath,
      ]);

      const processedToken = crypto.randomUUID();

      await bucket.upload(outputPath, {
        destination: processedStoragePath,
        metadata: {
          contentType: "video/mp4",
          metadata: {
            firebaseStorageDownloadTokens: processedToken,
            uid,
            exchangeId,
            mediaId,
            processedFrom: filePath,
            processedQuality: "web-720p-crf28",
          },
        },
      });

      const processedUrl = buildFirebaseDownloadUrl(
        bucketName,
        processedStoragePath,
        processedToken
      );

      const originalUrl =
        media.originalUrl ||
        media.originalDownloadUrl ||
        media.url ||
        media.downloadUrl ||
        "";

      const readyVideoPayload = {
        ...media,
        mediaId,
        type: "video",
        status: "ready",

        url: processedUrl,
        downloadUrl: processedUrl,

        originalUrl,
        originalDownloadUrl: originalUrl,
        originalPath: filePath,

        path: processedStoragePath,
        fullPath: processedStoragePath,

        contentType: "video/mp4",
        originalContentType: media.originalContentType || contentType,
        processedQuality: "web-720p-crf28",
        processedAt: Date.now(),
        processingError: null,
      };

      const rootUpdates = {
        [`exchanges/${exchangeId}/offerMedia/${mediaKey}`]: readyVideoPayload,
        [`userExchanges/${uid}/${exchangeId}/offerMedia/${mediaKey}`]:
          readyVideoPayload,
        [`exchanges/${exchangeId}/updatedAt`]: Date.now(),
        [`userExchanges/${uid}/${exchangeId}/updatedAt`]: Date.now(),
      };

      const exchangeSnapshot = await db.ref(`exchanges/${exchangeId}`).get();
      const exchangeData = exchangeSnapshot.exists() ? exchangeSnapshot.val() : {};

      const coverMedia = exchangeData.coverMedia || {};
      const firstMedia = Array.isArray(offerMedia) ? offerMedia[0] : offerMedia?.[0];

      const isCoverMedia =
        coverMedia.mediaId === mediaId ||
        coverMedia.originalPath === filePath ||
        String(mediaKey) === "0" ||
        firstMedia?.mediaId === mediaId;

      if (isCoverMedia) {
        rootUpdates[`exchanges/${exchangeId}/coverMedia`] = readyVideoPayload;
        rootUpdates[`userExchanges/${uid}/${exchangeId}/coverMedia`] =
          readyVideoPayload;
      }

      await db.ref().update(rootUpdates);

      logger.info("Video procesado correctamente", {
        exchangeId,
        mediaId,
        processedStoragePath,
      });
    } catch (error) {
      logger.error("Error procesando video", error);

      try {
        const { mediaKey } = await findMediaEntry(db, exchangeId, mediaId, filePath);
        await markMediaAsError(
          db,
          uid,
          exchangeId,
          mediaKey,
          "No pudimos convertir el video. Intentá subir otro archivo."
        );
      } catch (updateError) {
        logger.error("No pudimos marcar el video como error", updateError);
      }
    } finally {
      await fs.rm(inputPath, { force: true }).catch(() => {});
      await fs.rm(outputPath, { force: true }).catch(() => {});
    }
  }
);
