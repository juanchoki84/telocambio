import {
  equalTo,
  get,
  onValue,
  orderByChild,
  query,
  ref,
  set,
  update,
} from "firebase/database";
import { database } from "./firebase";

function isParticipant(user, proposal) {
  if (!user?.uid || !proposal) return false;

  return (
    proposal.fromUserId === user.uid ||
    proposal.toUserId === user.uid
  );
}

function getCounterpartyId(user, proposal) {
  if (!isParticipant(user, proposal)) return "";

  return proposal.fromUserId === user.uid
    ? proposal.toUserId
    : proposal.fromUserId;
}

function getCounterpartyName(user, proposal) {
  if (!isParticipant(user, proposal)) return "Usuario";

  return proposal.fromUserId === user.uid
    ? proposal.toUserName || "Usuario"
    : proposal.fromUserName || "Usuario";
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanMeetingPoint(data = {}) {
  return {
    placeName: cleanText(data.placeName),
    address: cleanText(data.address),
    date: cleanText(data.date),
    time: cleanText(data.time),
    notes: cleanText(data.notes),
  };
}

function getExchangeRefsForProposal(proposal) {
  const myExchangeId =
    proposal.myExchangeId ||
    proposal.myExchange?.id ||
    proposal.fromExchangeId ||
    "";

  const otherExchangeId =
    proposal.otherExchangeId ||
    proposal.otherExchange?.id ||
    proposal.toExchangeId ||
    "";

  return [
    {
      id: myExchangeId,
      ownerId:
        proposal.fromUserId ||
        proposal.myExchange?.userId ||
        "",
    },
    {
      id: otherExchangeId,
      ownerId:
        proposal.toUserId ||
        proposal.otherExchange?.userId ||
        "",
    },
  ].filter((item) => item.id);
}

function normalizeRatingRecord(ratingId, value = {}) {
  return {
    id: value.id || ratingId,
    proposalId: value.proposalId || "",
    fromUserId: value.fromUserId || "",
    fromUserName: value.fromUserName || "Usuario",
    toUserId: value.toUserId || "",
    toUserName: value.toUserName || "Usuario",
    rating: Number(value.rating || 0),
    comment: cleanText(value.comment),
    createdAt: Number(value.createdAt || 0),
  };
}

function assertExistingRatingMatches({
  existingRating,
  ratingId,
  proposalId,
  fromUserId,
  toUserId,
}) {
  if (
    existingRating.id !== ratingId ||
    existingRating.proposalId !== proposalId ||
    existingRating.fromUserId !== fromUserId ||
    existingRating.toUserId !== toUserId
  ) {
    throw new Error(
      "Ya existe una calificación incompatible para esta operación."
    );
  }
}

async function ensureRatingRecord({
  ratingId,
  proposalId,
  user,
  reviewedUserId,
  reviewedUserName,
  rating,
  comment,
}) {
  const ratingRef = ref(database, `ratings/${ratingId}`);
  const existingSnapshot = await get(ratingRef);

  if (existingSnapshot.exists()) {
    const existingRating = normalizeRatingRecord(
      ratingId,
      existingSnapshot.val()
    );

    assertExistingRatingMatches({
      existingRating,
      ratingId,
      proposalId,
      fromUserId: user.uid,
      toUserId: reviewedUserId,
    });

    return existingRating;
  }

  const ratingRecord = {
    id: ratingId,
    proposalId,
    fromUserId: user.uid,
    fromUserName:
      user.displayName ||
      user.email ||
      "Usuario",
    toUserId: reviewedUserId,
    toUserName: reviewedUserName,
    rating,
    comment,
    createdAt: Date.now(),
  };

  try {
    await set(ratingRef, ratingRecord);
    return ratingRecord;
  } catch (error) {
    /*
      Dos pestañas podrían intentar crear la misma calificación al mismo
      tiempo. Como el ID es determinístico, solamente una escritura puede
      crearla. Volvemos a leerla para continuar de forma idempotente.
    */
    const retrySnapshot = await get(ratingRef);

    if (!retrySnapshot.exists()) {
      throw error;
    }

    const existingRating = normalizeRatingRecord(
      ratingId,
      retrySnapshot.val()
    );

    assertExistingRatingMatches({
      existingRating,
      ratingId,
      proposalId,
      fromUserId: user.uid,
      toUserId: reviewedUserId,
    });

    return existingRating;
  }
}

function buildReputationFromRatings(userId, snapshot) {
  if (!snapshot.exists()) {
    return {
      userId,
      averageRating: 0,
      totalRatings: 0,
      ratingSum: 0,
      lastRating: 0,
      lastRatingAt: 0,
    };
  }

  const ratings = Object.entries(snapshot.val() || {})
    .map(([ratingId, value]) =>
      normalizeRatingRecord(ratingId, value)
    )
    .filter(
      (item) =>
        item.toUserId === userId &&
        Number.isFinite(item.rating) &&
        item.rating >= 1 &&
        item.rating <= 5
    );

  const totalRatings = ratings.length;
  const ratingSum = ratings.reduce(
    (total, item) => total + item.rating,
    0
  );

  const averageRating =
    totalRatings > 0
      ? Math.round((ratingSum / totalRatings) * 10) / 10
      : 0;

  const latestRating = ratings.reduce(
    (latest, item) =>
      item.createdAt > (latest?.createdAt || 0)
        ? item
        : latest,
    null
  );

  return {
    userId,
    userName:
      latestRating?.toUserName ||
      "Usuario",
    averageRating,
    totalRatings,
    ratingSum,
    lastRating: latestRating?.rating || 0,
    lastRatingAt: latestRating?.createdAt || 0,
  };
}

export function listenUserReputations(
  userIds,
  callback,
  onError
) {
  const uniqueIds = Array.from(
    new Set((userIds || []).filter(Boolean))
  );

  if (!uniqueIds.length) {
    callback({});
    return () => {};
  }

  const reputations = {};

  const unsubscribers = uniqueIds.map((userId) => {
    const ratingsQuery = query(
      ref(database, "ratings"),
      orderByChild("toUserId"),
      equalTo(userId)
    );

    return onValue(
      ratingsQuery,
      (snapshot) => {
        reputations[userId] =
          buildReputationFromRatings(
            userId,
            snapshot
          );

        callback({ ...reputations });
      },
      (error) => {
        console.error(
          `No pudimos cargar la reputación de ${userId}.`,
          error
        );

        if (onError) {
          onError(error);
        }
      }
    );
  });

  return () => {
    unsubscribers.forEach((unsubscribe) =>
      unsubscribe()
    );
  };
}

export async function saveProposalMeetingPoint(
  user,
  proposal,
  data
) {
  if (!isParticipant(user, proposal)) {
    throw new Error(
      "No tenés permisos para actualizar esta propuesta."
    );
  }

  const meetingPoint = cleanMeetingPoint(data);

  if (
    !meetingPoint.placeName &&
    !meetingPoint.address
  ) {
    throw new Error(
      "Indicá al menos un lugar o una dirección."
    );
  }

  const now = Date.now();

  await update(
    ref(database, `interests/${proposal.id}`),
    {
      meetingPoint: {
        ...meetingPoint,
        updatedAt: now,
        updatedBy: user.uid,
        updatedByName:
          user.displayName ||
          user.email ||
          "Usuario",
      },
    }
  );

  return meetingPoint;
}

export async function rateProposalOperation(
  user,
  proposal,
  data
) {
  if (!isParticipant(user, proposal)) {
    throw new Error(
      "No tenés permisos para calificar esta operación."
    );
  }

  if (
    proposal.status !== "accepted" &&
    proposal.status !== "completed"
  ) {
    throw new Error(
      "La propuesta debe estar aceptada para poder calificarla."
    );
  }

  const rating = Number(data.rating);

  if (
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    throw new Error(
      "La calificación debe estar entre 1 y 5."
    );
  }

  const reviewedUserId =
    getCounterpartyId(user, proposal);
  const reviewedUserName =
    getCounterpartyName(user, proposal);

  if (!reviewedUserId) {
    throw new Error(
      "No pudimos identificar al usuario a calificar."
    );
  }

  if (proposal?.ratedBy?.[user.uid]) {
    throw new Error(
      "Ya calificaste esta operación."
    );
  }

  const ratingId =
    `${proposal.id}_${user.uid}_${reviewedUserId}`;

  const storedRating = await ensureRatingRecord({
    ratingId,
    proposalId: proposal.id,
    user,
    reviewedUserId,
    reviewedUserName,
    rating,
    comment: cleanText(data.comment),
  });

  const now = Date.now();

  const updates = {
    [`interests/${proposal.id}/status`]:
      "completed",
    [`interests/${proposal.id}/completedAt`]:
      now,
    [`interests/${proposal.id}/completedBy`]:
      user.uid,
    [`interests/${proposal.id}/ratedBy/${user.uid}`]:
      true,
    [`interests/${proposal.id}/ratings/${user.uid}`]:
      {
        rating: storedRating.rating,
        comment: storedRating.comment,
        reviewedUserId,
        ratingId,
        createdAt: storedRating.createdAt,
      },
  };

  getExchangeRefsForProposal(proposal).forEach(
    ({ id, ownerId }) => {
      updates[`exchanges/${id}/status`] =
        "completed";
      updates[`exchanges/${id}/completedAt`] =
        now;
      updates[
        `exchanges/${id}/completedByProposalId`
      ] = proposal.id;

      if (ownerId) {
        updates[
          `userExchanges/${ownerId}/${id}/status`
        ] = "completed";
        updates[
          `userExchanges/${ownerId}/${id}/completedAt`
        ] = now;
        updates[
          `userExchanges/${ownerId}/${id}/completedByProposalId`
        ] = proposal.id;
      }
    }
  );

  /*
    La calificación ya está guardada en /ratings. Esta actualización
    finaliza la propuesta y sus publicaciones relacionadas de forma
    atómica. La reputación se calcula leyendo las calificaciones, por
    lo que ya no es necesario modificar /userReputations desde el
    navegador.
  */
  await update(ref(database), updates);

  return {
    reviewedUserId,
    rating: storedRating.rating,
    ratingId,
  };
}
