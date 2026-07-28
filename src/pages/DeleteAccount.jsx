import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  KeyRound,
  Mail,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import AppNavbar from "../components/AppNavbar";
import LogoMark from "../components/LogoMark";
import { useAuth } from "../context/AuthContext";
import { createHelpRequest } from "../services/helpService";

const INITIAL_FORM = {
  name: "",
  email: "",
  detail: "",
};

function DeleteAccount() {
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    ...INITIAL_FORM,
    name: user?.displayName || "",
    email: user?.email || "",
  });

  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const isLoggedIn = Boolean(user?.uid);

  const accountEmail = useMemo(
    () => formData.email.trim().toLowerCase(),
    [formData.email]
  );

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Eliminar cuenta | TeLoCambio";

    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    setFormData((current) => ({
      ...current,
      name: current.name || user.displayName || "",
      email: current.email || user.email || "",
    }));
  }, [user]);

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

    const cleanName = formData.name.trim();
    const cleanEmail = accountEmail;
    const cleanDetail = formData.detail.trim();

    if (!cleanName) {
      setError("Ingresá el nombre asociado a la cuenta.");
      return;
    }

    if (!cleanEmail) {
      setError("Ingresá el correo de la cuenta que querés eliminar.");
      return;
    }

    if (!accepted) {
      setError(
        "Confirmá que entendés que la eliminación será definitiva."
      );
      return;
    }

    setLoading(true);

    try {
      const message = [
        "Solicito la eliminación definitiva de mi cuenta de TeLoCambio.",
        `Nombre informado: ${cleanName}.`,
        `Correo de la cuenta: ${cleanEmail}.`,
        cleanDetail
          ? `Información adicional: ${cleanDetail}`
          : "Sin información adicional.",
        "Confirmo que entiendo que la cuenta y los datos asociados no podrán recuperarse.",
      ].join(" ");

      await createHelpRequest(user, {
        name: cleanName,
        email: cleanEmail,
        topic: "account",
        priority: "high",
        subject: "Solicitud de eliminación definitiva de cuenta",
        message,
        contactPreference: "email",
      });

      setSuccess(
        "Recibimos tu solicitud. Vamos a escribirte al correo indicado para verificar que la cuenta te pertenece antes de eliminarla."
      );

      setFormData({
        ...INITIAL_FORM,
        name: user?.displayName || "",
        email: user?.email || "",
      });

      setAccepted(false);
    } catch (requestError) {
      console.error(requestError);

      setError(
        "No pudimos registrar la solicitud. Revisá los datos e intentá nuevamente."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="accountDeletionPage">
      <AppNavbar />

      {!isLoggedIn && (
        <nav className="legalNavbar">
          <Link to="/" className="brand legalBrandLink">
            <LogoMark />
            <span>TeLoCambio</span>
          </Link>

          <div className="legalNavbarActions">
            <Link
              to="/login"
              className="secondaryButton legalNavButton"
            >
              Ingresar
            </Link>

            <Link
              to="/ayuda"
              className="primaryButton legalNavButton"
            >
              Centro de ayuda
            </Link>
          </div>
        </nav>
      )}

      <section className="accountDeletionHero">
        <div className="accountDeletionHeroMain">
          <span className="badge">
            <Trash2 size={16} strokeWidth={2.4} />
            Gestión de cuenta
          </span>

          <h1>Eliminar tu cuenta de TeLoCambio</h1>

          <p>
            Podés eliminarla directamente desde la aplicación o iniciar
            una solicitud desde esta página cuando ya no tengas acceso a
            la app.
          </p>
        </div>

        <aside className="accountDeletionHeroCard">
          <ShieldCheck size={38} strokeWidth={2.2} />

          <strong>Protegemos tu identidad</strong>

          <p>
            Nunca te vamos a pedir la contraseña, códigos de verificación
            ni datos completos de pago para gestionar la eliminación.
          </p>
        </aside>
      </section>

      <section className="accountDeletionSteps">
        <article>
          <span>
            <KeyRound size={23} />
          </span>

          <div>
            <strong>Opción más rápida</strong>
            <p>
              En la app: Perfil → Eliminar mi cuenta → escribir
              “ELIMINAR”.
            </p>
          </div>
        </article>

        <article>
          <span>
            <Mail size={23} />
          </span>

          <div>
            <strong>Solicitud desde la web</strong>
            <p>
              Completá el formulario con el correo asociado a la cuenta.
            </p>
          </div>
        </article>

        <article>
          <span>
            <UserCheck size={23} />
          </span>

          <div>
            <strong>Verificación</strong>
            <p>
              Confirmaremos la titularidad antes de procesar la solicitud.
            </p>
          </div>
        </article>
      </section>

      <section className="accountDeletionLayout">
        <form
          className="accountDeletionFormCard"
          onSubmit={handleSubmit}
        >
          <div className="accountDeletionFormHeader">
            <span className="miniLabel">Solicitud alternativa</span>
            <h2>Pedí la eliminación desde la web</h2>
            <p>
              Este formulario está disponible aunque hayas desinstalado
              la aplicación o no puedas ingresar.
            </p>
          </div>

          <div className="accountDeletionFormGrid">
            <label>
              Nombre asociado a la cuenta
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                maxLength={150}
                autoComplete="name"
                placeholder="Tu nombre"
                disabled={loading}
                required
              />
            </label>

            <label>
              Correo de la cuenta
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                maxLength={320}
                autoComplete="email"
                placeholder="tu@email.com"
                disabled={loading}
                required
              />
            </label>

            <label className="accountDeletionFullField">
              Información adicional
              <textarea
                name="detail"
                value={formData.detail}
                onChange={handleChange}
                maxLength={1500}
                placeholder="Podés indicar por qué no tenés acceso a la app o cualquier dato que ayude a identificar la cuenta. No escribas contraseñas ni códigos."
                disabled={loading}
              />
            </label>
          </div>

          <label className="accountDeletionCheck">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => {
                setAccepted(event.target.checked);
                setError("");
                setSuccess("");
              }}
              disabled={loading}
            />

            <span>
              Entiendo que, una vez verificada y procesada, la eliminación
              será definitiva y los datos no podrán recuperarse.
            </span>
          </label>

          {error && (
            <p className="accountDeletionError">
              <AlertTriangle size={19} />
              <span>{error}</span>
            </p>
          )}

          {success && (
            <div className="accountDeletionSuccess" role="status">
              <CheckCircle2 size={24} />
              <div>
                <strong>Solicitud registrada</strong>
                <p>{success}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="accountDeletionSubmitButton"
            disabled={loading}
          >
            {loading ? "Registrando solicitud..." : "Solicitar eliminación"}
          </button>

          <p className="accountDeletionFormNotice">
            Enviar este formulario inicia la solicitud, pero no elimina la
            cuenta automáticamente. Primero verificaremos que el correo
            pertenece al titular.
          </p>
        </form>

        <aside className="accountDeletionSideColumn">
          <article className="accountDeletionInfoCard">
            <Database size={25} />

            <h2>Datos que se eliminan</h2>

            <ul>
              <li>Cuenta y perfil.</li>
              <li>Publicaciones, fotos y videos.</li>
              <li>Propuestas e intereses relacionados.</li>
              <li>Chats, mensajes y adjuntos relacionados.</li>
              <li>Favoritos y tokens de notificaciones.</li>
              <li>Calificaciones y reputación asociadas.</li>
            </ul>
          </article>

          <article className="accountDeletionInfoCard">
            <Clock3 size={25} />

            <h2>Qué sucede después</h2>

            <p>
              Te contactaremos por email para verificar la titularidad.
              Cuando la verificación esté completa, procesaremos la
              eliminación definitiva.
            </p>
          </article>

          <article className="accountDeletionWarningCard">
            <AlertTriangle size={24} />

            <div>
              <strong>No compartas datos sensibles</strong>
              <p>
                TeLoCambio nunca solicitará contraseñas, códigos MFA ni
                códigos recibidos por SMS.
              </p>
            </div>
          </article>

          <div className="accountDeletionSideActions">
            {isLoggedIn ? (
              <Link to="/usuario" className="primaryButton">
                Ir a mi perfil
              </Link>
            ) : (
              <Link to="/login" className="primaryButton">
                Ingresar a mi cuenta
              </Link>
            )}

            <Link to="/privacidad" className="secondaryButton">
              Ver política de privacidad
            </Link>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default DeleteAccount;
