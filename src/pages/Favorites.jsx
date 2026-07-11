import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import AppNavbar from "../components/AppNavbar";
import ExchangeProposalModal from "../components/ExchangeProposalModal";
import LogoMark from "../components/LogoMark";
import { useAuth } from "../context/AuthContext";
import { storage } from "../services/firebase";
import { getServiceImageUrl } from "../utils/serviceMedia";
import {
  listenActiveExchanges,
  listenUserExchanges,
} from "../services/exchangeService";
import {
  listenUserFavorites,
  removeFavorite,
} from "../services/favoriteService";
import { createExchangeProposal } from "../services/proposalSubmitService";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getCreatedAtValue(exchange) {
  const createdAt = exchange?.createdAt;

  if (typeof createdAt === "number") return createdAt;
  if (typeof createdAt === "string") return Number(createdAt) || 0;

  return 0;
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

function isServiceExchange(exchange) {
  return exchange?.offerCategory === "Servicios";
}

function hasLicensedCredential(exchange) {
  return Boolean(
    exchange?.offerIsLicensed &&
      String(exchange?.offerLicenseNumber || "").trim()
  );
}

function getServiceTypeLabel(value) {
  return value || "Servicio no indicado";
}

function exchangeMatchesSearch(exchange, normalizedQuery) {
  if (!normalizedQuery) return true;

  const searchableText = normalizeText(
    [
      exchange?.offerTitle,
      exchange?.offerDescription,
      exchange?.offerCategory,
      exchange?.offerState,
      exchange?.offerServiceType,
      exchange?.searchTitle,
      exchange?.searchCategory,
      exchange?.searchServiceType,
      exchange?.userName,
      getExchangeLocationLabel(exchange),
    ].join(" ")
  );

  return searchableText.includes(normalizedQuery);
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

function getMediaStoragePath(media) {
  return (
    media?.path ||
    media?.fullPath ||
    getStoragePathFromGsUrl(media?.url) ||
    getStoragePathFromGsUrl(media?.gsUrl) ||
    ""
  );
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
          mediaId: `service-favorite-${
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

const mediaUrlCache = new Map();

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

function MediaViewerModal({
  mediaItems,
  initialIndex,
  mediaUrls,
  title,
  onClose,
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  const activeMedia = mediaItems[activeIndex] || null;
  const activeKey = activeMedia ? getMediaKey(activeMedia, activeIndex) : "";
  const activeUrl =
    (activeKey && mediaUrls[activeKey]) || getInitialMediaUrl(activeMedia);
  const isVideo = isVideoMedia(activeMedia);
  const hasMultipleMedia = mediaItems.length > 1;

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();

      if (event.key === "ArrowLeft" && hasMultipleMedia) {
        setActiveIndex((current) =>
          current === 0 ? mediaItems.length - 1 : current - 1
        );
      }

      if (event.key === "ArrowRight" && hasMultipleMedia) {
        setActiveIndex((current) =>
          current === mediaItems.length - 1 ? 0 : current + 1
        );
      }
    };

    document.body.classList.add("mediaViewerOpen");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("mediaViewerOpen");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasMultipleMedia, mediaItems.length, onClose]);

  if (!activeMedia) return null;

  const goToPrevious = () => {
    setActiveIndex((current) =>
      current === 0 ? mediaItems.length - 1 : current - 1
    );
  };

  const goToNext = () => {
    setActiveIndex((current) =>
      current === mediaItems.length - 1 ? 0 : current + 1
    );
  };

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
            <span className="miniLabel">Publicación favorita</span>
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
          {!activeUrl ? (
            <div className="mediaViewerFallback">
              <span>{isVideo ? "▶" : "↔"}</span>
              <p>No pudimos cargar este archivo.</p>
            </div>
          ) : isVideo ? (
            <video controls playsInline preload="metadata" autoPlay>
              <source
                src={activeUrl}
                type={activeMedia.contentType || "video/mp4"}
              />
              Tu navegador no puede reproducir este video.
            </video>
          ) : (
            <img
              src={activeUrl}
              alt={title || activeMedia.name || "Publicación"}
              decoding="async"
            />
          )}

          {hasMultipleMedia && (
            <>
              <button
                type="button"
                className="mediaViewerNavButton previous"
                onClick={goToPrevious}
                aria-label="Ver archivo anterior"
              >
                ‹
              </button>

              <button
                type="button"
                className="mediaViewerNavButton next"
                onClick={goToNext}
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
        </div>
      </div>
    </div>
  );
}

function FavoriteMediaPreview({ exchange }) {
  const mediaItems = useMemo(() => getExchangeMediaItems(exchange), [exchange]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mediaUrls, setMediaUrls] = useState({});
  const [mediaErrors, setMediaErrors] = useState({});
  const [expandedIndex, setExpandedIndex] = useState(null);

  const activeMedia = mediaItems[activeIndex] || null;
  const activeKey = activeMedia ? getMediaKey(activeMedia, activeIndex) : "";
  const activeUrl =
    (activeKey && mediaUrls[activeKey]) || getInitialMediaUrl(activeMedia);
  const isVideo = isVideoMedia(activeMedia);
  const hasMultipleMedia = mediaItems.length > 1;
  const hasActiveError = activeKey ? Boolean(mediaErrors[activeKey]) : false;

  useEffect(() => {
    let isMounted = true;

    setActiveIndex(0);
    setMediaUrls({});
    setMediaErrors({});

    mediaItems.forEach((media, index) => {
      const key = getMediaKey(media, index);
      const initialUrl = getInitialMediaUrl(media);

      if (initialUrl) {
        setMediaUrls((current) => ({
          ...current,
          [key]: initialUrl,
        }));
      }

      resolveMediaDownloadUrl(media)
        .then((resolvedUrl) => {
          if (!isMounted || !resolvedUrl) return;

          setMediaUrls((current) => ({
            ...current,
            [key]: resolvedUrl,
          }));
        })
        .catch((error) => {
          console.error("No pudimos cargar el archivo favorito.", error);

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

  if (!activeMedia) {
    return (
      <div className="favoriteMediaPlaceholder">
        <LogoMark size="large" />
        <span>Sin fotos o videos</span>
      </div>
    );
  }

  const goToPrevious = (event) => {
    event.stopPropagation();
    setActiveIndex((current) =>
      current === 0 ? mediaItems.length - 1 : current - 1
    );
  };

  const goToNext = (event) => {
    event.stopPropagation();
    setActiveIndex((current) =>
      current === mediaItems.length - 1 ? 0 : current + 1
    );
  };

  return (
    <div className="favoriteMediaCarousel">
      {!activeUrl && !hasActiveError ? (
        <div className="favoriteMediaPlaceholder">
          <span>Cargando archivo...</span>
        </div>
      ) : hasActiveError ? (
        <div className="favoriteMediaPlaceholder">
          <span>No pudimos cargar este archivo.</span>
        </div>
      ) : isVideo ? (
        <video
          className="favoriteMediaVideo"
          controls
          controlsList="nodownload"
          playsInline
          preload="metadata"
        >
          <source
            src={activeUrl}
            type={activeMedia.contentType || "video/mp4"}
          />
          Tu navegador no puede reproducir este video.
        </video>
      ) : (
        <button
          type="button"
          className="favoriteMediaOpenButton"
          onClick={() => setExpandedIndex(activeIndex)}
          aria-label="Ampliar imagen de la publicación"
        >
          <img
            className="favoriteMediaBackdrop"
            src={activeUrl}
            alt=""
            aria-hidden="true"
          />
          <img
            className="favoriteMediaImage"
            src={activeUrl}
            alt={exchange?.offerTitle || "Publicación favorita"}
            loading="lazy"
            decoding="async"
            onError={() =>
              setMediaErrors((current) => ({
                ...current,
                [activeKey]: true,
              }))
            }
          />
        </button>
      )}

      {hasMultipleMedia && (
        <>
          <button
            type="button"
            className="favoriteMediaArrow previous"
            onClick={goToPrevious}
            aria-label="Ver archivo anterior"
          >
            ‹
          </button>

          <button
            type="button"
            className="favoriteMediaArrow next"
            onClick={goToNext}
            aria-label="Ver archivo siguiente"
          >
            ›
          </button>

          <div className="favoriteMediaDots" aria-label="Archivos de la publicación">
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

      {expandedIndex !== null && (
        <MediaViewerModal
          mediaItems={mediaItems}
          initialIndex={expandedIndex}
          mediaUrls={mediaUrls}
          title={exchange?.offerTitle}
          onClose={() => setExpandedIndex(null)}
        />
      )}
    </div>
  );
}

function Favorites() {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();

  const [favoriteIds, setFavoriteIds] = useState([]);
  const [activeExchanges, setActiveExchanges] = useState([]);
  const [myExchanges, setMyExchanges] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("saved");
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [loadingExchanges, setLoadingExchanges] = useState(true);
  const [loadingMyExchanges, setLoadingMyExchanges] = useState(true);
  const [removingFavoriteId, setRemovingFavoriteId] = useState("");
  const [proposalModalExchange, setProposalModalExchange] = useState(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (authLoading) return undefined;

    if (!user) {
      navigate("/login");
      return undefined;
    }

    setLoadingFavorites(true);
    setLoadingExchanges(true);
    setLoadingMyExchanges(true);
    setError("");

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

    const unsubscribeActiveExchanges = listenActiveExchanges(
      (items) => {
        setActiveExchanges(items);
        setLoadingExchanges(false);
      },
      () => {
        setError("No pudimos cargar las publicaciones favoritas.");
        setLoadingExchanges(false);
      }
    );

    const unsubscribeMyExchanges = listenUserExchanges(
      user.uid,
      (items) => {
        setMyExchanges(items);
        setLoadingMyExchanges(false);
      },
      () => {
        setError("No pudimos cargar tus publicaciones para enviar propuestas.");
        setLoadingMyExchanges(false);
      }
    );

    return () => {
      unsubscribeFavorites();
      unsubscribeActiveExchanges();
      unsubscribeMyExchanges();
    };
  }, [authLoading, navigate, user]);

  const activeMyExchanges = useMemo(() => {
    return myExchanges.filter((exchange) => exchange.status === "active");
  }, [myExchanges]);

  const favoriteOrder = useMemo(() => {
    return new Map(favoriteIds.map((exchangeId, index) => [exchangeId, index]));
  }, [favoriteIds]);

  const activeFavoriteExchanges = useMemo(() => {
    return activeExchanges
      .filter((exchange) => favoriteOrder.has(exchange.id))
      .sort(
        (firstExchange, secondExchange) =>
          (favoriteOrder.get(firstExchange.id) ?? Number.MAX_SAFE_INTEGER) -
          (favoriteOrder.get(secondExchange.id) ?? Number.MAX_SAFE_INTEGER)
      );
  }, [activeExchanges, favoriteOrder]);

  const availableCategories = useMemo(() => {
    return Array.from(
      new Set(
        activeFavoriteExchanges
          .map((exchange) => exchange.offerCategory)
          .filter(Boolean)
      )
    ).sort((firstCategory, secondCategory) =>
      firstCategory.localeCompare(secondCategory, "es")
    );
  }, [activeFavoriteExchanges]);

  const visibleFavorites = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    const filteredItems = activeFavoriteExchanges.filter((exchange) => {
      const matchesQuery = exchangeMatchesSearch(exchange, normalizedQuery);
      const matchesCategory =
        category === "all" || exchange.offerCategory === category;

      return matchesQuery && matchesCategory;
    });

    return [...filteredItems].sort((firstExchange, secondExchange) => {
      if (sort === "newest") {
        return getCreatedAtValue(secondExchange) - getCreatedAtValue(firstExchange);
      }

      if (sort === "title") {
        return String(firstExchange.offerTitle || "").localeCompare(
          String(secondExchange.offerTitle || ""),
          "es"
        );
      }

      return (
        (favoriteOrder.get(firstExchange.id) ?? Number.MAX_SAFE_INTEGER) -
        (favoriteOrder.get(secondExchange.id) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  }, [activeFavoriteExchanges, category, favoriteOrder, query, sort]);

  const unavailableFavoritesCount = Math.max(
    favoriteIds.length - activeFavoriteExchanges.length,
    0
  );

  const hasFilters = Boolean(query.trim()) || category !== "all" || sort !== "saved";

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setSort("saved");
  };

  const handleRemoveFavorite = async (exchange) => {
    if (!user?.uid || !exchange?.id || removingFavoriteId) return;

    setError("");
    setSuccessMessage("");
    setRemovingFavoriteId(exchange.id);

    try {
      await removeFavorite(user.uid, exchange.id);
      setSuccessMessage(
        `Quitamos “${exchange.offerTitle || "la publicación"}” de tus favoritos.`
      );
    } catch (removeError) {
      console.error(removeError);
      setError("No pudimos quitar la publicación de favoritos. Intentá nuevamente.");
    } finally {
      setRemovingFavoriteId("");
    }
  };

  const handleOpenProposal = (exchange) => {
    setError("");
    setSuccessMessage("");
    setProposalError("");

    if (activeMyExchanges.length === 0) {
      setError(
        "Necesitás tener al menos una publicación activa para enviar una propuesta."
      );
      return;
    }

    setProposalModalExchange(exchange);
  };

  const closeProposalModal = () => {
    if (proposalLoading) return;

    setProposalModalExchange(null);
    setProposalError("");
  };

  const handleSendProposal = async (draft) => {
    if (!user || !proposalModalExchange) return;

    setProposalLoading(true);
    setProposalError("");
    setError("");
    setSuccessMessage("");

    try {
      const result = await createExchangeProposal(user, {
        ...draft,
        otherExchange: proposalModalExchange,
        source: "favorites",
      });

      setProposalModalExchange(null);
      setSuccessMessage(
        result.alreadyExists
          ? "Ya habías enviado una propuesta para esta publicación."
          : "Propuesta enviada. La otra persona la verá en la sección Propuestas."
      );
    } catch (submitError) {
      console.error(submitError);
      setProposalError(
        submitError?.message ||
          "No pudimos enviar la propuesta. Intentá nuevamente."
      );
    } finally {
      setProposalLoading(false);
    }
  };

  const isLoading =
    authLoading ||
    loadingFavorites ||
    loadingExchanges ||
    loadingMyExchanges;

  if (isLoading) {
    return (
      <main className="favoritesPage">
        <p className="loadingText">Cargando favoritos...</p>
      </main>
    );
  }

  return (
    <main className="favoritesPage">
      <AppNavbar />

      {error && (
        <section className="dashboardNotice favoritesNotice">
          <p>{error}</p>
        </section>
      )}

      {successMessage && (
        <section className="successNotice favoritesNotice">
          <p>{successMessage}</p>
        </section>
      )}

      <section className="favoritesHero">
        <div className="favoritesHeroContent">
          <span className="eyebrow">Tus guardados</span>
          <h1>Publicaciones favoritas</h1>
          <p>
            Reuní en un solo lugar los productos y servicios que te interesan,
            comparalos con calma y enviá una propuesta cuando estés listo.
          </p>
        </div>

        <div className="favoritesHeroCard">
          <span className="favoritesHeroHeart" aria-hidden="true">
            ♥
          </span>
          <strong>{activeFavoriteExchanges.length}</strong>
          <p>
            {activeFavoriteExchanges.length === 1
              ? "publicación activa guardada"
              : "publicaciones activas guardadas"}
          </p>
          <Link to="/panel" className="favoritesBackLink">
            Seguir explorando
          </Link>
        </div>
      </section>

      <section className="favoritesToolbar">
        <label className="favoritesSearchField">
          <span>Buscar</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar entre tus favoritos..."
          />
        </label>

        <label className="favoritesFilterField">
          <span>Categoría</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">Todas</option>
            {availableCategories.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="favoritesFilterField">
          <span>Orden</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="saved">Guardados recientemente</option>
            <option value="newest">Publicados recientemente</option>
            <option value="title">Título A-Z</option>
          </select>
        </label>

        <button
          type="button"
          className="favoritesClearButton"
          onClick={clearFilters}
          disabled={!hasFilters}
        >
          Limpiar filtros
        </button>
      </section>

      <section className="favoritesResultsHeader">
        <div>
          <span className="miniLabel">Resultados</span>
          <h2>
            {visibleFavorites.length === 1
              ? "1 publicación encontrada"
              : `${visibleFavorites.length} publicaciones encontradas`}
          </h2>
        </div>

        {unavailableFavoritesCount > 0 && (
          <p>
            {unavailableFavoritesCount === 1
              ? "1 favorito ya no está activo y no se muestra."
              : `${unavailableFavoritesCount} favoritos ya no están activos y no se muestran.`}
          </p>
        )}
      </section>

      {favoriteIds.length === 0 ? (
        <section className="favoritesEmptyState">
          <div className="emptyLogoIcon">
            <LogoMark size="large" />
          </div>
          <h2>Todavía no guardaste publicaciones</h2>
          <p>
            Presioná el corazón de una sugerencia para encontrarla rápidamente
            desde esta página.
          </p>
          <Link to="/panel" className="primaryLink">
            Explorar publicaciones
          </Link>
        </section>
      ) : visibleFavorites.length === 0 ? (
        <section className="favoritesEmptyState">
          <span className="favoritesEmptyIcon">⌕</span>
          <h2>No encontramos favoritos con esos filtros</h2>
          <p>
            Probá cambiar la búsqueda o volver a mostrar todas las categorías.
          </p>
          <button
            type="button"
            className="secondaryActionLink"
            onClick={clearFilters}
          >
            Limpiar filtros
          </button>
        </section>
      ) : (
        <section className="favoritesGrid">
          {visibleFavorites.map((exchange) => {
            const isService = isServiceExchange(exchange);
            const isLicensed = hasLicensedCredential(exchange);

            return (
              <article className="favoriteCard" key={exchange.id}>
                <div className="favoriteCardMediaWrap">
                  <FavoriteMediaPreview exchange={exchange} />

                  <span className="favoriteSavedBadge">Favorito</span>

                  <button
                    type="button"
                    className="favoriteHeartButton active"
                    disabled={removingFavoriteId === exchange.id}
                    onClick={() => handleRemoveFavorite(exchange)}
                    aria-label="Quitar de favoritos"
                    title="Quitar de favoritos"
                  >
                    {removingFavoriteId === exchange.id ? "…" : "♥"}
                  </button>
                </div>

                <div className="favoriteCardBody">
                  <div className="favoriteCardMeta">
                    <span>{exchange.offerCategory || "Categoría"}</span>
                    {isService && isLicensed && <strong>Matriculado</strong>}
                  </div>

                  <h3>{exchange.offerTitle || "Publicación"}</h3>

                  <p className="favoriteCardDescription">
                    {exchange.offerDescription ||
                      "El usuario no agregó una descripción detallada."}
                  </p>

                  <div className="favoriteCardInfoGrid">
                    <div>
                      <span>{isService ? "Servicio" : "Estado"}</span>
                      <strong>
                        {isService
                          ? getServiceTypeLabel(exchange.offerServiceType)
                          : exchange.offerState || "No indicado"}
                      </strong>
                    </div>

                    <div>
                      <span>Busca</span>
                      <strong>{exchange.searchTitle || "No indicado"}</strong>
                      {exchange.searchCategory === "Servicios" && (
                        <small>
                          {getServiceTypeLabel(exchange.searchServiceType)}
                        </small>
                      )}
                    </div>
                  </div>

                  <div className="favoriteCardLocation">
                    <span aria-hidden="true">⌖</span>
                    <strong>{getExchangeLocationLabel(exchange)}</strong>
                  </div>

                  <div className="favoriteCardActions">
                    {activeMyExchanges.length > 0 ? (
                      <button
                        type="button"
                        className="favoriteProposalButton"
                        disabled={proposalLoading}
                        onClick={() => handleOpenProposal(exchange)}
                      >
                        Enviar propuesta
                      </button>
                    ) : (
                      <Link to="/publicar" className="favoriteProposalButton">
                        Crear publicación
                      </Link>
                    )}

                    <button
                      type="button"
                      className="favoriteRemoveButton"
                      disabled={removingFavoriteId === exchange.id}
                      onClick={() => handleRemoveFavorite(exchange)}
                    >
                      {removingFavoriteId === exchange.id
                        ? "Quitando..."
                        : "Quitar"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <ExchangeProposalModal
        targetExchange={proposalModalExchange}
        myExchanges={activeMyExchanges}
        userId={user?.uid}
        loading={proposalLoading}
        error={proposalError}
        onClose={closeProposalModal}
        onSubmit={handleSendProposal}
      />
    </main>
  );
}

export default Favorites;
