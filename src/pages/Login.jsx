import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  completePhoneMfaEnrollment,
  completePhoneMfaSignIn,
  createInvisibleRecaptchaVerifier,
  getAuthErrorMessage,
  getAuthMultiFactorResolver,
  getMaskedMfaPhone,
  isMultiFactorRequiredError,
  loginUser,
  loginWithGoogle,
  logoutUser,
  normalizePhoneNumber,
  prepareAuthenticatedUser,
  registerUser,
  sendVerificationEmailAndLogout,
  startPhoneMfaEnrollment,
  startPhoneMfaSignIn,
} from "../services/authService";
import LogoMark from "../components/LogoMark";
import { useAuth } from "../context/AuthContext";

const AUTH_STEPS = {
  CREDENTIALS: "credentials",
  EMAIL_SENT: "emailSent",
  ENROLL_PHONE: "enrollPhone",
  ENROLL_CODE: "enrollCode",
  MFA_SEND: "mfaSend",
  MFA_CODE: "mfaCode",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.19-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.86A6.02 6.02 0 0 1 6.08 12c0-.65.11-1.28.31-1.86V7.53H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.47l3.35-2.61Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.01c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.53l3.35 2.61C7.18 7.77 9.39 6.01 12 6.01Z"
      />
    </svg>
  );
}

