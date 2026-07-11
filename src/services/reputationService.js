import {
  equalTo,
  get,
  onValue,
  orderByChild,
  query,
  ref,
} from "firebase/database";
import { database } from "./firebase";

function toTimestamp(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRating(ratingId, value = {}) {
  return {
    id: value.id || ratingId,
    proposalId: String(value.proposalId || ""),
    fromUserId: String(value.fromUserId || ""),
    fromUserName: String(value.fromUserName || "Usuario"),
    toUserId: String(value.toUserId || ""),
    toUserName: String(value.toUserName || "Usuario"),
    rating: Number(value.rating || 0),
    comment: String(value.comment || "").trim(),
    createdAt: toTimestamp(value.createdAt),
  };
}

function getEmptyReputation(userId = "") {
  return {
    userId,
    userName: "",
    ratingsCount: 0,
    totalRatings: 0,
    count: 0,
    ratingSum: 0,
    averageRating: 0,
    ratingAverage: 0,
    average: 0,
    completedExchanges: 0,
    completedCount: 0,
    positiveRatings: 0,
    positiveCount: 0,
    lastRating: 0,
    lastRatingAt: 0,
    ratings: [],
  };
}

export function buildUserReputation(userId, snapshot) {
  if (!userId || !snapshot?.exists?.()) {
    return getEmptyReputation(userId);
  }

  const ratings = Object.entries(snapshot.val() || {})
    .map(([ratingId, value]) => normalizeRating(ratingId, value))
    .filter((item) => {
      return (
        item.toUserId === userId &&
        Number.isFinite(item.rating) &&
        item.rating >= 1 &&
        item.rating <= 5
      );
    })
    .sort((first, second) => second.createdAt - first.createdAt);

  if (!ratings.length) {
    return getEmptyReputation(userId);
  }

  const totalRatings = ratings.length;
  const ratingSum = ratings.reduce(
    (total, item) => total + item.rating,
    0
  );
  const averageRating =
    Math.round((ratingSum / totalRatings) * 10) / 10;

  const completedExchanges = new Set(
    ratings
      .map((item) => item.proposalId)
      .filter(Boolean)
  ).size;

  const positiveRatings = ratings.filter(
    (item) => item.rating >= 4
  ).length;

  const latestRating = ratings[0];

  return {
    userId,
    userName: latestRating?.toUserName || "Usuario",
    ratingsCount: totalRatings,
    totalRatings,
    count: totalRatings,
    ratingSum,
    averageRating,
    ratingAverage: averageRating,
    average: averageRating,
    completedExchanges,
    completedCount: completedExchanges,
    positiveRatings,
    positiveCount: positiveRatings,
    lastRating: latestRating?.rating || 0,
    lastRatingAt: latestRating?.createdAt || 0,
    ratings,
  };
}

function createUserRatingsQuery(userId) {
  return query(
    ref(database, "ratings"),
    orderByChild("toUserId"),
    equalTo(userId)
  );
}

export function listenUserReputation(
  userId,
  callback,
  onError
) {
  if (!userId) {
    callback?.(getEmptyReputation(""));
    return () => {};
  }

  const ratingsQuery = createUserRatingsQuery(userId);

  return onValue(
    ratingsQuery,
    (snapshot) => {
      callback?.(
        buildUserReputation(userId, snapshot)
      );
    },
    (error) => {
      console.error(
        "No pudimos cargar la reputación del usuario.",
        error
      );

      onError?.(error);
    }
  );
}

export async function getUserReputation(userId) {
  if (!userId) {
    return getEmptyReputation("");
  }

  const snapshot = await get(
    createUserRatingsQuery(userId)
  );

  return buildUserReputation(userId, snapshot);
}
