import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  ClipboardList,
  Flag,
  Image as ImageIcon,
  MessageCircle,
  Paperclip,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import AppNavbar from "../components/AppNavbar";
import LogoMark from "../components/LogoMark";
import { useAuth } from "../context/AuthContext";
import {
  listenChat,
  listenChatMessages,
  listenUserChats,
  markChatAsRead,
  sendChatMessage,
} from "../services/chatService";
import { uploadChatImageFile } from "../services/chatAttachmentService";
import { reportChat } from "../services/chatReportService";

const REPORT_REASONS = [
  { value: "abuse", label: "Maltrato, amenazas o acoso" },
  { value: "scam", label: "Posible estafa" },
  { value: "terms", label: "No cumple los términos y condiciones" },
  { value: "spam", label: "Spam o mensajes repetidos" },
  { value: "inappropriate", label: "Contenido inapropiado" },
  { value: "other", label: "Otro motivo" },
];

const MAX_IMAGE_SIZE_MB = 8;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

function getTimestampValue(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function formatMessageTime(createdAt) {
  const timestamp = getTimestampValue(createdAt);
  if (!timestamp) return "";

  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatChatListDate(value) {
  const timestamp = getTimestampValue(value);
  if (!timestamp) return "Sin actividad";

  const date = new Date(timestamp);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    return new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function getOtherUserId(chat, userId) {
  if (!chat || !userId) return "";

  return (
    Object.keys(chat.participants || {}).find(
      (participantId) => participantId !== userId
    ) || ""
  );
}

function getMessageAttachment(message) {
  if (message?.attachment?.type === "image") return message.attachment;

  if (message?.imageUrl) {
    return {
      type: "image",
      url: message.imageUrl,
      name: message.imageName || "Imagen adjunta",
    };
  }

  return null;
}

function getChatItemId(chatItem) {
  return chatItem?.chatId || chatItem?.id || "";
}

function getChatItemName(chatItem) {
  return chatItem?.otherUserName || chatItem?.participantName || "Usuario";
}

function getChatItemPreview(chatItem) {
  return chatItem?.lastMessage || "Todavía no hay mensajes.";
}

function getLinkedProposalId(chat, chatId = "") {
  return (
    chat?.proposalId ||
    chat?.interestId ||
    chat?.sourceInterestId ||
    chat?.exchangeProposalId ||
    chat?.interest?.id ||
    chat?.proposal?.id ||
    chatId ||
    ""
  );
}

function ChatReportModal({
  chat,
  otherUserName,
  reason,
  detail,
  loading,
  error,
  onReasonChange,
  onDetailChange,
  onClose,
  onSubmit,
}) {
  if (!chat) return null;

  return (
    <div className="chatReportOverlay" role="dialog" aria-modal="true">
      <button
        type="button"
        className="chatReportBackdrop"
        aria-label="Cerrar reporte"
        onClick={onClose}
      />

      <form className="chatReportModal" onSubmit={onSubmit}>
        <div className="chatReportHeader">
          <div>
            <span className="miniLabel">Reportar chat</span>
            <h3>Conversación con {otherUserName}</h3>
          </div>

          <button
            type="button"
            className="chatReportClose"
            aria-label="Cerrar"
            onClick={onClose}
            disabled={loading}
          >
            ×
          </button>
        </div>

        <p className="chatReportIntro">
          Usá este reporte si la otra persona incumple los términos, envía
          contenido inapropiado o intenta realizar una operación sospechosa.
        </p>

        <label>
          Motivo
          <select
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            disabled={loading}
          >
            {REPORT_REASONS.map((item) => (
              <option value={item.value} key={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Detalle
          <textarea
            value={detail}
            onChange={(event) => onDetailChange(event.target.value)}
            placeholder="Contanos qué pasó. Incluí datos útiles para revisar el caso."
            disabled={loading}
            required
          />
        </label>

        {error && <p className="chatReportError">{error}</p>}

        <div className="chatReportActions">
          <button
            type="button"
            className="secondaryButton"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>

          <button type="submit" className="dangerButton" disabled={loading}>
            {loading ? "Enviando reporte..." : "Enviar reporte"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ChatsList({ chats, loading, onOpenChat }) {
  const sortedChats = useMemo(() => {
    return [...chats]
      .filter((chatItem) => getChatItemId(chatItem))
      .sort((firstChat, secondChat) => {
        return (
          getTimestampValue(secondChat.lastMessageAt || secondChat.updatedAt) -
          getTimestampValue(firstChat.lastMessageAt || firstChat.updatedAt)
        );
      });
  }, [chats]);

  const unreadTotal = useMemo(() => {
    return sortedChats.reduce((total, chatItem) => {
      return total + Number(chatItem.unreadCount || 0);
    }, 0);
  }, [sortedChats]);

  if (loading) {
    return <p className="loadingText">Cargando chats...</p>;
  }

  return (
    <main className="dashboardPage modernChatPage chatsListPage">
      <AppNavbar />

      <section className="chatsListHeader">
        <div className="chatsListHeaderCard">
          <div className="chatHeaderIdentity">
            <div className="chatAvatarGlow">
              <LogoMark />
            </div>

            <div>
              <span className="badge chatBadge">Chats</span>
              <h1>Conversaciones en curso</h1>
              <p>
                Revisá tus conversaciones activas, mensajes pendientes y accedé
                directo al chat para coordinar cada intercambio.
              </p>
            </div>
          </div>

          <div className="chatsListStats">
            <article>
              <span>Chats</span>
              <strong>{sortedChats.length}</strong>
            </article>

            <article className={unreadTotal > 0 ? "hasUnread" : ""}>
              <span>Pendientes</span>
              <strong>{unreadTotal}</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="chatsListWrap">
        {sortedChats.length === 0 ? (
          <div className="emptyState chatsEmptyState">
            <div>
              <div className="emptyLogoIcon">
                <LogoMark size="large" />
              </div>
              <h2>Todavía no tenés chats activos</h2>
              <p>
                Cuando una propuesta sea aceptada, vas a poder conversar desde
                esta pantalla.
              </p>
              <Link to="/propuestas" className="primaryLink">
                Ver propuestas
              </Link>
            </div>
          </div>
        ) : (
          <div className="chatsListGrid">
            {sortedChats.map((chatItem) => {
              const chatItemId = getChatItemId(chatItem);
              const unreadCount = Number(chatItem.unreadCount || 0);

              return (
                <button
                  type="button"
                  className={
                    unreadCount > 0
                      ? "chatListCard hasUnread"
                      : "chatListCard"
                  }
                  key={chatItemId}
                  onClick={() => onOpenChat(chatItemId)}
                >
                  <div className="chatListAvatar">
                    <MessageCircle size={24} strokeWidth={2.4} />
                    {unreadCount > 0 && (
                      <span>{unreadCount > 99 ? "99+" : unreadCount}</span>
                    )}
                  </div>

                  <div className="chatListContent">
                    <div className="chatListTopline">
                      <strong>{getChatItemName(chatItem)}</strong>
                      <small>
                        {formatChatListDate(
                          chatItem.lastMessageAt || chatItem.updatedAt
                        )}
                      </small>
                    </div>

                    <p>{getChatItemPreview(chatItem)}</p>

                    <div className="chatListMetaRow">
                      <span>{unreadCount > 0 ? "Mensaje pendiente" : "Al día"}</span>
                      <b>Ver chat</b>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Chat() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();

  const messagesEndRef = useRef(null);

  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userChats, setUserChats] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loadingChat, setLoadingChat] = useState(Boolean(chatId));
  const [loadingUserChats, setLoadingUserChats] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("terms");
  const [reportDetail, setReportDetail] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (authLoading) return undefined;

    if (!user) {
      navigate("/login");
      return undefined;
    }

    setLoadingUserChats(true);

    const unsubscribeUserChats = listenUserChats(
      user.uid,
      (items) => {
        setUserChats(items || []);
        setLoadingUserChats(false);
      },
      () => {
        setError("No pudimos cargar tus chats.");
        setLoadingUserChats(false);
      }
    );

    return () => {
      unsubscribeUserChats?.();
    };
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (authLoading) return undefined;

    if (!user) return undefined;

    if (!chatId) {
      setChat(null);
      setMessages([]);
      setLoadingChat(false);
      return undefined;
    }

    setLoadingChat(true);
    setError("");

    const unsubscribeChat = listenChat(
      chatId,
      (chatData) => {
        setChat(chatData);
        setLoadingChat(false);
      },
      () => {
        setError("No pudimos cargar el chat.");
        setLoadingChat(false);
      }
    );

    const unsubscribeMessages = listenChatMessages(
      chatId,
      setMessages,
      () => {
        setError("No pudimos cargar los mensajes.");
      }
    );

    return () => {
      unsubscribeChat?.();
      unsubscribeMessages?.();
    };
  }, [authLoading, user, chatId]);

  useEffect(() => {
    if (!user || !chatId || !chat?.participants?.[user.uid]) return;

    markChatAsRead(user, chatId).catch((err) => {
      console.error(err);
    });
  }, [user, chatId, chat, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!selectedImageFile) {
      setSelectedImagePreview("");
      return undefined;
    }

    const url = URL.createObjectURL(selectedImageFile);
    setSelectedImagePreview(url);

    return () => URL.revokeObjectURL(url);
  }, [selectedImageFile]);

  const otherUserId = useMemo(() => {
    if (!chat || !user) return "";
    return getOtherUserId(chat, user.uid);
  }, [chat, user]);

  const otherUserName = useMemo(() => {
    if (!chat || !user) return "Usuario";
    return chat.participantNames?.[otherUserId] || "Usuario";
  }, [chat, otherUserId, user]);

  const linkedProposalId = useMemo(
    () => getLinkedProposalId(chat, chatId),
    [chat, chatId]
  );

  const canSend = Boolean(messageText.trim() || selectedImageFile) && !sending;
  const isLoading = authLoading || (chatId ? loadingChat : loadingUserChats);

  const handleOpenChat = (nextChatId) => {
    if (!nextChatId) return;
    navigate(`/chat/${nextChatId}`);
  };

  const handleOpenLinkedProposal = () => {
    if (!linkedProposalId) {
      navigate("/propuestas");
      return;
    }

    navigate(
      `/propuestas?proposalId=${encodeURIComponent(
        linkedProposalId
      )}`
    );
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    setError("");
    setSuccessMessage("");

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Solo se pueden adjuntar imágenes.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError(`La imagen no puede superar los ${MAX_IMAGE_SIZE_MB} MB.`);
      return;
    }

    setSelectedImageFile(file);
    setUploadProgress(0);
  };

  const clearSelectedImage = () => {
    setSelectedImageFile(null);
    setUploadProgress(0);
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();

    if (!messageText.trim() && !selectedImageFile) return;

    setSending(true);
    setError("");
    setSuccessMessage("");

    try {
      let attachment = null;

      if (selectedImageFile) {
        const participantIds = Object.keys(chat?.participants || {});

        attachment = await uploadChatImageFile(
          user,
          chatId,
          selectedImageFile,
          setUploadProgress,
          participantIds
        );
      }

      await sendChatMessage(user, chatId, messageText.trim(), attachment);
      setMessageText("");
      clearSelectedImage();
    } catch (err) {
      console.error(err);
      setError("No pudimos enviar el mensaje.");
    } finally {
      setSending(false);
    }
  };

  const openReportModal = () => {
    setReportReason("terms");
    setReportDetail("");
    setReportError("");
    setIsReportOpen(true);
  };

  const closeReportModal = () => {
    if (reportLoading) return;

    setIsReportOpen(false);
    setReportReason("terms");
    setReportDetail("");
    setReportError("");
  };

  const handleReportChat = async (event) => {
    event.preventDefault();

    const cleanDetail = reportDetail.trim();

    if (cleanDetail.length < 10) {
      setReportError("Agregá un detalle de al menos 10 caracteres.");
      return;
    }

    setReportLoading(true);
    setReportError("");
    setError("");
    setSuccessMessage("");

    try {
      await reportChat(user, chat, {
        chatId,
        reportedUserId: otherUserId,
        reportedUserName: otherUserName,
        reasonCode: reportReason,
        reason:
          REPORT_REASONS.find((item) => item.value === reportReason)?.label ||
          "Otro motivo",
        detail: cleanDetail,
        lastMessages: messages.slice(-8).map((message) => ({
          id: message.id || "",
          senderId: message.senderId || "",
          senderName: message.senderName || "",
          text: message.text || "",
          hasAttachment: Boolean(getMessageAttachment(message)),
          createdAt: message.createdAt || null,
        })),
      });

      setSuccessMessage("Recibimos el reporte. Vamos a revisar la conversación.");
      closeReportModal();
    } catch (err) {
      console.error(err);
      setReportError("No pudimos enviar el reporte. Intentá nuevamente.");
    } finally {
      setReportLoading(false);
    }
  };

  if (!chatId) {
    return (
      <ChatsList
        chats={userChats}
        loading={isLoading}
        onOpenChat={handleOpenChat}
      />
    );
  }

  if (isLoading) {
    return (
      <main className="dashboardPage">
        <p className="loadingText">Cargando chat...</p>
      </main>
    );
  }

  if (!chat) {
    return (
      <main className="dashboardPage">
        <AppNavbar />

        <section className="emptyState">
          <div>
            <div className="emptyLogoIcon">
              <LogoMark size="large" />
            </div>
            <h2>Chat no encontrado</h2>
            <p>Este chat no existe o ya no está disponible.</p>
            <button
              type="button"
              className="primaryButton"
              onClick={() => navigate("/chats")}
            >
              Ver todos los chats
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboardPage modernChatPage">
      <AppNavbar />

      <section className="modernChatHeader">
        <div className="chatDetailTopActions">
          <button
            type="button"
            className="chatBackButton"
            onClick={() => navigate("/chats")}
          >
            <ArrowLeft size={18} strokeWidth={2.4} />
            Ver todos los chats
          </button>
        </div>

        <div className="modernChatHeaderCard">
          <div className="chatHeaderIdentity">
            <div className="chatAvatarGlow">
              <LogoMark />
            </div>

            <div>
              <span className="badge chatBadge">Chat de intercambio</span>
              <h1>Conversación con {otherUserName}</h1>
              <p>
                Coordiná el intercambio dentro de TeLoCambio. Evitá compartir
                datos sensibles y usá puntos seguros para concretar.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="chatReportButton"
            onClick={openReportModal}
          >
            <Flag size={18} strokeWidth={2.4} />
            Reportar chat
          </button>
        </div>
      </section>

      {error && (
        <section className="dashboardNotice compactDashboardNotice">
          <p>{error}</p>
        </section>
      )}

      {successMessage && (
        <section className="successNotice compactDashboardNotice">
          <p>{successMessage}</p>
        </section>
      )}

      <section className="modernChatLayout">
        <aside className="modernChatSummaryCard">
          <div className="chatSummaryTop">
            <span className="miniLabel">Intercambio</span>
            <strong>{otherUserName}</strong>
            <p>Revisá qué busca y qué ofrece la otra parte antes de coordinar.</p>
          </div>

          <div className="chatSummaryBlock modernSummaryBlock">
            <strong>Busca</strong>
            <p>{chat.otherSearchTitle || chat.mySearchTitle || "No indicado"}</p>
          </div>

          <div className="chatSummaryBlock modernSummaryBlock">
            <strong>Ofrece</strong>
            <p>{chat.otherOfferTitle || chat.myOfferTitle || "No indicado"}</p>
          </div>

          <button
            type="button"
            className="primaryButton"
            onClick={handleOpenLinkedProposal}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <ClipboardList size={18} strokeWidth={2.4} />
            Ver propuesta
          </button>

          <button
            type="button"
            className="secondaryButton chatAllChatsSideButton"
            onClick={() => navigate("/chats")}
          >
            Ver todos los chats
          </button>

          <div className="chatSafetyCard">
            <ShieldCheck size={22} strokeWidth={2.4} />
            <div>
              <strong>Consejo de seguridad</strong>
              <p>
                Coordiná en lugares públicos, iluminados y con movimiento. No
                compartas claves, códigos ni datos de pago sensibles.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="chatSideReportButton"
            onClick={openReportModal}
          >
            <AlertTriangle size={18} strokeWidth={2.4} />
            Informar un problema
          </button>
        </aside>

        <section className="modernChatCard">
          <div className="modernMessagesHeader">
            <div>
              <span className="miniLabel">Mensajes</span>
              <strong>
                {messages.length} mensaje{messages.length === 1 ? "" : "s"}
              </strong>
            </div>
            <span>Chat seguro</span>
          </div>

          <div className="messagesList modernMessagesList">
            {messages.length === 0 ? (
              <div className="emptyMessages modernEmptyMessages">
                <LogoMark />
                <strong>Todavía no hay mensajes</strong>
                <p>Escribí el primero para coordinar el intercambio.</p>
              </div>
            ) : (
              messages.map((message) => {
                const isMine = message.senderId === user.uid;
                const attachment = getMessageAttachment(message);

                return (
                  <div
                    className={
                      isMine
                        ? "messageBubble modernMessageBubble mine"
                        : "messageBubble modernMessageBubble"
                    }
                    key={message.id}
                  >
                    <div className="messageBubbleHeader">
                      <strong>{isMine ? "Vos" : message.senderName}</strong>
                      {message.createdAt && (
                        <small>{formatMessageTime(message.createdAt)}</small>
                      )}
                    </div>

                    {attachment?.url && (
                      <a
                        className="chatImageAttachment"
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={attachment.url}
                          alt={attachment.name || "Imagen adjunta"}
                        />
                      </a>
                    )}

                    {message.text && <p>{message.text}</p>}
                  </div>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          {selectedImagePreview && (
            <div className="chatSelectedImagePreview">
              <img src={selectedImagePreview} alt="Imagen seleccionada" />

              <div>
                <strong>{selectedImageFile?.name}</strong>
                <span>
                  {sending && uploadProgress > 0
                    ? `Subiendo ${uploadProgress}%`
                    : "Lista para enviar"}
                </span>
              </div>

              <button
                type="button"
                aria-label="Quitar imagen"
                onClick={clearSelectedImage}
                disabled={sending}
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
          )}

          <form className="chatForm modernChatForm" onSubmit={handleSendMessage}>
            <label className="chatAttachButton" title="Adjuntar foto">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={sending}
              />
              <Paperclip size={20} strokeWidth={2.5} />
            </label>

            <div className="chatInputShell">
              <ImageIcon size={18} strokeWidth={2.2} />
              <input
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder={
                  selectedImageFile
                    ? "Agregá un mensaje opcional..."
                    : "Escribí un mensaje..."
                }
                disabled={sending}
              />
            </div>

            <button type="submit" className="primaryButton chatSendButton" disabled={!canSend}>
              {sending ? (
                selectedImageFile ? (
                  `Subiendo ${uploadProgress}%`
                ) : (
                  "Enviando..."
                )
              ) : (
                <>
                  <Send size={18} strokeWidth={2.5} />
                  Enviar
                </>
              )}
            </button>
          </form>

          <div className="chatFormHint">
            <Camera size={16} strokeWidth={2.3} />
            <span>Podés adjuntar una foto por mensaje. Máximo {MAX_IMAGE_SIZE_MB} MB.</span>
          </div>
        </section>
      </section>

      <ChatReportModal
        chat={isReportOpen ? chat : null}
        otherUserName={otherUserName}
        reason={reportReason}
        detail={reportDetail}
        loading={reportLoading}
        error={reportError}
        onReasonChange={setReportReason}
        onDetailChange={setReportDetail}
        onClose={closeReportModal}
        onSubmit={handleReportChat}
      />
    </main>
  );
}

export default Chat;
