import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "react-router";
import {
  onValue,
  ref as databaseRef,
} from "firebase/database";
import {
  getDownloadURL,
  ref as storageRef,
} from "firebase/storage";
import { useAuth } from "../context/AuthContext";
import AppNavbar from "../components/AppNavbar";
import ExchangeProposalModal from "../components/ExchangeProposalModal";
import {
  database,
  storage,
} from "../services/firebase";
import {
  listenUserExchanges,
} from "../services/exchangeService";
import {
  listenUserProfile,
} from "../services/userProfileService";
import {
  listenUserFavorites,
  setPublicationFavorite,
} from "../services/favoriteService";
import {
  createExchangeProposal,
} from "../services/proposalSubmitService";
import {
  reportPublication,
} from "../services/reportService";
import {
  calculateDistanceKm,
  getExchangePoint,
  getUserProfilePoint,
} from "../utils/geoDistance";
import {
  getServiceImageUrl,
} from "../utils/serviceMedia";

const DISCOVERY_DISMISSED_KEY =
  "telocambio_discovery_dismissed";

function normalizeMediaCollection(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (value && typeof value === "object") {
    return Object.values(value).filter(Boolean);
  }

  return [];
}

function isVideoMedia(media) {
  return (
    media?.type === "video" ||
    media?.contentType?.startsWith("video/")
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

function getStoragePathFromGsUrl(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("gs://")
  ) {
    return "";
  }

  return value.replace(/^gs:\/\/[^/]+\//, "");
}

function getInitialMediaUrl(media) {
  return [
    media?.url,
    media?.downloadUrl,
    media?.originalUrl,
    media?.originalDownloadUrl,
  ].find(isDirectMediaUrl) || "";
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

function getMediaKey(media, index) {
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

function getPublicationMedia(publication) {
  const mediaItems = normalizeMediaCollection(
    publication?.offerMedia
  );

  if (mediaItems.length > 0) {
    return mediaItems;
  }

  if (publication?.coverMedia) {
    return [publication.coverMedia];
  }

  if (
    publication?.offerCategory === "Servicios"
  ) {
    const serviceUrl = getServiceImageUrl(
      publication?.offerServiceType
    );

    if (serviceUrl) {
      return [
        {
          mediaId: `service-detail-${
            publication?.offerServiceType ||
            "otro"
          }`,
          type: "image",
          contentType: "image/png",
          url: serviceUrl,
          downloadUrl: serviceUrl,
          name:
            publication?.offerServiceType ||
            "Servicio",
        },
      ];
    }
  }

  return [];
}

function getLocationLabel(publication) {
  const location = publication?.location;

  if (
    location?.localityName &&
    location?.provinceName
  ) {
    return `${location.localityName}, ${location.provinceName}`;
  }

  if (
    location?.departmentName &&
    location?.provinceName
  ) {
    return `${location.departmentName}, ${location.provinceName}`;
  }

  return (
    publication?.zone ||
    "Ubicación no indicada"
  );
}

function getDistanceText(
  publication,
  profileData
) {
  const profile = profileData?.profile;

  const userPoint =
    getUserProfilePoint(profile);
  const publicationPoint =
    getExchangePoint(publication);

  if (!userPoint) {
    return "Configurá tu ubicación para calcular la distancia";
  }

  if (!publicationPoint) {
    return "Distancia no disponible";
  }

  const distanceKm = calculateDistanceKm(
    userPoint,
    publicationPoint
  );

  return `A ${distanceKm} km`;
}

function getReportReasonLabel(value) {
  const labels = {
    inappropriate: "Contenido inapropiado",
    prohibited:
      "Producto o servicio prohibido",
    falseInfo:
      "Información falsa o engañosa",
    spam: "Spam o publicación repetida",
    scam: "Posible estafa",
    other: "Otro motivo",
  };

  return labels[value] || labels.other;
}

function saveDismissedPublication(
  userId,
  publicationId
) {
  if (
    !userId ||
    !publicationId ||
    typeof window === "undefined"
  ) {
    return;
  }

  const key = `${DISCOVERY_DISMISSED_KEY}_${userId}`;

  try {
    const saved = JSON.parse(
      localStorage.getItem(key) || "[]"
    );

    const nextIds = Array.from(
      new Set([
        ...(Array.isArray(saved) ? saved : []),
        publicationId,
      ])
    );

    localStorage.setItem(
      key,
      JSON.stringify(nextIds)
    );
  } catch (error) {
    console.error(error);

    localStorage.setItem(
      key,
      JSON.stringify([publicationId])
    );
  }
}

function PublicationFullscreenViewer({
  mediaItems,
  mediaUrls,
  initialIndex,
  publicationTitle,
  onClose,
}) {
  const [activeIndex, setActiveIndex] =
    useState(initialIndex);

  const activeMedia =
    mediaItems[activeIndex] || null;

  const activeKey = activeMedia
    ? getMediaKey(activeMedia, activeIndex)
    : "";

  const activeUrl =
    mediaUrls[activeKey] ||
    getInitialMediaUrl(activeMedia);

  const activeIsVideo =
    isVideoMedia(activeMedia);

  const hasMultipleMedia =
    mediaItems.length > 1;

  const goPrevious = () => {
    if (!hasMultipleMedia) return;

    setActiveIndex((current) =>
      current === 0
        ? mediaItems.length - 1
        : current - 1
    );
  };

  const goNext = () => {
    if (!hasMultipleMedia) return;

    setActiveIndex((current) =>
      current === mediaItems.length - 1
        ? 0
        : current + 1
    );
  };

  useEffect(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };

    document.body.classList.add(
      "publicationFullscreenOpen"
    );

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.classList.remove(
        "publicationFullscreenOpen"
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    hasMultipleMedia,
    mediaItems.length,
    onClose,
  ]);

  if (!activeMedia) return null;

  return (
    <div
      className="publicationFullscreenOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Vista ampliada de la publicación"
    >
      <div className="publicationFullscreenHeader">
        <div>
          <span>Publicación</span>
          <strong>
            {publicationTitle ||
              "Archivo ampliado"}
          </strong>
        </div>

        <button
          type="button"
          className="publicationFullscreenClose"
          onClick={onClose}
          aria-label="Cerrar vista ampliada"
        >
          ×
        </button>
      </div>

      <div className="publicationFullscreenBody">
        {!activeUrl ? (
          <div className="publicationFullscreenFallback">
            Cargando archivo...
          </div>
        ) : activeIsVideo ? (
          <video
            key={activeKey}
            className="publicationFullscreenMedia"
            controls
            controlsList="nodownload"
            playsInline
            preload="metadata"
            autoPlay
          >
            <source
              src={activeUrl}
              type={
                activeMedia.contentType ||
                "video/mp4"
              }
            />
            Tu navegador no puede reproducir
            este video.
          </video>
        ) : (
          <img
            key={activeKey}
            className="publicationFullscreenMedia"
            src={activeUrl}
            alt={
              publicationTitle ||
              "Publicación ampliada"
            }
            decoding="async"
          />
        )}

        {hasMultipleMedia && (
          <>
            <button
              type="button"
              className="publicationFullscreenArrow previous"
              onClick={goPrevious}
              aria-label="Archivo anterior"
            >
              ‹
            </button>

            <button
              type="button"
              className="publicationFullscreenArrow next"
              onClick={goNext}
              aria-label="Archivo siguiente"
            >
              ›
            </button>
          </>
        )}

        <span className="publicationFullscreenCounter">
          {activeIndex + 1} / {mediaItems.length}
        </span>
      </div>
    </div>
  );
}

function PublicationMediaGallery({
  publication,
}) {
  const mediaItems = useMemo(
    () => getPublicationMedia(publication),
    [publication]
  );

  const [activeIndex, setActiveIndex] =
    useState(0);
  const [mediaUrls, setMediaUrls] =
    useState({});
  const [mediaErrors, setMediaErrors] =
    useState({});
  const [expandedMediaIndex, setExpandedMediaIndex] =
    useState(null);

  const activeMedia =
    mediaItems[activeIndex] || null;

  const activeKey = activeMedia
    ? getMediaKey(activeMedia, activeIndex)
    : "";

  const activeUrl =
    mediaUrls[activeKey] ||
    getInitialMediaUrl(activeMedia);

  const activeIsVideo =
    isVideoMedia(activeMedia);

  useEffect(() => {
    let mounted = true;

    setMediaErrors({});

    mediaItems.forEach((media, index) => {
      const key = getMediaKey(
        media,
        index
      );

      const initialUrl =
        getInitialMediaUrl(media);

      if (initialUrl) {
        setMediaUrls((current) => ({
          ...current,
          [key]: initialUrl,
        }));
      }

      const storagePath =
        getMediaStoragePath(media);

      if (!storagePath || initialUrl) {
        return;
      }

      getDownloadURL(
        storageRef(storage, storagePath)
      )
        .then((url) => {
          if (!mounted || !url) return;

          setMediaUrls((current) => ({
            ...current,
            [key]: url,
          }));
        })
        .catch((error) => {
          console.error(
            "No pudimos cargar el archivo.",
            error
          );

          if (mounted) {
            setMediaErrors((current) => ({
              ...current,
              [key]: true,
            }));
          }
        });
    });

    return () => {
      mounted = false;
    };
  }, [mediaItems]);

  useEffect(() => {
    if (
      activeIndex >= mediaItems.length
    ) {
      setActiveIndex(0);
    }
  }, [
    activeIndex,
    mediaItems.length,
  ]);

  const goPrevious = () => {
    if (mediaItems.length <= 1) return;

    setActiveIndex((current) =>
      current === 0
        ? mediaItems.length - 1
        : current - 1
    );
  };

  const goNext = () => {
    if (mediaItems.length <= 1) return;

    setActiveIndex((current) =>
      current ===
      mediaItems.length - 1
        ? 0
        : current + 1
    );
  };

  if (!activeMedia) {
    return (
      <div className="publicationDetailMediaEmpty">
        <span>↔</span>
        <strong>
          Esta publicación no tiene imágenes
          ni videos.
        </strong>
      </div>
    );
  }

  const hasError =
    Boolean(mediaErrors[activeKey]);

  return (
    <div className="publicationDetailGallery">
      <div className="publicationDetailMainMedia">
        {!activeUrl && !hasError ? (
          <div className="publicationDetailMediaLoading">
            Cargando archivo...
          </div>
        ) : hasError ? (
          <div className="publicationDetailMediaLoading">
            No pudimos cargar este archivo.
          </div>
        ) : activeIsVideo ? (
          <div className="publicationDetailVideoShell">
            <video
              key={activeKey}
              className="publicationDetailMediaContent"
              controls
              controlsList="nodownload"
              playsInline
              preload="metadata"
              onDoubleClick={() =>
                setExpandedMediaIndex(
                  activeIndex
                )
              }
            >
              <source
                src={activeUrl}
                type={
                  activeMedia.contentType ||
                  "video/mp4"
                }
              />
              Tu navegador no puede reproducir
              este video.
            </video>

            <button
              type="button"
              className="publicationDetailExpandButton"
              onClick={() =>
                setExpandedMediaIndex(
                  activeIndex
                )
              }
              aria-label="Ampliar video a pantalla completa"
            >
              <span aria-hidden="true">⛶</span>
              Ampliar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="publicationDetailImageButton"
            onClick={() =>
              setExpandedMediaIndex(
                activeIndex
              )
            }
            aria-label="Ampliar imagen a pantalla completa"
          >
            <img
              className="publicationDetailMediaContent"
              src={activeUrl}
              alt={
                publication?.offerTitle ||
                "Publicación"
              }
              decoding="async"
            />

            <span className="publicationDetailExpandHint">
              <span aria-hidden="true">⛶</span>
              Ampliar
            </span>
          </button>
        )}

        {mediaItems.length > 1 && (
          <>
            <button
              type="button"
              className="publicationDetailMediaArrow previous"
              onClick={goPrevious}
              aria-label="Archivo anterior"
            >
              ‹
            </button>

            <button
              type="button"
              className="publicationDetailMediaArrow next"
              onClick={goNext}
              aria-label="Archivo siguiente"
            >
              ›
            </button>

            <span className="publicationDetailMediaCounter">
              {activeIndex + 1} /{" "}
              {mediaItems.length}
            </span>
          </>
        )}
      </div>

      {mediaItems.length > 1 && (
        <div className="publicationDetailThumbnails">
          {mediaItems.map(
            (media, index) => {
              const key = getMediaKey(
                media,
                index
              );

              const url =
                mediaUrls[key] ||
                getInitialMediaUrl(media);

              return (
                <button
                  type="button"
                  className={
                    index === activeIndex
                      ? "active"
                      : ""
                  }
                  key={key}
                  onClick={() =>
                    setActiveIndex(index)
                  }
                  aria-label={`Ver archivo ${
                    index + 1
                  }`}
                >
                  {url &&
                  isVideoMedia(media) ? (
                    <video
                      src={url}
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : url ? (
                    <img
                      src={url}
                      alt=""
                      decoding="async"
                    />
                  ) : (
                    <span>…</span>
                  )}

                  {isVideoMedia(media) && (
                    <strong>▶</strong>
                  )}
                </button>
              );
            }
          )}
        </div>
      )}

      {expandedMediaIndex !== null && (
        <PublicationFullscreenViewer
          mediaItems={mediaItems}
          mediaUrls={mediaUrls}
          initialIndex={expandedMediaIndex}
          publicationTitle={
            publication?.offerTitle
          }
          onClose={() =>
            setExpandedMediaIndex(null)
          }
        />
      )}
    </div>
  );
}

function ReportPublicationModal({
  publication,
  reason,
  detail,
  error,
  loading,
  onReasonChange,
  onDetailChange,
  onClose,
  onSubmit,
}) {
  if (!publication) return null;

  return (
    <div
      className="reportModalOverlay"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="reportModalBackdrop"
        aria-label="Cerrar denuncia"
        onClick={onClose}
      />

      <form
        className="reportModalCard"
        onSubmit={onSubmit}
      >
        <div className="reportModalHeader">
          <div>
            <span className="miniLabel">
              Denunciar publicación
            </span>

            <h3>
              {publication.offerTitle ||
                "Publicación"}
            </h3>
          </div>

          <button
            type="button"
            className="reportModalClose"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <p className="reportModalIntro">
          Contanos qué problema detectaste.
          Revisaremos la publicación para mantener
          TeLoCambio seguro.
        </p>

        <label>
          Motivo
          <select
            value={reason}
            onChange={(event) =>
              onReasonChange(
                event.target.value
              )
            }
            disabled={loading}
          >
            <option value="inappropriate">
              Contenido inapropiado
            </option>
            <option value="prohibited">
              Producto o servicio prohibido
            </option>
            <option value="falseInfo">
              Información falsa o engañosa
            </option>
            <option value="spam">
              Spam o publicación repetida
            </option>
            <option value="scam">
              Posible estafa
            </option>
            <option value="other">
              Otro motivo
            </option>
          </select>
        </label>

        <label>
          Detalle de la denuncia
          <textarea
            value={detail}
            onChange={(event) =>
              onDetailChange(
                event.target.value
              )
            }
            placeholder="Describí brevemente el problema."
            disabled={loading}
            required
          />
        </label>

        {error && (
          <p className="reportModalError">
            {error}
          </p>
        )}

        <div className="reportModalActions">
          <button
            type="button"
            className="secondaryButton"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="primaryButton"
            disabled={loading}
          >
            {loading
              ? "Enviando..."
              : "Enviar denuncia"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PublicationDetail() {
  const navigate = useNavigate();
  const { exchangeId } = useParams();

  const {
    user,
    authLoading,
  } = useAuth();

  const [publication, setPublication] =
    useState(null);
  const [profileData, setProfileData] =
    useState(null);
  const [userExchanges, setUserExchanges] =
    useState([]);
  const [favoriteIds, setFavoriteIds] =
    useState([]);

  const [
    loadingPublication,
    setLoadingPublication,
  ] = useState(true);

  const [loadingProfile, setLoadingProfile] =
    useState(true);

  const [
    loadingUserExchanges,
    setLoadingUserExchanges,
  ] = useState(true);

  const [
    loadingFavorites,
    setLoadingFavorites,
  ] = useState(true);

  const [
    favoriteLoading,
    setFavoriteLoading,
  ] = useState(false);

  const [
    proposalModalExchange,
    setProposalModalExchange,
  ] = useState(null);

  const [
    proposalLoading,
    setProposalLoading,
  ] = useState(false);

  const [
    proposalError,
    setProposalError,
  ] = useState("");

  const [
    reportModalOpen,
    setReportModalOpen,
  ] = useState(false);

  const [reportReason, setReportReason] =
    useState("inappropriate");

  const [reportDetail, setReportDetail] =
    useState("");

  const [reportError, setReportError] =
    useState("");

  const [reportLoading, setReportLoading] =
    useState(false);

  const [error, setError] = useState("");
  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  useEffect(() => {
    if (authLoading) return undefined;

    if (!user) {
      navigate("/login", {
        replace: true,
      });
      return undefined;
    }

    if (!exchangeId) {
      setError(
        "La publicación no es válida."
      );
      setLoadingPublication(false);
      return undefined;
    }

    setError("");
    setLoadingPublication(true);
    setLoadingProfile(true);
    setLoadingUserExchanges(true);
    setLoadingFavorites(true);

    const unsubscribePublication =
      onValue(
        databaseRef(
          database,
          `exchanges/${exchangeId}`
        ),
        (snapshot) => {
          if (!snapshot.exists()) {
            setPublication(null);
            setError(
              "La publicación no existe o fue eliminada."
            );
            setLoadingPublication(false);
            return;
          }

          const nextPublication = {
            id: snapshot.key,
            ...snapshot.val(),
          };

          const canView =
            nextPublication.status ===
              "active" ||
            nextPublication.userId ===
              user.uid;

          if (!canView) {
            setPublication(null);
            setError(
              "Esta publicación ya no está disponible."
            );
            setLoadingPublication(false);
            return;
          }

          setPublication(
            nextPublication
          );
          setLoadingPublication(false);
        },
        (publicationError) => {
          console.error(
            publicationError
          );
          setError(
            "No pudimos cargar la publicación."
          );
          setLoadingPublication(false);
        }
      );

    const unsubscribeProfile =
      listenUserProfile(
        user.uid,
        (nextProfileData) => {
          setProfileData(
            nextProfileData
          );
          setLoadingProfile(false);
        },
        () => {
          setProfileData(null);
          setLoadingProfile(false);
        }
      );

    const unsubscribeUserExchanges =
      listenUserExchanges(
        user.uid,
        (items) => {
          setUserExchanges(items);
          setLoadingUserExchanges(
            false
          );
        },
        () => {
          setUserExchanges([]);
          setLoadingUserExchanges(
            false
          );
        }
      );

    const unsubscribeFavorites =
      listenUserFavorites(
        user.uid,
        (ids) => {
          setFavoriteIds(ids);
          setLoadingFavorites(false);
        },
        () => {
          setFavoriteIds([]);
          setLoadingFavorites(false);
        }
      );

    return () => {
      unsubscribePublication();
      unsubscribeProfile();
      unsubscribeUserExchanges();
      unsubscribeFavorites();
    };
  }, [
    authLoading,
    user,
    exchangeId,
    navigate,
  ]);

  const activeUserExchanges =
    useMemo(
      () =>
        userExchanges.filter(
          (item) =>
            item.status === "active"
        ),
      [userExchanges]
    );

  const isFavorite =
    publication?.id
      ? favoriteIds.includes(
          publication.id
        )
      : false;

  const isOwnPublication =
    Boolean(
      publication?.userId &&
      publication.userId === user?.uid
    );

  const distanceText =
    publication
      ? getDistanceText(
          publication,
          profileData
        )
      : "";

  const isLoading =
    authLoading ||
    loadingPublication ||
    loadingProfile ||
    loadingUserExchanges ||
    loadingFavorites;

  const handleFavorite = async () => {
    if (
      !user?.uid ||
      !publication?.id ||
      favoriteLoading
    ) {
      return;
    }

    setFavoriteLoading(true);
    setError("");

    try {
      await setPublicationFavorite(
        user.uid,
        publication.id,
        !isFavorite
      );
    } catch (favoriteError) {
      console.error(favoriteError);
      setError(
        "No pudimos actualizar favoritos."
      );
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleInterest = () => {
    if (!publication?.id) return;

    if (
      activeUserExchanges.length === 0
    ) {
      navigate("/publicar");
      return;
    }

    setProposalError("");
    setProposalModalExchange(
      publication
    );
  };

  const handleSendProposal = async (
    draft
  ) => {
    if (
      !user ||
      !proposalModalExchange
    ) {
      return;
    }

    setProposalLoading(true);
    setProposalError("");
    setError("");
    setSuccessMessage("");

    try {
      const result =
        await createExchangeProposal(
          user,
          {
            ...draft,
            otherExchange:
              proposalModalExchange,
            source:
              "publication_detail",
          }
        );

      saveDismissedPublication(
        user.uid,
        publication.id
      );

      setProposalModalExchange(null);
      setSuccessMessage(
        result.alreadyExists
          ? "Ya habías enviado una propuesta para esta publicación."
          : "Propuesta enviada correctamente."
      );
    } catch (proposalSubmitError) {
      console.error(
        proposalSubmitError
      );

      setProposalError(
        proposalSubmitError?.message ||
          "No pudimos enviar la propuesta."
      );
    } finally {
      setProposalLoading(false);
    }
  };

  const handleDismiss = () => {
    if (
      !user?.uid ||
      !publication?.id
    ) {
      return;
    }

    saveDismissedPublication(
      user.uid,
      publication.id
    );

    navigate("/panel", {
      replace: true,
    });
  };

  const handleReport = async (event) => {
    event.preventDefault();

    if (
      !user ||
      !publication?.id
    ) {
      return;
    }

    const cleanDetail =
      reportDetail.trim();

    if (cleanDetail.length < 8) {
      setReportError(
        "Agregá una breve descripción para que podamos revisar la denuncia."
      );
      return;
    }

    setReportLoading(true);
    setReportError("");
    setError("");
    setSuccessMessage("");

    try {
      await reportPublication(
        user,
        publication,
        {
          reason:
            getReportReasonLabel(
              reportReason
            ),
          reasonCode: reportReason,
          detail: cleanDetail,
          source:
            "publication_detail",
        }
      );

      setReportModalOpen(false);
      setReportDetail("");
      setReportReason(
        "inappropriate"
      );
      setSuccessMessage(
        "Recibimos la denuncia y revisaremos la publicación."
      );
    } catch (reportSubmitError) {
      console.error(
        reportSubmitError
      );
      setReportError(
        "No pudimos enviar la denuncia."
      );
    } finally {
      setReportLoading(false);
    }
  };

  if (isLoading) {
    return (
      <main className="dashboardPage publicationDetailPage">
        <AppNavbar />
        <p className="loadingText">
          Cargando publicación...
        </p>
      </main>
    );
  }

  if (!publication) {
    return (
      <main className="dashboardPage publicationDetailPage">
        <AppNavbar />

        <section className="publicationDetailNotFound">
          <span className="eyebrow">
            Publicación
          </span>
          <h1>
            No pudimos mostrarla
          </h1>
          <p>
            {error ||
              "La publicación no está disponible."}
          </p>

          <Link
            to="/panel"
            className="primaryButton"
          >
            Volver al panel
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboardPage publicationDetailPage">
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

      <div className="publicationDetailTopBar">
        <button
          type="button"
          onClick={() =>
            navigate("/panel")
          }
        >
          ← Volver a publicaciones
        </button>

        <span>
          Publicación de{" "}
          <strong>
            {publication.userName ||
              "Usuario"}
          </strong>
        </span>
      </div>

      <section className="publicationDetailLayout">
        <PublicationMediaGallery
          publication={publication}
        />

        <article className="publicationDetailContent">
          <div className="publicationDetailHeading">
            <div className="publicationDetailBadges">
              <span>
                {publication.offerCategory ||
                  "Categoría"}
              </span>

              {publication.offerIsLicensed && (
                <span className="licensed">
                  Matriculado
                </span>
              )}
            </div>

            <h1>
              {publication.offerTitle ||
                "Publicación"}
            </h1>

            <p>
              {publication.offerDescription ||
                "El usuario no agregó una descripción detallada."}
            </p>
          </div>

          <div className="publicationDetailInfoGrid">
            <section>
              <span>
                {publication.offerCategory ===
                "Servicios"
                  ? "Servicio ofrecido"
                  : "Estado"}
              </span>

              <strong>
                {publication.offerCategory ===
                "Servicios"
                  ? publication.offerServiceType ||
                    "No indicado"
                  : publication.offerState ||
                    "No indicado"}
              </strong>

              {publication.offerLicenseNumber && (
                <small>
                  Matrícula{" "}
                  {
                    publication.offerLicenseNumber
                  }
                </small>
              )}
            </section>

            <section className="publicationDetailWantedBox">
              <span>
                Busca a cambio
              </span>

              <strong>
                {publication.searchTitle ||
                  "No indicado"}
              </strong>

              <small>
                {publication.searchCategory ||
                  "Categoría no indicada"}
                {publication.searchServiceType
                  ? ` · ${publication.searchServiceType}`
                  : ""}
              </small>

              {publication.searchDetails && (
                <p>
                  {
                    publication.searchDetails
                  }
                </p>
              )}
            </section>

            <section>
              <span>Ubicación</span>

              <strong>
                {getLocationLabel(
                  publication
                )}
              </strong>

              <small>
                {distanceText}
              </small>
            </section>
          </div>

          {isOwnPublication ? (
            <div className="publicationDetailOwnActions">
              <Link
                to={`/editar/${publication.id}`}
                className="primaryButton"
              >
                Editar mi publicación
              </Link>

              <Link
                to="/panel"
                className="secondaryButton"
              >
                Volver al panel
              </Link>
            </div>
          ) : (
            <div className="publicationDetailActions">
              <button
                type="button"
                className={`publicationDetailFavoriteButton ${
                  isFavorite
                    ? "isFavorite"
                    : ""
                }`}
                onClick={handleFavorite}
                disabled={
                  favoriteLoading
                }
                aria-pressed={
                  isFavorite
                }
              >
                <span aria-hidden="true">
                  {isFavorite
                    ? "♥"
                    : "♡"}
                </span>

                {favoriteLoading
                  ? "Guardando..."
                  : isFavorite
                    ? "Quitar de favoritos"
                    : "Guardar en favoritos"}
              </button>

              <button
                type="button"
                className="primaryButton publicationDetailInterestButton"
                onClick={handleInterest}
              >
                {activeUserExchanges.length >
                0
                  ? "Me interesa"
                  : "Crear publicación para proponer"}
              </button>

              <button
                type="button"
                className="secondaryButton publicationDetailDismissButton"
                onClick={handleDismiss}
              >
                No me interesa
              </button>

              <button
                type="button"
                className="reportPublicationButton publicationDetailReportButton"
                onClick={() => {
                  setReportError("");
                  setReportModalOpen(
                    true
                  );
                }}
              >
                Denunciar publicación
              </button>

              {activeUserExchanges.length ===
                0 && (
                <p className="publicationDetailProposalNotice">
                  Podés ver toda la
                  publicación, guardarla,
                  descartarla o denunciarla.
                  Para enviar una propuesta
                  primero necesitás registrar
                  qué ofrecés a cambio.
                </p>
              )}
            </div>
          )}
        </article>
      </section>

      <ExchangeProposalModal
        targetExchange={
          proposalModalExchange
        }
        myExchanges={
          activeUserExchanges
        }
        userId={user?.uid}
        loading={proposalLoading}
        error={proposalError}
        onClose={() => {
          if (proposalLoading) return;

          setProposalModalExchange(
            null
          );
          setProposalError("");
        }}
        onSubmit={handleSendProposal}
      />

      <ReportPublicationModal
        publication={
          reportModalOpen
            ? publication
            : null
        }
        reason={reportReason}
        detail={reportDetail}
        error={reportError}
        loading={reportLoading}
        onReasonChange={
          setReportReason
        }
        onDetailChange={
          setReportDetail
        }
        onClose={() => {
          if (reportLoading) return;

          setReportModalOpen(false);
          setReportError("");
        }}
        onSubmit={handleReport}
      />
    </main>
  );
}

export default PublicationDetail;
