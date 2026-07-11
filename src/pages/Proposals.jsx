import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router";
import {
  get,
  ref as databaseRef,
  update,
} from "firebase/database";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import AppNavbar from "../components/AppNavbar";
import LogoMark from "../components/LogoMark";
import { useAuth } from "../context/AuthContext";
import { database, storage } from "../services/firebase";
import { getServiceImageUrl } from "../utils/serviceMedia";
import {
  acceptInterestAndCreateChat,
  ensureChatForInterest,
  listenUserChats,
} from "../services/chatService";
import {
  listenUserInterests,
  updateInterestStatus,
} from "../services/exchangeService";
import {
  listenUserReputations,
  rateProposalOperation,
  saveProposalMeetingPoint,
} from "../services/proposalService";
import { cleanupChatResources } from "../services/chatCleanupService";
import PublicAdvertisement from "../components/PublicAdvertisement";
import { listenAdvertisementsByPlacement } from "../services/advertisingPublicService";

const statusLabels = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  completed: "Finalizada",
  notCompleted: "No concretada",
};

const mediaUrlCache = new Map();
const imagePreloadCache = new Set();

function getCounterpartyId(proposal, userId) {
  if (!proposal || !userId) return "";
  return proposal.fromUserId === userId ? proposal.toUserId : proposal.fromUserId;
}

function getCounterpartyName(proposal, userId) {
  if (!proposal || !userId) return "Usuario";

  if (proposal.fromUserId === userId) {
    return proposal.toUserName || "Usuario";
  }

  return proposal.fromUserName || "Usuario";
}

function getCompatibilityScore(proposal) {
  const score = Number(proposal?.matchScore ?? proposal?.score ?? 0);
  return Number.isFinite(score) ? score : 0;
}

function getInitialMeetingDraft(proposal) {
  const meetingPoint = proposal?.meetingPoint || {};

  return {
    placeName: meetingPoint.placeName || "",
    address: meetingPoint.address || "",
    date: meetingPoint.date || "",
    time: meetingPoint.time || "",
    notes: meetingPoint.notes || "",
  };
}

function getInitialRatingDraft() {
  return {
    rating: 0,
    comment: "",
  };
}

function getProposalExchangeIds(proposal) {
  return [proposal?.myExchangeId, proposal?.otherExchangeId].filter(Boolean);
}

function getCounterpartyExchangeId(proposal, userId) {
  if (!proposal || !userId) return "";
  return proposal.fromUserId === userId
    ? proposal.otherExchangeId
    : proposal.myExchangeId;
}

function getOwnExchangeId(proposal, userId) {
  if (!proposal || !userId) return "";
  return proposal.fromUserId === userId
    ? proposal.myExchangeId
    : proposal.otherExchangeId;
}

function getCounterpartyOfferTitle(proposal, userId) {
  if (!proposal || !userId) return "Producto ofrecido";
  return proposal.fromUserId === userId
    ? proposal.otherOfferTitle
    : proposal.myOfferTitle;
}

function getCounterpartySearchTitle(proposal, userId) {
  if (!proposal || !userId) return "Producto buscado";
  return proposal.fromUserId === userId
    ? proposal.otherSearchTitle
    : proposal.mySearchTitle;
}

function getOwnOfferTitle(proposal, userId) {
  if (!proposal || !userId) return "Tu publicación";
  return proposal.fromUserId === userId
    ? proposal.myOfferTitle
    : proposal.otherOfferTitle;
}

function getOwnSearchTitle(proposal, userId) {
  if (!proposal || !userId) return "Tu búsqueda";
  return proposal.fromUserId === userId
    ? proposal.mySearchTitle
    : proposal.otherSearchTitle;
}

function getExchangeLocationLabel(exchange) {
  const location = exchange?.location;

  if (location?.localityName && location?.provinceName) {
    return `${location.localityName}, ${location.provinceName}`;
  }

  if (location?.departmentName && location?.provinceName) {
    return `${location.departmentName}, ${location.provinceName}`;
  }

  return exchange?.zone || "Ubicación no indicada";
}

function normalizeMediaCollection(mediaValue) {
  if (Array.isArray(mediaValue)) {
    return mediaValue.filter(Boolean);
  }

  if (mediaValue && typeof mediaValue === "object") {
    return Object.values(mediaValue).filter(Boolean);
  }

  return [];
}

function getMediaCount(exchange) {
  const mediaItems = normalizeMediaCollection(exchange?.offerMedia);

  if (mediaItems.length > 0) {
    return mediaItems.length;
  }

  if (exchange?.coverMedia) {
    return 1;
  }

  if (
    exchange?.offerCategory === "Servicios" &&
    getServiceImageUrl(exchange?.offerServiceType)
  ) {
    return 1;
  }

  return Number(exchange?.offerMediaCount || 0);
}

