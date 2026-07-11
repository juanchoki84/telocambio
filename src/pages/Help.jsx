import { useMemo, useState } from "react";
import { Link } from "react-router";
import AppNavbar from "../components/AppNavbar";
import LogoMark from "../components/LogoMark";
import { useAuth } from "../context/AuthContext";
import { createHelpRequest } from "../services/helpService";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";

const helpTopics = [
  { value: "account", label: "Cuenta y acceso" },
  { value: "publication", label: "Publicaciones" },
  { value: "matches", label: "Matches e intereses" },
  { value: "proposals", label: "Propuestas e intercambios" },
  { value: "profile", label: "Perfil y ubicación" },
  { value: "security", label: "Seguridad o denuncia" },
  { value: "technical", label: "Problema técnico" },
  { value: "general", label: "Consulta general" },
];

const priorityOptions = [
  { value: "low", label: "Baja" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

function Help() {
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: user?.displayName || "",
    email: user?.email || "",
    topic: "general",
    priority: "normal",
    subject: "",
    message: "",
    contactPreference: "email",
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const isLoggedIn = Boolean(user?.uid);

  const selectedTopicLabel = useMemo(() => {
    return (
      helpTopics.find((topic) => topic.value === formData.topic)?.label ||
      "Consulta general"
    );
  }, [formData.topic]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!formData.name.trim()) {
      setError("Ingresá tu nombre para poder identificar la consulta.");
      return;
    }

    if (!formData.email.trim()) {
      setError("Ingresá un email de contacto.");
      return;
    }

    if (!formData.subject.trim()) {
      setError("Agregá un asunto para la consulta.");
      return;
    }

    if (formData.message.trim().length < 20) {
      setError("Contanos un poco más. El mensaje debe tener al menos 20 caracteres.");
      return;
    }

    setLoading(true);

    try {
      await createHelpRequest(user, formData);

      setSuccess(
        "Recibimos tu consulta. Te vamos a responder lo antes posible."
      );

      setFormData({
        name: user?.displayName || "",
        email: user?.email || "",
        topic: "general",
        priority: "normal",
        subject: "",
        message: "",
        contactPreference: "email",
      });
    } catch (err) {
      console.error(err);
      setError("No pudimos enviar tu consulta. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="helpPage">
      <AppNavbar />

      {!isLoggedIn && (
        <nav className="legalNavbar">
          <Link to="/" className="brand legalBrandLink">
            <LogoMark />
            <span>TeLoCambio</span>
          </Link>

          <div className="legalNavbarActions">
            <Link to="/login" className="secondaryButton legalNavButton">
              Ingresar
            </Link>

            <Link to="/login" className="primaryButton legalNavButton">
              Publicar intercambio
            </Link>
          </div>
        </nav>
      )}

      <section className="helpHero helpUnifiedHero">
        <div className="helpUnifiedHeroMain">
          <h1>¿Necesitás ayuda con TeLoCambio?</h1>
          <small>Soporte directo desde la plataforma</small>
        </div>

        <div className="helpUnifiedHeroIntro">
          <span className="badge">
            <HelpCircle size={16} strokeWidth={2.4} />
            Centro de ayuda
          </span>

          <p>
            Completá el formulario y contanos qué está pasando. Mientras más
            detalle nos compartas, más rápido vamos a poder ayudarte.
          </p>
        </div>
      </section>

      <section className="helpLayout">
        <form className="helpFormCard" onSubmit={handleSubmit}>
          <div className="helpFormHeader">
            <span className="miniLabel">Formulario</span>
            <h2>Contanos qué necesitás</h2>
            <p>
              Tipo de ayuda seleccionada: <strong>{selectedTopicLabel}</strong>
            </p>
          </div>

          <div className="helpFormGrid">
            <label>
              Nombre
              <input
                type="text"
                name="name"
                placeholder="Tu nombre"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Email
              <input
                type="email"
                name="email"
                placeholder="tu@email.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Tipo de ayuda
              <select
                name="topic"
                value={formData.topic}
                onChange={handleChange}
              >
                {helpTopics.map((topic) => (
                  <option key={topic.value} value={topic.value}>
                    {topic.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Prioridad
              <select
                name="priority"
                value={formData.priority}
                onChange={handleChange}
              >
                {priorityOptions.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="helpFullField">
              Asunto
              <input
                type="text"
                name="subject"
                placeholder="Ej: No puedo publicar un intercambio"
                value={formData.subject}
                onChange={handleChange}
                required
              />
            </label>

            <label className="helpFullField">
              Mensaje
              <textarea
                name="message"
                placeholder="Describí el problema o consulta con el mayor detalle posible."
                value={formData.message}
                onChange={handleChange}
                required
              />
            </label>

            <label className="helpFullField">
              Preferencia de contacto
              <select
                name="contactPreference"
                value={formData.contactPreference}
                onChange={handleChange}
              >
                <option value="email">Responder por email</option>
                <option value="app">Responder dentro de la app</option>
                <option value="both">Email y app</option>
              </select>
            </label>
          </div>

          {error && <p className="errorText">{error}</p>}
          {success && <p className="successNotice helpSuccessNotice">{success}</p>}

          <button
            type="submit"
            className="primaryButton fullButton"
            disabled={loading}
          >
            {loading ? "Enviando consulta..." : "Enviar consulta"}
          </button>
        </form>

        <aside className="helpSideColumn">
          <article className="helpInfoCard">
            <span>
              <Clock size={22} strokeWidth={2.3} />
            </span>
            <h3>Tiempo de respuesta</h3>
            <p>
              Las consultas normales se revisan por orden de llegada. Las
              urgentes tienen prioridad.
            </p>
          </article>

          <article className="helpInfoCard">
            <span>
              <ShieldCheck size={22} strokeWidth={2.3} />
            </span>
            <h3>Seguridad</h3>
            <p>
              Si tu consulta es por una situación sospechosa, elegí “Seguridad o
              denuncia” y agregá todos los detalles posibles.
            </p>
          </article>

          <article className="helpInfoCard">
            <span>
              <Mail size={22} strokeWidth={2.3} />
            </span>
            <h3>No compartas datos sensibles</h3>
            <p>
              No envíes contraseñas, datos completos de tarjeta ni códigos de
              verificación.
            </p>
          </article>

          <article className="helpEmergencyCard">
            <AlertCircle size={24} strokeWidth={2.4} />
            <div>
              <strong>¿Es una urgencia?</strong>
              <p>
                En casos de riesgo personal o fraude grave, priorizá canales
                oficiales y autoridades correspondientes.
              </p>
            </div>
          </article>

        </aside>
      </section>

      <section className="helpFaqSection">
        <div className="sectionHeader homeCenteredHeader">
          <span className="eyebrow">Ayuda rápida</span>
          <h2>Consultas frecuentes</h2>
        </div>

        <div className="helpFaqGrid">
          <article>
            <CheckCircle2 size={24} strokeWidth={2.3} />
            <h3>No puedo publicar</h3>
            <p>
              Revisá que hayas completado la categoría, la descripción, la
              ubicación y los archivos requeridos para la publicación.
            </p>
          </article>

          <article>
            <CheckCircle2 size={24} strokeWidth={2.3} />
            <h3>No veo mis matches</h3>
            <p>
              Los matches dependen de tus publicaciones activas, tu ubicación,
              tus intereses y la disponibilidad de publicaciones compatibles.
            </p>
          </article>

          <article>
            <CheckCircle2 size={24} strokeWidth={2.3} />
            <h3>No puedo completar un intercambio</h3>
            <p>
              Revisá que la propuesta esté aceptada. Desde Propuestas podés
              abrir el chat, coordinar el punto seguro, finalizar y calificar
              la operación.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

export default Help;