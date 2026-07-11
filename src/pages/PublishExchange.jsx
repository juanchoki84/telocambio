import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import AppNavbar from "../components/AppNavbar";
import LocationPicker from "../components/LocationPicker";
import {
  createExchange,
  createExchangeId,
  getExchangeById,
  updateExchange,
} from "../services/exchangeService";
import { uploadExchangeMediaFiles } from "../services/storageService";
import { getUserProfile } from "../services/userProfileService";
import {
  buildServiceDefaultMedia,
  getServiceImageUrl,
} from "../utils/serviceMedia";
import {
  ensureUserPlan,
  getPlanLimitLabel,
  validateMediaSelectionAgainstPlan,
  validatePublicationAgainstPlan,
} from "../services/planService";

const SERVICE_CATEGORY = "Servicios";

const categories = [
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
  SERVICE_CATEGORY,
];

const serviceTypes = [
  "Gasista",
  "Electricista",
  "Plomero",
  "Cerrajero",
  "Pintor",
  "Albañil",
  "Mecánico",
  "Otro",
];

function isServiceCategory(category) {
  return category === SERVICE_CATEGORY;
}

function isOtherService(serviceType) {
  return serviceType === "Otro";
}

function buildAutomaticServiceTitle(serviceType) {
  if (!serviceType || isOtherService(serviceType)) {
    return "";
  }

  return `Servicio de ${serviceType}`;
}

function resolvePublicationTitle({
  category,
  serviceType,
  manualTitle,
}) {
  if (!isServiceCategory(category)) {
    return String(manualTitle || "").trim();
  }

  if (isOtherService(serviceType)) {
    return String(manualTitle || "").trim();
  }

  return buildAutomaticServiceTitle(serviceType);
}

function buildLocationLabel(location) {
  if (!location) return "";

  const locality = location.localityName || "";
  const department = location.departmentName || "";
  const province = location.provinceName || "";

  const parts = [];

  if (locality) parts.push(locality);
  if (department && department !== locality) parts.push(department);
  if (province) parts.push(province);

  return parts.join(", ");
}

function hasValidLocation(location) {
  return Boolean(
    location?.provinceId &&
      location?.localityId &&
      location?.localityName &&
      location?.lat !== null &&
      location?.lat !== undefined &&
      location?.lon !== null &&
      location?.lon !== undefined
  );
}

function getMediaIdentity(media) {
  return (
    media?.mediaId ||
    media?.path ||
    media?.originalPath ||
    media?.fullPath ||
    media?.originalFullPath ||
    media?.url ||
    media?.downloadUrl ||
    media?.originalUrl ||
    media?.name ||
    ""
  );
}

function isVideoMedia(media) {
  return (
    media?.type === "video" ||
    media?.contentType?.startsWith("video/") ||
    media?.originalContentType?.startsWith("video/")
  );
}

function getMediaDisplayUrl(media) {
  return (
    media?.url ||
    media?.downloadUrl ||
    media?.originalUrl ||
    media?.originalDownloadUrl ||
    ""
  );
}

function normalizeOfferMediaList(media) {
  if (Array.isArray(media)) return media.filter(Boolean);

  if (media && typeof media === "object") {
    return Object.values(media).filter(Boolean);
  }

  return [];
}

