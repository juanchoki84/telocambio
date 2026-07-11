import {
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
} from "firebase/database";
import { database } from "./firebase";

const FAVORITES_NODE = "Favoritos";

function getFavoritePath(userId, exchangeId = "") {
  const cleanUserId = String(userId || "").trim();
  const cleanExchangeId = String(exchangeId || "").trim();

  if (!cleanUserId) {
    throw new Error("No se recibió el usuario para administrar favoritos.");
  }

  return cleanExchangeId
    ? `${FAVORITES_NODE}/${cleanUserId}/${cleanExchangeId}`
    : `${FAVORITES_NODE}/${cleanUserId}`;
}

export function listenUserFavorites(userId, onSuccess, onError) {
  if (!userId) {
    onSuccess?.([]);
    return () => {};
  }

  const favoritesRef = ref(database, getFavoritePath(userId));

  return onValue(
    favoritesRef,
    (snapshot) => {
      const favoritesData = snapshot.val() || {};

      const favoriteIds = Object.entries(favoritesData)
        .sort(([, firstFavorite], [, secondFavorite]) => {
          const firstCreatedAt = Number(firstFavorite?.createdAt || 0);
          const secondCreatedAt = Number(secondFavorite?.createdAt || 0);

          return secondCreatedAt - firstCreatedAt;
        })
        .map(([exchangeId]) => exchangeId);

      onSuccess?.(favoriteIds);
    },
    (error) => {
      console.error("No pudimos escuchar los favoritos del usuario.", error);
      onError?.(error);
    }
  );
}

export async function addFavorite(userId, exchangeId) {
  if (!exchangeId) {
    throw new Error("No se recibió la publicación para guardar en favoritos.");
  }

  const favoriteRef = ref(database, getFavoritePath(userId, exchangeId));

  await set(favoriteRef, {
    createdAt: serverTimestamp(),
  });
}

export async function removeFavorite(userId, exchangeId) {
  if (!exchangeId) {
    throw new Error("No se recibió la publicación para quitar de favoritos.");
  }

  const favoriteRef = ref(database, getFavoritePath(userId, exchangeId));
  await remove(favoriteRef);
}

export async function setPublicationFavorite(
  userId,
  exchangeId,
  shouldBeFavorite
) {
  if (shouldBeFavorite) {
    await addFavorite(userId, exchangeId);
    return;
  }

  await removeFavorite(userId, exchangeId);
}
