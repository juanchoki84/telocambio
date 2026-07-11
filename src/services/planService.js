import {
  get,
  onValue,
  ref,
} from "firebase/database";
import { database } from "./firebase";

export const DEFAULT_PLAN_ID = "free";

export const FALLBACK_FREE_PLAN = {
  id: "free",
  name: "Gratis",
  status: "active",
  priceMonthly: 0,
  priceYearly: 0,
  description: "Plan inicial para publicar intercambios.",
  order: 1,
  limits: {
    maxActivePublications: 2,
    maxMediaPerPublication: 3,
    maxVideosPerPublication: 0,
    maxVideoSizeMb: 0,
  },
  benefits: {
    canReceiveProposals: true,
    canUseChat: true,
    priorityInSearch: false,
    supportLevel: "standard",
  },
};

const ACTIVE_USER_PLAN_STATUSES = ["active", "trialing"];
const ACTIVE_CATALOG_PLAN_STATUSES = ["active"];

function snapshotToArray(snapshot) {
  if (!snapshot.exists()) return [];

  const value = snapshot.val() || {};

  return Object.entries(value).map(([id, item]) => ({
    id,
    ...(item || {}),
  }));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLimits(limits = {}) {
  return {
    maxActivePublications: Math.max(
      0,
      toNumber(limits.maxActivePublications, FALLBACK_FREE_PLAN.limits.maxActivePublications)
    ),
    maxMediaPerPublication: Math.max(
      0,
      toNumber(limits.maxMediaPerPublication, FALLBACK_FREE_PLAN.limits.maxMediaPerPublication)
    ),
    maxVideosPerPublication: Math.max(
      0,
      toNumber(limits.maxVideosPerPublication, FALLBACK_FREE_PLAN.limits.maxVideosPerPublication)
    ),
    maxVideoSizeMb: Math.max(
      0,
      toNumber(limits.maxVideoSizeMb, FALLBACK_FREE_PLAN.limits.maxVideoSizeMb)
    ),
  };
}

function normalizeBenefits(benefits = {}) {
  return {
    canReceiveProposals: benefits.canReceiveProposals !== false,
    canUseChat: benefits.canUseChat !== false,
    priorityInSearch: benefits.priorityInSearch === true,
    supportLevel: benefits.supportLevel || FALLBACK_FREE_PLAN.benefits.supportLevel,
  };
}

export function normalizePlan(plan = null) {
  const source = plan || FALLBACK_FREE_PLAN;

  return {
    ...FALLBACK_FREE_PLAN,
    ...source,
    id: source.id || DEFAULT_PLAN_ID,
    name: source.name || FALLBACK_FREE_PLAN.name,
    status: source.status || "active",
    priceMonthly: toNumber(source.priceMonthly, 0),
    priceYearly: toNumber(source.priceYearly, 0),
    order: toNumber(source.order, FALLBACK_FREE_PLAN.order),
    limits: normalizeLimits(source.limits),
    benefits: normalizeBenefits(source.benefits),
  };
}

export function isCatalogPlanActive(plan) {
  return ACTIVE_CATALOG_PLAN_STATUSES.includes(plan?.status || "active");
}

export function isUserPlanUsable(plan) {
  return ACTIVE_USER_PLAN_STATUSES.includes(plan?.status || "active");
}

export function listenActivePlans(callback, onError) {
  return onValue(
    ref(database, "plans"),
    (snapshot) => {
      const plans = snapshotToArray(snapshot)
        .map((plan) => normalizePlan(plan))
        .filter(isCatalogPlanActive)
        .sort((a, b) => (a.order || 999) - (b.order || 999));

      callback(plans);
    },
    (error) => {
      console.error("Error leyendo planes", error);
      if (onError) onError(error);
    }
  );
}

export async function getPlansCatalog({ onlyActive = true } = {}) {
  const snapshot = await get(ref(database, "plans"));
  const plans = snapshotToArray(snapshot)
    .map((plan) => normalizePlan(plan))
    .filter((plan) => !onlyActive || isCatalogPlanActive(plan))
    .sort((a, b) => (a.order || 999) - (b.order || 999));

  return plans;
}

export async function getCatalogPlanById(planId = DEFAULT_PLAN_ID) {
  const snapshot = await get(ref(database, `plans/${planId}`));

  if (snapshot.exists()) {
    return normalizePlan({ id: planId, ...snapshot.val() });
  }

  if (planId !== DEFAULT_PLAN_ID) {
    return getCatalogPlanById(DEFAULT_PLAN_ID);
  }

  return normalizePlan(FALLBACK_FREE_PLAN);
}

export function buildUserPlanSnapshot(plan, options = {}) {
  const normalizedPlan = normalizePlan(plan);
  const now = Date.now();

  return {
    id: normalizedPlan.id,
    name: normalizedPlan.name,
    status: options.status || "active",
    billingProvider: options.billingProvider || "manual",
    billingCycle: options.billingCycle || "monthly",
    priceMonthly: normalizedPlan.priceMonthly || 0,
    priceYearly: normalizedPlan.priceYearly || 0,
    limits: normalizedPlan.limits,
    benefits: normalizedPlan.benefits,
    startedAt: options.startedAt || now,
    expiresAt: options.expiresAt || null,
    cancelAt: options.cancelAt || null,
    sourcePlanUpdatedAt: normalizedPlan.updatedAt || null,
    updatedAt: now,
    updatedBy: options.updatedBy || "system",
  };
}

export async function getUserPlan(uid) {
  if (!uid) return normalizePlan(FALLBACK_FREE_PLAN);

  const snapshot = await get(ref(database, `users/${uid}/plan`));

  if (!snapshot.exists()) {
    return null;
  }

  return normalizePlan(snapshot.val());
}

export async function ensureUserPlan(uid) {
  if (!uid) {
    throw new Error("Usuario no autenticado.");
  }

  const currentPlan = await getUserPlan(uid);

  if (currentPlan && isUserPlanUsable(currentPlan)) {
    return currentPlan;
  }

  /*
    Los usuarios nuevos reciben el plan Gratis durante la creación de
    users/{uid}. Si encontramos una cuenta anterior sin plan, usamos el
    plan Gratis como respaldo sin intentar escribir campos administrativos
    desde el navegador.
  */
  let freePlan = FALLBACK_FREE_PLAN;

  try {
    freePlan = await getCatalogPlanById(DEFAULT_PLAN_ID);
  } catch (error) {
    console.warn(
      "No pudimos leer el catálogo de planes. Usamos el plan Gratis local.",
      error
    );
  }

  const fallbackUserPlan = buildUserPlanSnapshot(freePlan, {
    billingProvider: "system_fallback",
    billingCycle: "monthly",
    updatedBy: "system",
  });

  return normalizePlan(fallbackUserPlan);
}

export async function assignCurrentUserPlan({
  user,
  planId,
}) {
  if (!user?.uid) {
    throw new Error("Debes iniciar sesión para elegir un plan.");
  }

  if (!planId) {
    throw new Error("Plan no indicado.");
  }

  if (planId !== DEFAULT_PLAN_ID) {
    throw new Error(
      "Los cambios de plan deben realizarse desde administración."
    );
  }

  return ensureUserPlan(user.uid);
}

export function getMediaUrl(media) {
  return media?.url || media?.downloadUrl || media?.originalUrl || media?.originalDownloadUrl || "";
}

export function isVideoFile(file) {
  return Boolean(file?.type?.startsWith("video/"));
}

export function isVideoMedia(media) {
  return (
    media?.type === "video" ||
    media?.contentType?.startsWith?.("video/") ||
    media?.originalContentType?.startsWith?.("video/") ||
    getMediaUrl(media).toLowerCase().includes(".mp4")
  );
}

export function normalizeMediaList(media) {
  if (Array.isArray(media)) return media.filter(Boolean);
  if (media && typeof media === "object") return Object.values(media).filter(Boolean);
  return [];
}

export function getPlanLimitLabel(plan) {
  const normalizedPlan = normalizePlan(plan);
  const limits = normalizedPlan.limits;

  return `${normalizedPlan.name}: ${limits.maxActivePublications} publicaciones activas, ${limits.maxMediaPerPublication} archivos por publicación, ${limits.maxVideosPerPublication} video(s).`;
}

export function validateMediaSelectionAgainstPlan({
  plan,
  newFiles = [],
  currentFiles = [],
  existingMedia = [],
}) {
  const normalizedPlan = normalizePlan(plan);
  const limits = normalizedPlan.limits;
  const messages = [];

  const allowedFiles = Array.from(newFiles || []).filter(
    (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
  );

  const rejectedByType = Array.from(newFiles || []).length - allowedFiles.length;
  if (rejectedByType > 0) {
    messages.push("Algunos archivos fueron descartados. Solo se permiten fotos y videos.");
  }

  const existingMediaList = normalizeMediaList(existingMedia);
  const currentFileList = Array.from(currentFiles || []);
  const currentFileKeys = new Set(
    currentFileList.map((file) => `${file.name}-${file.size}-${file.lastModified}`)
  );

  const uniqueNewFiles = allowedFiles.filter((file) => {
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    return !currentFileKeys.has(fileKey);
  });

  const duplicatedCount = allowedFiles.length - uniqueNewFiles.length;
  if (duplicatedCount > 0) {
    messages.push("Algunos archivos ya estaban agregados y no se duplicaron.");
  }

  const currentVideos = currentFileList.filter(isVideoFile).length;
  const existingVideos = existingMediaList.filter(isVideoMedia).length;
  let availableVideoSlots = Math.max(
    limits.maxVideosPerPublication - currentVideos - existingVideos,
    0
  );

  const filesAfterVideoLimit = [];

  uniqueNewFiles.forEach((file) => {
    if (!isVideoFile(file)) {
      filesAfterVideoLimit.push(file);
      return;
    }

    if (availableVideoSlots <= 0) {
      messages.push(
        `Tu plan ${normalizedPlan.name} permite hasta ${limits.maxVideosPerPublication} video(s) por publicación.`
      );
      return;
    }

    const maxVideoSizeBytes = limits.maxVideoSizeMb * 1024 * 1024;

    if (limits.maxVideoSizeMb <= 0 || file.size > maxVideoSizeBytes) {
      messages.push(
        limits.maxVideoSizeMb <= 0
          ? `Tu plan ${normalizedPlan.name} no permite subir videos.`
          : `El video ${file.name} supera el máximo de ${limits.maxVideoSizeMb} MB permitido por tu plan ${normalizedPlan.name}.`
      );
      return;
    }

    availableVideoSlots -= 1;
    filesAfterVideoLimit.push(file);
  });

  const availableMediaSlots = Math.max(
    limits.maxMediaPerPublication - existingMediaList.length - currentFileList.length,
    0
  );

  const acceptedFiles = filesAfterVideoLimit.slice(0, availableMediaSlots);
  const discardedByLimit = Math.max(filesAfterVideoLimit.length - acceptedFiles.length, 0);

  if (discardedByLimit > 0) {
    messages.push(
      `Tu plan ${normalizedPlan.name} permite hasta ${limits.maxMediaPerPublication} archivos por publicación.`
    );
  }

  return {
    acceptedFiles,
    messages: [...new Set(messages)],
    plan: normalizedPlan,
  };
}

export async function getActivePublicationsCount(uid, { excludeExchangeId = "" } = {}) {
  if (!uid) return 0;

  const snapshot = await get(ref(database, "exchanges"));
  const publications = snapshotToArray(snapshot);

  return publications.filter((publication) => {
    if (publication.id === excludeExchangeId) return false;
    if (publication.userId !== uid) return false;

    const status = publication.status || "active";
    return status === "active";
  }).length;
}

export async function validatePublicationAgainstPlan({
  user,
  mediaFiles = [],
  existingMedia = [],
  exchangeId = "",
} = {}) {
  if (!user?.uid) {
    return {
      allowed: false,
      message: "Debes iniciar sesión para publicar.",
      plan: normalizePlan(FALLBACK_FREE_PLAN),
    };
  }

  const plan = await ensureUserPlan(user.uid);
  const limits = plan.limits;
  const activePublicationsCount = await getActivePublicationsCount(user.uid, {
    excludeExchangeId: exchangeId,
  });

  if (!exchangeId && activePublicationsCount >= limits.maxActivePublications) {
    return {
      allowed: false,
      plan,
      message: `Tu plan ${plan.name} permite hasta ${limits.maxActivePublications} publicaciones activas. Pausá una publicación o mejorá tu plan para publicar más.`,
    };
  }

  const existingMediaList = normalizeMediaList(existingMedia);
  const currentFiles = Array.from(mediaFiles || []);
  const totalMedia = existingMediaList.length + currentFiles.length;

  if (totalMedia > limits.maxMediaPerPublication) {
    return {
      allowed: false,
      plan,
      message: `Tu plan ${plan.name} permite hasta ${limits.maxMediaPerPublication} archivos por publicación.`,
    };
  }

  const totalVideos =
    existingMediaList.filter(isVideoMedia).length + currentFiles.filter(isVideoFile).length;

  if (totalVideos > limits.maxVideosPerPublication) {
    return {
      allowed: false,
      plan,
      message: `Tu plan ${plan.name} permite hasta ${limits.maxVideosPerPublication} video(s) por publicación.`,
    };
  }

  const maxVideoSizeBytes = limits.maxVideoSizeMb * 1024 * 1024;
  const oversizedVideo = currentFiles.find(
    (file) => isVideoFile(file) && (limits.maxVideoSizeMb <= 0 || file.size > maxVideoSizeBytes)
  );

  if (oversizedVideo) {
    return {
      allowed: false,
      plan,
      message:
        limits.maxVideoSizeMb <= 0
          ? `Tu plan ${plan.name} no permite subir videos.`
          : `El video ${oversizedVideo.name} supera el máximo de ${limits.maxVideoSizeMb} MB permitido por tu plan ${plan.name}.`,
    };
  }

  return {
    allowed: true,
    plan,
    message: "",
  };
}
