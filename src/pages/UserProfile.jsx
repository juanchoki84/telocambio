import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import AppNavbar from "../components/AppNavbar";
import LocationPicker from "../components/LocationPicker";
import { useAuth } from "../context/AuthContext";
import {
  listenUserProfile,
  saveUserProfile,
  validateProfilePhoto,
} from "../services/userProfileService";
import { listenUserReputation } from "../services/reputationService";

const radiusOptions = [10, 25, 50, 75, 100, 150, 250, 500];

function normalizeReputation(reputation) {
  const ratingsCount = Number(
    reputation?.ratingsCount ??
      reputation?.totalRatings ??
      reputation?.count ??
      0
  );

  const averageRating = Number(
    reputation?.averageRating ??
      reputation?.ratingAverage ??
      reputation?.average ??
      0
  );

  const completedExchanges = Number(
    reputation?.completedExchanges ??
      reputation?.completedCount ??
      ratingsCount ??
      0
  );

  const positiveRatings = Number(
    reputation?.positiveRatings ??
      reputation?.positiveCount ??
      0
  );

  return {
    ratingsCount,
    averageRating: ratingsCount > 0 ? averageRating : 0,
    completedExchanges,
    positiveRatings,
  };
}

function getInitials(nameOrEmail) {
  const value = String(nameOrEmail || "").trim();

  if (!value) return "U";

  if (value.includes("@")) {
    return value.charAt(0).toUpperCase();
  }

  const words = value.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
}

