import {
  equalTo,
  get,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { database } from "./firebase";
import { deleteExchangeMediaFiles } from "./storageService";
import { buildServiceDefaultMedia } from "../utils/serviceMedia";


export function createExchangeId() {
  return push(ref(database, "exchanges")).key;
}

function buildLocationLabel(location) {
  if (!location) return "";

  const locality = location.localityName || "";
  const department = location.departmentName || "";
  const province = location.provinceName || "";
  const parts = [];

  if (locality) parts.push(locality);
  if (department && department !== locality) parts.push(department);
  if (province) parts.push(province);

  return parts.join(", ");
}

function cleanLocation(location) {
  if (!location) return null;

  return {
    provinceId: location.provinceId || "",
    provinceName: location.provinceName || "",
    departmentId: location.departmentId || "",
    departmentName: location.departmentName || "",
    municipalityId: location.municipalityId || "",
    municipalityName: location.municipalityName || "",
    localityId: location.localityId || "",
    localityName: location.localityName || "",
    lat: location.lat ?? null,
    lon: location.lon ?? null,
  };
}


function isServiceCategory(category) {
  return category === "Servicios";
}

function isOtherService(serviceType) {
  return serviceType === "Otro";
}

function buildPublicationTitle(
  category,
  serviceType,
  manualTitle
) {
  if (!isServiceCategory(category)) {
    return String(manualTitle || "").trim();
  }

  if (isOtherService(serviceType)) {
    return String(manualTitle || "").trim();
  }

  return serviceType
    ? `Servicio de ${serviceType}`
    : String(manualTitle || "").trim();
}

function buildServiceFields(data) {
  const searchIsService = isServiceCategory(data.searchCategory);
  const offerIsService = isServiceCategory(data.offerCategory);
  const isLicensed = offerIsService ? Boolean(data.offerIsLicensed) : false;

  return {
    searchServiceType: searchIsService ? data.searchServiceType || "" : "",
    offerServiceType: offerIsService ? data.offerServiceType || "" : "",
    offerIsLicensed: isLicensed,
    offerLicenseNumber:
      offerIsService && isLicensed
        ? String(data.offerLicenseNumber || "").trim()
        : "",
    offerState: offerIsService ? "" : data.offerState || "Muy bueno",
  };
}

export async function createExchange(user, data, forcedExchangeId = "") {
  if (!user) {
    throw new Error("Debes iniciar sesión para publicar un intercambio.");
  }

  const exchangeId = forcedExchangeId || createExchangeId();

  if (!exchangeId) {
    throw new Error("No pudimos preparar la publicación.");
  }

  const exchangeRef = ref(database, `exchanges/${exchangeId}`);
  const offerMedia = isServiceCategory(data.offerCategory)
    ? [buildServiceDefaultMedia(data.offerServiceType)].filter(Boolean)
    : data.offerMedia || [];
  const location = cleanLocation(data.location);
  const zone = data.zone || buildLocationLabel(location);
  const serviceFields = buildServiceFields(data);

  const exchange = {
    id: exchangeId,
    userId: user.uid,
    userName: user.displayName || "Usuario",
    userEmail: user.email,

    searchTitle: buildPublicationTitle(
      data.searchCategory,
      serviceFields.searchServiceType,
      data.searchTitle
    ),
    searchCategory: data.searchCategory,
    searchServiceType: serviceFields.searchServiceType,
    searchDetails: data.searchDetails,

    offerTitle: buildPublicationTitle(
      data.offerCategory,
      serviceFields.offerServiceType,
      data.offerTitle
    ),
    offerCategory: data.offerCategory,
    offerServiceType: serviceFields.offerServiceType,
    offerIsLicensed: serviceFields.offerIsLicensed,
    offerLicenseNumber: serviceFields.offerLicenseNumber,
    offerState: serviceFields.offerState,
    offerDescription: data.offerDescription,

    offerMedia,
    offerMediaCount: offerMedia.length,
    coverMedia: offerMedia[0] || null,

    zone,
    location,
    locationSource: data.locationSource || "custom",
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await set(exchangeRef, exchange);
  await set(ref(database, `userExchanges/${user.uid}/${exchangeId}`), exchange);

  return exchange;
}

export async function getExchangeById(user, exchangeId) {
  if (!user) {
    throw new Error("Debes iniciar sesión.");
  }

  if (!exchangeId) {
    throw new Error("La publicación no es válida.");
  }

  const snapshot = await get(ref(database, `exchanges/${exchangeId}`));

  if (!snapshot.exists()) {
    throw new Error("La publicación no existe.");
  }

  const exchange = {
    id: snapshot.key,
    ...snapshot.val(),
  };

  if (exchange.userId !== user.uid) {
    throw new Error("No tienes permisos para editar esta publicación.");
  }

  return exchange;
}

export async function updateExchange(user, exchangeId, data) {
  if (!user) {
    throw new Error("Debes iniciar sesión para editar un intercambio.");
  }

  const currentExchange = await getExchangeById(user, exchangeId);
  const offerMedia = isServiceCategory(data.offerCategory)
    ? [buildServiceDefaultMedia(data.offerServiceType)].filter(Boolean)
    : data.offerMedia || [];
  const location = cleanLocation(data.location);
  const zone = data.zone || buildLocationLabel(location);
  const serviceFields = buildServiceFields(data);

  const updatedExchange = {
    searchTitle: buildPublicationTitle(
      data.searchCategory,
      serviceFields.searchServiceType,
      data.searchTitle
    ),
    searchCategory: data.searchCategory,
    searchServiceType: serviceFields.searchServiceType,
    searchDetails: data.searchDetails,

    offerTitle: buildPublicationTitle(
      data.offerCategory,
      serviceFields.offerServiceType,
      data.offerTitle
    ),
    offerCategory: data.offerCategory,
    offerServiceType: serviceFields.offerServiceType,
    offerIsLicensed: serviceFields.offerIsLicensed,
    offerLicenseNumber: serviceFields.offerLicenseNumber,
    offerState: serviceFields.offerState,
    offerDescription: data.offerDescription,

    offerMedia,
    offerMediaCount: offerMedia.length,
    coverMedia: offerMedia[0] || null,

    zone,
    location,
    locationSource: data.locationSource || currentExchange.locationSource || "custom",
    status: currentExchange.status || "active",
    updatedAt: serverTimestamp(),
  };

  await update(ref(database), {
    [`exchanges/${exchangeId}`]: updatedExchange,
    [`userExchanges/${user.uid}/${exchangeId}`]: {
      id: exchangeId,
      userId: user.uid,
      userName: currentExchange.userName || user.displayName || "Usuario",
      userEmail: currentExchange.userEmail || user.email || "",
      createdAt: currentExchange.createdAt || null,
      ...updatedExchange,
    },
  });

  return {
    id: exchangeId,
    ...currentExchange,
    ...updatedExchange,
  };
}

async function deleteRelatedInterests(exchangeId) {
  const interestsSnapshot = await get(ref(database, "interests"));

  if (!interestsSnapshot.exists()) {
    return;
  }

  const deletions = [];

  interestsSnapshot.forEach((childSnapshot) => {
    const interest = childSnapshot.val();
    const isRelated =
      interest?.myExchangeId === exchangeId ||
      interest?.otherExchangeId === exchangeId;

    if (isRelated) {
      deletions.push(remove(ref(database, `interests/${childSnapshot.key}`)));
    }
  });

  await Promise.all(deletions);
}

function normalizeMediaList(mediaValue) {
  if (!mediaValue) return [];
  if (Array.isArray(mediaValue)) return mediaValue.filter(Boolean);
  if (typeof mediaValue === "object") return Object.values(mediaValue).filter(Boolean);
  return [];
}

export async function deleteExchange(user, exchangeId) {
  if (!user) {
    throw new Error("Debes iniciar sesión para eliminar un intercambio.");
  }

  if (!exchangeId) {
    throw new Error("La publicación no es válida.");
  }

  const currentExchange = await getExchangeById(user, exchangeId);

  const mediaToDelete = [
    ...normalizeMediaList(currentExchange.offerMedia),
    currentExchange.coverMedia,
  ].filter(Boolean);

  // Primero eliminamos la publicación de Realtime para que el panel no quede
  // mostrando datos si falla la limpieza secundaria de intereses o archivos.
  await update(ref(database), {
    [`exchanges/${exchangeId}`]: null,
    [`userExchanges/${user.uid}/${exchangeId}`]: null,
  });

  try {
    await deleteRelatedInterests(exchangeId);
  } catch (error) {
    console.warn("No pudimos limpiar propuestas relacionadas.", error);
  }

  try {
    await deleteExchangeMediaFiles(mediaToDelete);
  } catch (error) {
    console.warn("La publicación fue eliminada, pero quedó algún archivo pendiente en Storage.", error);
  }

  return currentExchange;
}

export function listenUserExchanges(userId, callback, onError) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const userExchangesQuery = query(
    ref(database, "exchanges"),
    orderByChild("userId"),
    equalTo(userId)
  );

  const unsubscribe = onValue(
    userExchangesQuery,
    (snapshot) => {
      const exchanges = [];

      snapshot.forEach((childSnapshot) => {
        const exchange = {
          id: childSnapshot.key,
          ...childSnapshot.val(),
        };

        if (exchange.status !== "deleted") {
          exchanges.push(exchange);
        }
      });

      exchanges.sort((a, b) => {
        const dateA = a.createdAt || 0;
        const dateB = b.createdAt || 0;
        return dateB - dateA;
      });

      callback(exchanges);
    },
    (error) => {
      console.error(error);

      if (onError) {
        onError(error);
      }
    }
  );

  return unsubscribe;
}

export function listenActiveExchanges(callback, onError) {
  const activeExchangesQuery = query(
    ref(database, "exchanges"),
    orderByChild("status"),
    equalTo("active")
  );

  const unsubscribe = onValue(
    activeExchangesQuery,
    (snapshot) => {
      const exchanges = [];

      snapshot.forEach((childSnapshot) => {
        exchanges.push({
          id: childSnapshot.key,
          ...childSnapshot.val(),
        });
      });

      exchanges.sort((a, b) => {
        const dateA = a.createdAt || 0;
        const dateB = b.createdAt || 0;
        return dateB - dateA;
      });

      callback(exchanges);
    },
    (error) => {
      console.error(error);

      if (onError) {
        onError(error);
      }
    }
  );

  return unsubscribe;
}

export async function createInterest(user, match) {
  if (!user) {
    throw new Error("Debes iniciar sesión para marcar interés.");
  }

  if (!match?.myExchange || !match?.otherExchange) {
    throw new Error("El match no es válido.");
  }

  if (match.otherExchange.userId === user.uid) {
    throw new Error("No puedes marcar interés sobre una publicación propia.");
  }

  const interestId = `${match.myExchange.id}_${match.otherExchange.id}`;
  const interestRef = ref(database, `interests/${interestId}`);

  const existingInterest = await get(interestRef);

  if (existingInterest.exists()) {
    return {
      id: interestId,
      alreadyExists: true,
      ...existingInterest.val(),
    };
  }

  const interest = {
    id: interestId,

    fromUserId: user.uid,
    fromUserName: user.displayName || "Usuario",
    fromUserEmail: user.email,

    toUserId: match.otherExchange.userId,
    toUserName: match.otherExchange.userName || "Usuario",
    toUserEmail: match.otherExchange.userEmail || "",

    myExchangeId: match.myExchange.id,
    otherExchangeId: match.otherExchange.id,

    mySearchTitle: match.myExchange.searchTitle,
    mySearchCategory: match.myExchange.searchCategory || "",
    mySearchServiceType: match.myExchange.searchServiceType || "",
    myOfferTitle: match.myExchange.offerTitle,
    myOfferCategory: match.myExchange.offerCategory || "",
    myOfferServiceType: match.myExchange.offerServiceType || "",
    myOfferIsLicensed: Boolean(match.myExchange.offerIsLicensed),
    myOfferLicenseNumber: match.myExchange.offerLicenseNumber || "",

    otherSearchTitle: match.otherExchange.searchTitle,
    otherSearchCategory: match.otherExchange.searchCategory || "",
    otherSearchServiceType: match.otherExchange.searchServiceType || "",
    otherOfferTitle: match.otherExchange.offerTitle,
    otherOfferCategory: match.otherExchange.offerCategory || "",
    otherOfferServiceType: match.otherExchange.offerServiceType || "",
    otherOfferIsLicensed: Boolean(match.otherExchange.offerIsLicensed),
    otherOfferLicenseNumber: match.otherExchange.offerLicenseNumber || "",

    matchScore: match.score,
    reasons: match.reasons || [],

    status: "pending",
    createdAt: serverTimestamp(),
  };

  await set(interestRef, interest);

  return interest;
}

export function listenUserInterests(userId, callback, onError) {
  if (!userId) {
    callback({
      received: [],
      sent: [],
    });

    return () => {};
  }

  const receivedQuery = query(
    ref(database, "interests"),
    orderByChild("toUserId"),
    equalTo(userId)
  );

  const sentQuery = query(
    ref(database, "interests"),
    orderByChild("fromUserId"),
    equalTo(userId)
  );

  let receivedInterests = [];
  let sentInterests = [];

  const emit = () => {
    callback({
      received: receivedInterests,
      sent: sentInterests,
    });
  };

  const unsubscribeReceived = onValue(
    receivedQuery,
    (snapshot) => {
      const items = [];

      snapshot.forEach((childSnapshot) => {
        items.push({
          id: childSnapshot.key,
          ...childSnapshot.val(),
        });
      });

      items.sort((a, b) => {
        const dateA = a.createdAt || 0;
        const dateB = b.createdAt || 0;
        return dateB - dateA;
      });

      receivedInterests = items;
      emit();
    },
    (error) => {
      console.error(error);

      if (onError) {
        onError(error);
      }
    }
  );

  const unsubscribeSent = onValue(
    sentQuery,
    (snapshot) => {
      const items = [];

      snapshot.forEach((childSnapshot) => {
        items.push({
          id: childSnapshot.key,
          ...childSnapshot.val(),
        });
      });

      items.sort((a, b) => {
        const dateA = a.createdAt || 0;
        const dateB = b.createdAt || 0;
        return dateB - dateA;
      });

      sentInterests = items;
      emit();
    },
    (error) => {
      console.error(error);

      if (onError) {
        onError(error);
      }
    }
  );

  return () => {
    unsubscribeReceived();
    unsubscribeSent();
  };
}

export async function updateInterestStatus(user, interest, status) {
  if (!user) {
    throw new Error("Debes iniciar sesión para actualizar la propuesta.");
  }

  if (!interest?.id) {
    throw new Error("La propuesta no es válida.");
  }

  const allowedStatuses = ["accepted", "rejected", "pending", "notCompleted"];

  if (!allowedStatuses.includes(status)) {
    throw new Error("Estado inválido.");
  }

  const isReceiver = interest.toUserId === user.uid;
  const isSender = interest.fromUserId === user.uid;

  if (!isReceiver && !isSender) {
    throw new Error("No tienes permisos para modificar esta propuesta.");
  }

  await update(ref(database, `interests/${interest.id}`), {
    status,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}