function Login() {
  const navigate = useNavigate();
  const {
    user: restoredUser,
    authLoading,
  } = useAuth();

  const recaptchaVerifierRef = useRef(null);
  const restoredSessionCheckedRef = useRef(false);

  const [mode, setMode] = useState("login");
  const [step, setStep] = useState(AUTH_STEPS.CREDENTIALS);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);

  const [pendingUser, setPendingUser] = useState(null);
  const [mfaResolver, setMfaResolver] = useState(null);
  const [verificationId, setVerificationId] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+54");
  const [smsCode, setSmsCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [restoringSession, setRestoringSession] =
    useState(true);
  const [error, setError] = useState("");

  const isRegister = mode === "register";

  useEffect(() => {
    return () => {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
    };
  }, []);

  /*
    onAuthStateChanged restaura la sesión almacenada antes de mostrar
    el formulario. Si la sesión ya está completa, el usuario vuelve
    directamente al panel sin ingresar nuevamente sus credenciales.
  */
  useEffect(() => {
    if (
      authLoading ||
      restoredSessionCheckedRef.current
    ) {
      return undefined;
    }

    restoredSessionCheckedRef.current = true;

    if (!restoredUser) {
      setRestoringSession(false);
      return undefined;
    }

    let cancelled = false;

    async function restoreExistingSession() {
      try {
        const authenticationState =
          await prepareAuthenticatedUser(
            restoredUser
          );

        if (cancelled) return;

        if (!authenticationState.emailVerified) {
          setError(
            "Tu sesión estaba guardada, pero todavía necesitás verificar el correo electrónico."
          );
          setRestoringSession(false);
          await logoutUser();
          return;
        }

        if (!authenticationState.mfaEnrolled) {
          setPendingUser(
            authenticationState.user
          );
          setStep(AUTH_STEPS.ENROLL_PHONE);
          setRestoringSession(false);
          return;
        }

        navigate("/panel", {
          replace: true,
        });
      } catch (restoreError) {
        console.error(restoreError);

        if (!cancelled) {
          setError(
            getAuthErrorMessage(restoreError)
          );
          setRestoringSession(false);
        }
      }
    }

    restoreExistingSession();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    restoredUser,
    navigate,
  ]);

  const clearRecaptcha = () => {
    recaptchaVerifierRef.current?.clear();
    recaptchaVerifierRef.current = null;
  };

  const resetSecurityState = () => {
    clearRecaptcha();
    setPendingUser(null);
    setMfaResolver(null);
    setVerificationId("");
    setMaskedPhone("");
    setSmsCode("");
    setSmsConsent(false);
    setError("");
  };

  const returnToCredentials = async () => {
    setLoading(true);

    try {
      await logoutUser();
    } catch (logoutError) {
      console.error(logoutError);
    } finally {
      resetSecurityState();
      setMode("login");
      setStep(AUTH_STEPS.CREDENTIALS);
      setLoading(false);
    }
  };

  const continueAfterPrimaryAuthentication = async (user) => {
    const authenticationState = await prepareAuthenticatedUser(user);

    if (!authenticationState.emailVerified) {
      const unverifiedEmail =
        authenticationState.user.email || email.trim().toLowerCase();

      await sendVerificationEmailAndLogout(authenticationState.user);

      setVerificationEmail(unverifiedEmail);
      setStep(AUTH_STEPS.EMAIL_SENT);
      return;
    }

    if (!authenticationState.mfaEnrolled) {
      setPendingUser(authenticationState.user);
      setStep(AUTH_STEPS.ENROLL_PHONE);
      return;
    }

    navigate("/panel");
  };

  const beginMfaSignIn = (authError) => {
    const resolver = getAuthMultiFactorResolver(authError);

    setMfaResolver(resolver);
    setMaskedPhone(getMaskedMfaPhone(resolver));
    setStep(AUTH_STEPS.MFA_SEND);
  };

  const validateTerms = () => {
    if (acceptedTerms) return true;

    setError(
      "Para continuar necesitás aceptar los Términos y Condiciones."
    );

    return false;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!validateTerms()) return;

    setLoading(true);

    try {
      if (isRegister) {
        const result = await registerUser({
          name,
          email,
          password,
        });

        setVerificationEmail(result.email);
        setStep(AUTH_STEPS.EMAIL_SENT);
        return;
      }

      const user = await loginUser({
        email,
        password,
      });

      await continueAfterPrimaryAuthentication(user);
    } catch (authError) {
      console.error(authError);

      if (isMultiFactorRequiredError(authError)) {
        beginMfaSignIn(authError);
      } else {
        setError(getAuthErrorMessage(authError));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");

    if (!validateTerms()) return;

    setLoading(true);

    try {
      const user = await loginWithGoogle();
      await continueAfterPrimaryAuthentication(user);
    } catch (authError) {
      console.error(authError);

      if (isMultiFactorRequiredError(authError)) {
        beginMfaSignIn(authError);
      } else {
        setError(getAuthErrorMessage(authError));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendEnrollmentSms = async (event) => {
    event.preventDefault();
    setError("");

    if (!pendingUser) {
      setError("La sesión venció. Volvé a ingresar.");
      return;
    }

    if (!smsConsent) {
      setError(
        "Necesitás aceptar el envío del SMS para configurar la seguridad."
      );
      return;
    }

    setLoading(true);
    clearRecaptcha();

    try {
      const verifier = createInvisibleRecaptchaVerifier(
        "mfa-enroll-send-button"
      );

      recaptchaVerifierRef.current = verifier;

      const newVerificationId = await startPhoneMfaEnrollment({
        user: pendingUser,
        phoneNumber,
        recaptchaVerifier: verifier,
      });

      setPhoneNumber(normalizePhoneNumber(phoneNumber));
      setVerificationId(newVerificationId);
      setSmsCode("");
      setStep(AUTH_STEPS.ENROLL_CODE);
    } catch (authError) {
      console.error(authError);
      clearRecaptcha();
      setError(getAuthErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteEnrollment = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await completePhoneMfaEnrollment({
        user: pendingUser,
        verificationId,
        verificationCode: smsCode,
      });

      navigate("/panel");
    } catch (authError) {
      console.error(authError);
      setError(getAuthErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  };

  const handleSendMfaSignInSms = async () => {
    setError("");

    if (!mfaResolver) {
      setError("La sesión de verificación venció. Volvé a ingresar.");
      return;
    }

    setLoading(true);
    clearRecaptcha();

    try {
      const verifier = createInvisibleRecaptchaVerifier(
        "mfa-signin-send-button"
      );

      recaptchaVerifierRef.current = verifier;

      const newVerificationId = await startPhoneMfaSignIn({
        resolver: mfaResolver,
        recaptchaVerifier: verifier,
      });

      setVerificationId(newVerificationId);
      setSmsCode("");
      setStep(AUTH_STEPS.MFA_CODE);
    } catch (authError) {
      console.error(authError);
      clearRecaptcha();
      setError(getAuthErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteMfaSignIn = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await completePhoneMfaSignIn({
        resolver: mfaResolver,
        verificationId,
        verificationCode: smsCode,
      });

      navigate("/panel");
    } catch (authError) {
      console.error(authError);
      setError(getAuthErrorMessage(authError));
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = () => {
    resetSecurityState();
    setMode(isRegister ? "login" : "register");
    setStep(AUTH_STEPS.CREDENTIALS);
    setAcceptedTerms(false);
  };

  const getHeaderContent = () => {
    switch (step) {
      case AUTH_STEPS.EMAIL_SENT:
        return {
          title: "Verificá tu correo",
          description:
            "Antes de configurar la seguridad por SMS, necesitamos confirmar que el correo te pertenece.",
        };

      case AUTH_STEPS.ENROLL_PHONE:
        return {
          title: "Protegé tu cuenta",
          description:
            "Registrá un teléfono para recibir un código cada vez que inicies sesión.",
        };

      case AUTH_STEPS.ENROLL_CODE:
        return {
          title: "Ingresá el código",
          description: `Enviamos un SMS al número ${phoneNumber}.`,
        };

      case AUTH_STEPS.MFA_SEND:
        return {
          title: "Confirmá que sos vos",
          description: `Tu cuenta está protegida. Enviaremos un código a ${maskedPhone}.`,
        };

      case AUTH_STEPS.MFA_CODE:
        return {
          title: "Código de seguridad",
          description: `Ingresá el código enviado a ${maskedPhone}.`,
        };

      default:
        return {
          title: isRegister ? "Crear cuenta" : "Ingresá a tu cuenta",
          description: isRegister
            ? "Creá tu cuenta para publicar qué buscás y qué tenés para ofrecer."
            : "Ingresá para ver tus publicaciones, matches y oportunidades de intercambio.",
        };
    }
  };

  const headerContent = getHeaderContent();

  if (authLoading || restoringSession) {
    return (
      <main className="authPage authPageWithLogoBg">
        <section className="authCard authCardSecure">
          <div className="brand authBrand">
            <LogoMark size="large" />
            <span>TeLoCambio</span>
          </div>

          <h1>Restaurando tu sesión</h1>
          <p>
            Estamos recuperando tu acceso de forma segura.
          </p>

          <p className="loadingText">
            Un momento...
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="authPage authPageWithLogoBg">
      <div className="authLogoBackground" aria-hidden="true">
        <span className="authBgLogo authBgLogoOne">
          <LogoMark size="large" />
        </span>

        <span className="authBgLogo authBgLogoTwo">
          <LogoMark size="large" />
        </span>

        <span className="authBgLogo authBgLogoThree">
          <LogoMark size="large" />
        </span>
      </div>

      <section className="authCard authCardSecure">
        <Link to="/" className="backLink">
          ← Volver al inicio
        </Link>

        <div className="brand authBrand">
          <LogoMark size="large" />
          <span>TeLoCambio</span>
        </div>

        <h1>{headerContent.title}</h1>
        <p>{headerContent.description}</p>

        {step === AUTH_STEPS.CREDENTIALS && (
          <>
            <button
              type="button"
              className="googleAuthButton"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <GoogleIcon />
              <span>
                {loading ? "Procesando..." : "Continuar con Google"}
              </span>
            </button>

            <div className="authDivider">
              <span>o continuá con email</span>
            </div>

            <form className="form" onSubmit={handleSubmit}>
              {isRegister && (
                <label>
                  Nombre
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                  />
                </label>
              )}

              <label>
                Email
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                Contraseña
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />
              </label>

              <label className="termsCheck">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) =>
                    setAcceptedTerms(event.target.checked)
                  }
                  required
                />

                <span>
                  Acepto los{" "}
                  <Link
                    to="/terminos-y-condiciones"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Términos y Condiciones
                  </Link>{" "}
                  y la{" "}
                  <Link
                    to="/privacidad"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Política de Privacidad
                  </Link>
                  .
                </span>
              </label>

              {error && (
                <p className="errorText" role="alert" aria-live="polite">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="primaryButton fullButton"
                disabled={loading}
              >
                {loading
                  ? "Procesando..."
                  : isRegister
                    ? "Crear cuenta"
                    : "Ingresar"}
              </button>
            </form>

            <button
              type="button"
              className="ghostButton"
              onClick={handleModeChange}
              disabled={loading}
            >
              {isRegister
                ? "Ya tengo cuenta"
                : "Todavía no tengo cuenta"}
            </button>
          </>
        )}

        {step === AUTH_STEPS.EMAIL_SENT && (
          <div className="securityStep">
            <div className="securityStepIcon" aria-hidden="true">
              ✉
            </div>

            <div className="securityEmailBox">
              <span>Correo de verificación enviado a</span>
              <strong>{verificationEmail || email}</strong>
            </div>

            <p className="securityHelpText">
              Abrí el enlace que te enviamos y después volvé para iniciar
              sesión. Revisá también la carpeta de spam.
            </p>

            {error && (
              <p className="errorText" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button
              type="button"
              className="primaryButton fullButton"
              onClick={returnToCredentials}
              disabled={loading}
            >
              Volver al ingreso
            </button>
          </div>
        )}

        {step === AUTH_STEPS.ENROLL_PHONE && (
          <form
            className="form securityForm"
            onSubmit={handleSendEnrollmentSms}
          >
            <div className="securityStepIcon" aria-hidden="true">
              🔒
            </div>

            <div className="securityNotice">
              <strong>Autenticación en dos pasos obligatoria</strong>
              <p>
                Además de tu contraseña o cuenta de Google, te pediremos un
                código SMS al iniciar sesión.
              </p>
            </div>

            <label>
              Número de teléfono
              <input
                type="tel"
                placeholder="+5491123456789"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                autoComplete="tel"
                required
              />
              <small className="securityFieldHelp">
                Ingresalo con código de país. Para un celular argentino:
                +54 9 + código de área + número.
              </small>
            </label>

            <label className="smsConsentCheck">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(event) => setSmsConsent(event.target.checked)}
                required
              />
              <span>
                Acepto recibir un SMS de seguridad.
              </span>
            </label>

            {error && (
              <p className="errorText" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button
              id="mfa-enroll-send-button"
              type="submit"
              className="primaryButton fullButton"
              disabled={loading}
            >
              {loading ? "Enviando código..." : "Enviar código por SMS"}
            </button>

            <button
              type="button"
              className="securityCancelButton"
              onClick={returnToCredentials}
              disabled={loading}
            >
              Cancelar y cerrar sesión
            </button>
          </form>
        )}

        {step === AUTH_STEPS.ENROLL_CODE && (
          <form
            className="form securityForm"
            onSubmit={handleCompleteEnrollment}
          >
            <div className="securityStepIcon" aria-hidden="true">
              6
            </div>

            <label>
              Código recibido
              <input
                className="securityCodeInput"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={smsCode}
                onChange={(event) =>
                  setSmsCode(event.target.value.replace(/\D/g, ""))
                }
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </label>

            {error && (
              <p className="errorText" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="primaryButton fullButton"
              disabled={loading}
            >
              {loading
                ? "Verificando..."
                : "Confirmar y proteger mi cuenta"}
            </button>

            <button
              type="button"
              className="securityCancelButton"
              onClick={() => {
                clearRecaptcha();
                setVerificationId("");
                setSmsCode("");
                setStep(AUTH_STEPS.ENROLL_PHONE);
              }}
              disabled={loading}
            >
              Cambiar número o reenviar código
            </button>
          </form>
        )}

        {step === AUTH_STEPS.MFA_SEND && (
          <div className="securityStep">
            <div className="securityStepIcon" aria-hidden="true">
              🔐
            </div>

            <div className="securityPhoneBox">
              <span>Segundo factor registrado</span>
              <strong>{maskedPhone}</strong>
            </div>

            <p className="securityHelpText">
              Presioná el botón para recibir un código de seis dígitos.
            </p>

            {error && (
              <p className="errorText" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button
              id="mfa-signin-send-button"
              type="button"
              className="primaryButton fullButton"
              onClick={handleSendMfaSignInSms}
              disabled={loading}
            >
              {loading ? "Enviando código..." : "Enviar código por SMS"}
            </button>

            <button
              type="button"
              className="securityCancelButton"
              onClick={returnToCredentials}
              disabled={loading}
            >
              Cancelar
            </button>
          </div>
        )}

        {step === AUTH_STEPS.MFA_CODE && (
          <form
            className="form securityForm"
            onSubmit={handleCompleteMfaSignIn}
          >
            <div className="securityStepIcon" aria-hidden="true">
              6
            </div>

            <label>
              Código recibido
              <input
                className="securityCodeInput"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={smsCode}
                onChange={(event) =>
                  setSmsCode(event.target.value.replace(/\D/g, ""))
                }
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </label>

            {error && (
              <p className="errorText" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="primaryButton fullButton"
              disabled={loading}
            >
              {loading ? "Verificando..." : "Confirmar ingreso"}
            </button>

            <button
              type="button"
              className="securityCancelButton"
              onClick={() => {
                clearRecaptcha();
                setVerificationId("");
                setSmsCode("");
                setStep(AUTH_STEPS.MFA_SEND);
              }}
              disabled={loading}
            >
              Solicitar un código nuevo
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

export default Login;
