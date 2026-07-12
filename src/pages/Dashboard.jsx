import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import AppNavbar from "../components/AppNavbar";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { storage } from "../services/firebase";
import { getServiceImageUrl } from "../utils/serviceMedia";
import {
  deleteExchange,
  listenActiveExchanges,
  listenUserExchanges,
} from "../services/exchangeService";
import { listenUserProfile, saveUserProfile } from "../services/userProfileService";
import { reportPublication } from "../services/reportService";
import {
  calculateDistanceKm,
  getExchangePoint,
  getUserProfilePoint,
} from "../utils/geoDistance";
import LogoMark from "../components/LogoMark";
import ExchangeProposalModal from "../components/ExchangeProposalModal";
import { createExchangeProposal } from "../services/proposalSubmitService";
import {
  listenUserFavorites,
  setPublicationFavorite,
} from "../services/favoriteService";
import { listenPanelAdvertisements } from "../services/advertisingPublicService";

const DISCOVERY_DISMISSED_KEY = "telocambio_discovery_dismissed";

const CATEGORIES = [
  "Tecnología",
  "Hogar y muebles",
  "Electrodomésticos",
  "Herramientas",
  "Construcción",
  "Deportes y fitness",
  "Accesorios para vehículos",
  "Mascotas",
  "Moda",
  "Juegos y juguetes",
  "Bebés",
  "Belleza y cuidado personal",
  "Servicios",
];

const OFFER_STATES = [
  "Excelente",
  "Muy bueno",
  "Bueno",
  "Funcional con detalles",
];

const SERVICE_TYPES = [
  "Gasista",
  "Electricista",
  "Plomero",
  "Cerrajero",
  "Pintor",
  "Albañil",
  "Mecánico",
  "Otro",
];

const LICENSE_FILTERS = [
  { label: "Todos", value: "all" },
  { label: "Solo matriculados", value: "licensed" },
  { label: "Sin matrícula", value: "notLicensed" },
];

const DISTANCE_FILTERS = [
  { label: "Según mi perfil", value: "profile" },
  { label: "10 km", value: "10" },
  { label: "25 km", value: "25" },
  { label: "50 km", value: "50" },
  { label: "75 km", value: "75" },
  { label: "100 km", value: "100" },
  { label: "150 km", value: "150" },
  { label: "250 km", value: "250" },
  { label: "Todo el país", value: "national" },
];

const INITIAL_FILTERS = {
  query: "",
  category: "all",
  serviceType: "all",
  licensed: "all",
  offerState: "all",
  radius: "profile",
  sort: "recommended",
};