function ReputationStars({ value = 0 }) {
  const rounded = Math.round(Number(value || 0));

  return (
    <div
      className="profileReputationStars"
      aria-label={`Reputación ${value} de 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rounded ? "active" : ""}>
          ★
        </span>
      ))}
    </div>
  );
}

function UserProfile() {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingReputation, setLoadingReputation] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");

  const [personal, setPersonal] = useState({
    name: "",
    phone: "",
    photoURL: "",
    photoPath: "",
  });
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [photoPreviewURL, setPhotoPreviewURL] = useState("");
  const [removePhoto, setRemovePhoto] = useState(false);

  const [location, setLocation] = useState(null);
  const [preferences, setPreferences] = useState({
    searchRadiusKm: 50,
    showNationalResults: false,
    onlyWithMedia: false,
  });
  const [reputationData, setReputationData] = useState(null);

  const reputation = useMemo(
    () => normalizeReputation(reputationData),
    [reputationData]
  );

  const displayedPhotoURL =
    photoPreviewURL ||
    (!removePhoto
      ? personal.photoURL || user?.photoURL || ""
      : "");

  const profileInitials = getInitials(
    personal.name || user?.displayName || user?.email
  );

  const hasProfilePhoto = Boolean(displayedPhotoURL);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, navigate, user]);

  useEffect(() => {
    return () => {
      if (photoPreviewURL) {
        URL.revokeObjectURL(photoPreviewURL);
      }
    };
  }, [photoPreviewURL]);

  useEffect(() => {
    if (!user) return undefined;

    setLoadingProfile(true);

    const unsubscribe = listenUserProfile(
      user.uid,
      (userData) => {
        const profile = userData.profile;

        setPersonal({
          name:
            profile?.personal?.name ||
            user.displayName ||
            "",
          phone: profile?.personal?.phone || "",
          photoURL:
            profile?.personal?.photoURL ||
            userData.photoURL ||
            user.photoURL ||
            "",
          photoPath:
            profile?.personal?.photoPath ||
            userData.photoPath ||
            "",
        });

        setLocation(profile?.location || null);

        setPreferences({
          searchRadiusKm:
            profile?.preferences?.searchRadiusKm || 50,
          showNationalResults: Boolean(
            profile?.preferences?.showNationalResults
          ),
          onlyWithMedia: Boolean(
            profile?.preferences?.onlyWithMedia
          ),
        });

        setLoadingProfile(false);
      },
      (err) => {
        console.error(err);
        setError("No pudimos cargar tu perfil.");
        setLoadingProfile(false);
      }
    );

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    setLoadingReputation(true);

    const unsubscribe = listenUserReputation(
      user.uid,
      (data) => {
        setReputationData(data);
        setLoadingReputation(false);
      },
      (err) => {
        console.error(err);
        setLoadingReputation(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const updatePersonalField = (field, value) => {
    setPersonal((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updatePreference = (field, value) => {
    setPreferences((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0] || null;

    event.target.value = "";

    if (!file) return;

    setError("");
    setSuccessMessage("");

    try {
      validateProfilePhoto(file);
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    const nextPreviewURL = URL.createObjectURL(file);

    setSelectedPhotoFile(file);
    setPhotoPreviewURL(nextPreviewURL);
    setRemovePhoto(false);
    setUploadProgress(0);
  };

  const handleRemovePhoto = () => {
    setSelectedPhotoFile(null);
    setPhotoPreviewURL("");
    setRemovePhoto(true);
    setUploadProgress(0);
    setError("");
    setSuccessMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
    setUploadProgress(0);

    if (!user) {
      navigate("/login");
      return;
    }

    if (
  !location?.localityId ||
  location?.lat == null ||
  location?.lon == null
) {
      setError(
        "Seleccioná tu provincia y localidad para calcular el radio de búsqueda."
      );
      return;
    }

    setSaving(true);

    try {
      const savedProfile = await saveUserProfile(
        user,
        {
          personal,
          location,
          preferences,
        },
        {
          photoFile: selectedPhotoFile,
          removePhoto,
          onUploadProgress: setUploadProgress,
        }
      );

      setPersonal(savedProfile.personal);
      setSelectedPhotoFile(null);
      setPhotoPreviewURL("");
      setRemovePhoto(false);
      setUploadProgress(0);
      setSuccessMessage("Perfil actualizado correctamente.");
    } catch (err) {
      console.error(err);

      if (err?.code === "storage/unauthorized") {
        setError(
          "Firebase Storage no permitió guardar la foto. Revisá las reglas de Storage."
        );
      } else {
        setError(
          err?.message || "No pudimos guardar tu perfil."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loadingProfile) {
    return (
      <main className="dashboardPage">
        <AppNavbar />
        <p className="loadingText">Cargando perfil...</p>
      </main>
    );
  }

  return (
    <main className="dashboardPage">
      <AppNavbar />

      <section className="profileHeader">
        <span className="badge">Mi perfil</span>
        <h1>Datos personales y preferencias</h1>
        <p>
          Elegí tu foto de perfil, configurá tu ubicación base,
          el rango de búsqueda y consultá tu reputación dentro de
          TeLoCambio.
        </p>
      </section>

      {successMessage && (
        <div className="successNotice">
          <p>{successMessage}</p>
        </div>
      )}

      <section className="profileLayout profileLayoutRefined">
        <form
          className="profileCard profileForm profileFormRefined"
          onSubmit={handleSubmit}
        >
          <div className="profileBlock profilePersonalBlock">
            <span className="miniLabel">Datos personales</span>
            <h2>Información básica</h2>

            <section className="profilePhotoEditor">
              <div
                className={
                  hasProfilePhoto
                    ? "profilePhotoPreview hasPhoto"
                    : "profilePhotoPreview"
                }
              >
                {hasProfilePhoto ? (
                  <img
                    src={displayedPhotoURL}
                    alt="Foto de perfil"
                  />
                ) : (
                  <span>{profileInitials}</span>
                )}
              </div>

              <div className="profilePhotoEditorContent">
                <div>
                  <strong>Foto de perfil</strong>
                  <p>
                    Usá una imagen clara para que otros usuarios
                    puedan reconocerte en propuestas e intercambios.
                  </p>
                </div>

                <div className="profilePhotoActions">
                  <label
                    className={
                      saving
                        ? "profilePhotoUploadButton disabled"
                        : "profilePhotoUploadButton"
                    }
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoChange}
                      disabled={saving}
                    />
                    {hasProfilePhoto
                      ? "Cambiar foto"
                      : "Agregar foto"}
                  </label>

                  {hasProfilePhoto && (
                    <button
                      type="button"
                      className="profilePhotoRemoveButton"
                      onClick={handleRemovePhoto}
                      disabled={saving}
                    >
                      Quitar
                    </button>
                  )}
                </div>

                <small>
                  Formatos JPG, PNG o WEBP. Tamaño máximo: 5 MB.
                </small>

                {selectedPhotoFile && (
                  <div className="profilePhotoSelectedFile">
                    <span>Nueva imagen</span>
                    <strong>{selectedPhotoFile.name}</strong>
                  </div>
                )}

                {saving &&
                  selectedPhotoFile &&
                  uploadProgress > 0 && (
                    <div className="profilePhotoProgress">
                      <div>
                        <span>Subiendo foto...</span>
                        <strong>{uploadProgress}%</strong>
                      </div>

                      <progress
                        max="100"
                        value={uploadProgress}
                      />
                    </div>
                  )}
              </div>
            </section>

            <label>
              Nombre visible
              <input
                value={personal.name}
                onChange={(event) =>
                  updatePersonalField("name", event.target.value)
                }
                placeholder="Ej: Juan Pérez"
                required
              />
            </label>

            <label>
              Email
              <input value={user?.email || ""} disabled />
            </label>

            <label>
              Teléfono / WhatsApp
              <input
                value={personal.phone}
                onChange={(event) =>
                  updatePersonalField("phone", event.target.value)
                }
                placeholder="Ej: 11 1234 5678"
              />
            </label>
          </div>

          <div className="profileBlock profileLocationBlock">
            <span className="miniLabel">Ubicación base</span>
            <h2>Desde dónde buscás intercambios</h2>
            <p className="profileHelpText">
              Esta ubicación se usa para calcular distancia
              aproximada contra las publicaciones.
            </p>

            <LocationPicker
              value={location}
              onChange={setLocation}
              disabled={saving}
            />
          </div>

          <div className="profileBlock fullProfileBlock">
            <span className="miniLabel">Preferencias</span>
            <h2>Rango de búsqueda</h2>

            <div className="radiusOptionsGrid">
              {radiusOptions.map((radius) => (
                <button
                  type="button"
                  className={`radiusOption ${
                    Number(preferences.searchRadiusKm) ===
                      radius &&
                    !preferences.showNationalResults
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    updatePreference(
                      "searchRadiusKm",
                      radius
                    );
                    updatePreference(
                      "showNationalResults",
                      false
                    );
                  }}
                  disabled={saving}
                  key={radius}
                >
                  {radius} km
                </button>
              ))}

              <button
                type="button"
                className={`radiusOption national ${
                  preferences.showNationalResults
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  updatePreference(
                    "showNationalResults",
                    true
                  )
                }
                disabled={saving}
              >
                Todo el país
              </button>
            </div>

            <label className="profileCheck">
              <input
                type="checkbox"
                checked={preferences.onlyWithMedia}
                onChange={(event) =>
                  updatePreference(
                    "onlyWithMedia",
                    event.target.checked
                  )
                }
              />
              Priorizar publicaciones con fotos o videos
            </label>
          </div>

          {error && <p className="errorText">{error}</p>}

          <button
            type="submit"
            className="primaryButton fullButton"
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar perfil"}
          </button>
        </form>

        <aside className="profileSideColumn">
          <section className="profileCard profileSummaryCard profileIdentityCard">
            <div
              className={
                hasProfilePhoto
                  ? "profileIdentityAvatar hasPhoto"
                  : "profileIdentityAvatar"
              }
            >
              {hasProfilePhoto ? (
                <img
                  src={displayedPhotoURL}
                  alt="Foto de perfil"
                />
              ) : (
                <span>{profileInitials}</span>
              )}
            </div>

            <span className="miniLabel">Tu identidad</span>
            <h2>
              {personal.name ||
                user?.displayName ||
                "Usuario"}
            </h2>
            <p>
              Esta es la información visual que podrán reconocer
              otros usuarios dentro de la plataforma.
            </p>
          </section>

          <section className="profileCard profileSummaryCard profileReputationCard">
            <span className="miniLabel">Reputación</span>
            <h2>Tu reputación actual</h2>

            {loadingReputation ? (
              <div className="profileReputationLoading">
                Cargando reputación...
              </div>
            ) : reputation.ratingsCount > 0 ? (
              <>
                <div className="profileReputationMain">
                  <div className="profileReputationScore">
                    <strong>
                      {reputation.averageRating.toFixed(1)}
                    </strong>
                    <span>/ 5</span>
                  </div>

                  <div>
                    <ReputationStars
                      value={reputation.averageRating}
                    />
                    <p>
                      Basado en {reputation.ratingsCount}{" "}
                      calificación
                      {reputation.ratingsCount === 1
                        ? ""
                        : "es"}{" "}
                      de otros usuarios.
                    </p>
                  </div>
                </div>

                <div className="profileReputationStats">
                  <article>
                    <span>Operaciones calificadas</span>
                    <strong>
                      {reputation.completedExchanges}
                    </strong>
                  </article>

                  <article>
                    <span>Calificaciones positivas</span>
                    <strong>
                      {reputation.positiveRatings}
                    </strong>
                  </article>
                </div>
              </>
            ) : (
              <div className="profileNoReputation">
                <strong>Aún sin calificaciones</strong>
                <p>
                  Cuando completes intercambios y otros usuarios
                  te califiquen, tu reputación se verá en
                  propuestas y en tu perfil.
                </p>
              </div>
            )}
          </section>

          <section className="profileCard profileSummaryCard">
            <span className="miniLabel">Resumen</span>
            <h2>Así vamos a filtrar tus sugerencias</h2>

            <div className="profileSummaryItem">
              <span>Ubicación</span>
              <strong>
                {location?.localityName || "Sin configurar"}
              </strong>
              <p>
                {location?.departmentName
                  ? `${location.departmentName} · `
                  : ""}
                {location?.provinceName ||
                  "Completá tu ubicación base"}
              </p>
            </div>

            <div className="profileSummaryItem">
              <span>Radio</span>
              <strong>
                {preferences.showNationalResults
                  ? "Todo el país"
                  : `${preferences.searchRadiusKm} km`}
              </strong>
              <p>
                {preferences.showNationalResults
                  ? "Verás publicaciones nacionales, sin limitar por distancia."
                  : "Verás primero publicaciones dentro de ese rango aproximado."}
              </p>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

export default UserProfile;