function isLicensedValue(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isOfferServiceExchange(exchange) {
  return exchange?.offerCategory === "Servicios";
}

function isSearchServiceExchange(exchange) {
  return exchange?.searchCategory === "Servicios";
}

function getServiceTypeLabel(value) {
  return value || "Servicio no indicado";
}

function getOfferMetaText(exchange) {
  if (!exchange) return "Datos completos no disponibles";

  if (isOfferServiceExchange(exchange)) {
    const parts = ["Servicios", getServiceTypeLabel(exchange.offerServiceType)];

    if (isLicensedValue(exchange.offerIsLicensed)) {
      parts.push("Matriculado");
    }

    return parts.filter(Boolean).join(" · ");
  }

  return [exchange.offerCategory, exchange.offerState]
    .filter(Boolean)
    .join(" · ") || "Sin datos de categoría";
}

function getSearchMetaText(exchange) {
  if (!exchange) return "Datos completos no disponibles";

  if (isSearchServiceExchange(exchange)) {
    return ["Servicios", getServiceTypeLabel(exchange.searchServiceType)]
      .filter(Boolean)
      .join(" · ");
  }

  return exchange.searchCategory || "Sin categoría indicada";
}

function PublicationInfoPanel({
  title,
  exchange,
  fallbackOfferTitle,
  fallbackSearchTitle,
  variant = "counterparty",
}) {
  const offerTitle =
    exchange?.offerTitle || fallbackOfferTitle || "Oferta no indicada";
  const searchTitle =
    exchange?.searchTitle || fallbackSearchTitle || "Búsqueda no indicada";
  const isServiceOffer = isOfferServiceExchange(exchange);
  const isServiceSearch = isSearchServiceExchange(exchange);
  const isLicensed = isLicensedValue(exchange?.offerIsLicensed);
  const isOwnPublication = variant === "own";
  const variantClass = isOwnPublication
    ? "ownProposalPublicationCard"
    : "counterpartyProposalPublicationCard";

  return (
    <section
      className={`proposalPublicationInfoCard simplifiedProposalPublicationCard differentiatedProposalPublicationCard ${variantClass}`}
    >
      <div className="proposalPublicationInfoHeader simplifiedPublicationHeader differentiatedPublicationHeader">
        <div className="proposalPublicationIdentityIcon" aria-hidden="true">
          {isOwnPublication ? "✓" : "↔"}
        </div>

        <div className="proposalPublicationHeaderCopy">
          <span className="miniLabel">{title}</span>
          <p>
            {exchange
              ? getExchangeLocationLabel(exchange)
              : "Cargando datos completos de la publicación..."}
          </p>
        </div>

        <span className="proposalPublicationOwnershipPill">
          {isOwnPublication ? "Tuya" : "Otra persona"}
        </span>
      </div>

      <div className="simplifiedPublicationBlocks">
        <article>
          <span>Ofrece</span>
          <strong>{offerTitle}</strong>
          <p>{getOfferMetaText(exchange)}</p>

          {isServiceOffer && isLicensed && exchange?.offerLicenseNumber && (
            <p className="simplifiedLicenseNumber">
              Matrícula N° {exchange.offerLicenseNumber}
            </p>
          )}
        </article>

        <article>
          <span>Busca</span>
          <strong>{searchTitle}</strong>
          <p>{getSearchMetaText(exchange)}</p>
        </article>
      </div>

      {(exchange?.offerDescription || exchange?.searchDetails) && (
        <div className="simplifiedPublicationNotes">
          {exchange?.offerDescription && (
            <div>
              <span>Descripción</span>
              <p>{exchange.offerDescription}</p>
            </div>
          )}

          {exchange?.searchDetails && (
            <div>
              <span>Detalles de búsqueda</span>
              <p>{exchange.searchDetails}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function isDirectMediaUrl(value) {
  if (typeof value !== "string") return false;

  const cleanValue = value.trim();

  return (
    cleanValue.startsWith("http://") ||
    cleanValue.startsWith("https://") ||
    cleanValue.startsWith("/") ||
    cleanValue.startsWith("./") ||
    cleanValue.startsWith("../") ||
    cleanValue.startsWith("blob:") ||
    cleanValue.startsWith("data:")
  );
}

function isVideoMedia(media) {
  return media?.type === "video" || media?.contentType?.startsWith("video/");
}

function getStoragePathFromGsUrl(value) {
  if (typeof value !== "string" || !value.startsWith("gs://")) return "";
  return value.replace(/^gs:\/\/[^/]+\//, "");
}

function getInitialMediaUrl(media) {
  const possibleUrls = [
    media?.url,
    media?.downloadUrl,
    media?.originalUrl,
    media?.originalDownloadUrl,
  ];

  return (
    possibleUrls.find((value) => isDirectMediaUrl(value)) || ""
  );
}

function getMediaStoragePath(media) {
  return (
    media?.path ||
    media?.fullPath ||
    getStoragePathFromGsUrl(media?.url) ||
    getStoragePathFromGsUrl(media?.gsUrl) ||
    ""
  );
}

async function resolveMediaDownloadUrl(media) {
  const initialUrl = getInitialMediaUrl(media);
  if (initialUrl) return initialUrl;

  const path = getMediaStoragePath(media);
  if (!path) return "";

  if (mediaUrlCache.has(path)) {
    return mediaUrlCache.get(path);
  }

  const request = getDownloadURL(storageRef(storage, path)).catch((error) => {
    mediaUrlCache.delete(path);
    throw error;
  });

  mediaUrlCache.set(path, request);

  return request;
}

function getExchangeMediaItems(exchange) {
  const mediaItems = normalizeMediaCollection(exchange?.offerMedia);

  if (mediaItems.length > 0) {
    return mediaItems;
  }

  if (exchange?.coverMedia) {
    return [exchange.coverMedia];
  }

  if (isOfferServiceExchange(exchange)) {
    const serviceImageUrl = getServiceImageUrl(
      exchange?.offerServiceType
    );

    if (serviceImageUrl) {
      return [
        {
          mediaId: `service-proposal-${
            exchange?.offerServiceType || "otro"
          }`,
          type: "image",
          status: "ready",
          url: serviceImageUrl,
          downloadUrl: serviceImageUrl,
          originalUrl: serviceImageUrl,
          originalDownloadUrl: serviceImageUrl,
          path: "",
          fullPath: "",
          name: `servicio-${
            exchange?.offerServiceType || "otro"
          }`,
          contentType: "image/png",
          isServiceDefault: true,
          serviceType: exchange?.offerServiceType || "Otro",
        },
      ];
    }
  }

  return [];
}

function getMediaKey(media, index = 0) {
  return (
    media?.path ||
    media?.fullPath ||
    media?.url ||
    media?.downloadUrl ||
    media?.gsUrl ||
    media?.name ||
    `media-${index}`
  );
}

function preloadImage(url) {
  if (!url || typeof window === "undefined" || imagePreloadCache.has(url)) return;

  imagePreloadCache.add(url);

  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = "high";
  image.src = url;
}

async function getExchangeSnapshotById(exchangeId) {
  if (!exchangeId) return null;

  const snapshot = await get(databaseRef(database, `exchanges/${exchangeId}`));

  if (!snapshot.exists()) return null;

  return {
    id: snapshot.key,
    ...snapshot.val(),
  };
}

function MediaViewerModal({
  mediaItems = [],
  initialIndex = 0,
  mediaUrls = {},
  title,
  onClose,
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [resolvedUrls, setResolvedUrls] = useState(mediaUrls || {});
  const [mediaErrors, setMediaErrors] = useState({});

  const activeMedia = mediaItems[activeIndex] || null;
  const activeKey = activeMedia ? getMediaKey(activeMedia, activeIndex) : "";
  const activeMediaUrl =
    (activeKey && resolvedUrls[activeKey]) || getInitialMediaUrl(activeMedia);
  const isVideo = isVideoMedia(activeMedia);
  const hasMultipleMedia = mediaItems.length > 1;

  useEffect(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    let isMounted = true;

    setResolvedUrls((current) => ({
      ...current,
      ...(mediaUrls || {}),
    }));

    mediaItems.forEach((media, index) => {
      const key = getMediaKey(media, index);
      const initialUrl = getInitialMediaUrl(media) || mediaUrls?.[key];

      if (initialUrl) {
        setResolvedUrls((current) => ({
          ...current,
          [key]: initialUrl,
        }));

        if (!isVideoMedia(media)) {
          preloadImage(initialUrl);
        }
      }

      resolveMediaDownloadUrl(media)
        .then((resolvedUrl) => {
          if (!isMounted || !resolvedUrl) return;

          setResolvedUrls((current) => ({
            ...current,
            [key]: resolvedUrl,
          }));

          if (!isVideoMedia(media)) {
            preloadImage(resolvedUrl);
          }
        })
        .catch((error) => {
          console.error("No pudimos resolver la URL del archivo ampliado.", error);

          if (isMounted) {
            setMediaErrors((current) => ({
              ...current,
              [key]: true,
            }));
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [mediaItems, mediaUrls]);

  useEffect(() => {
    if (activeIndex >= mediaItems.length && mediaItems.length > 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, mediaItems.length]);

  const goToPreviousMedia = () => {
    if (!hasMultipleMedia) return;

    setActiveIndex((current) =>
      current === 0 ? mediaItems.length - 1 : current - 1
    );
  };

  const goToNextMedia = () => {
    if (!hasMultipleMedia) return;

    setActiveIndex((current) =>
      current === mediaItems.length - 1 ? 0 : current + 1
    );
  };

  useEffect(() => {
    if (!activeMedia) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousMedia();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextMedia();
      }
    };

    document.body.classList.add("mediaViewerOpen");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("mediaViewerOpen");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeMedia, hasMultipleMedia, mediaItems.length, onClose]);

  if (!activeMedia) return null;

  const hasActiveError = activeKey ? Boolean(mediaErrors[activeKey]) : false;

  return (
    <div className="mediaViewerOverlay" role="dialog" aria-modal="true">
      <button
        type="button"
        className="mediaViewerBackdrop"
        aria-label="Cerrar vista ampliada"
        onClick={onClose}
      />

      <div className="mediaViewerDialog">
        <div className="mediaViewerHeader">
          <div>
            <span className="miniLabel">Archivo de la propuesta</span>
            <strong>{title || activeMedia.name || "Publicación"}</strong>
            {hasMultipleMedia && (
              <small>
                Archivo {activeIndex + 1} de {mediaItems.length}
              </small>
            )}
          </div>

          <button
            type="button"
            className="mediaViewerClose"
            aria-label="Cerrar"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="mediaViewerBody">
          {!activeMediaUrl && !hasActiveError ? (
            <div className="mediaViewerFallback">
              <LogoMark />
              <p>Cargando archivo...</p>
            </div>
          ) : hasActiveError ? (
            <div className="mediaViewerFallback">
              <LogoMark />
              <p>No pudimos cargar este archivo.</p>
            </div>
          ) : isVideo ? (
            <video controls playsInline preload="metadata" autoPlay>
              <source
                src={activeMediaUrl}
                type={activeMedia.contentType || "video/mp4"}
              />
              Tu navegador no puede reproducir este video.
            </video>
          ) : (
            <img
              src={activeMediaUrl}
              alt={title || activeMedia.name || "Publicación"}
              decoding="async"
            />
          )}

          {hasMultipleMedia && (
            <>
              <button
                type="button"
                className="mediaViewerNavButton previous"
                onClick={goToPreviousMedia}
                aria-label="Ver archivo anterior"
              >
                ‹
              </button>

              <button
                type="button"
                className="mediaViewerNavButton next"
                onClick={goToNextMedia}
                aria-label="Ver archivo siguiente"
              >
                ›
              </button>

              <div className="mediaViewerDots" aria-label="Archivos ampliados">
                {mediaItems.map((media, index) => (
                  <button
                    type="button"
                    className={index === activeIndex ? "active" : ""}
                    key={getMediaKey(media, index)}
                    onClick={() => setActiveIndex(index)}
                    aria-label={`Ver archivo ${index + 1}`}
                  />
                ))}
              </div>
            </>
          )}

          <div className="mediaPreloadStack" aria-hidden="true">
            {mediaItems.map((media, index) => {
              const key = getMediaKey(media, index);
              const url = resolvedUrls[key] || getInitialMediaUrl(media);

              if (!url || isVideoMedia(media) || index === activeIndex) {
                return null;
              }

              return <img src={url} alt="" key={key} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProposalMediaCarousel({ exchange, title }) {
  const mediaItems = useMemo(() => getExchangeMediaItems(exchange), [exchange]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mediaUrls, setMediaUrls] = useState({});
  const [mediaErrors, setMediaErrors] = useState({});
  const [expandedMediaIndex, setExpandedMediaIndex] = useState(null);

  const activeMedia = mediaItems[activeIndex] || null;
  const activeKey = activeMedia ? getMediaKey(activeMedia, activeIndex) : "";
  const activeMediaUrl =
    (activeKey && mediaUrls[activeKey]) || getInitialMediaUrl(activeMedia);
  const isVideo = isVideoMedia(activeMedia);
  const hasMultipleMedia = mediaItems.length > 1;
  const hasActiveError = activeKey ? Boolean(mediaErrors[activeKey]) : false;

  useEffect(() => {
    if (activeIndex >= mediaItems.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, mediaItems.length]);

  useEffect(() => {
    let isMounted = true;

    setMediaErrors({});

    if (mediaItems.length === 0) {
      setMediaUrls({});
      return undefined;
    }

    mediaItems.forEach((media, index) => {
      const key = getMediaKey(media, index);
      const initialUrl = getInitialMediaUrl(media);

      if (initialUrl) {
        setMediaUrls((current) => ({
          ...current,
          [key]: initialUrl,
        }));

        if (!isVideoMedia(media)) {
          preloadImage(initialUrl);
        }
      }

      resolveMediaDownloadUrl(media)
        .then((resolvedUrl) => {
          if (!isMounted || !resolvedUrl) return;

          setMediaUrls((current) => ({
            ...current,
            [key]: resolvedUrl,
          }));

          if (!isVideoMedia(media)) {
            preloadImage(resolvedUrl);
          }
        })
        .catch((error) => {
          console.error("No pudimos resolver la URL del archivo.", error);

          if (isMounted) {
            setMediaErrors((current) => ({
              ...current,
              [key]: true,
            }));
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [mediaItems]);

  const goToPreviousMedia = (event) => {
    event.stopPropagation();
    setActiveIndex((current) =>
      current === 0 ? mediaItems.length - 1 : current - 1
    );
  };

  const goToNextMedia = (event) => {
    event.stopPropagation();
    setActiveIndex((current) =>
      current === mediaItems.length - 1 ? 0 : current + 1
    );
  };

  const openMediaViewer = () => {
    if (!activeMedia || !activeMediaUrl || hasActiveError || isVideo) return;
    setExpandedMediaIndex(activeIndex);
  };

  const closeMediaViewer = () => {
    setExpandedMediaIndex(null);
  };

  if (!activeMedia) {
    return (
      <div className="proposalMediaPlaceholder">
        <LogoMark />
        <span>Sin multimedia</span>
      </div>
    );
  }

  if (!activeMediaUrl && !hasActiveError) {
    return (
      <div className="proposalMediaPlaceholder">
        <LogoMark />
        <span>Cargando archivo...</span>
      </div>
    );
  }

  if (hasActiveError) {
    return (
      <div className="proposalMediaPlaceholder">
        <LogoMark />
        <span>No pudimos cargar este archivo.</span>
      </div>
    );
  }

  return (
    <div className="proposalMediaCarousel">
      <div
        className={`proposalMediaExpandButton ${isVideo ? "isVideo" : "isImage"}`}
        role={isVideo ? undefined : "button"}
        tabIndex={isVideo ? undefined : 0}
        onClick={isVideo ? undefined : openMediaViewer}
        onKeyDown={(event) => {
          if (!isVideo && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openMediaViewer();
          }
        }}
        aria-label={isVideo ? undefined : "Ampliar imagen de la propuesta"}
      >
        {isVideo ? (
          <video
            className="proposalMediaPreview proposalVideoPreview"
            controls
            controlsList="nodownload"
            playsInline
            preload="metadata"
            onError={() =>
              setMediaErrors((current) => ({
                ...current,
                [activeKey]: true,
              }))
            }
          >
            <source src={activeMediaUrl} type={activeMedia.contentType || "video/mp4"} />
            Tu navegador no puede reproducir este video.
          </video>
        ) : (
          <img
            className="proposalMediaPreview"
            src={activeMediaUrl}
            alt={title || exchange?.offerTitle || "Publicación de la propuesta"}
            loading="eager"
            decoding="async"
            onError={() =>
              setMediaErrors((current) => ({
                ...current,
                [activeKey]: true,
              }))
            }
          />
        )}
      </div>

      {hasMultipleMedia && (
        <>
          <button
            type="button"
            className="proposalCarouselButton previous"
            onClick={goToPreviousMedia}
            aria-label="Ver archivo anterior"
          >
            ‹
          </button>

          <button
            type="button"
            className="proposalCarouselButton next"
            onClick={goToNextMedia}
            aria-label="Ver archivo siguiente"
          >
            ›
          </button>

          <div className="proposalCarouselDots" aria-label="Archivos de la propuesta">
            {mediaItems.map((media, index) => (
              <button
                type="button"
                className={index === activeIndex ? "active" : ""}
                key={getMediaKey(media, index)}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex(index);
                }}
                aria-label={`Ver archivo ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}

      <div className="mediaPreloadStack" aria-hidden="true">
        {mediaItems.map((media, index) => {
          const key = getMediaKey(media, index);
          const url = mediaUrls[key] || getInitialMediaUrl(media);

          if (!url || isVideoMedia(media) || index === activeIndex) {
            return null;
          }

          return <img src={url} alt="" key={key} />;
        })}
      </div>

      {expandedMediaIndex !== null && (
        <MediaViewerModal
          mediaItems={mediaItems}
          initialIndex={expandedMediaIndex}
          mediaUrls={mediaUrls}
          title={title || exchange?.offerTitle}
          onClose={closeMediaViewer}
        />
      )}
    </div>
  );
}

function ReputationBadge({ reputation }) {
  const totalRatings = Number(reputation?.totalRatings || 0);
  const averageRating = Number(reputation?.averageRating || 0);

  if (!totalRatings) {
    return (
      <div className="reputationBadge reputationEmpty">
        <strong>Sin reputación</strong>
        <span>Este usuario todavía no tiene calificaciones.</span>
      </div>
    );
  }

  return (
    <div className="reputationBadge">
      <strong>★ {averageRating.toFixed(1)}</strong>
      <span>
        {totalRatings} calificación{totalRatings > 1 ? "es" : ""}
      </span>
    </div>
  );
}

function RatingStarsInput({ value, onChange, disabled }) {
  return (
    <div className="starsInput" aria-label="Calificación">
      {[1, 2, 3, 4, 5].map((ratingValue) => (
        <button
          type="button"
          key={ratingValue}
          className={
            value >= ratingValue
              ? "ratingStarButton active"
              : "ratingStarButton"
          }
          disabled={disabled}
          onClick={() => onChange(ratingValue)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function formatProposalMoney(value) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount) || amount <= 0) return "Sin dinero adicional";

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMeetingDateForShare(value) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue) return "No indicada";

  const [year, month, day] = cleanValue.split("-");

  if (!year || !month || !day) {
    return cleanValue;
  }

  return `${day}/${month}/${year}`;
}

function buildMeetingWhatsAppMessage({
  counterpartyName,
  ownOfferTitle,
  counterpartyOfferTitle,
  meetingDraft,
}) {
  const placeName = String(meetingDraft?.placeName || "").trim();
  const address = String(meetingDraft?.address || "").trim();
  const date = String(meetingDraft?.date || "").trim();
  const time = String(meetingDraft?.time || "").trim();
  const notes = String(meetingDraft?.notes || "").trim();

  const lines = [
    "Te comparto los datos de una coordinación de intercambio en TeLoCambio:",
    "",
    `Con quién: ${counterpartyName || "Usuario"}`,
    `Yo ofrezco: ${ownOfferTitle || "No indicado"}`,
    `La otra persona ofrece: ${counterpartyOfferTitle || "No indicado"}`,
    `Lugar: ${placeName || "No indicado"}`,
    `Dirección o referencia: ${address || "No indicada"}`,
    `Fecha: ${formatMeetingDateForShare(date)}`,
    `Hora: ${time || "No indicada"}`,
  ];

  if (notes) {
    lines.push(`Notas: ${notes}`);
  }

  lines.push(
    "",
    "Comparto estos datos por seguridad para que sepas dónde y con quién voy a estar."
  );

  return lines.join("\n");
}

function ProposalConcreteTerms({ proposal }) {
  const message = String(proposal?.proposalMessage || "").trim();
  const extraProduct = String(proposal?.extraProduct || "").trim();
  const hasExtraMoney = Boolean(proposal?.extraMoneyEnabled) && Number(proposal?.extraMoneyAmount || 0) > 0;

  if (!message && !extraProduct && !hasExtraMoney) return null;

  return (
    <section className="proposalConcreteBox">
      <h3>Propuesta concreta</h3>

      <div className="proposalConcreteGrid">
        <article>
          <span>Mensaje</span>
          <p>{message || "Sin mensaje adicional."}</p>
        </article>

        <article>
          <span>Producto adicional</span>
          <p>{extraProduct || "No agregó otro producto."}</p>
        </article>

        <article>
          <span>Dinero adicional</span>
          <strong>{hasExtraMoney ? formatProposalMoney(proposal.extraMoneyAmount) : "No ofreció dinero adicional"}</strong>
        </article>
      </div>
    </section>
  );
}

function Proposals() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, authLoading } = useAuth();

  const directProposalId =
    searchParams.get("proposalId") || "";
  const appliedDirectProposalRef = useRef("");

  const [activeTab, setActiveTab] = useState("received");
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [userChats, setUserChats] = useState([]);
  const [reputations, setReputations] = useState({});
  const [exchangeDetails, setExchangeDetails] = useState({});
  const [loadingInterests, setLoadingInterests] = useState(true);
  const [loadingExchangeDetails, setLoadingExchangeDetails] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState({});
  const [openingChat, setOpeningChat] = useState({});
  const [savingMeeting, setSavingMeeting] = useState({});
  const [ratingProposal, setRatingProposal] = useState({});
  const [deletingProposal, setDeletingProposal] = useState({});
  const [meetingDrafts, setMeetingDrafts] = useState({});
  const [ratingDrafts, setRatingDrafts] = useState({});
  const [proposalAdvertisements, setProposalAdvertisements] = useState([]);

  useEffect(() => {
    if (authLoading) return undefined;

    if (!user) {
      navigate("/login");
      return undefined;
    }

    setLoadingInterests(true);
    setError("");

    const unsubscribeInterests = listenUserInterests(
      user.uid,
      ({ received: receivedItems, sent: sentItems }) => {
        setReceived(receivedItems);
        setSent(sentItems);
        setLoadingInterests(false);
      },
      () => {
        setError("No pudimos cargar tus propuestas.");
        setLoadingInterests(false);
      }
    );

    const unsubscribeChats = listenUserChats(
      user.uid,
      setUserChats,
      () => {
        setError("No pudimos cargar las notificaciones de mensajes.");
      }
    );

    const unsubscribeAdvertisements =
      listenAdvertisementsByPlacement(
        "proposals_sidebar",
        setProposalAdvertisements,
        (advertisingError) => {
          console.error(
            "No pudimos cargar la publicidad de Propuestas.",
            advertisingError
          );
          setProposalAdvertisements([]);
        }
      );

    return () => {
      unsubscribeInterests();
      unsubscribeChats();
      unsubscribeAdvertisements();
    };
  }, [authLoading, user, navigate]);

  useEffect(() => {
    const allProposals = [...received, ...sent];

    setMeetingDrafts((current) => {
      const nextDrafts = { ...current };

      allProposals.forEach((proposal) => {
        if (!nextDrafts[proposal.id]) {
          nextDrafts[proposal.id] = getInitialMeetingDraft(proposal);
        }
      });

      return nextDrafts;
    });

    setRatingDrafts((current) => {
      const nextDrafts = { ...current };

      allProposals.forEach((proposal) => {
        if (!nextDrafts[proposal.id]) {
          nextDrafts[proposal.id] = getInitialRatingDraft();
        }
      });

      return nextDrafts;
    });
  }, [received, sent]);

  const proposalExchangeIds = useMemo(() => {
    const ids = [...received, ...sent].flatMap(getProposalExchangeIds).filter(Boolean);
    return Array.from(new Set(ids));
  }, [received, sent]);

  const proposalExchangeIdsKey = proposalExchangeIds.join("|");

  useEffect(() => {
    if (!proposalExchangeIds.length) {
      setExchangeDetails({});
      return undefined;
    }

    let isMounted = true;
    setLoadingExchangeDetails(true);

    Promise.all(
      proposalExchangeIds.map(async (exchangeId) => {
        try {
          const exchange = await getExchangeSnapshotById(exchangeId);
          return [exchangeId, exchange];
        } catch (error) {
          console.error("No pudimos cargar una publicación vinculada.", error);
          return [exchangeId, null];
        }
      })
    )
      .then((entries) => {
        if (!isMounted) return;

        const nextDetails = entries.reduce((acc, [exchangeId, exchange]) => {
          if (exchange) {
            acc[exchangeId] = exchange;
          }
          return acc;
        }, {});

        setExchangeDetails(nextDetails);
      })
      .finally(() => {
        if (isMounted) {
          setLoadingExchangeDetails(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [proposalExchangeIdsKey]);

  const counterpartyIds = useMemo(() => {
    if (!user?.uid) return [];

    const ids = [...received, ...sent]
      .map((proposal) => getCounterpartyId(proposal, user.uid))
      .filter(Boolean);

    return Array.from(new Set(ids));
  }, [received, sent, user]);

  const counterpartyIdsKey = counterpartyIds.join("|");

  useEffect(() => {
    if (!counterpartyIds.length) {
      setReputations({});
      return undefined;
    }

    return listenUserReputations(
      counterpartyIds,
      setReputations,
      () => {
        setError("No pudimos cargar la reputación de algunos usuarios.");
      }
    );
  }, [counterpartyIdsKey]);

  const allUserProposals = useMemo(() => {
    const uniqueProposals = new Map();

    [...received, ...sent].forEach((proposal) => {
      if (proposal?.id) {
        uniqueProposals.set(proposal.id, proposal);
      }
    });

    return Array.from(uniqueProposals.values());
  }, [received, sent]);

  const activeReceivedProposals = useMemo(() => {
    if (!user?.uid) return [];

    return received.filter((proposal) => {
      return (
        !proposal?.deletedFor?.[user.uid] &&
        !proposal?.ratedBy?.[user.uid] &&
        proposal?.status !== "notCompleted"
      );
    });
  }, [received, user]);

  const activeSentProposals = useMemo(() => {
    if (!user?.uid) return [];

    return sent.filter((proposal) => {
      return (
        !proposal?.deletedFor?.[user.uid] &&
        !proposal?.ratedBy?.[user.uid] &&
        proposal?.status !== "notCompleted"
      );
    });
  }, [sent, user]);

  const finalizedProposals = useMemo(() => {
    if (!user?.uid) return [];

    return allUserProposals
      .filter((proposal) => {
        return (
          proposal?.status === "completed" &&
          Boolean(proposal?.ratedBy?.[user.uid]) &&
          !proposal?.deletedFor?.[user.uid]
        );
      })
      .sort((firstProposal, secondProposal) => {
        const firstDate = Number(
          firstProposal?.completedAt ||
            firstProposal?.updatedAt ||
            firstProposal?.createdAt ||
            0
        );
        const secondDate = Number(
          secondProposal?.completedAt ||
            secondProposal?.updatedAt ||
            secondProposal?.createdAt ||
            0
        );

        return secondDate - firstDate;
      });
  }, [allUserProposals, user]);

  const proposals =
    activeTab === "received"
      ? activeReceivedProposals
      : activeTab === "sent"
        ? activeSentProposals
        : finalizedProposals;

  useEffect(() => {
    if (
      !directProposalId ||
      appliedDirectProposalRef.current === directProposalId
    ) {
      return;
    }

    const isFinalizedProposal = finalizedProposals.some(
      (proposal) => proposal.id === directProposalId
    );
    const isReceivedProposal = activeReceivedProposals.some(
      (proposal) => proposal.id === directProposalId
    );
    const isSentProposal = activeSentProposals.some(
      (proposal) => proposal.id === directProposalId
    );

    if (
      !isFinalizedProposal &&
      !isReceivedProposal &&
      !isSentProposal
    ) {
      return;
    }

    setActiveTab(
      isFinalizedProposal
        ? "completed"
        : isReceivedProposal
          ? "received"
          : "sent"
    );
    appliedDirectProposalRef.current = directProposalId;
  }, [
    activeReceivedProposals,
    activeSentProposals,
    directProposalId,
    finalizedProposals,
  ]);

  useEffect(() => {
    if (!directProposalId || loadingInterests) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      const proposalElement = document.getElementById(
        `proposal-${directProposalId}`
      );

      proposalElement?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 180);

    return () => window.clearTimeout(timerId);
  }, [
    activeTab,
    directProposalId,
    loadingInterests,
    proposals.length,
  ]);

  const stats = useMemo(() => {
    const pendingReceived = received.filter(
      (item) => item.status === "pending"
    ).length;

    const acceptedOrCompleted = allUserProposals.filter((item) => {
      return item.status === "accepted";
    }).length;

    const unreadMessages = userChats.reduce((total, chat) => {
      return total + Number(chat.unreadCount || 0);
    }, 0);

    return [
      {
        label: "Recibidas pendientes",
        value: pendingReceived,
      },
      {
        label: "Operaciones activas",
        value: acceptedOrCompleted,
      },
      {
        label: "Mensajes sin leer",
        value: unreadMessages,
      },
    ];
  }, [allUserProposals, received, userChats]);

  const unreadByChatId = useMemo(() => {
    return userChats.reduce((acc, chat) => {
      acc[chat.id] = Number(chat.unreadCount || 0);
      return acc;
    }, {});
  }, [userChats]);

  const cleanupProposalChat = async (proposal) => {
    try {
      await cleanupChatResources(user, proposal);
      return true;
    } catch (err) {
      console.error("No pudimos eliminar completamente el chat vinculado.", err);
      return false;
    }
  };

  const handleStatusChange = async (interest, status) => {
    setError("");
    setSuccessMessage("");

    setUpdatingStatus((current) => ({
      ...current,
      [interest.id]: status,
    }));

    try {
      if (status === "accepted") {
        const chat = await acceptInterestAndCreateChat(user, interest);
        navigate(`/chat/${chat.id}`);
        return;
      }

      await updateInterestStatus(user, interest, status);

      if (status === "notCompleted") {
        const cleanupOk = await cleanupProposalChat(interest);

        setSuccessMessage(
          cleanupOk
            ? "La propuesta se marcó como no concretada y eliminamos el chat vinculado."
            : "La propuesta se marcó como no concretada, pero no pudimos eliminar completamente el chat vinculado."
        );
      } else {
        setSuccessMessage("Propuesta rechazada.");
      }
    } catch (err) {
      console.error(err);
      setError("No pudimos actualizar la propuesta. Intentá nuevamente.");
    } finally {
      setUpdatingStatus((current) => ({
        ...current,
        [interest.id]: "",
      }));
    }
  };

  const handleMarkNotCompleted = (proposal) => {
    const confirmed = window.confirm(
      "¿Confirmás que esta propuesta no se concretó? Se quitará de tu lista de propuestas activas."
    );

    if (!confirmed) return;

    handleStatusChange(proposal, "notCompleted");
  };

  const handleOpenChat = async (proposal) => {
    setError("");
    setSuccessMessage("");

    setOpeningChat((current) => ({
      ...current,
      [proposal.id]: true,
    }));

    try {
      const chat = await ensureChatForInterest(user, proposal);
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      console.error(err);
      setError("No pudimos abrir el chat.");
    } finally {
      setOpeningChat((current) => ({
        ...current,
        [proposal.id]: false,
      }));
    }
  };

  const updateMeetingDraft = (proposalId, field, value) => {
    setMeetingDrafts((current) => ({
      ...current,
      [proposalId]: {
        ...getInitialMeetingDraft({}),
        ...current[proposalId],
        [field]: value,
      },
    }));
  };

  const updateRatingDraft = (proposalId, field, value) => {
    setRatingDrafts((current) => ({
      ...current,
      [proposalId]: {
        ...getInitialRatingDraft(),
        ...current[proposalId],
        [field]: value,
      },
    }));
  };

  const handleSaveMeetingPoint = async (proposal) => {
    const draft = meetingDrafts[proposal.id] || getInitialMeetingDraft(proposal);

    if (!draft.placeName.trim() && !draft.address.trim()) {
      setError("Indicá al menos un lugar o una dirección para coordinar.");
      return;
    }

    setError("");
    setSuccessMessage("");

    setSavingMeeting((current) => ({
      ...current,
      [proposal.id]: true,
    }));

    try {
      await saveProposalMeetingPoint(user, proposal, draft);
      setSuccessMessage("Punto de entrega actualizado.");
    } catch (err) {
      console.error(err);
      setError("No pudimos guardar el punto de entrega.");
    } finally {
      setSavingMeeting((current) => ({
        ...current,
        [proposal.id]: false,
      }));
    }
  };

  const handleShareMeetingWhatsApp = ({
    meetingDraft,
    counterpartyName,
    ownOfferTitle,
    counterpartyOfferTitle,
  }) => {
    const placeName = String(meetingDraft?.placeName || "").trim();
    const address = String(meetingDraft?.address || "").trim();
    const date = String(meetingDraft?.date || "").trim();
    const time = String(meetingDraft?.time || "").trim();

    if (!placeName && !address) {
      setError(
        "Completá el lugar o la dirección antes de compartir la coordinación."
      );
      return;
    }

    if (!date || !time) {
      setError(
        "Completá la fecha y el horario antes de compartir la coordinación."
      );
      return;
    }

    setError("");
    setSuccessMessage("");

    const message = buildMeetingWhatsAppMessage({
      counterpartyName,
      ownOfferTitle,
      counterpartyOfferTitle,
      meetingDraft,
    });

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
      message
    )}`;

    window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleDeleteFinalizedProposal = async (proposal) => {
    if (!user?.uid || !proposal?.id) return;

    const confirmed = window.confirm(
      "¿Querés eliminar esta propuesta de tu historial de finalizadas? La otra persona conservará su registro y las calificaciones no se modificarán."
    );

    if (!confirmed) return;

    setError("");
    setSuccessMessage("");

    setDeletingProposal((current) => ({
      ...current,
      [proposal.id]: true,
    }));

    try {
      await update(
        databaseRef(database, `interests/${proposal.id}`),
        {
          [`deletedFor/${user.uid}`]: true,
          [`deletedAtFor/${user.uid}`]: Date.now(),
        }
      );

      setSuccessMessage(
        "La propuesta se eliminó de tu historial de finalizadas."
      );
    } catch (err) {
      console.error(err);
      setError(
        "No pudimos eliminar la propuesta de tu historial."
      );
    } finally {
      setDeletingProposal((current) => ({
        ...current,
        [proposal.id]: false,
      }));
    }
  };

  const handleRateProposal = async (proposal) => {
    const draft = ratingDrafts[proposal.id] || getInitialRatingDraft();

    if (!draft.rating) {
      setError("Seleccioná una calificación antes de finalizar.");
      return;
    }

    setError("");
    setSuccessMessage("");

    setRatingProposal((current) => ({
      ...current,
      [proposal.id]: true,
    }));

    try {
      await rateProposalOperation(user, proposal, {
        rating: draft.rating,
        comment: draft.comment,
      });

      const cleanupOk = await cleanupProposalChat(proposal);

      setSuccessMessage(
        cleanupOk
          ? "Operación calificada."
          : "Operación calificada."
      );
    } catch (err) {
      console.error(err);
      setError("No pudimos registrar la calificación.");
    } finally {
      setRatingProposal((current) => ({
        ...current,
        [proposal.id]: false,
      }));
    }
  };

  if (authLoading || loadingInterests) {
    return (
      <main className="dashboardPage">
        <p className="loadingText">Cargando propuestas...</p>
      </main>
    );
  }

  return (
    <main className="dashboardPage proposalsPage">
      <AppNavbar />

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

      <section className="matchesMarketplaceHeader proposalsMarketplaceHeader">
        <div>
          <span className="eyebrow">Intercambios</span>
          <h1>Mis propuestas</h1>
          <p>
            Aceptá propuestas, revisá multimedia, coordiná puntos seguros y calificá
            la operación para construir reputación dentro de TeLoCambio.
          </p>
        </div>

        <Link to="/panel" className="marketplacePublishButton">
          Explorar publicaciones
        </Link>
      </section>

      <section className="matchesQuickStats proposalsQuickStats">
        {stats.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="proposalTabs modernProposalTabs">
        <button
          type="button"
          className={activeTab === "received" ? "tabButton active" : "tabButton"}
          onClick={() => setActiveTab("received")}
        >
          Recibidas ({activeReceivedProposals.length})
        </button>

        <button
          type="button"
          className={activeTab === "sent" ? "tabButton active" : "tabButton"}
          onClick={() => setActiveTab("sent")}
        >
          Enviadas ({activeSentProposals.length})
        </button>

        <button
          type="button"
          className={activeTab === "completed" ? "tabButton active" : "tabButton"}
          onClick={() => setActiveTab("completed")}
        >
          Finalizadas ({finalizedProposals.length})
        </button>
      </section>

      <div
        className={
          proposalAdvertisements.length > 0
            ? "proposalsContentWithAdvertising hasAdvertising"
            : "proposalsContentWithAdvertising"
        }
      >
        <div className="proposalsContentMain">
          {loadingExchangeDetails && (
        <section className="proposalMediaLoadingNotice">
          <LogoMark />
          <span>Cargando archivos de las publicaciones vinculadas...</span>
        </section>
          )}

          {proposals.length === 0 ? (
        <section className="emptyState matchesEmptyState proposalsEmptyState">
          <div>
            <div className="emptyLogoIcon">
              <LogoMark size="large" />
            </div>
            <h2>
              {activeTab === "received"
                ? "No tenés propuestas recibidas pendientes"
                : activeTab === "sent"
                  ? "No tenés propuestas enviadas pendientes"
                  : "No tenés propuestas finalizadas"}
            </h2>
            <p>
              {activeTab === "completed"
                ? "Cuando finalices y califiques un intercambio, quedará disponible en esta sección hasta que decidas eliminarlo de tu historial."
                : "Cuando tengas nuevas propuestas o intercambios activos, aparecerán en esta sección."}
            </p>
            <Link to="/panel" className="primaryLink">
              Explorar publicaciones
            </Link>
          </div>
        </section>
      ) : (
        <section className="modernProposalsGrid">
          {proposals.map((proposal) => {
            const isFinalizedTab = activeTab === "completed";
            const isReceived =
              proposal?.toUserId === user?.uid;
            const canManage =
              !isFinalizedTab &&
              isReceived &&
              proposal.status === "pending";
            const canOpenChat =
              !isFinalizedTab &&
              (proposal.status === "accepted" ||
                proposal.status === "completed");
            const canCoordinate =
              !isFinalizedTab &&
              (proposal.status === "accepted" ||
                proposal.status === "completed");
            const canRate =
              !isFinalizedTab &&
              (proposal.status === "accepted" ||
                proposal.status === "completed");
            const canMarkNotCompleted =
              !isFinalizedTab &&
              proposal.status === "accepted";
            const chatId = proposal.chatId || proposal.id;
            const unreadMessages = unreadByChatId[chatId] || 0;
            const isOpeningChat = Boolean(openingChat[proposal.id]);
            const meetingDraft =
              meetingDrafts[proposal.id] || getInitialMeetingDraft(proposal);
            const ratingDraft =
              ratingDrafts[proposal.id] || getInitialRatingDraft();
            const counterpartyId = getCounterpartyId(proposal, user?.uid);
            const counterpartyName = getCounterpartyName(proposal, user?.uid);
            const counterpartyReputation = reputations[counterpartyId];
            const counterpartyExchangeId = getCounterpartyExchangeId(proposal, user?.uid);
            const ownExchangeId = getOwnExchangeId(proposal, user?.uid);
            const counterpartyExchange = exchangeDetails[counterpartyExchangeId] || null;
            const ownExchange = exchangeDetails[ownExchangeId] || null;
            const counterpartyOfferTitle =
              counterpartyExchange?.offerTitle || getCounterpartyOfferTitle(proposal, user?.uid);
            const counterpartySearchTitle =
              counterpartyExchange?.searchTitle || getCounterpartySearchTitle(proposal, user?.uid);
            const ownOfferTitle = ownExchange?.offerTitle || getOwnOfferTitle(proposal, user?.uid);
            const ownSearchTitle = ownExchange?.searchTitle || getOwnSearchTitle(proposal, user?.uid);
            const counterpartyMediaCount = getMediaCount(counterpartyExchange);

            const isDirectProposal =
              directProposalId === proposal.id;

            return (
              <article
                id={`proposal-${proposal.id}`}
                className="proposalCard modernProposalCard"
                key={proposal.id}
                style={{
                  scrollMarginTop: "110px",
                  ...(isDirectProposal
                    ? {
                        outline: "3px solid #f2b705",
                        outlineOffset: "4px",
                        boxShadow:
                          "0 18px 48px rgba(242, 183, 5, 0.22)",
                      }
                    : {}),
                }}
              >
                <div className="modernProposalMediaWrap">
                  <ProposalMediaCarousel
                    exchange={counterpartyExchange}
                    title={counterpartyOfferTitle}
                  />

                  <span className="proposalScoreFloating">
                    {getCompatibilityScore(proposal)}%
                  </span>
                </div>

                <div className="modernProposalContent">
                  <div className="proposalTop modernProposalTop">
                    <div>
                      <span className="miniLabel">
                        {isReceived ? "Propuesta de" : "Propuesta para"}
                      </span>
                      <h2>{counterpartyName}</h2>
                      <p>
                        {counterpartyExchange
                          ? getExchangeLocationLabel(counterpartyExchange)
                          : "Ubicación no indicada"}
                      </p>
                    </div>

                    <div className="proposalTopBadges">
                      <span className={`proposalStatus ${proposal.status}`}>
                        {statusLabels[proposal.status] || proposal.status}
                      </span>

                      {canOpenChat && (
                        <button
                          type="button"
                          className="primaryButton"
                          disabled={isOpeningChat}
                          onClick={() => handleOpenChat(proposal)}
                          style={{
                            minHeight: "36px",
                            padding: "8px 14px",
                            fontSize: "0.88rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isOpeningChat
                            ? "Abriendo chat..."
                            : unreadMessages > 0
                              ? `Abrir chat (${unreadMessages})`
                              : "Abrir chat"}
                        </button>
                      )}

                      {!isFinalizedTab && unreadMessages > 0 && (
                        <span className="messageUnreadPill">
                          💬 {unreadMessages} nuevo
                          {unreadMessages > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="proposalTrustRow modernProposalTrustRow">
                    <ReputationBadge reputation={counterpartyReputation} />

                    <div className="proposalSafetyHint">
                      <strong>Punto seguro</strong>
                      <span>
                        Coordiná lugares públicos, iluminados y con movimiento.
                      </span>
                    </div>
                  </div>

                  <ProposalConcreteTerms proposal={proposal} />

                  <div className="proposalFullPublicationGrid simplifiedProposalFullGrid">
                    <PublicationInfoPanel
                      title="Publicación de la otra persona"
                      exchange={counterpartyExchange}
                      fallbackOfferTitle={counterpartyOfferTitle}
                      fallbackSearchTitle={counterpartySearchTitle}
                      variant="counterparty"
                    />

                    <PublicationInfoPanel
                      title="Tu publicación vinculada"
                      exchange={ownExchange}
                      fallbackOfferTitle={ownOfferTitle}
                      fallbackSearchTitle={ownSearchTitle}
                      variant="own"
                    />
                  </div>

                  {proposal.reasons?.length > 0 && (
                    <div className="matchReasons modernProposalReasons">
                      {proposal.reasons.slice(0, 3).map((reason) => (
                        <span key={reason}>{reason}</span>
                      ))}
                    </div>
                  )}

                  {isFinalizedTab && (
                    <div className="proposalActions modernProposalActions">
                      <button
                        type="button"
                        className="dangerButton"
                        disabled={Boolean(
                          deletingProposal[proposal.id]
                        )}
                        onClick={() =>
                          handleDeleteFinalizedProposal(proposal)
                        }
                      >
                        {deletingProposal[proposal.id]
                          ? "Eliminando..."
                          : "Eliminar de mi historial"}
                      </button>
                    </div>
                  )}

                  {canManage && (
                    <div className="proposalActions modernProposalActions">
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={Boolean(updatingStatus[proposal.id])}
                        onClick={() => handleStatusChange(proposal, "rejected")}
                      >
                        {updatingStatus[proposal.id] === "rejected"
                          ? "Rechazando..."
                          : "Rechazar"}
                      </button>

                      <button
                        type="button"
                        className="primaryButton"
                        disabled={Boolean(updatingStatus[proposal.id])}
                        onClick={() => handleStatusChange(proposal, "accepted")}
                      >
                        {updatingStatus[proposal.id] === "accepted"
                          ? "Aceptando..."
                          : "Aceptar"}
                      </button>
                    </div>
                  )}

                  {canCoordinate && (
                    <section className="safePointBox modernSafePointBox">
                      <div className="safePointHeader">
                        <div>
                          <span className="miniLabel">Entrega segura</span>
                          <h3>Coordinar punto de encuentro</h3>
                        </div>

                        {proposal.meetingPoint?.updatedAt && (
                          <span className="safePointSaved">Guardado</span>
                        )}
                      </div>

                      <div className="safePointGrid">
                        <label>
                          Lugar seguro
                          <input
                            placeholder="Ej: Shopping, estación de servicio, plaza central"
                            value={meetingDraft.placeName}
                            onChange={(event) =>
                              updateMeetingDraft(
                                proposal.id,
                                "placeName",
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <label>
                          Dirección o referencia
                          <input
                            placeholder="Ej: Av. Rivadavia 1234"
                            value={meetingDraft.address}
                            onChange={(event) =>
                              updateMeetingDraft(
                                proposal.id,
                                "address",
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <label>
                          Fecha tentativa
                          <input
                            type="date"
                            value={meetingDraft.date}
                            onChange={(event) =>
                              updateMeetingDraft(
                                proposal.id,
                                "date",
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <label>
                          Horario
                          <input
                            type="time"
                            value={meetingDraft.time}
                            onChange={(event) =>
                              updateMeetingDraft(
                                proposal.id,
                                "time",
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <label className="safePointNotes">
                          Notas
                          <textarea
                            placeholder="Detalles del punto de encuentro, referencias o condiciones acordadas."
                            value={meetingDraft.notes}
                            onChange={(event) =>
                              updateMeetingDraft(
                                proposal.id,
                                "notes",
                                event.target.value
                              )
                            }
                          />
                        </label>
                      </div>

                      <div className="proposalFormActions">
                        <button
                          type="button"
                          className="secondaryButton"
                          disabled={Boolean(savingMeeting[proposal.id])}
                          onClick={() => handleSaveMeetingPoint(proposal)}
                        >
                          {savingMeeting[proposal.id]
                            ? "Guardando..."
                            : "Guardar punto seguro"}
                        </button>

                        <button
                          type="button"
                          className="primaryButton"
                          disabled={Boolean(savingMeeting[proposal.id])}
                          onClick={() =>
                            handleShareMeetingWhatsApp({
                              meetingDraft,
                              counterpartyName,
                              ownOfferTitle,
                              counterpartyOfferTitle,
                            })
                          }
                        >
                          Compartir por WhatsApp
                        </button>
                      </div>
                    </section>
                  )}

                  {canRate && (
                    <section className="ratingBox modernRatingBox">
                      <div>
                        <span className="miniLabel">Reputación</span>
                        <h3>Calificar operación</h3>
                        <p>
                          Al calificar, la operación se cierra, las publicaciones
                          involucradas dejan de aparecer en Matches y esta propuesta
                          se oculta de tu pantalla.
                        </p>
                      </div>

                      <RatingStarsInput
                        value={ratingDraft.rating}
                        disabled={Boolean(ratingProposal[proposal.id])}
                        onChange={(value) =>
                          updateRatingDraft(proposal.id, "rating", value)
                        }
                      />

                      <label>
                        Comentario opcional
                        <textarea
                          placeholder="Contá cómo fue la coordinación, puntualidad y estado del producto."
                          value={ratingDraft.comment}
                          disabled={Boolean(ratingProposal[proposal.id])}
                          onChange={(event) =>
                            updateRatingDraft(
                              proposal.id,
                              "comment",
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <div className="proposalFormActions">
                        <button
                          type="button"
                          className="primaryButton"
                          disabled={Boolean(ratingProposal[proposal.id])}
                          onClick={() => handleRateProposal(proposal)}
                        >
                          {ratingProposal[proposal.id]
                            ? "Calificando..."
                            : "Finalizar y calificar"}
                        </button>
                      </div>

                      {canMarkNotCompleted && (
                    <div className="proposalActions modernProposalActions proposalNotCompletedActions">
                      <button
                        type="button"
                        className="dangerButton proposalNotCompletedButton"
                        disabled={Boolean(updatingStatus[proposal.id])}
                        onClick={() => handleMarkNotCompleted(proposal)}
                      >
                        {updatingStatus[proposal.id] === "notCompleted"
                          ? "Quitando..."
                          : "No se concretó"}
                      </button>
                    </div>
                  )}
                    </section>
                  )}
                </div>
              </article>
            );
          })}
        </section>
          )}
        </div>

        {proposalAdvertisements.length > 0 && (
          <aside className="proposalsAdvertisingAside">
            <PublicAdvertisement
              advertisements={proposalAdvertisements}
              variant="sidebar"
              className="proposalsSidebarAdvertisement"
            />
          </aside>
        )}
      </div>
    </main>
  );
}

export default Proposals;
