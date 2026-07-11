import {
  onValue,
  ref,
} from "firebase/database";
import { database } from "./firebase";

const PUBLIC_PLACEMENTS = new Set([
  "panel_top",
  "panel_middle",
  "panel_feed",
  "matches_feed",
  "proposals_sidebar",
]);

const PANEL_PLACEMENTS = new Set([
  "panel_top",
  "panel_middle",
  "panel_feed",
]);

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeAsset(asset = null) {
  if (!asset || typeof asset !== "object") {
    return null;
  }

  const url =
    cleanString(asset.url) ||
    cleanString(asset.downloadUrl);

  if (!url) {
    return null;
  }

  return {
    ...asset,
    url,
  };
}

function normalizeAdvertisement(id, value = {}) {
  const assets = value.assets || {};

  return {
    id,
    campaignName: cleanString(value.campaignName),
    companyName: cleanString(value.companyName),
    placement: cleanString(value.placement),
    destinationUrl: cleanString(value.destinationUrl),
    description: cleanString(value.description),
    startDate: cleanString(value.startDate),
    endDate: cleanString(value.endDate),
    durationDays: Number(value.durationDays || 0),
    status: cleanString(value.status) || "active",
    updatedAt: Number(value.updatedAt || 0),
    assets: {
      desktop: normalizeAsset(assets.desktop),
      mobile: normalizeAsset(assets.mobile),
      square: normalizeAsset(assets.square),
    },
  };
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(
    2,
    "0"
  );
  const day = String(date.getDate()).padStart(
    2,
    "0"
  );

  return `${year}-${month}-${day}`;
}

function hasAdvertisementAsset(advertisement) {
  return Boolean(
    advertisement.assets.desktop ||
      advertisement.assets.mobile ||
      advertisement.assets.square
  );
}

function isAdvertisementCurrentlyVisible(
  advertisement,
  todayKey
) {
  if (
    advertisement.status !== "active" ||
    !PUBLIC_PLACEMENTS.has(advertisement.placement)
  ) {
    return false;
  }

  if (
    advertisement.startDate &&
    advertisement.startDate > todayKey
  ) {
    return false;
  }

  if (
    advertisement.endDate &&
    advertisement.endDate < todayKey
  ) {
    return false;
  }

  return hasAdvertisementAsset(advertisement);
}

export function listenPublicAdvertisements(
  callback,
  onError
) {
  return onValue(
    ref(database, "advertisementPublic"),
    (snapshot) => {
      const todayKey = getLocalDateKey();
      const advertisements = [];

      snapshot.forEach((childSnapshot) => {
        const advertisement = normalizeAdvertisement(
          childSnapshot.key,
          childSnapshot.val() || {}
        );

        if (
          isAdvertisementCurrentlyVisible(
            advertisement,
            todayKey
          )
        ) {
          advertisements.push(advertisement);
        }
      });

      advertisements.sort(
        (first, second) =>
          second.updatedAt - first.updatedAt
      );

      callback(advertisements);
    },
    (error) => {
      console.error(
        "Error leyendo advertisementPublic",
        error
      );
      onError?.(error);
    }
  );
}

export function listenAdvertisementsByPlacement(
  placement,
  callback,
  onError
) {
  if (!PUBLIC_PLACEMENTS.has(placement)) {
    callback([]);
    return () => {};
  }

  return listenPublicAdvertisements(
    (advertisements) => {
      callback(
        advertisements.filter(
          (advertisement) =>
            advertisement.placement === placement
        )
      );
    },
    onError
  );
}

export function listenPanelAdvertisements(
  callback,
  onError
) {
  return listenPublicAdvertisements(
    (advertisements) => {
      callback(
        advertisements.filter((advertisement) =>
          PANEL_PLACEMENTS.has(
            advertisement.placement
          )
        )
      );
    },
    onError
  );
}
