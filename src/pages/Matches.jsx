import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { useAuth } from "../context/AuthContext";
import AppNavbar from "../components/AppNavbar";
import LogoMark from "../components/LogoMark";
import { storage } from "../services/firebase";
import { getServiceImageUrl } from "../utils/serviceMedia";
import { buildMatches } from "../utils/matchUtils";
import { reportPublication } from "../services/reportService";
import {
  listenActiveExchanges,
  listenUserExchanges,
} from "../services/exchangeService";
import ExchangeProposalModal from "../components/ExchangeProposalModal";
import { createExchangeProposal } from "../services/proposalSubmitService";
import {
  listenUserFavorites,
  setPublicationFavorite,
} from "../services/favoriteService";
import PublicAdvertisement from "../components/PublicAdvertisement";
import { listenAdvertisementsByPlacement } from "../services/advertisingPublicService";

const mediaUrlCache = new Map();

const matchMediaFrameStyle = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "#edf3f7",
};

const matchMediaBackdropStyle = {
  position: "absolute",
  inset: "-18px",
  width: "calc(100% + 36px)",
  height: "calc(100% + 36px)",
  objectFit: "cover",
  objectPosition: "center",
  filter: "blur(18px)",
  transform: "scale(1.08)",
  opacity: 0.3,
  pointerEvents: "none",
};

const matchMediaContentStyle = {
  position: "relative",
  zIndex: 1,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center",
  display: "block",
  background: "transparent",
};

const matchFavoriteButtonStyle = {
  position: "absolute",
  top: "14px",
  left: "14px",
  zIndex: 9,
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  border: "1px solid rgba(255, 255, 255, 0.82)",
  display: "grid",
  placeItems: "center",
  padding: 0,
  cursor: "pointer",
  fontSize: "23px",
  lineHeight: 1,
  boxShadow: "0 10px 26px rgba(15, 35, 61, 0.22)",
  backdropFilter: "blur(12px)",
  transition:
    "transform 160ms ease, background 160ms ease, color 160ms ease, opacity 160ms ease",
};

const MATCHES_DISMISSED_KEY = "telocambio_matches_dismissed";