function PublishExchange() {
  const navigate = useNavigate();
  const { exchangeId } = useParams();
  const { user, authLoading } = useAuth();

  const isEditMode = Boolean(exchangeId);

  const [formData, setFormData] = useState({
    searchTitle: "",
    searchCategory: "",
    searchServiceType: "",
    searchDetails: "",
    offerTitle: "",
    offerCategory: "",
    offerServiceType: "",
    offerIsLicensed: false,
    offerLicenseNumber: "",
    offerState: "Muy bueno",
    offerDescription: "",
  });

  const [profileLocation, setProfileLocation] = useState(null);
  const [location, setLocation] = useState(null);
  const [useProfileLocation, setUseProfileLocation] = useState(false);
  const [useCustomLocation, setUseCustomLocation] = useState(false);

  const [existingMedia, setExistingMedia] = useState([]);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaPreviews, setMediaPreviews] = useState([]);
  const [loadingExchange, setLoadingExchange] = useState(Boolean(exchangeId));
  const [loadingProfileLocation, setLoadingProfileLocation] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [userPlan, setUserPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);

  const hasProfileLocation = hasValidLocation(profileLocation);
  const currentLocationLabel = buildLocationLabel(location);
  const isSearchingService = isServiceCategory(formData.searchCategory);
  const isOfferingService = isServiceCategory(formData.offerCategory);
  const serviceDefaultMedia = isOfferingService
    ? buildServiceDefaultMedia(formData.offerServiceType)
    : null;
  const serviceImageUrl = isOfferingService
    ? getServiceImageUrl(formData.offerServiceType)
    : "";
  const planMaxMedia = userPlan?.limits?.maxMediaPerPublication || 3;
  const hasReachedMediaLimit = existingMedia.length >= planMaxMedia;

  useEffect(() => {
    if (authLoading) return undefined;

    if (!user) {
      navigate("/login");
      return undefined;
    }

    let isMounted = true;

    async function loadInitialData() {
      setLoadingExchange(Boolean(exchangeId));
      setLoadingProfileLocation(true);
      setError("");

      try {
        const userProfile = await getUserProfile(user.uid).catch((err) => {
          console.error(err);
          return null;
        });

        const userProfileLocation = hasValidLocation(userProfile?.location)
          ? userProfile.location
          : null;

        if (!isMounted) return;

        setProfileLocation(userProfileLocation);

        if (isEditMode) {
          const exchange = await getExchangeById(user, exchangeId);

          if (!isMounted) return;

          const loadedSearchCategory =
            exchange.searchCategory || "";
          const loadedSearchServiceType =
            exchange.searchServiceType || "";
          const loadedOfferCategory =
            exchange.offerCategory || "";
          const loadedOfferServiceType =
            exchange.offerServiceType || "";

          setFormData({
            searchTitle: resolvePublicationTitle({
              category: loadedSearchCategory,
              serviceType: loadedSearchServiceType,
              manualTitle: exchange.searchTitle || "",
            }),
            searchCategory: loadedSearchCategory,
            searchServiceType: loadedSearchServiceType,
            searchDetails: exchange.searchDetails || "",
            offerTitle: resolvePublicationTitle({
              category: loadedOfferCategory,
              serviceType: loadedOfferServiceType,
              manualTitle: exchange.offerTitle || "",
            }),
            offerCategory: loadedOfferCategory,
            offerServiceType: loadedOfferServiceType,
            offerIsLicensed: Boolean(exchange.offerIsLicensed),
            offerLicenseNumber: exchange.offerLicenseNumber || "",
            offerState: exchange.offerState || "Muy bueno",
            offerDescription: exchange.offerDescription || "",
          });

          const exchangeLocation = hasValidLocation(exchange.location)
            ? exchange.location
            : null;

          if (exchangeLocation) {
            setLocation(exchangeLocation);
            setUseProfileLocation(false);
            setUseCustomLocation(true);
          } else if (userProfileLocation) {
            setLocation(userProfileLocation);
            setUseProfileLocation(true);
            setUseCustomLocation(false);
          } else {
            setLocation(null);
            setUseProfileLocation(false);
            setUseCustomLocation(true);
          }

          setExistingMedia(normalizeOfferMediaList(exchange.offerMedia));
        } else if (userProfileLocation) {
          setLocation(userProfileLocation);
          setUseProfileLocation(true);
          setUseCustomLocation(false);
        } else {
          setLocation(null);
          setUseProfileLocation(false);
          setUseCustomLocation(true);
        }
      } catch (err) {
        console.error(err);

        if (isMounted) {
          setError(
            isEditMode
              ? "No pudimos cargar la publicación para editar."
              : "No pudimos cargar la ubicación de tu perfil. Podés seleccionarla manualmente."
          );
        }
      } finally {
        if (isMounted) {
          setLoadingExchange(false);
          setLoadingProfileLocation(false);
        }
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [authLoading, user, isEditMode, exchangeId, navigate]);

  useEffect(() => {
    let ignore = false;

    async function loadUserPlan() {
      if (!user?.uid) return;

      setPlanLoading(true);

      try {
        const plan = await ensureUserPlan(user.uid);

        if (!ignore) {
          setUserPlan(plan);
        }
      } catch (err) {
        console.error(err);

        if (!ignore) {
          setError("No pudimos validar tu plan actual. Intentá nuevamente.");
        }
      } finally {
        if (!ignore) {
          setPlanLoading(false);
        }
      }
    }

    loadUserPlan();

    return () => {
      ignore = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    const previews = mediaFiles.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      type: file.type.startsWith("video/") ? "video" : "image",
      url: URL.createObjectURL(file),
    }));

    setMediaPreviews(previews);

    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [mediaFiles]);

  const selectedFilesInfo = useMemo(() => {
    if (!mediaFiles.length) return "Sin archivos nuevos seleccionados";

    const images = mediaFiles.filter((file) =>
      file.type.startsWith("image/")
    ).length;

    const videos = mediaFiles.filter((file) =>
      file.type.startsWith("video/")
    ).length;

    const parts = [];

    if (images > 0) {
      parts.push(`${images} foto${images > 1 ? "s" : ""}`);
    }

    if (videos > 0) {
      parts.push(`${videos} video${videos > 1 ? "s" : ""}`);
    }

    return parts.join(" · ");
  }, [mediaFiles]);

  const updateField = (field, value) => {
    setFormData((current) => {
      const nextData = {
        ...current,
        [field]: value,
      };

      if (field === "searchCategory") {
        nextData.searchServiceType = "";
        nextData.searchTitle = "";
      }

      if (field === "offerCategory") {
        nextData.offerServiceType = "";
        nextData.offerTitle = "";
        nextData.offerIsLicensed = false;
        nextData.offerLicenseNumber = "";
        nextData.offerState = isServiceCategory(value)
          ? ""
          : "Muy bueno";
      }

      if (field === "searchServiceType") {
        nextData.searchTitle = isOtherService(value)
          ? current.searchServiceType === "Otro"
            ? current.searchTitle
            : ""
          : buildAutomaticServiceTitle(value);
      }

      if (field === "offerServiceType") {
        nextData.offerTitle = isOtherService(value)
          ? current.offerServiceType === "Otro"
            ? current.offerTitle
            : ""
          : buildAutomaticServiceTitle(value);
      }

      if (field === "offerIsLicensed" && !value) {
        nextData.offerLicenseNumber = "";
      }

      return nextData;
    });
  };

  const handleUseProfileLocation = () => {
    if (!hasProfileLocation) return;

    setLocation(profileLocation);
    setUseProfileLocation(true);
    setUseCustomLocation(false);
    setError("");
  };

  const handleUseCustomLocation = () => {
    setUseProfileLocation(false);
    setUseCustomLocation(true);
    setError("");
  };

  const handleLocationChange = (selectedLocation) => {
    setLocation(selectedLocation);
    setUseProfileLocation(false);
    setUseCustomLocation(true);
    setError("");
  };

  const handleMediaChange = (event) => {
    setError("");

    const files = Array.from(event.target.files || []);

    if (planLoading) {
      setError("Estamos validando tu plan. Intentá nuevamente en unos segundos.");
      event.target.value = "";
      return;
    }

    const validation = validateMediaSelectionAgainstPlan({
      plan: userPlan,
      newFiles: files,
      currentFiles: mediaFiles,
      existingMedia,
    });

    if (validation.plan) {
      setUserPlan(validation.plan);
    }

    if (validation.acceptedFiles.length > 0) {
      setMediaFiles((currentFiles) => [
        ...currentFiles,
        ...validation.acceptedFiles,
      ]);
    }

    if (validation.messages.length > 0) {
      setError(validation.messages.join(" "));
    }

    event.target.value = "";
  };

  const removeMediaFile = (fileToRemove) => {
    setMediaFiles((current) =>
      current.filter(
        (file) =>
          !(file.name === fileToRemove.name &&
            file.size === fileToRemove.size &&
            file.lastModified === fileToRemove.lastModified)
      )
    );
  };

  const removeExistingMedia = (mediaToRemove) => {
    const targetIdentity = getMediaIdentity(mediaToRemove);

    setExistingMedia((current) =>
      current.filter((media) => getMediaIdentity(media) !== targetIdentity)
    );
  };

  const clearNewMediaFiles = () => {
    setMediaFiles([]);
    setUploadProgress(0);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setUploadProgress(0);

    if (!user) {
      navigate("/login");
      return;
    }

    if (!formData.searchCategory) {
      setError("Seleccioná la categoría de lo que estás buscando.");
      return;
    }

    if (!formData.offerCategory) {
      setError("Seleccioná la categoría de lo que estás ofreciendo.");
      return;
    }

    if (!hasValidLocation(location)) {
      setError(
        "Seleccioná una localidad válida. Podés usar la ubicación de tu perfil o elegir una diferente para esta publicación."
      );
      return;
    }

    if (
      isServiceCategory(formData.searchCategory) &&
      !formData.searchServiceType
    ) {
      setError("Indicá qué tipo de servicio estás buscando.");
      return;
    }

    if (
      isServiceCategory(formData.offerCategory) &&
      !formData.offerServiceType
    ) {
      setError("Indicá qué profesión o servicio estás ofreciendo.");
      return;
    }

    if (
      isServiceCategory(formData.searchCategory) &&
      isOtherService(formData.searchServiceType) &&
      !formData.searchTitle.trim()
    ) {
      setError("Indicá qué servicio estás buscando.");
      return;
    }

    if (
      isServiceCategory(formData.offerCategory) &&
      isOtherService(formData.offerServiceType) &&
      !formData.offerTitle.trim()
    ) {
      setError("Indicá qué servicio estás ofreciendo.");
      return;
    }

    if (
      !isServiceCategory(formData.searchCategory) &&
      !formData.searchTitle.trim()
    ) {
      setError("Ingresá el nombre del producto que estás buscando.");
      return;
    }

    if (
      !isServiceCategory(formData.offerCategory) &&
      !formData.offerTitle.trim()
    ) {
      setError("Ingresá el nombre del producto que estás ofreciendo.");
      return;
    }

    if (
      isServiceCategory(formData.offerCategory) &&
      formData.offerIsLicensed &&
      !formData.offerLicenseNumber.trim()
    ) {
      setError("Ingresá el número de matrícula para confirmar que sos matriculado.");
      return;
    }

    setSaving(true);

    try {
      const publicationMediaFiles = isOfferingService
        ? []
        : mediaFiles;
      const publicationExistingMedia = isOfferingService
        ? []
        : existingMedia;

      const planValidation = await validatePublicationAgainstPlan({
        user,
        mediaFiles: publicationMediaFiles,
        existingMedia: publicationExistingMedia,
        exchangeId: isEditMode ? exchangeId : "",
      });

      setUserPlan(planValidation.plan);

      if (!planValidation.allowed) {
        setError(planValidation.message);
        return;
      }

      const targetExchangeId = isEditMode ? exchangeId : createExchangeId();

      if (!targetExchangeId) {
        throw new Error("No pudimos preparar el ID de la publicación.");
      }

      const uploadedMedia = isOfferingService
        ? []
        : await uploadExchangeMediaFiles(
            user,
            publicationMediaFiles,
            setUploadProgress,
            targetExchangeId
          );

      const offerMedia = isOfferingService
        ? [serviceDefaultMedia].filter(Boolean)
        : [...publicationExistingMedia, ...uploadedMedia];
      const zone = buildLocationLabel(location);

      const normalizedFormData = {
        ...formData,
        searchTitle: resolvePublicationTitle({
          category: formData.searchCategory,
          serviceType: formData.searchServiceType,
          manualTitle: formData.searchTitle,
        }),
        offerTitle: resolvePublicationTitle({
          category: formData.offerCategory,
          serviceType: formData.offerServiceType,
          manualTitle: formData.offerTitle,
        }),
        searchServiceType: isServiceCategory(formData.searchCategory)
          ? formData.searchServiceType
          : "",
        offerServiceType: isServiceCategory(formData.offerCategory)
          ? formData.offerServiceType
          : "",
        offerIsLicensed: isServiceCategory(formData.offerCategory)
          ? Boolean(formData.offerIsLicensed)
          : false,
        offerLicenseNumber:
          isServiceCategory(formData.offerCategory) &&
          formData.offerIsLicensed
            ? formData.offerLicenseNumber.trim()
            : "",
      };

      const exchangePayload = {
        ...normalizedFormData,
        id: targetExchangeId,
        zone,
        location,
        locationSource: useProfileLocation ? "profile" : "custom",
        offerMedia,
      };

      if (isEditMode) {
        await updateExchange(user, targetExchangeId, exchangePayload);
      } else {
        await createExchange(user, exchangePayload, targetExchangeId);
      }

      navigate("/panel");
    } catch (err) {
      console.error(err);
      setError(
        err?.message ||
          "No pudimos guardar la publicación. Intentá nuevamente."
      );
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loadingExchange || loadingProfileLocation) {
    return (
      <main className="dashboardPage">
        <p className="loadingText">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="dashboardPage">
      <AppNavbar />

      <section className="formPageHeader">
        <span className="badge">
          {isEditMode ? "Editar publicación" : "Nuevo intercambio"}
        </span>
        <h1>
          {isEditMode
            ? "Actualizá tu publicación"
            : "Contanos qué buscás y qué ofrecés"}
        </h1>
        <p>
          Si ofrecés un producto, podés sumar fotos o videos. Si ofrecés un
          servicio, asignaremos automáticamente una portada profesional según
          el rubro seleccionado. La ubicación se toma desde tu perfil, pero
          podés cambiarla para una publicación puntual.
        </p>
      </section>

      <section className="exchangeFormCard">
        <form className="exchangeForm" onSubmit={handleSubmit}>
          <div className="formBlock">
            <h2>Qué buscás</h2>

            <label>
              Categoría
              <select
                value={formData.searchCategory}
                onChange={(event) =>
                  updateField(
                    "searchCategory",
                    event.target.value
                  )
                }
                required
              >
                <option value="">
                  Seleccionar categoría
                </option>

                {categories.map((category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                ))}
              </select>
            </label>

            {formData.searchCategory &&
              !isSearchingService && (
                <label>
                  Producto buscado
                  <input
                    placeholder="Ej: Notebook, celular..."
                    value={formData.searchTitle}
                    onChange={(event) =>
                      updateField(
                        "searchTitle",
                        event.target.value
                      )
                    }
                    required
                  />
                </label>
              )}

            {isSearchingService && (
              <section className="serviceOptionsBox">
                <span className="miniLabel">
                  Servicio buscado
                </span>

                <label>
                  Tipo de servicio
                  <select
                    value={formData.searchServiceType}
                    onChange={(event) =>
                      updateField(
                        "searchServiceType",
                        event.target.value
                      )
                    }
                    required
                  >
                    <option value="">
                      Seleccionar servicio
                    </option>

                    {serviceTypes.map((service) => (
                      <option
                        key={service}
                        value={service}
                      >
                        {service}
                      </option>
                    ))}
                  </select>
                </label>

                {formData.searchServiceType &&
                  !isOtherService(
                    formData.searchServiceType
                  ) && (
                    <p>
                      El título se completará automáticamente
                      como{" "}
                      <strong>
                        {buildAutomaticServiceTitle(
                          formData.searchServiceType
                        )}
                      </strong>
                      .
                    </p>
                  )}

                {isOtherService(
                  formData.searchServiceType
                ) && (
                  <label>
                    ¿Qué servicio buscás?
                    <input
                      placeholder="Ej: Servicio de reparación de calzado"
                      value={formData.searchTitle}
                      onChange={(event) =>
                        updateField(
                          "searchTitle",
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>
                )}

                <p>
                  Esto ayuda a relacionar tu búsqueda con
                  usuarios que ofrecen ese oficio o profesión.
                </p>
              </section>
            )}

            <label>
              Detalles
              <textarea
                placeholder="Contá qué características necesitás..."
                value={formData.searchDetails}
                onChange={(event) =>
                  updateField(
                    "searchDetails",
                    event.target.value
                  )
                }
              />
            </label>
          </div>

          <div className="formBlock">
            <h2>Qué ofrecés</h2>

            <label>
              Categoría
              <select
                value={formData.offerCategory}
                onChange={(event) =>
                  updateField(
                    "offerCategory",
                    event.target.value
                  )
                }
                required
              >
                <option value="">
                  Seleccionar categoría
                </option>

                {categories.map((category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                ))}
              </select>
            </label>

            {formData.offerCategory &&
              !isOfferingService && (
                <label>
                  Producto ofrecido
                  <input
                    placeholder="Ej: Bicicleta rodado 29..."
                    value={formData.offerTitle}
                    onChange={(event) =>
                      updateField(
                        "offerTitle",
                        event.target.value
                      )
                    }
                    required
                  />
                </label>
              )}

            {isOfferingService && (
              <section className="serviceOptionsBox offerServiceOptionsBox">
                <span className="miniLabel">
                  Servicio ofrecido
                </span>

                <label>
                  Profesión o rubro
                  <select
                    value={formData.offerServiceType}
                    onChange={(event) =>
                      updateField(
                        "offerServiceType",
                        event.target.value
                      )
                    }
                    required
                  >
                    <option value="">
                      Seleccionar profesión
                    </option>

                    {serviceTypes.map((service) => (
                      <option
                        key={service}
                        value={service}
                      >
                        {service}
                      </option>
                    ))}
                  </select>
                </label>

                {formData.offerServiceType &&
                  !isOtherService(
                    formData.offerServiceType
                  ) && (
                    <p>
                      El título se completará automáticamente
                      como{" "}
                      <strong>
                        {buildAutomaticServiceTitle(
                          formData.offerServiceType
                        )}
                      </strong>
                      .
                    </p>
                  )}

                {isOtherService(
                  formData.offerServiceType
                ) && (
                  <label>
                    ¿Qué servicio ofrecés?
                    <input
                      placeholder="Ej: Servicio de reparación de calzado"
                      value={formData.offerTitle}
                      onChange={(event) =>
                        updateField(
                          "offerTitle",
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>
                )}

                <label className="serviceCheckRow">
                  <input
                    type="checkbox"
                    checked={formData.offerIsLicensed}
                    onChange={(event) =>
                      updateField(
                        "offerIsLicensed",
                        event.target.checked
                      )
                    }
                  />

                  <span>
                    Soy matriculado y puedo acreditar mi
                    matrícula.
                  </span>
                </label>

                {formData.offerIsLicensed && (
                  <label>
                    Número de matrícula
                    <input
                      placeholder="Ej: Matrícula 123456"
                      value={formData.offerLicenseNumber}
                      onChange={(event) =>
                        updateField(
                          "offerLicenseNumber",
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>
                )}

                <p>
                  El número de matrícula se guardará junto con la
                  publicación para aportar mayor confianza al
                  intercambio.
                </p>
              </section>
            )}

            {formData.offerCategory &&
              !isOfferingService && (
                <label>
                  Estado
                  <select
                    value={formData.offerState}
                    onChange={(event) =>
                      updateField(
                        "offerState",
                        event.target.value
                      )
                    }
                  >
                    <option>Excelente</option>
                    <option>Muy bueno</option>
                    <option>Bueno</option>
                    <option>
                      Funcional con detalles
                    </option>
                  </select>
                </label>
              )}

            <label>
              Descripción
              <textarea
                placeholder="Describí el estado real de lo que ofrecés..."
                value={formData.offerDescription}
                onChange={(event) =>
                  updateField(
                    "offerDescription",
                    event.target.value
                  )
                }
              />
            </label>
          </div>

          <section className="exchangeLocationSection">
            <div className="exchangeLocationHeader">
              <div>
                <span className="miniLabel">Ubicación del intercambio</span>
                <h2>¿Dónde se encuentra lo que ofrecés?</h2>
                <p>
                  Usamos esta ubicación para calcular distancias. Por defecto se
                  usa la localidad cargada en tu perfil.
                </p>
              </div>
            </div>

            {hasProfileLocation ? (
              <div
                className={`profileLocationDefaultBox ${
                  useProfileLocation ? "active" : ""
                }`}
              >
                <div>
                  <span className="miniLabel">
                    {useProfileLocation
                      ? "Usando ubicación de tu perfil"
                      : "Ubicación guardada en tu perfil"}
                  </span>
                  <strong>{buildLocationLabel(profileLocation)}</strong>
                  <p>
                    Esta ubicación se completará automáticamente en tus nuevas
                    publicaciones.
                  </p>
                </div>

                <div className="profileLocationActions">
                  {useProfileLocation ? (
                    <button
                      type="button"
                      className="secondaryButton profileLocationButton"
                      onClick={handleUseCustomLocation}
                      disabled={saving}
                    >
                      Cambiar para esta publicación
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondaryButton profileLocationButton"
                      onClick={handleUseProfileLocation}
                      disabled={saving}
                    >
                      Usar ubicación de mi perfil
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="profileLocationMissingBox">
                <div>
                  <span className="miniLabel">Ubicación de perfil pendiente</span>
                  <strong>No tenés una localidad guardada en tu perfil</strong>
                  <p>
                    Podés seleccionar una localidad para esta publicación o
                    completar tu perfil para que se cargue automáticamente en
                    futuras publicaciones.
                  </p>
                </div>

                <Link to="/usuario" className="secondaryActionLink">
                  Completar perfil
                </Link>
              </div>
            )}

            {useCustomLocation && (
              <div className="customLocationPickerBox">
                <span className="miniLabel">Ubicación específica</span>
                <LocationPicker
                  value={location}
                  onChange={handleLocationChange}
                  disabled={saving}
                />
              </div>
            )}

            {currentLocationLabel && (
              <p className="locationHelperText">
                Ubicación seleccionada: <strong>{currentLocationLabel}</strong>
              </p>
            )}
          </section>

          {isOfferingService ? (
            formData.offerServiceType &&
            serviceImageUrl && (
              <section className="mediaUploadSection">
                <div className="mediaUploadHeader">
                  <div>
                    <span className="miniLabel">
                      Imagen automática
                    </span>
                    <h2>Portada asignada al servicio</h2>
                    <p>
                      Esta imagen se agregará automáticamente a la
                      publicación y no ocupará espacio del límite
                      multimedia de tu plan.
                    </p>
                  </div>
                </div>

                <div className="mediaPreviewGroup">
                  <div className="mediaPreviewGrid">
                    <article className="mediaPreviewCard">
                      <img
                        src={serviceImageUrl}
                        alt={`Imagen de ${formData.offerServiceType}`}
                      />

                      <div className="mediaPreviewInfo">
                        <span>Portada automática</span>
                        <strong>
                          {serviceDefaultMedia?.name ||
                            `Servicio de ${formData.offerServiceType}`}
                        </strong>
                      </div>
                    </article>
                  </div>
                </div>
              </section>
            )
          ) : (
          <section className="mediaUploadSection">
            <div className="mediaUploadHeader">
              <div>
                <span className="miniLabel">Fotos y videos</span>
                <h2>Mostrá el producto que ofrecés</h2>
                <p>
                  Tu plan actual permite hasta {planMaxMedia} archivos entre imágenes y videos. El
                  primer archivo se usará como portada de la publicación.
                </p>
              </div>

              {mediaFiles.length > 0 && (
                <button
                  type="button"
                  className="clearMediaButton"
                  onClick={clearNewMediaFiles}
                  disabled={saving}
                >
                  Limpiar nuevos
                </button>
              )}
            </div>

            <label className="mediaDropzone">
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleMediaChange}
                disabled={saving || planLoading || hasReachedMediaLimit}
              />

              <span className="mediaDropzoneIcon">＋</span>
              <strong>Agregar fotos o videos</strong>
              <small>
                {hasReachedMediaLimit
                  ? `Ya alcanzaste el máximo de ${planMaxMedia} archivos de tu plan`
                  : selectedFilesInfo}
              </small>
            </label>

            {existingMedia.length > 0 && (
              <div className="mediaPreviewGroup">
                <span className="miniLabel">Archivos actuales</span>
                <div className="mediaPreviewGrid">
                  {existingMedia.map((media) => {
                    const mediaDisplayUrl = getMediaDisplayUrl(media);
                    const mediaIsVideo = isVideoMedia(media);
                    const mediaIsProcessing = media.status === "processing";

                    return (
                    <article className="mediaPreviewCard" key={getMediaIdentity(media)}>
                      {mediaIsVideo ? (
                        mediaDisplayUrl && !mediaIsProcessing ? (
                          <video src={mediaDisplayUrl} controls muted />
                        ) : (
                          <div className="mediaPreviewProcessingBox">
                            <span>Video</span>
                            <small>Procesando para web...</small>
                          </div>
                        )
                      ) : (
                        <img src={mediaDisplayUrl} alt={media.name || "Archivo"} />
                      )}

                      <div className="mediaPreviewInfo">
                        <span>{mediaIsVideo ? "Video" : "Foto"}</span>
                        <strong>{media.name || "Archivo cargado"}</strong>
                        {mediaIsProcessing && <small>Procesando para web</small>}
                      </div>

                      <button
                        type="button"
                        className="removeMediaButton"
                        onClick={() => removeExistingMedia(media)}
                        disabled={saving}
                      >
                        ×
                      </button>
                    </article>
                    );
                  })}
                </div>
              </div>
            )}

            {mediaPreviews.length > 0 && (
              <div className="mediaPreviewGroup">
                <span className="miniLabel">Archivos nuevos</span>
                <div className="mediaPreviewGrid">
                  {mediaPreviews.map((preview) => {
                    const sourceFile = mediaFiles.find(
                      (file) =>
                        `${file.name}-${file.size}-${file.lastModified}` ===
                        preview.id
                    );

                    return (
                      <article className="mediaPreviewCard" key={preview.id}>
                        {preview.type === "video" ? (
                          <video src={preview.url} controls muted />
                        ) : (
                          <img src={preview.url} alt={preview.name} />
                        )}

                        <div className="mediaPreviewInfo">
                          <span>{preview.type === "video" ? "Video" : "Foto"}</span>
                          <strong>{preview.name}</strong>
                        </div>

                        <button
                          type="button"
                          className="removeMediaButton"
                          onClick={() => sourceFile && removeMediaFile(sourceFile)}
                          disabled={saving}
                        >
                          ×
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {saving && mediaFiles.length > 0 && (
              <div className="uploadProgressBox">
                <div>
                  <strong>Subiendo archivos</strong>
                  <span>{uploadProgress}%</span>
                </div>

                <progress value={uploadProgress} max="100" />
              </div>
            )}
          </section>
          )}

          {error && <p className="errorText">{error}</p>}

          <button
            type="submit"
            className="primaryButton fullButton"
            disabled={saving || planLoading}
          >
            {planLoading
              ? "Validando plan..."
              : saving
                ? !isOfferingService &&
                  mediaFiles.length > 0
                  ? "Subiendo y guardando..."
                  : "Guardando..."
                : isEditMode
                  ? "Guardar cambios"
                  : "Publicar búsqueda"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default PublishExchange;