function getDismissedIds(userId) {
  if (!userId) return [];

  try {
    const saved = localStorage.getItem(`${DISCOVERY_DISMISSED_KEY}_${userId}`);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function saveDismissedIds(userId, ids) {
  if (!userId) return;

  localStorage.setItem(
    `${DISCOVERY_DISMISSED_KEY}_${userId}`,
    JSON.stringify(ids)
  );
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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

function hasExchangeMedia(exchange) {
  return getMediaCount(exchange) > 0;
}

function getProfile(profileData) {
  return profileData?.profile || null;
}

function getProfilePreferences(profileData) {
  const profile = getProfile(profileData);

  return {
    searchRadiusKm: Number(profile?.preferences?.searchRadiusKm || 50),
    showNationalResults: Boolean(profile?.preferences?.showNationalResults),
    onlyWithMedia: Boolean(profile?.preferences?.onlyWithMedia),
  };
}

function hasProfileLocation(profileData) {
  const profile = getProfile(profileData);
  const point = getUserProfilePoint(profile);
  return Boolean(point);
}

function getExchangeDistanceKm(exchange, profileData) {
  const profile = getProfile(profileData);
  const userPoint = getUserProfilePoint(profile);
  const exchangePoint = getExchangePoint(exchange);

  if (!userPoint || !exchangePoint) return null;

  return calculateDistanceKm(userPoint, exchangePoint);
}

function shouldShowByDistance(exchange, profileData) {
  const preferences = getProfilePreferences(profileData);

  if (preferences.showNationalResults) return true;
  if (!hasProfileLocation(profileData)) return true;

  const distanceKm = getExchangeDistanceKm(exchange, profileData);

  if (distanceKm === null) {
    return false;
  }

  return distanceKm <= preferences.searchRadiusKm;
}

function shouldShowByPanelRadius(exchange, profileData, selectedRadius) {
  if (selectedRadius === "national") return true;

  if (selectedRadius === "profile") {
    return shouldShowByDistance(exchange, profileData);
  }

  if (!hasProfileLocation(profileData)) {
    return true;
  }

  const radiusKm = Number(selectedRadius);
  const distanceKm = getExchangeDistanceKm(exchange, profileData);

  if (!Number.isFinite(radiusKm) || distanceKm === null) {
    return false;
  }

  return distanceKm <= radiusKm;
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

function getCreatedAtValue(exchange) {
  const createdAt = exchange?.createdAt;

  if (typeof createdAt === "number") return createdAt;
  if (typeof createdAt === "string") return Number(createdAt) || 0;

  return 0;
}

function getDistanceBadgeText(exchange, profileData) {
  const preferences = getProfilePreferences(profileData);

  if (preferences.showNationalResults) {
    return "Todo el país";
  }

  if (!hasProfileLocation(profileData)) {
    return "Sin radio configurado";
  }

  const distanceKm = getExchangeDistanceKm(exchange, profileData);

  if (distanceKm === null) {
    return "Sin distancia";
  }

  return `A ${distanceKm} km`;
}

function getPanelDistanceBadgeText(exchange, profileData, selectedRadius) {
  if (selectedRadius === "national") {
    return "Todo el país";
  }

  if (!hasProfileLocation(profileData)) {
    return "Sin radio configurado";
  }

  const distanceKm = getExchangeDistanceKm(exchange, profileData);

  if (distanceKm === null) {
    return "Sin distancia";
  }

  return `A ${distanceKm} km`;
}

function getRadiusFilterLabel(selectedRadius, profilePreferences) {
  if (selectedRadius === "national") return "Todo el país";

  if (selectedRadius === "profile") {
    return profilePreferences.showNationalResults
      ? "Perfil: todo el país"
      : `Perfil: ${profilePreferences.searchRadiusKm} km`;
  }

  return `${selectedRadius} km`;
}

function exchangeMatchesSearch(exchange, normalizedQuery) {
  if (!normalizedQuery) return true;

  const searchableText = normalizeText(
    [
      exchange.offerTitle,
      exchange.offerDescription,
      exchange.offerCategory,
      exchange.offerServiceType,
      exchange.offerLicenseNumber,
      exchange.offerState,
      exchange.searchTitle,
      exchange.searchDetails,
      exchange.searchCategory,
      exchange.searchServiceType,
      exchange.userName,
      getExchangeLocationLabel(exchange),
    ].join(" ")
  );

  return searchableText.includes(normalizedQuery);
}

function isServiceExchange(exchange) {
  return exchange?.offerCategory === "Servicios";
}

function hasLicensedCredential(exchange) {
  return Boolean(exchange?.offerIsLicensed && String(exchange?.offerLicenseNumber || "").trim());
}

function getServiceTypeLabel(value) {
  return value || "Servicio no indicado";
}

function getOfferMetaSummary(exchange) {
  if (isServiceExchange(exchange)) {
    const serviceType = getServiceTypeLabel(exchange?.offerServiceType);
    const licenseText = hasLicensedCredential(exchange)
      ? `Matriculado · Matrícula ${exchange.offerLicenseNumber}`
      : "Sin matrícula informada";

    return `${serviceType} · ${licenseText}`;
  }

  return `${exchange?.offerCategory || "Categoría"} · ${exchange?.offerState || "Estado no indicado"}`;
}

function getSearchMetaSummary(exchange) {
  if (exchange?.searchCategory === "Servicios") {
    return `Servicios · ${getServiceTypeLabel(exchange?.searchServiceType)}`;
  }

  return exchange?.searchCategory || "Categoría no indicada";
}


function isVideoMedia(media) {
  return media?.type === "video" || media?.contentType?.startsWith("video/");
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

const mediaUrlCache = new Map();
const imagePreloadCache = new Set();

const mediaFrameStyle = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "#edf3f7",
};

const mediaBackdropStyle = {
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

const mediaContentStyle = {
  position: "relative",
  zIndex: 1,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center",
  display: "block",
};

const favoriteButtonStyle = {
  position: "absolute",
  top: "16px",
  right: "16px",
  zIndex: 8,
  width: "46px",
  height: "46px",
  borderRadius: "50%",
  border: "1px solid rgba(255, 255, 255, 0.8)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  fontSize: "24px",
  lineHeight: 1,
  boxShadow: "0 8px 22px rgba(15, 35, 61, 0.2)",
  transition: "transform 160ms ease, background 160ms ease, color 160ms ease",
};

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

  if (isServiceExchange(exchange)) {
    const serviceImageUrl = getServiceImageUrl(
      exchange?.offerServiceType
    );

    if (serviceImageUrl) {
      return [
        {
          mediaId: `service-panel-${
            exchange?.offerServiceType || "otro"
          }`,
          type: "image",
          status: "ready",
          url: serviceImageUrl,
          downloadUrl: serviceImageUrl,
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
            <span className="miniLabel">Imágenes de la publicación</span>
            <strong>{title || activeMedia.name || "Publicación"}</strong>
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
          Contanos qué problema detectaste. Revisaremos la publicación para
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
            placeholder="Ej: la publicación contiene contenido ofensivo, información falsa, producto no permitido, spam, etc."
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

function ExchangeMediaPreview({ exchange, className = "" }) {
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
    if (!activeMedia || !activeMediaUrl || hasActiveError) return;
    setExpandedMediaIndex(activeIndex);
  };

  const closeMediaViewer = () => {
    setExpandedMediaIndex(null);
  };

  if (!activeMedia) {
    return (
      <div className={`exchangeMediaPlaceholder exchangeVideoFallback ${className}`}>
        <span>↔</span>
      </div>
    );
  }

  if (!activeMediaUrl && !hasActiveError) {
    return (
      <div className={`exchangeMediaPlaceholder exchangeMediaLoading ${className}`}>
        <span>Cargando archivo...</span>
      </div>
    );
  }

  if (hasActiveError) {
    return (
      <div className={`exchangeMediaPlaceholder exchangeVideoFallback ${className}`}>
        <span>{isVideo ? "▶" : "↔"}</span>
        <small>No pudimos cargar este archivo.</small>
      </div>
    );
  }

  return (
    <div className={`exchangeMediaCarousel ${className}`}>
      <div
        className={`exchangeMediaExpandButton ${isVideo ? "isVideo" : "isImage"}`}
        style={mediaFrameStyle}
        role={isVideo ? undefined : "button"}
        tabIndex={isVideo ? undefined : 0}
        onClick={isVideo ? undefined : openMediaViewer}
        onKeyDown={(event) => {
          if (!isVideo && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openMediaViewer();
          }
        }}
        aria-label={isVideo ? undefined : "Ampliar imagen de la publicación"}
      >
        {isVideo ? (
          <video
            className="exchangeMediaPreview exchangeVideoPreview"
            style={mediaContentStyle}
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
              className="exchangeMediaBackdrop"
              src={activeMediaUrl}
              alt=""
              aria-hidden="true"
              decoding="async"
              style={mediaBackdropStyle}
            />

            <img
              className="exchangeMediaPreview"
              src={activeMediaUrl}
              alt={exchange.offerTitle || "Publicación"}
              loading="eager"
              decoding="async"
              style={mediaContentStyle}
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
            className="mediaCarouselButton previous"
            onClick={goToPreviousMedia}
            aria-label="Ver archivo anterior"
          >
            ‹
          </button>

          <button
            type="button"
            className="mediaCarouselButton next"
            onClick={goToNextMedia}
            aria-label="Ver archivo siguiente"
          >
            ›
          </button>

          <div className="mediaCarouselDots" aria-label="Archivos de la publicación">
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
          title={exchange.offerTitle}
          onClose={closeMediaViewer}
        />
      )}
    </div>
  );
}

function normalizeAdvertisementPlacementValue(
  placement
) {
  if (placement === "home_top") {
    return "panel_top";
  }

  if (placement === "home_middle") {
    return "panel_middle";
  }

  return String(placement || "").trim();
}

function getAdvertisementPlacements(
  advertisement
) {
  const rawPlacements = Array.isArray(
    advertisement?.placements
  )
    ? advertisement.placements
    : advertisement?.placements &&
        typeof advertisement.placements ===
          "object"
      ? Object.values(advertisement.placements)
      : advertisement?.placement
        ? [advertisement.placement]
        : [];

  return [
    ...new Set(
      rawPlacements
        .map(
          normalizeAdvertisementPlacementValue
        )
        .filter(Boolean)
    ),
  ];
}

function advertisementHasPlacement(
  advertisement,
  placement
) {
  return getAdvertisementPlacements(
    advertisement
  ).includes(placement);
}

function getAdvertisementAssetUrl(
  advertisement,
  slot,
  fallbackSlots = []
) {
  const slots = [slot, ...fallbackSlots];

  for (const currentSlot of slots) {
    const asset = advertisement?.assets?.[currentSlot];
    const url = asset?.url || asset?.downloadUrl || "";

    if (url) return url;
  }

  return "";
}

function DashboardAdvertisementSlot({
  advertisements = [],
  variant = "banner",
  className = "",
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const availableAdvertisements = advertisements.filter(Boolean);

  useEffect(() => {
    if (activeIndex >= availableAdvertisements.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, availableAdvertisements.length]);

  useEffect(() => {
    if (availableAdvertisements.length <= 1) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((current) =>
        current >= availableAdvertisements.length - 1
          ? 0
          : current + 1
      );
    }, 8000);

    return () => window.clearInterval(intervalId);
  }, [availableAdvertisements.length]);

  if (!availableAdvertisements.length) {
    return null;
  }

  const advertisement =
    availableAdvertisements[activeIndex] ||
    availableAdvertisements[0];

  const isFeedAdvertisement = variant === "feed";

  const desktopUrl = isFeedAdvertisement
    ? getAdvertisementAssetUrl(
        advertisement,
        "square",
        ["desktop", "mobile"]
      )
    : getAdvertisementAssetUrl(
        advertisement,
        "desktop",
        ["square", "mobile"]
      );

  const mobileUrl = isFeedAdvertisement
    ? getAdvertisementAssetUrl(
        advertisement,
        "square",
        ["mobile", "desktop"]
      )
    : getAdvertisementAssetUrl(
        advertisement,
        "mobile",
        ["square", "desktop"]
      );

  const destinationUrl =
    advertisement?.destinationUrl || "";

  const campaignName =
    advertisement?.campaignName ||
    advertisement?.companyName ||
    "Publicidad";

  const advertisementContent = (
    <article
      className={`dashboardAdvertisingSlot ${variant} ${className}`.trim()}
    >
      <div className="dashboardAdvertisingMedia">
        <picture>
          {mobileUrl && (
            <source
              media="(max-width: 720px)"
              srcSet={mobileUrl}
            />
          )}

          <img
            src={desktopUrl || mobileUrl}
            alt={campaignName}
            loading="lazy"
            decoding="async"
          />
        </picture>

        <span className="dashboardAdvertisingLabel">
          Publicidad
        </span>

        {availableAdvertisements.length > 1 && (
          <div
            className="dashboardAdvertisingDots"
            aria-label="Publicidades disponibles"
          >
            {availableAdvertisements.map((item, index) => (
              <button
                type="button"
                key={item.id || index}
                className={index === activeIndex ? "active" : ""}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveIndex(index);
                }}
                aria-label={`Ver publicidad ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );

  if (!destinationUrl) {
    return advertisementContent;
  }

  return (
    <a
      className="dashboardAdvertisingLink"
      href={destinationUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label={`Abrir publicidad de ${campaignName}`}
    >
      {advertisementContent}
    </a>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();

  const [exchanges, setExchanges] = useState([]);
  const [allExchanges, setAllExchanges] = useState([]);
  const [userProfileData, setUserProfileData] = useState(null);
  const [dismissedIds, setDismissedIds] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoriteLoadingId, setFavoriteLoadingId] = useState("");
  const [panelAdvertisements, setPanelAdvertisements] = useState([]);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState("");
  const [loadingExchanges, setLoadingExchanges] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [interestLoading, setInterestLoading] = useState(false);
  const [proposalModalExchange, setProposalModalExchange] = useState(null);
  const [proposalError, setProposalError] = useState("");
  const [deletingExchangeId, setDeletingExchangeId] = useState("");
  const [reportLoadingId, setReportLoadingId] = useState("");
  const [reportModalExchange, setReportModalExchange] = useState(null);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDetail, setReportDetail] = useState("");
  const [reportError, setReportError] = useState("");
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [savingRadius, setSavingRadius] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (authLoading) return undefined;

    if (!user) {
      navigate("/login");
      return undefined;
    }

    setDismissedIds(getDismissedIds(user.uid));
    setFavoriteIds([]);
    setLoadingExchanges(true);
    setLoadingSuggestions(true);
    setLoadingProfile(true);
    setLoadingFavorites(true);
    setError("");

    const unsubscribeUserExchanges = listenUserExchanges(
      user.uid,
      (items) => {
        setExchanges(items);
        setLoadingExchanges(false);
      },
      () => {
        setError("No pudimos cargar tus publicaciones.");
        setLoadingExchanges(false);
      }
    );

    const unsubscribeActiveExchanges = listenActiveExchanges(
      (items) => {
        setAllExchanges(items);
        setLoadingSuggestions(false);
      },
      () => {
        setError("No pudimos cargar publicaciones sugeridas.");
        setLoadingSuggestions(false);
      }
    );

    const unsubscribeProfile = listenUserProfile(
      user.uid,
      (profileData) => {
        setUserProfileData(profileData);
        setLoadingProfile(false);
      },
      () => {
        setError("No pudimos cargar tus preferencias de ubicación.");
        setLoadingProfile(false);
      }
    );

    const unsubscribeFavorites = listenUserFavorites(
      user.uid,
      (ids) => {
        setFavoriteIds(ids);
        setLoadingFavorites(false);
      },
      () => {
        setError("No pudimos cargar tus publicaciones favoritas.");
        setLoadingFavorites(false);
      }
    );

    const unsubscribeAdvertisements = listenPanelAdvertisements(
      (items) => {
        setPanelAdvertisements(items);
      },
      (advertisingError) => {
        console.error(
          "No pudimos cargar las publicidades del panel.",
          advertisingError
        );
        setPanelAdvertisements([]);
      }
    );

    return () => {
      unsubscribeUserExchanges();
      unsubscribeActiveExchanges();
      unsubscribeProfile();
      unsubscribeFavorites();
      unsubscribeAdvertisements();
    };
  }, [authLoading, user, navigate]);

  const profile = getProfile(userProfileData);
  const profilePreferences = getProfilePreferences(userProfileData);
  const profileHasLocation = hasProfileLocation(userProfileData);
  const activeRadiusLabel = getRadiusFilterLabel(filters.radius, profilePreferences);
  const isUsingDistanceFilter =
    profileHasLocation &&
    filters.radius !== "national" &&
    !(filters.radius === "profile" && profilePreferences.showNationalResults);

  const visibleExchanges = useMemo(() => {
    return exchanges.filter((exchange) => exchange.status !== "deleted");
  }, [exchanges]);

  const activeUserExchanges = useMemo(() => {
    return visibleExchanges.filter((exchange) => exchange.status === "active");
  }, [visibleExchanges]);

  const panelTopAdvertisements = useMemo(() => {
    return panelAdvertisements.filter(
      (advertisement) =>
        advertisementHasPlacement(
          advertisement,
          "panel_top"
        )
    );
  }, [panelAdvertisements]);

  const panelMiddleAdvertisements = useMemo(() => {
    return panelAdvertisements.filter(
      (advertisement) =>
        advertisementHasPlacement(
          advertisement,
          "panel_middle"
        )
    );
  }, [panelAdvertisements]);

  const panelFeedAdvertisements = useMemo(() => {
    return panelAdvertisements.filter(
      (advertisement) =>
        advertisementHasPlacement(
          advertisement,
          "panel_feed"
        )
    );
  }, [panelAdvertisements]);

  const discoverySuggestions = useMemo(() => {
    if (!user?.uid) return [];

    const normalizedQuery = normalizeText(filters.query);

    return allExchanges
      .filter((exchange) => {
        const isMine = exchange.userId === user.uid;
        const isActive = exchange.status === "active";
        const wasDismissed = dismissedIds.includes(exchange.id);
        const matchesSearch = exchangeMatchesSearch(exchange, normalizedQuery);
        const matchesCategory =
          filters.category === "all" || exchange.offerCategory === filters.category;
        const matchesState =
          filters.offerState === "all" || exchange.offerState === filters.offerState;
        const matchesServiceType =
          filters.category !== "Servicios" ||
          filters.serviceType === "all" ||
          exchange.offerServiceType === filters.serviceType;
        const matchesLicensed =
          filters.category !== "Servicios" ||
          filters.licensed === "all" ||
          (filters.licensed === "licensed" && hasLicensedCredential(exchange)) ||
          (filters.licensed === "notLicensed" && !hasLicensedCredential(exchange));
        const isInsideDistance = shouldShowByPanelRadius(
          exchange,
          userProfileData,
          filters.radius
        );

        return (
          !isMine &&
          isActive &&
          !wasDismissed &&
          matchesSearch &&
          matchesCategory &&
          matchesState &&
          matchesServiceType &&
          matchesLicensed &&
          isInsideDistance
        );
      })
      .sort((firstExchange, secondExchange) => {
        const firstHasMedia = hasExchangeMedia(firstExchange) ? 1 : 0;
        const secondHasMedia = hasExchangeMedia(secondExchange) ? 1 : 0;
        const firstDistance = getExchangeDistanceKm(firstExchange, userProfileData);
        const secondDistance = getExchangeDistanceKm(secondExchange, userProfileData);

        if (filters.sort === "newest") {
          return getCreatedAtValue(secondExchange) - getCreatedAtValue(firstExchange);
        }


        if (filters.sort === "distance") {
          if (firstDistance !== null && secondDistance !== null) {
            return firstDistance - secondDistance;
          }

          if (firstDistance !== null) return -1;
          if (secondDistance !== null) return 1;
        }

        if (profilePreferences.onlyWithMedia && firstHasMedia !== secondHasMedia) {
          return secondHasMedia - firstHasMedia;
        }

        if (firstDistance !== null && secondDistance !== null) {
          return firstDistance - secondDistance;
        }

        if (firstDistance !== null) return -1;
        if (secondDistance !== null) return 1;

        if (firstHasMedia !== secondHasMedia) {
          return secondHasMedia - firstHasMedia;
        }

        return getCreatedAtValue(secondExchange) - getCreatedAtValue(firstExchange);
      });
  }, [
    allExchanges,
    dismissedIds,
    filters,
    user,
    userProfileData,
    profilePreferences.onlyWithMedia,
  ]);

  const currentSuggestion = discoverySuggestions[currentSuggestionIndex] || null;

  const hasCustomFilters = useMemo(() => {
    return (
      normalizeText(filters.query) !== "" ||
      filters.category !== INITIAL_FILTERS.category ||
      filters.serviceType !== INITIAL_FILTERS.serviceType ||
      filters.licensed !== INITIAL_FILTERS.licensed ||
      filters.offerState !== INITIAL_FILTERS.offerState ||
      filters.radius !== INITIAL_FILTERS.radius ||
      filters.sort !== INITIAL_FILTERS.sort
    );
  }, [filters]);

  const discoveryScopeText = useMemo(() => {
    if (filters.radius === "national") {
      return "Mostrando publicaciones activas de todo el país.";
    }

    if (filters.radius !== "profile") {
      if (!profileHasLocation) {
        return "Configurá tu ubicación para aplicar filtros de distancia reales.";
      }

      const locality = profile?.location?.localityName || "tu localidad";
      const province = profile?.location?.provinceName;
      const locationText = province ? `${locality}, ${province}` : locality;

      return `Mostrando publicaciones dentro de ${filters.radius} km de ${locationText}.`;
    }

    if (profilePreferences.showNationalResults) {
      return "Mostrando publicaciones activas de todo el país según tu perfil.";
    }

    if (!profileHasLocation) {
      return "Configurá tu ubicación para filtrar sugerencias por distancia.";
    }

    const locality = profile?.location?.localityName || "tu localidad";
    const province = profile?.location?.provinceName;
    const locationText = province ? `${locality}, ${province}` : locality;

    return `Mostrando publicaciones dentro de ${profilePreferences.searchRadiusKm} km de ${locationText}.`;
  }, [filters.radius, profile, profileHasLocation, profilePreferences]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const cleanQuery = filters.query.trim();

    if (cleanQuery) {
      chips.push({ field: "query", label: `Búsqueda: ${cleanQuery}` });
    }

    if (filters.category !== INITIAL_FILTERS.category) {
      chips.push({ field: "category", label: `Categoría: ${filters.category}` });
    }

    if (filters.category === "Servicios" && filters.serviceType !== "all") {
      chips.push({ field: "serviceType", label: `Servicio: ${filters.serviceType}` });
    }

    if (filters.category === "Servicios" && filters.licensed !== "all") {
      const label = LICENSE_FILTERS.find((option) => option.value === filters.licensed)?.label || "Matrícula";
      chips.push({ field: "licensed", label: `Matrícula: ${label}` });
    }

    if (filters.category !== "Servicios" && filters.offerState !== INITIAL_FILTERS.offerState) {
      chips.push({ field: "offerState", label: `Estado: ${filters.offerState}` });
    }

    if (filters.radius !== INITIAL_FILTERS.radius) {
      chips.push({ field: "radius", label: `Radio: ${activeRadiusLabel}` });
    }

    if (filters.sort !== INITIAL_FILTERS.sort) {
      const sortLabels = {
        distance: "Más cercanos",
        newest: "Más recientes",
        recommended: "Recomendados",
      };

      chips.push({ field: "sort", label: `Orden: ${sortLabels[filters.sort] || filters.sort}` });
    }

    return chips;
  }, [activeRadiusLabel, filters]);

  useEffect(() => {
    if (currentSuggestionIndex >= discoverySuggestions.length) {
      setCurrentSuggestionIndex(0);
    }
  }, [currentSuggestionIndex, discoverySuggestions.length]);

  useEffect(() => {
    setCurrentSuggestionIndex(0);
  }, [filters]);

  const updateFilter = (field, value) => {
    setFilters((current) => {
      const nextFilters = {
        ...current,
        [field]: value,
      };

      if (field === "category") {
        if (value === "Servicios") {
          nextFilters.offerState = "all";
        } else {
          nextFilters.serviceType = "all";
          nextFilters.licensed = "all";
        }
      }

      return nextFilters;
    });
  };

  const clearFilter = (field) => {
    if (field === "radius") {
      setFilters((current) => ({
        ...current,
        radius: INITIAL_FILTERS.radius,
      }));
      return;
    }

    if (field === "category") {
      setFilters((current) => ({
        ...current,
        category: INITIAL_FILTERS.category,
        serviceType: INITIAL_FILTERS.serviceType,
        licensed: INITIAL_FILTERS.licensed,
        offerState: INITIAL_FILTERS.offerState,
      }));
      return;
    }

    setFilters((current) => ({
      ...current,
      [field]: INITIAL_FILTERS[field],
    }));
  };

  const handleRadiusFilterChange = async (value) => {
    updateFilter("radius", value);

    if (!user || value === "profile") return;

    const numericRadius = Number(value);
    const nextPreferences = {
      ...profilePreferences,
      showNationalResults: value === "national",
      searchRadiusKm:
        value === "national" || !Number.isFinite(numericRadius)
          ? profilePreferences.searchRadiusKm
          : numericRadius,
    };

    const nextProfile = {
      personal: profile?.personal || {
        name: user.displayName || user.email || "",
        phone: "",
      },
      location: profile?.location || null,
      preferences: nextPreferences,
    };

    setSavingRadius(true);
    setError("");

    try {
      await saveUserProfile(user, nextProfile);
    } catch (err) {
      console.error(err);
      setError("No pudimos actualizar el radio de búsqueda. Intentá nuevamente.");
    } finally {
      setSavingRadius(false);
    }
  };

  const clearFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const dismissSuggestion = (exchangeId, direction) => {
    if (!user?.uid || !exchangeId || swipeDirection) return;

    setSwipeDirection(direction);

    window.setTimeout(() => {
      const updatedDismissedIds = Array.from(
        new Set([...dismissedIds, exchangeId])
      );

      setDismissedIds(updatedDismissedIds);
      saveDismissedIds(user.uid, updatedDismissedIds);
      setSwipeDirection("");
      setCurrentSuggestionIndex(0);
    }, 260);
  };

  const handleToggleFavorite = async (exchangeId) => {
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

    try {
      await setPublicationFavorite(user.uid, exchangeId, !isFavorite);
    } catch (err) {
      console.error(err);
      setError(
        isFavorite
          ? "No pudimos quitar la publicación de favoritos. Intentá nuevamente."
          : "No pudimos guardar la publicación en favoritos. Intentá nuevamente."
      );
    } finally {
      setFavoriteLoadingId("");
    }
  };

  const handleSuggestionInterest = (exchange) => {
    if (!user) {
      navigate("/login");
      return;
    }

    if (!exchange?.id) return;

    setError("");
    setSuccessMessage("");
    setProposalError("");
    setProposalModalExchange(exchange);
  };

  const closeProposalModal = () => {
    if (interestLoading) return;

    setProposalModalExchange(null);
    setProposalError("");
  };

  const handleSendProposal = async (draft) => {
    if (!user || !proposalModalExchange) return;

    setError("");
    setSuccessMessage("");
    setProposalError("");
    setInterestLoading(true);

    try {
      const result = await createExchangeProposal(user, {
        ...draft,
        otherExchange: proposalModalExchange,
        source: "dashboard_suggestions",
      });

      const updatedDismissedIds = Array.from(
        new Set([...dismissedIds, proposalModalExchange.id])
      );

      setDismissedIds(updatedDismissedIds);
      saveDismissedIds(user.uid, updatedDismissedIds);
      setCurrentSuggestionIndex(0);
      setSwipeDirection("");
      setProposalModalExchange(null);

      setSuccessMessage(
        result.alreadyExists
          ? "Ya habías enviado una propuesta para esta publicación."
          : "Propuesta enviada. La otra persona la verá en la sección Propuestas."
      );
    } catch (err) {
      console.error(err);
      setProposalError(
        err?.message || "No pudimos enviar la propuesta. Intentá nuevamente."
      );
    } finally {
      setInterestLoading(false);
    }
  };

  const handleDeleteExchange = async (exchange) => {
    if (!user || !exchange?.id) return;

    const confirmed = window.confirm(
      `¿Eliminar definitivamente la publicación "${
        exchange.offerTitle || exchange.searchTitle
      }"? Esta acción borrará la publicación, sus propuestas relacionadas y sus fotos/videos.`
    );

    if (!confirmed) return;

    setError("");
    setSuccessMessage("");
    setDeletingExchangeId(exchange.id);

    try {
      await deleteExchange(user, exchange.id);
      setSuccessMessage("Publicación eliminada correctamente.");
    } catch (err) {
      console.error(err);
      setError("No pudimos eliminar la publicación. Intentá nuevamente.");
    } finally {
      setDeletingExchangeId("");
    }
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
        source: "dashboard_suggestions",
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
    loadingExchanges ||
    loadingSuggestions ||
    loadingProfile ||
    loadingFavorites;

  if (isLoading) {
    return (
      <main className="dashboardPage">
        <p className="loadingText">Cargando panel...</p>
      </main>
    );
  }

  return (
    <main className="dashboardPage">
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

      <DashboardAdvertisementSlot
        advertisements={panelTopAdvertisements}
        variant="banner"
        className="dashboardAdvertisingTop"
      />

      <section className="marketplaceControlBar">
        <div className="marketplaceSearchLine">
          <label className="marketplaceSearchInput" aria-label="Buscar producto o servicio">
            <input
              type="search"
              placeholder="Buscar productos, servicios y más..."
              value={filters.query}
              onChange={(event) => updateFilter("query", event.target.value)}
            />
            <span className="marketplaceSearchIcon">⌕</span>
          </label>

          <Link to="/publicar" className="marketplacePublishButton">
            Crear intercambio
          </Link>
        </div>

        <div className="marketplaceFiltersLine">
          <label className="marketplaceMiniFilter">
            <span>Categorías</span>
            <select
              value={filters.category}
              onChange={(event) => updateFilter("category", event.target.value)}
            >
              <option value="all">Todas</option>
              {CATEGORIES.map((category) => (
                <option value={category} key={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          {filters.category === "Servicios" && (
            <>
              <label className="marketplaceMiniFilter marketplaceServiceFilter">
                <span>Servicio</span>
                <select
                  value={filters.serviceType}
                  onChange={(event) => updateFilter("serviceType", event.target.value)}
                >
                  <option value="all">Todos</option>
                  {SERVICE_TYPES.map((serviceType) => (
                    <option value={serviceType} key={serviceType}>
                      {serviceType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="marketplaceMiniFilter marketplaceLicenseFilter">
                <span>Matriculado</span>
                <select
                  value={filters.licensed}
                  onChange={(event) => updateFilter("licensed", event.target.value)}
                >
                  {LICENSE_FILTERS.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {filters.category !== "Servicios" && (
            <label className="marketplaceMiniFilter">
              <span>Estado</span>
              <select
                value={filters.offerState}
                onChange={(event) => updateFilter("offerState", event.target.value)}
              >
                <option value="all">Todos</option>
                {OFFER_STATES.map((state) => (
                  <option value={state} key={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="marketplaceMiniFilter marketplaceRadiusFilter">
            <span>Radio</span>
            <select
              value={filters.radius}
              onChange={(event) => handleRadiusFilterChange(event.target.value)}
              disabled={savingRadius}
            >
              {DISTANCE_FILTERS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="marketplaceMiniFilter">
            <span>Orden</span>
            <select
              value={filters.sort}
              onChange={(event) => updateFilter("sort", event.target.value)}
            >
              <option value="recommended">Recomendados</option>
              <option value="distance">Más cercanos</option>
              <option value="newest">Más recientes</option>
            </select>
          </label>

          <div className="marketplaceScopeChip">
            <strong>{activeRadiusLabel}</strong>
            <span>{discoveryScopeText}</span>
          </div>

          <button
            type="button"
            className="marketplaceClearButton"
            onClick={clearFilters}
            disabled={!hasCustomFilters || savingRadius}
          >
            Limpiar todo
          </button>
        </div>

        {activeFilterChips.length > 0 && (
          <div className="marketplaceActiveFilters" aria-label="Filtros activos">
            {activeFilterChips.map((chip) => (
              <button
                type="button"
                key={chip.field}
                className="marketplaceActiveFilterChip"
                onClick={() => clearFilter(chip.field)}
                disabled={chip.field === "radius" && savingRadius}
              >
                <span>{chip.label}</span>
                <strong aria-hidden="true">×</strong>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="marketplaceDiscoveryHeader">
        <div>
          <span className="eyebrow">Sugerencias</span>
          <h1>Puede interesarte</h1>
        </div>

        <p>
          <strong>{discoverySuggestions.length}</strong>{" "}
          {discoverySuggestions.length === 1
            ? "publicación encontrada"
            : "publicaciones encontradas"}
        </p>
      </section>

      <section className="discoveryPanel refinedDiscoveryPanel multiDiscoveryPanel">
        {activeUserExchanges.length === 0 ? (
          <div className="discoveryEmptyCard">
            <div className="emptyLogoIcon">
              <LogoMark size="large" />
            </div>

            <h3>Primero necesitás una publicación propia</h3>
            <p>
              Para enviar una propuesta, TeLoCambio necesita saber qué tenés para
              ofrecer a cambio.
            </p>
            <Link to="/publicar" className="primarySmallLink">
              Crear publicación
            </Link>
          </div>
        ) : discoverySuggestions.length === 0 ? (
          <div className="discoveryEmptyCard">
            <span>✓</span>
            <h3>
              {hasCustomFilters
                ? "No encontramos publicaciones con esos filtros"
                : isUsingDistanceFilter
                  ? "No hay publicaciones dentro de tu rango"
                  : "No hay más sugerencias por ahora"}
            </h3>
            <p>
              {hasCustomFilters
                ? "Probá ampliar el radio, cambiar la categoría o limpiar los filtros para ver más resultados."
                : isUsingDistanceFilter
                  ? "Podés ampliar el radio de búsqueda, elegir Todo el país o esperar nuevas publicaciones con localidad cargada."
                  : "Cuando aparezcan nuevas publicaciones activas, las vas a ver acá."}
            </p>

            {hasCustomFilters ? (
              <button
                type="button"
                className="secondaryActionLink emptyActionButton"
                onClick={clearFilters}
              >
                Limpiar filtros
              </button>
            ) : (
              <button
                type="button"
                className="secondaryActionLink emptyActionButton"
                onClick={() => handleRadiusFilterChange("national")}
                disabled={savingRadius}
              >
                Ver todo el país
              </button>
            )}
          </div>
        ) : (
          <div className="dashboardSuggestionsGrid">
            {discoverySuggestions.map((suggestion, index) => {
              const suggestionMediaCount = getMediaCount(suggestion);
              const suggestionIsService = isServiceExchange(suggestion);
              const suggestionIsLicensed = hasLicensedCredential(suggestion);
              const suggestionDistance = getPanelDistanceBadgeText(
                suggestion,
                userProfileData,
                filters.radius
              );
              const suggestionIsFavorite = favoriteIds.includes(suggestion.id);

              const shouldInsertFeedAdvertisement =
                panelFeedAdvertisements.length > 0 &&
                index ===
                  Math.min(
                    2,
                    discoverySuggestions.length - 1
                  );

              return (
                <Fragment key={suggestion.id}>
                  <article className="dashboardSuggestionCard">
                  <div className="dashboardSuggestionMediaWrap">
                    <ExchangeMediaPreview
                      exchange={suggestion}
                      className="dashboardSuggestionMedia"
                    />

                    <div className="dashboardSuggestionTopBadges">
                      <span className="dashboardSuggestionBadge">Sugerencia</span>
                    </div>

                    <button
                      type="button"
                      className={`dashboardSuggestionFavoriteButton ${
                        suggestionIsFavorite ? "isFavorite" : ""
                      }`}
                      disabled={favoriteLoadingId === suggestion.id}
                      style={{
                        ...favoriteButtonStyle,
                        cursor:
                          favoriteLoadingId === suggestion.id
                            ? "wait"
                            : "pointer",
                        opacity:
                          favoriteLoadingId === suggestion.id ? 0.72 : 1,
                        background: suggestionIsFavorite
                          ? "#ff5d76"
                          : "rgba(255, 255, 255, 0.94)",
                        color: suggestionIsFavorite ? "#ffffff" : "#13243d",
                      }}
                      aria-pressed={suggestionIsFavorite}
                      aria-label={
                        favoriteLoadingId === suggestion.id
                          ? "Guardando favorito"
                          : suggestionIsFavorite
                            ? "Quitar de favoritos"
                            : "Agregar a favoritos"
                      }
                      title={
                        favoriteLoadingId === suggestion.id
                          ? "Guardando..."
                          : suggestionIsFavorite
                            ? "Quitar de favoritos"
                            : "Agregar a favoritos"
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleFavorite(suggestion.id);
                      }}
                    >
                      <span aria-hidden="true">
                        {suggestionIsFavorite ? "♥" : "♡"}
                      </span>
                    </button>
                  </div>

                  <div className="dashboardSuggestionBody">
                    <div className="dashboardSuggestionMetaRow">
                      <span className="dashboardSuggestionCategory">
                        {suggestion.offerCategory || "Categoría"}
                      </span>

                      {suggestionIsService && suggestionIsLicensed && (
                        <span className="dashboardSuggestionLicensed">
                          Matriculado
                        </span>
                      )}
                    </div>

                    <h3>{suggestion.offerTitle || "Publicación"}</h3>

                    <p className="dashboardSuggestionDescription">
                      {suggestion.offerDescription ||
                        "El usuario no agregó una descripción detallada."}
                    </p>

                    <div className="dashboardSuggestionInfoGrid">
                      <div>
                        <span>{suggestionIsService ? "Servicio" : "Estado"}</span>
                        <strong>
                          {suggestionIsService
                            ? getServiceTypeLabel(suggestion.offerServiceType)
                            : suggestion.offerState || "No indicado"}
                        </strong>
                      </div>

                      <div>
                        <span>Busca</span>
                        <strong>{suggestion.searchTitle || "No indicado"}</strong>
                        {suggestion.searchCategory === "Servicios" && (
                          <small>
                            {getServiceTypeLabel(suggestion.searchServiceType)}
                          </small>
                        )}
                      </div>
                    </div>

                    <div className="dashboardSuggestionLocation">
                      <span>⌖</span>
                      <p>
                        <strong>{getExchangeLocationLabel(suggestion)}</strong>
                        <small>{suggestionDistance}</small>
                      </p>
                    </div>

                    <div className="dashboardSuggestionActions">
                      <button
                        type="button"
                        className="likeButton dashboardSuggestionProposalButton"
                        disabled={interestLoading || Boolean(swipeDirection)}
                        onClick={() => handleSuggestionInterest(suggestion)}
                      >
                        {interestLoading && proposalModalExchange?.id === suggestion.id
                          ? "Enviando..."
                          : "Enviar propuesta"}
                      </button>

                      <button
                        type="button"
                        className="dashboardSuggestionDismissButton"
                        disabled={interestLoading || Boolean(swipeDirection)}
                        onClick={() => dismissSuggestion(suggestion.id, "left")}
                      >
                        No me interesa
                      </button>
                    </div>

                    <button
                      type="button"
                      className="reportPublicationButton dashboardSuggestionReportButton"
                      disabled={reportLoadingId === suggestion.id}
                      onClick={() => openReportModal(suggestion)}
                    >
                      {reportLoadingId === suggestion.id
                        ? "Enviando denuncia..."
                        : "Denunciar publicación"}
                    </button>
                  </div>
                  </article>

                  {shouldInsertFeedAdvertisement && (
                    <DashboardAdvertisementSlot
                      advertisements={panelFeedAdvertisements}
                      variant="feed"
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </section>

      <DashboardAdvertisementSlot
        advertisements={panelMiddleAdvertisements}
        variant="banner"
        className="dashboardAdvertisingMiddle"
      />

      <section className="dashboardSectionHeader compactPublicationsHeader">
        <div>
          <span className="eyebrow">Tus publicaciones</span>
          <h2>Intercambios cargados</h2>
        </div>

        <Link to="/publicar" className="secondaryLink">
          + Nueva publicación
        </Link>
      </section>

      {visibleExchanges.length === 0 ? (
        <section className="emptyState">
          <div>
            <div className="emptyLogoIcon">
  <LogoMark size="large" />
</div>
            <h2>Todavía no publicaste ningún intercambio</h2>
            <p>
              Cargá qué estás buscando y qué tenés para ofrecer. Con esa
              información vamos a poder generar tus primeros matches.
            </p>
            <Link to="/publicar" className="primaryLink">
              Crear mi primera publicación
            </Link>
          </div>
        </section>
      ) : (
        <section className="userExchangesGrid compactUserExchangesGrid">
          {visibleExchanges.map((exchange) => (
            <article className="exchangeCard compactExchangeCard" key={exchange.id}>
              <ExchangeMediaPreview exchange={exchange} className="compactExchangeMedia" />

              <div className="compactExchangeBody">
                <div className="exchangeCardTop">
                  <span className="statusPill">
                    {exchange.status === "active" ? "Activa" : exchange.status}
                  </span>

                  <span className="zoneText">
                    {getExchangeLocationLabel(exchange)}
                  </span>
                </div>

                <div className="compactExchangeInfo">
                  <div>
                    <span className="miniLabel">Busco</span>
                    <h3>{exchange.searchTitle}</h3>
                    <p>{getSearchMetaSummary(exchange)}</p>
                  </div>

                  <div>
                    <span className="miniLabel">Ofrezco</span>
                    <h3>{exchange.offerTitle}</h3>
                    <p>{getOfferMetaSummary(exchange)}</p>
                  </div>
                </div>

                <div className="exchangeCardFooter compactExchangeActions">
                  <Link
                    to={`/editar/${exchange.id}`}
                    className="secondaryButton compactActionButton"
                  >
                    Editar
                  </Link>

                  <button
                    type="button"
                    className="dangerButton compactActionButton"
                    disabled={deletingExchangeId === exchange.id}
                    onClick={() => handleDeleteExchange(exchange)}
                  >
                    {deletingExchangeId === exchange.id ? "Eliminando..." : "Eliminar"}
                  </button>

                  <Link to="/matches" className="primarySmallLink compactActionButton">
                    Ver matches
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      <ExchangeProposalModal
        targetExchange={proposalModalExchange}
        myExchanges={activeUserExchanges}
        userId={user?.uid}
        loading={interestLoading}
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

export default Dashboard;