function getDismissedMatchIds(userId) {
  if (!userId) return [];

  try {
    const saved = localStorage.getItem(`${MATCHES_DISMISSED_KEY}_${userId}`);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function saveDismissedMatchIds(userId, ids) {
  if (!userId) return;

  localStorage.setItem(
    `${MATCHES_DISMISSED_KEY}_${userId}`,
    JSON.stringify(ids)
  );
}

function isServiceCategory(category) {
  return category === "Servicios";
}

function getServiceType(exchange, type = "offer") {
  const value =
    type === "search" ? exchange?.searchServiceType : exchange?.offerServiceType;

  return value || "Servicio sin especificar";
}

function getLicenseNumber(exchange) {
  return String(exchange?.offerLicenseNumber || "").trim();
}

function getExchangeSearchSummary(exchange) {
  if (isServiceCategory(exchange?.searchCategory)) {
    return `Servicios · ${getServiceType(exchange, "search")}`;
  }

  return exchange?.searchCategory || "Categoría no indicada";
}

function getExchangeOfferSummary(exchange) {
  if (isServiceCategory(exchange?.offerCategory)) {
    return `Servicios · ${getServiceType(exchange, "offer")}`;
  }

  return [exchange?.offerCategory, exchange?.offerState]
    .filter(Boolean)
    .join(" · ") || "Categoría no indicada";
}

function getReportReasonLabel(value) {
  const labels = {
    inappropriate: "Contenido inapropiado",
    prohibited: "Producto o servicio prohibido",
    falseInfo: "Información falsa o engañosa",
    spam: "Spam o publicación repetida",
    scam: "Posible estafa",
    other: "Otro motivo",
  };

  return labels[value] || labels.other;
}

function ExchangeServiceMeta({ exchange, type = "offer", compact = false }) {
  const category = type === "search" ? exchange?.searchCategory : exchange?.offerCategory;

  if (!isServiceCategory(category)) return null;

  const serviceType = getServiceType(exchange, type);
  const licenseNumber = getLicenseNumber(exchange);
  const isLicensed = Boolean(exchange?.offerIsLicensed);

  return (
    <div className={compact ? "matchServiceMeta compact" : "matchServiceMeta"}>
      <span>{serviceType}</span>

      {type === "offer" && (
        isLicensed ? (
          <span className="licensedServiceBadge">
            Matriculado{licenseNumber ? ` · Matrícula ${licenseNumber}` : ""}
          </span>
        ) : (
          <span className="unlicensedServiceBadge">No matriculado</span>
        )
      )}
    </div>
  );
}

function normalizeStatus(exchange) {
  return exchange?.status || "active";
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
    isServiceCategory(exchange?.offerCategory) &&
    getServiceImageUrl(exchange?.offerServiceType)
  ) {
    return 1;
  }

  return Number(exchange?.offerMediaCount || 0);
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

const imagePreloadCache = new Set();

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

  if (isServiceCategory(exchange?.offerCategory)) {
    const serviceImageUrl = getServiceImageUrl(
      exchange?.offerServiceType
    );

    if (serviceImageUrl) {
      return [
        {
          mediaId: `service-match-${
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
            <span className="miniLabel">Archivo de la publicación</span>
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
              <span>{isVideo ? "▶" : "↔"}</span>
              <p>Cargando archivo...</p>
            </div>
          ) : hasActiveError ? (
            <div className="mediaViewerFallback">
              <span>{isVideo ? "▶" : "↔"}</span>
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

function MatchMediaCarousel({ exchange }) {
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
      <div className="matchMediaPlaceholder">
        <LogoMark />
        <span>Sin multimedia</span>
      </div>
    );
  }

  if (!activeMediaUrl && !hasActiveError) {
    return (
      <div className="matchMediaPlaceholder">
        <LogoMark />
        <span>Cargando archivo...</span>
      </div>
    );
  }

  if (hasActiveError) {
    return (
      <div className="matchMediaPlaceholder">
        <LogoMark />
        <span>No pudimos cargar este archivo.</span>
      </div>
    );
  }

  return (
    <div className="matchMediaCarousel">
      <div
        className={`matchMediaExpandButton ${isVideo ? "isVideo" : "isImage"}`}
        style={matchMediaFrameStyle}
        role={isVideo ? undefined : "button"}
        tabIndex={isVideo ? undefined : 0}
        onClick={isVideo ? undefined : openMediaViewer}
        onKeyDown={(event) => {
          if (!isVideo && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openMediaViewer();
          }
        }}
        aria-label={isVideo ? undefined : "Ampliar imagen del match"}
      >
        {isVideo ? (
          <video
            className="matchMediaPreview matchVideoPreview"
            style={matchMediaContentStyle}
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
          <>
            <img
              className="matchMediaBackdrop"
              src={activeMediaUrl}
              alt=""
              aria-hidden="true"
              decoding="async"
              style={matchMediaBackdropStyle}
            />

            <img
              className="matchMediaPreview"
              src={activeMediaUrl}
              alt={exchange?.offerTitle || "Publicación compatible"}
              loading="eager"
              decoding="async"
              style={matchMediaContentStyle}
              onError={() =>
                setMediaErrors((current) => ({
                  ...current,
                  [activeKey]: true,
                }))
              }
            />
          </>
        )}
      </div>

      {hasMultipleMedia && (
        <>
          <button
            type="button"
            className="matchCarouselButton previous"
            onClick={goToPreviousMedia}
            aria-label="Ver archivo anterior"
          >
            ‹
          </button>

          <button
            type="button"
            className="matchCarouselButton next"
            onClick={goToNextMedia}
            aria-label="Ver archivo siguiente"
          >
            ›
          </button>

          <div className="matchCarouselDots" aria-label="Archivos del match">
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
          title={exchange?.offerTitle}
          onClose={closeMediaViewer}
        />
      )}
    </div>
  );
}


function ReportPublicationModal({
  exchange,
  reason,
  detail,
  error,
  loading,
  onReasonChange,
  onDetailChange,
  onClose,
  onSubmit,
}) {
  if (!exchange) return null;

  return (
    <div className="reportModalOverlay" role="dialog" aria-modal="true">
      <button
        type="button"
        className="reportModalBackdrop"
        aria-label="Cerrar denuncia"
        onClick={onClose}
      />

      <form className="reportModalCard" onSubmit={onSubmit}>
        <div className="reportModalHeader">
          <div>
            <span className="miniLabel">Denunciar publicación</span>
            <h3>{exchange.offerTitle || "Publicación"}</h3>
          </div>

          <button type="button" className="reportModalClose" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="reportModalIntro">
          Contanos qué problema detectaste. Revisaremos esta publicación para
          mantener TeLoCambio seguro para todos.
        </p>

        <label>
          Motivo
          <select
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            disabled={loading}
          >
            <option value="inappropriate">Contenido inapropiado</option>
            <option value="prohibited">Producto o servicio prohibido</option>
            <option value="falseInfo">Información falsa o engañosa</option>
            <option value="spam">Spam o publicación repetida</option>
            <option value="scam">Posible estafa</option>
            <option value="other">Otro motivo</option>
          </select>
        </label>

        <label>
          Detalle de la denuncia
          <textarea
            value={detail}
            onChange={(event) => onDetailChange(event.target.value)}
            placeholder="Ej: matrícula falsa, información engañosa, contenido sospechoso, publicación repetida, etc."
            disabled={loading}
            required
          />
        </label>

        {error && <p className="reportModalError">{error}</p>}

        <div className="reportModalActions">
          <button
            type="button"
            className="secondaryButton"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>

          <button type="submit" className="primaryButton" disabled={loading}>
            {loading ? "Enviando..." : "Enviar denuncia"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MatchDetailModal({
  match,
  onClose,
  onInterest,
  interestState,
  onDismiss,
  onReport,
  reportLoading,
  isFavorite,
  favoriteLoading,
  onToggleFavorite,
}) {
  if (!match) return null;

  return (
    <div className="matchDetailOverlay" role="dialog" aria-modal="true">
      <article className="matchDetailModal enhancedMatchDetailModal">
        <button
          type="button"
          className="matchDetailClose"
          onClick={onClose}
          aria-label="Cerrar detalle"
        >
          ×
        </button>

        <div className="matchDetailHeader">
          <span className="eyebrow">Detalle del match</span>
          <h2>{match.otherExchange.offerTitle}</h2>
          <p>
            {match.otherExchange.userName || "Usuario"} · {getExchangeLocationLabel(match.otherExchange)}
          </p>
        </div>

        <div className="matchDetailScoreBox">
          <strong>{match.score}%</strong>
          <span>compatibilidad estimada</span>
        </div>

        <div className="matchDetailGrid">
          <section>
            <span className="miniLabel">Vos buscás</span>
            <h3>{match.myExchange.searchTitle}</h3>
            <p>{getExchangeSearchSummary(match.myExchange)}</p>
            <ExchangeServiceMeta exchange={match.myExchange} type="search" />
          </section>

          <section>
            <span className="miniLabel">La otra persona ofrece</span>
            <h3>{match.otherExchange.offerTitle}</h3>
            <p>{getExchangeOfferSummary(match.otherExchange)}</p>
            <ExchangeServiceMeta exchange={match.otherExchange} type="offer" />
          </section>

          <section>
            <span className="miniLabel">Vos ofrecés</span>
            <h3>{match.myExchange.offerTitle}</h3>
            <p>{getExchangeOfferSummary(match.myExchange)}</p>
            <ExchangeServiceMeta exchange={match.myExchange} type="offer" />
          </section>

          <section>
            <span className="miniLabel">La otra persona busca</span>
            <h3>{match.otherExchange.searchTitle}</h3>
            <p>{getExchangeSearchSummary(match.otherExchange)}</p>
            <ExchangeServiceMeta exchange={match.otherExchange} type="search" />
          </section>
        </div>

        {match.reasons?.length > 0 && (
          <div className="matchReasons matchDetailReasons">
            {match.reasons.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </div>
        )}

        <div className="matchDetailSecondaryActions">
          <button
            type="button"
            className="secondaryButton"
            disabled={favoriteLoading}
            aria-pressed={isFavorite}
            onClick={() => onToggleFavorite(match.otherExchange)}
          >
            {favoriteLoading
              ? "Guardando..."
              : isFavorite
                ? "♥ Quitar de favoritos"
                : "♡ Guardar en favoritos"}
          </button>

          <button
            type="button"
            className="dangerButton"
            onClick={() => onDismiss(match)}
          >
            No me interesa
          </button>

          <button
            type="button"
            className="reportPublicationButton matchReportInlineButton"
            disabled={reportLoading}
            onClick={() => onReport(match.otherExchange)}
          >
            {reportLoading ? "Enviando denuncia..." : "Denunciar publicación"}
          </button>
        </div>

        <div className="matchDetailActions">
          <button type="button" className="secondaryButton" onClick={onClose}>
            Volver
          </button>

          <button
            type="button"
            className="primaryButton"
            disabled={interestState === "loading" || interestState === "sent"}
            onClick={() => onInterest(match)}
          >
            {interestState === "loading"
              ? "Enviando..."
              : interestState === "sent"
                ? "Propuesta enviada"
                : "Enviar propuesta"}
          </button>
        </div>
      </article>
    </div>
  );
}

function Matches() {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();

  const [myExchanges, setMyExchanges] = useState([]);
  const [allExchanges, setAllExchanges] = useState([]);
  const [loadingMyExchanges, setLoadingMyExchanges] = useState(true);
  const [loadingAllExchanges, setLoadingAllExchanges] = useState(true);
  const [error, setError] = useState("");
  const [interestStatus, setInterestStatus] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [proposalModalMatch, setProposalModalMatch] = useState(null);
  const [proposalError, setProposalError] = useState("");
  const [dismissedMatchIds, setDismissedMatchIds] = useState([]);
  const [reportLoadingId, setReportLoadingId] = useState("");
  const [reportModalExchange, setReportModalExchange] = useState(null);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDetail, setReportDetail] = useState("");
  const [reportError, setReportError] = useState("");
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoriteLoadingId, setFavoriteLoadingId] = useState("");
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [matchesAdvertisements, setMatchesAdvertisements] = useState([]);

  useEffect(() => {
    if (authLoading) return undefined;

    if (!user) {
      navigate("/login");
      return undefined;
    }

    setDismissedMatchIds(getDismissedMatchIds(user.uid));
    setFavoriteIds([]);
    setError("");
    setLoadingMyExchanges(true);
    setLoadingAllExchanges(true);
    setLoadingFavorites(true);

    const unsubscribeMyExchanges = listenUserExchanges(
      user.uid,
      (items) => {
        setMyExchanges(items);
        setLoadingMyExchanges(false);
      },
      () => {
        setError("No pudimos cargar tus publicaciones.");
        setLoadingMyExchanges(false);
      }
    );

    const unsubscribeAllExchanges = listenActiveExchanges(
      (items) => {
        setAllExchanges(items);
        setLoadingAllExchanges(false);
      },
      () => {
        setError("No pudimos cargar las publicaciones activas.");
        setLoadingAllExchanges(false);
      }
    );

    const unsubscribeFavorites = listenUserFavorites(
      user.uid,
      (ids) => {
        setFavoriteIds(ids);
        setLoadingFavorites(false);
      },
      () => {
        setError("No pudimos cargar tus favoritos.");
        setLoadingFavorites(false);
      }
    );

    const unsubscribeAdvertisements =
      listenAdvertisementsByPlacement(
        "matches_feed",
        setMatchesAdvertisements,
        (advertisingError) => {
          console.error(
            "No pudimos cargar la publicidad de Matches.",
            advertisingError
          );
          setMatchesAdvertisements([]);
        }
      );

    return () => {
      unsubscribeMyExchanges();
      unsubscribeAllExchanges();
      unsubscribeFavorites();
      unsubscribeAdvertisements();
    };
  }, [authLoading, user, navigate]);

  const activeMyExchanges = useMemo(() => {
    return myExchanges.filter((exchange) => normalizeStatus(exchange) === "active");
  }, [myExchanges]);

  const availableExchanges = useMemo(() => {
    if (!user) return [];

    return allExchanges.filter(
      (exchange) =>
        exchange.userId !== user.uid && normalizeStatus(exchange) === "active"
    );
  }, [allExchanges, user]);

  const matches = useMemo(() => {
    if (!user) return [];

    return buildMatches(activeMyExchanges, allExchanges, user.uid).filter(
      (match) =>
        normalizeStatus(match.myExchange) === "active" &&
        normalizeStatus(match.otherExchange) === "active" &&
        !dismissedMatchIds.includes(match.id)
    );
  }, [activeMyExchanges, allExchanges, user, dismissedMatchIds]);

  const sortedMatches = useMemo(() => {
    return [...matches].sort((firstMatch, secondMatch) => {
      if (secondMatch.score !== firstMatch.score) {
        return secondMatch.score - firstMatch.score;
      }

      return getMediaCount(secondMatch.otherExchange) - getMediaCount(firstMatch.otherExchange);
    });
  }, [matches]);

  const handleToggleFavorite = async (exchange) => {
    const exchangeId = exchange?.id;

    if (
      !user?.uid ||
      !exchangeId ||
      favoriteLoadingId === exchangeId
    ) {
      return;
    }

    const isFavorite = favoriteIds.includes(exchangeId);

    setError("");
    setFavoriteLoadingId(exchangeId);

    setFavoriteIds((currentIds) =>
      isFavorite
        ? currentIds.filter((id) => id !== exchangeId)
        : Array.from(new Set([...currentIds, exchangeId]))
    );

    try {
      await setPublicationFavorite(user.uid, exchangeId, !isFavorite);
    } catch (err) {
      console.error(err);

      setFavoriteIds((currentIds) =>
        isFavorite
          ? Array.from(new Set([...currentIds, exchangeId]))
          : currentIds.filter((id) => id !== exchangeId)
      );

      setError(
        isFavorite
          ? "No pudimos quitar la publicación de favoritos. Intentá nuevamente."
          : "No pudimos guardar la publicación en favoritos. Intentá nuevamente."
      );
    } finally {
      setFavoriteLoadingId("");
    }
  };

  const handleInterest = (match) => {
    if (!user) {
      navigate("/login");
      return;
    }

    if (!match) return;

    setError("");
    setSuccessMessage("");
    setProposalError("");
    setProposalModalMatch(match);
  };

  const closeProposalModal = () => {
    const modalMatchId = proposalModalMatch?.id;

    if (modalMatchId && interestStatus[modalMatchId] === "loading") return;

    setProposalModalMatch(null);
    setProposalError("");
  };

  const handleSendProposal = async (draft) => {
    if (!user || !proposalModalMatch) return;

    setError("");
    setSuccessMessage("");
    setProposalError("");

    setInterestStatus((current) => ({
      ...current,
      [proposalModalMatch.id]: "loading",
    }));

    try {
      const result = await createExchangeProposal(user, {
        ...draft,
        myExchange: draft.myExchange || proposalModalMatch.myExchange,
        otherExchange: proposalModalMatch.otherExchange,
        score: draft.score ?? proposalModalMatch.score,
        reasons: draft.reasons?.length ? draft.reasons : proposalModalMatch.reasons || [],
        source: "matches_page",
      });

      setInterestStatus((current) => ({
        ...current,
        [proposalModalMatch.id]: "sent",
      }));

      setProposalModalMatch(null);
      setSelectedMatch(null);
      setSuccessMessage(
        result.alreadyExists
          ? "Ya habías enviado una propuesta para este intercambio."
          : "Propuesta enviada. La otra persona podrá aceptarla o rechazarla."
      );
    } catch (err) {
      console.error(err);

      setInterestStatus((current) => ({
        ...current,
        [proposalModalMatch.id]: "error",
      }));

      setProposalError(
        err?.message || "No pudimos enviar la propuesta. Intentá nuevamente."
      );
    }
  };

  const handleDismissMatch = (match) => {
    if (!user?.uid || !match?.id) return;

    const updatedDismissedIds = Array.from(
      new Set([...dismissedMatchIds, match.id])
    );

    setDismissedMatchIds(updatedDismissedIds);
    saveDismissedMatchIds(user.uid, updatedDismissedIds);
    setSelectedMatch(null);
    setSuccessMessage("Ocultamos este match de tus resultados.");
    setError("");
  };

  const openReportModal = (exchange) => {
    setReportModalExchange(exchange);
    setReportReason("inappropriate");
    setReportDetail("");
    setReportError("");
  };

  const closeReportModal = () => {
    if (reportLoadingId) return;

    setReportModalExchange(null);
    setReportReason("inappropriate");
    setReportDetail("");
    setReportError("");
  };

  const handleReportPublication = async (event) => {
    event.preventDefault();

    if (!user || !reportModalExchange?.id) return;

    const cleanDetail = reportDetail.trim();

    if (cleanDetail.length < 8) {
      setReportError("Agregá una breve descripción para que podamos revisar mejor la denuncia.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setReportError("");
    setReportLoadingId(reportModalExchange.id);

    try {
      await reportPublication(user, reportModalExchange, {
        reason: getReportReasonLabel(reportReason),
        reasonCode: reportReason,
        detail: cleanDetail,
        source: "matches_page",
      });

      setSuccessMessage(
        "Gracias por avisarnos. Recibimos la denuncia y vamos a revisar la publicación."
      );
      setReportModalExchange(null);
      setReportReason("inappropriate");
      setReportDetail("");
    } catch (err) {
      console.error(err);
      setReportError("No pudimos enviar la denuncia. Intentá nuevamente.");
    } finally {
      setReportLoadingId("");
    }
  };

  const isLoading =
    authLoading ||
    loadingMyExchanges ||
    loadingAllExchanges ||
    loadingFavorites;

  if (isLoading) {
    return (
      <main className="dashboardPage">
        <p className="loadingText">Buscando coincidencias...</p>
      </main>
    );
  }

  return (
    <main className="dashboardPage matchesPage">
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

      <section className="matchesMarketplaceHeader">
        <div>
          <span className="eyebrow">Coincidencias</span>
          <h1>Matches para vos</h1>
          <p>
            Cruzamos lo que buscás con lo que otros usuarios ofrecen, y lo que
            ofrecés con lo que otros usuarios necesitan.
          </p>
        </div>

        <Link to="/publicar" className="marketplacePublishButton">
          Crear intercambio
        </Link>
      </section>

      <section className="matchesQuickStats">
        <article>
          <span>Tus publicaciones activas</span>
          <strong>{activeMyExchanges.length}</strong>
        </article>

        <article>
          <span>Publicaciones disponibles</span>
          <strong>{availableExchanges.length}</strong>
        </article>

        <article>
          <span>Matches encontrados</span>
          <strong>{sortedMatches.length}</strong>
        </article>
      </section>

      {activeMyExchanges.length === 0 ? (
        <section className="emptyState matchesEmptyState">
          <div>
            <div className="emptyLogoIcon">
              <LogoMark size="large" />
            </div>
            <h2>Primero necesitás crear una publicación</h2>
            <p>
              Para encontrar matches, TeLoCambio necesita saber qué estás
              buscando y qué tenés para ofrecer.
            </p>
            <Link to="/publicar" className="primaryLink">
              Crear publicación
            </Link>
          </div>
        </section>
      ) : sortedMatches.length === 0 ? (
        <section className="emptyState matchesEmptyState">
          <div>
            <div className="emptyLogoIcon">
              <LogoMark size="large" />
            </div>
            <h2>Todavía no encontramos coincidencias</h2>
            <p>
              A medida que más usuarios publiquen productos o servicios, van a
              aparecer oportunidades compatibles con tus búsquedas.
            </p>
            <Link to="/publicar" className="primaryLink">
              Crear otra publicación
            </Link>
          </div>
        </section>
      ) : (
        <section className="modernMatchesGrid">
          {sortedMatches.map((match, index) => {
            const currentInterestState = interestStatus[match.id];
            const otherExchangeId = match.otherExchange?.id;
            const isFavorite = favoriteIds.includes(otherExchangeId);
            const isFavoriteLoading =
              favoriteLoadingId === otherExchangeId;
            const shouldInsertAdvertisement =
              matchesAdvertisements.length > 0 &&
              index ===
                Math.min(2, sortedMatches.length - 1);

            return (
              <Fragment key={match.id}>
                <article className="modernMatchCard">
                <div className="modernMatchMediaWrap">
                  <MatchMediaCarousel exchange={match.otherExchange} />

                  <button
                    type="button"
                    className={`matchFavoriteButton ${
                      isFavorite ? "isFavorite" : ""
                    }`}
                    disabled={isFavoriteLoading}
                    style={{
                      ...matchFavoriteButtonStyle,
                      cursor: isFavoriteLoading ? "wait" : "pointer",
                      opacity: isFavoriteLoading ? 0.72 : 1,
                      background: isFavorite
                        ? "#ff5d76"
                        : "rgba(255, 255, 255, 0.94)",
                      color: isFavorite ? "#ffffff" : "#13243d",
                    }}
                    aria-pressed={isFavorite}
                    aria-label={
                      isFavoriteLoading
                        ? "Guardando favorito"
                        : isFavorite
                          ? "Quitar de favoritos"
                          : "Agregar a favoritos"
                    }
                    title={
                      isFavoriteLoading
                        ? "Guardando..."
                        : isFavorite
                          ? "Quitar de favoritos"
                          : "Agregar a favoritos"
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleFavorite(match.otherExchange);
                    }}
                  >
                    <span aria-hidden="true">
                      {isFavorite ? "♥" : "♡"}
                    </span>
                  </button>

                  <span className="matchScoreFloating">{match.score}%</span>
                </div>

                <div className="modernMatchContent">
                  <div className="modernMatchTopline">
                    <span className="miniLabel">Match con</span>
                    <span>{getExchangeLocationLabel(match.otherExchange)}</span>
                  </div>

                  <h2>{match.otherExchange.userName || "Usuario"}</h2>

                  <div className="matchOfferBox">
                    <span>La otra persona ofrece</span>
                    <strong>{match.otherExchange.offerTitle}</strong>
                    <p>{getExchangeOfferSummary(match.otherExchange)}</p>
                    <ExchangeServiceMeta
                      exchange={match.otherExchange}
                      type="offer"
                      compact
                    />
                  </div>

                  <div className="matchMiniComparison">
                    <div>
                      <span>Vos buscás</span>
                      <strong>{match.myExchange.searchTitle}</strong>
                      <p>{getExchangeSearchSummary(match.myExchange)}</p>
                      <ExchangeServiceMeta exchange={match.myExchange} type="search" compact />
                    </div>

                    <div>
                      <span>La otra persona busca</span>
                      <strong>{match.otherExchange.searchTitle}</strong>
                      <p>{getExchangeSearchSummary(match.otherExchange)}</p>
                      <ExchangeServiceMeta exchange={match.otherExchange} type="search" compact />
                    </div>
                  </div>

                  {match.reasons?.length > 0 && (
                    <div className="matchReasons modernMatchReasons">
                      {match.reasons.slice(0, 3).map((reason) => (
                        <span key={reason}>{reason}</span>
                      ))}
                    </div>
                  )}

                  <div className="modernMatchActions modernMatchActionsExtended">
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => setSelectedMatch(match)}
                    >
                      Ver detalle
                    </button>

                    <button
                      type="button"
                      className="dangerButton"
                      onClick={() => handleDismissMatch(match)}
                    >
                      No me interesa
                    </button>

                    <button
                      type="button"
                      className="primaryButton"
                      disabled={
                        currentInterestState === "loading" ||
                        currentInterestState === "sent"
                      }
                      onClick={() => handleInterest(match)}
                    >
                      {currentInterestState === "loading"
                        ? "Enviando..."
                        : currentInterestState === "sent"
                          ? "Propuesta enviada"
                          : "Enviar propuesta"}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="reportPublicationButton matchCardReportButton"
                    disabled={reportLoadingId === match.otherExchange.id}
                    onClick={() => openReportModal(match.otherExchange)}
                  >
                    {reportLoadingId === match.otherExchange.id
                      ? "Enviando denuncia..."
                      : "Denunciar publicación"}
                  </button>
                </div>
                </article>

                {shouldInsertAdvertisement && (
                  <PublicAdvertisement
                    advertisements={matchesAdvertisements}
                    variant="feed"
                    className="matchesFeedAdvertisement"
                  />
                )}
              </Fragment>
            );
          })}
        </section>
      )}

      <MatchDetailModal
        match={selectedMatch}
        onClose={() => setSelectedMatch(null)}
        onInterest={handleInterest}
        interestState={selectedMatch ? interestStatus[selectedMatch.id] : ""}
        onDismiss={handleDismissMatch}
        onReport={openReportModal}
        reportLoading={
          selectedMatch
            ? reportLoadingId === selectedMatch.otherExchange.id
            : false
        }
        isFavorite={
          selectedMatch
            ? favoriteIds.includes(selectedMatch.otherExchange.id)
            : false
        }
        favoriteLoading={
          selectedMatch
            ? favoriteLoadingId === selectedMatch.otherExchange.id
            : false
        }
        onToggleFavorite={handleToggleFavorite}
      />

      <ExchangeProposalModal
        targetExchange={proposalModalMatch?.otherExchange || null}
        myExchanges={activeMyExchanges}
        defaultMatch={proposalModalMatch}
        userId={user?.uid}
        loading={proposalModalMatch ? interestStatus[proposalModalMatch.id] === "loading" : false}
        error={proposalError}
        onClose={closeProposalModal}
        onSubmit={handleSendProposal}
      />

      <ReportPublicationModal
        exchange={reportModalExchange}
        reason={reportReason}
        detail={reportDetail}
        error={reportError}
        loading={Boolean(reportLoadingId)}
        onReasonChange={setReportReason}
        onDetailChange={setReportDetail}
        onClose={closeReportModal}
        onSubmit={handleReportPublication}
      />
    </main>
  );
}

export default Matches;
