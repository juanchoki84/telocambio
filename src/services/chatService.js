import {
  get,
  increment,
  onValue,
  push,
  ref,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { database } from "./firebase";

function buildChatData(interest) {
  const chatId = interest.chatId || interest.id;

  return {
    id: chatId,
    interestId: interest.id,

    participants: {
      [interest.fromUserId]: true,
      [interest.toUserId]: true,
    },

    participantNames: {
      [interest.fromUserId]: interest.fromUserName || "Usuario",
      [interest.toUserId]: interest.toUserName || "Usuario",
    },

    fromUserId: interest.fromUserId,
    toUserId: interest.toUserId,

    fromUserName: interest.fromUserName || "Usuario",
    toUserName: interest.toUserName || "Usuario",

    myExchangeId: interest.myExchangeId,
    otherExchangeId: interest.otherExchangeId,

    mySearchTitle: interest.mySearchTitle,
    myOfferTitle: interest.myOfferTitle,
    otherSearchTitle: interest.otherSearchTitle,
    otherOfferTitle: interest.otherOfferTitle,

    status: "active",
    createdAt: serverTimestamp(),
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
  };
}

async function writeUserChatIndexes(chatId, chat) {
  const participantIds = Object.keys(chat.participants || {});
  const updates = {};

  participantIds.forEach((participantId) => {
    const otherUserId = participantIds.find((id) => id !== participantId);

    updates[`userChats/${participantId}/${chatId}`] = {
      id: chatId,
      chatId,
      interestId: chat.interestId,
      otherUserId,
      otherUserName: chat.participantNames?.[otherUserId] || "Usuario",
      lastMessage: chat.lastMessage || "",
      lastMessageAt: chat.lastMessageAt || serverTimestamp(),
      unreadCount: 0,
      status: chat.status || "active",
      updatedAt: serverTimestamp(),
    };
  });

  await update(ref(database), updates);
}

export async function acceptInterestAndCreateChat(user, interest) {
  if (!user) {
    throw new Error("Debes iniciar sesión.");
  }

  if (!interest?.id) {
    throw new Error("La propuesta no es válida.");
  }

  if (interest.toUserId !== user.uid) {
    throw new Error("Solo quien recibe la propuesta puede aceptarla.");
  }

  const chatId = interest.chatId || interest.id;
  const chatRef = ref(database, `chats/${chatId}`);
  const chatSnapshot = await get(chatRef);

  let chatData;

  if (!chatSnapshot.exists()) {
    chatData = buildChatData({ ...interest, chatId });
    await set(chatRef, chatData);
  } else {
    chatData = chatSnapshot.val();
  }

  await writeUserChatIndexes(chatId, chatData);

  await update(ref(database, `interests/${interest.id}`), {
    status: "accepted",
    chatId,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });

  return {
    id: chatId,
  };
}

export async function ensureChatForInterest(user, interest) {
  if (!user) {
    throw new Error("Debes iniciar sesión.");
  }

  if (!interest?.id) {
    throw new Error("La propuesta no es válida.");
  }

  const isParticipant =
    interest.fromUserId === user.uid || interest.toUserId === user.uid;

  if (!isParticipant) {
    throw new Error("No tienes acceso a este chat.");
  }

  if (interest.status !== "accepted") {
    throw new Error("La propuesta todavía no fue aceptada.");
  }

  const chatId = interest.chatId || interest.id;
  const chatRef = ref(database, `chats/${chatId}`);
  const chatSnapshot = await get(chatRef);

  let chatData;

  if (!chatSnapshot.exists()) {
    chatData = buildChatData({ ...interest, chatId });
    await set(chatRef, chatData);

    await update(ref(database, `interests/${interest.id}`), {
      chatId,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
  } else {
    chatData = chatSnapshot.val();
  }

  await writeUserChatIndexes(chatId, chatData);

  return {
    id: chatId,
  };
}

export function listenChat(chatId, callback, onError) {
  if (!chatId) {
    callback(null);
    return () => {};
  }

  return onValue(
    ref(database, `chats/${chatId}`),
    (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    },
    (error) => {
      console.error(error);

      if (onError) {
        onError(error);
      }
    }
  );
}

export function listenChatMessages(chatId, callback, onError) {
  if (!chatId) {
    callback([]);
    return () => {};
  }

  return onValue(
    ref(database, `chatMessages/${chatId}`),
    (snapshot) => {
      const messages = [];

      snapshot.forEach((childSnapshot) => {
        messages.push({
          id: childSnapshot.key,
          ...childSnapshot.val(),
        });
      });

      messages.sort((a, b) => {
        const dateA = a.createdAt || 0;
        const dateB = b.createdAt || 0;
        return dateA - dateB;
      });

      callback(messages);
    },
    (error) => {
      console.error(error);

      if (onError) {
        onError(error);
      }
    }
  );
}

export function listenUserChats(userId, callback, onError) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  return onValue(
    ref(database, `userChats/${userId}`),
    (snapshot) => {
      const chats = [];

      snapshot.forEach((childSnapshot) => {
        chats.push({
          id: childSnapshot.key,
          ...childSnapshot.val(),
        });
      });

      chats.sort((a, b) => {
        const dateA = a.lastMessageAt || 0;
        const dateB = b.lastMessageAt || 0;
        return dateB - dateA;
      });

      callback(chats);
    },
    (error) => {
      console.error(error);

      if (onError) {
        onError(error);
      }
    }
  );
}

export async function sendChatMessage(user, chatId, text, attachment = null) {
  if (!user?.uid) {
    throw new Error("Usuario no autenticado.");
  }

  if (!chatId) {
    throw new Error("Chat no indicado.");
  }

  const cleanText = String(text || "").trim();

  if (!cleanText && !attachment) {
    throw new Error("El mensaje está vacío.");
  }

  const chatSnapshot = await get(ref(database, `chats/${chatId}`));

  if (!chatSnapshot.exists()) {
    throw new Error("Chat no encontrado.");
  }

  const chatData = chatSnapshot.val() || {};
  const participants = chatData.participants || {};
  const participantIds = Object.keys(participants);

  if (!participants[user.uid]) {
    throw new Error("No tenés permiso para escribir en este chat.");
  }

  const messageRef = push(ref(database, `chatMessages/${chatId}`));
  const senderName = user.displayName || user.email || "Usuario";
  const isImageMessage = attachment?.type === "image";

  const messagePayload = {
    id: messageRef.key,
    chatId,
    senderId: user.uid,
    senderName,
    text: cleanText,
    messageType: isImageMessage ? "image" : "text",
    attachment: attachment || null,
    createdAt: serverTimestamp(),
    readBy: {
      [user.uid]: true,
    },
  };

  const lastMessageText = isImageMessage
    ? cleanText || "📷 Foto"
    : cleanText;

  const updates = {
    [`chatMessages/${chatId}/${messageRef.key}`]: messagePayload,

    [`chats/${chatId}/lastMessage`]: lastMessageText,
    [`chats/${chatId}/lastMessageAt`]: serverTimestamp(),
    [`chats/${chatId}/lastMessageSenderId`]: user.uid,
    [`chats/${chatId}/updatedAt`]: serverTimestamp(),
  };

  participantIds.forEach((participantId) => {
    const otherUserId = participantIds.find((id) => id !== participantId);
    const isSender = participantId === user.uid;

    updates[`userChats/${participantId}/${chatId}/id`] = chatId;
    updates[`userChats/${participantId}/${chatId}/chatId`] = chatId;
    updates[`userChats/${participantId}/${chatId}/interestId`] =
      chatData.interestId || chatId;
    updates[`userChats/${participantId}/${chatId}/otherUserId`] =
      otherUserId || "";
    updates[`userChats/${participantId}/${chatId}/otherUserName`] =
      chatData.participantNames?.[otherUserId] || "Usuario";
    updates[`userChats/${participantId}/${chatId}/lastMessage`] =
      lastMessageText;
    updates[`userChats/${participantId}/${chatId}/lastMessageAt`] =
      serverTimestamp();
    updates[`userChats/${participantId}/${chatId}/status`] =
      chatData.status || "active";
    updates[`userChats/${participantId}/${chatId}/updatedAt`] =
      serverTimestamp();

    if (isSender) {
      updates[`chats/${chatId}/unreadCounts/${participantId}`] = 0;
      updates[`userChats/${participantId}/${chatId}/unreadCount`] = 0;
      updates[`userChats/${participantId}/${chatId}/lastReadAt`] =
        serverTimestamp();
    } else {
      updates[`chats/${chatId}/unreadCounts/${participantId}`] = increment(1);
      updates[`userChats/${participantId}/${chatId}/unreadCount`] =
        increment(1);
    }
  });

  await update(ref(database), updates);

  return {
    id: messageRef.key,
    ...messagePayload,
  };
}

export async function markChatAsRead(user, chatId) {
  if (!user?.uid || !chatId) return;

  await update(ref(database), {
    [`userChats/${user.uid}/${chatId}/unreadCount`]: 0,
    [`userChats/${user.uid}/${chatId}/lastReadAt`]: serverTimestamp(),
    [`chats/${chatId}/unreadCounts/${user.uid}`]: 0,
  });
}