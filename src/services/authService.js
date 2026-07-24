import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getMultiFactorResolver,
  GoogleAuthProvider,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  reload,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  get,
  ref,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { auth, database } from "./firebase";
import {
  buildUserPlanSnapshot,
  FALLBACK_FREE_PLAN,
} from "./planService";

auth.useDeviceLanguage();

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account",
});

let localPersistencePromise = null;

/*
  Firebase Auth conserva la sesión en el almacenamiento local del
  navegador. La configuración se aplica antes de cualquier ingreso
  para que la sesión sobreviva al cierre de pestañas, del navegador
  y a reinicios del equipo.
*/
export function ensurePersistentAuthSession() {
  if (!localPersistencePromise) {
    localPersistencePromise = setPersistence(
      auth,
      browserLocalPersistence
    ).catch((error) => {
      localPersistencePromise = null;
      throw error;
    });
  }

  return localPersistencePromise;
}

function getEmailActionSettings() {
  if (typeof window === "undefined") return undefined;

  return {
    url: `${window.location.origin}/login`,
    handleCodeInApp: false,
  };
}

function getProviderId(user) {
  return user?.providerData?.[0]?.providerId || "password";
}

function getSafeDisplayName(user, fallbackName = "") {
  const cleanFallbackName = String(fallbackName || "").trim();
  const cleanDisplayName = String(user?.displayName || "").trim();

  if (cleanDisplayName) return cleanDisplayName;
  if (cleanFallbackName) return cleanFallbackName;

  return String(user?.email || "")
    .split("@")[0]
    .trim();
}

function createAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function buildInitialFreePlan() {
  const plan = buildUserPlanSnapshot(FALLBACK_FREE_PLAN, {
    billingProvider: "system",
    billingCycle: "monthly",
    updatedBy: "system",
  });

  return {
    ...plan,
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function normalizePhoneNumber(value) {
  return String(value || "")
    .trim()
    .replace(/[\s()-]/g, "");
}

export function isValidE164PhoneNumber(value) {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhoneNumber(value));
}

export async function ensureUserRecord(user, fallbackName = "") {
  if (!user?.uid) {
    throw createAuthError(
      "auth/missing-user",
      "No encontramos un usuario autenticado."
    );
  }

  const userRef = ref(database, `users/${user.uid}`);
  const snapshot = await get(userRef);
  const name = getSafeDisplayName(user, fallbackName);

  if (!snapshot.exists()) {
    await set(userRef, {
      uid: user.uid,
      name,
      email: user.email || "",
      photoURL: user.photoURL || "",
      role: "user",
      reputation: 0,
      exchangesCompleted: 0,
      plan: buildInitialFreePlan(),
      emailVerified: Boolean(user.emailVerified),
      mfaEnabled: multiFactor(user).enrolledFactors.length > 0,
      authProvider: getProviderId(user),
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });

    return;
  }

  /*
    El uid se guarda únicamente al crear el registro.
    En usuarios existentes es un dato inmutable y las reglas actuales
    no permiten reescribirlo durante cada inicio de sesión.
  */
  await update(userRef, {
    name,
    email: user.email || "",
    photoURL: user.photoURL || "",
    emailVerified: Boolean(user.emailVerified),
    mfaEnabled: multiFactor(user).enrolledFactors.length > 0,
    authProvider: getProviderId(user),
    lastLoginAt: serverTimestamp(),
  });
}

export async function registerUser({ name, email, password }) {
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();

  const userCredential = await createUserWithEmailAndPassword(
    auth,
    cleanEmail,
    password
  );

  const user = userCredential.user;

  try {
    await updateProfile(user, {
      displayName: cleanName,
    });

    await ensureUserRecord(user, cleanName);

    const actionSettings = getEmailActionSettings();

    if (actionSettings) {
      await sendEmailVerification(user, actionSettings);
    } else {
      await sendEmailVerification(user);
    }

    return {
      user,
      email: user.email || cleanEmail,
    };
  } finally {
    await signOut(auth);
  }
}

export async function loginUser({ email, password }) {
  const cleanEmail = String(email || "").trim().toLowerCase();

  await ensurePersistentAuthSession();

  const userCredential = await signInWithEmailAndPassword(
    auth,
    cleanEmail,
    password
  );

  return userCredential.user;
}

export async function loginWithGoogle() {
  await ensurePersistentAuthSession();

  const userCredential = await signInWithPopup(
    auth,
    googleProvider
  );

  return userCredential.user;
}

export function isMultiFactorRequiredError(error) {
  return error?.code === "auth/multi-factor-auth-required";
}

export function getAuthMultiFactorResolver(error) {
  if (!isMultiFactorRequiredError(error)) {
    throw error;
  }

  return getMultiFactorResolver(auth, error);
}

export function getPhoneFactorHint(resolver) {
  return (
    resolver?.hints?.find(
      (hint) => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID
    ) || null
  );
}

export function getMaskedMfaPhone(resolver) {
  return getPhoneFactorHint(resolver)?.phoneNumber || "tu teléfono registrado";
}

export async function prepareAuthenticatedUser(user) {
  if (!user) {
    throw createAuthError(
      "auth/missing-user",
      "No encontramos un usuario autenticado."
    );
  }

  await reload(user);

  const refreshedUser = auth.currentUser || user;

  await ensureUserRecord(refreshedUser);

  return {
    user: refreshedUser,
    emailVerified: Boolean(refreshedUser.emailVerified),
    mfaEnrolled: multiFactor(refreshedUser).enrolledFactors.length > 0,
  };
}

export async function sendVerificationEmailAndLogout(user) {
  if (!user) {
    throw createAuthError(
      "auth/missing-user",
      "No encontramos un usuario autenticado."
    );
  }

  try {
    const actionSettings = getEmailActionSettings();

    if (actionSettings) {
      await sendEmailVerification(user, actionSettings);
    } else {
      await sendEmailVerification(user);
    }
  } finally {
    await signOut(auth);
  }
}

export function createInvisibleRecaptchaVerifier(buttonId) {
  return new RecaptchaVerifier(auth, buttonId, {
    size: "invisible",
  });
}

export async function startPhoneMfaEnrollment({
  user,
  phoneNumber,
  recaptchaVerifier,
}) {
  if (!user) {
    throw createAuthError(
      "auth/missing-user",
      "No encontramos un usuario autenticado."
    );
  }

  await reload(user);

  const refreshedUser = auth.currentUser || user;

  if (!refreshedUser.emailVerified) {
    throw createAuthError(
      "auth/unverified-email",
      "Primero necesitás verificar tu correo electrónico."
    );
  }

  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (!isValidE164PhoneNumber(normalizedPhoneNumber)) {
    throw createAuthError(
      "auth/invalid-phone-number",
      "Ingresá el número con código de país. Ejemplo: +5491123456789."
    );
  }

  const multiFactorSession = await multiFactor(refreshedUser).getSession();
  const phoneAuthProvider = new PhoneAuthProvider(auth);

  return phoneAuthProvider.verifyPhoneNumber(
    {
      phoneNumber: normalizedPhoneNumber,
      session: multiFactorSession,
    },
    recaptchaVerifier
  );
}

export async function completePhoneMfaEnrollment({
  user,
  verificationId,
  verificationCode,
}) {
  if (!user) {
    throw createAuthError(
      "auth/missing-user",
      "No encontramos un usuario autenticado."
    );
  }

  const cleanCode = String(verificationCode || "").trim();

  if (!/^\d{6}$/.test(cleanCode)) {
    throw createAuthError(
      "auth/invalid-verification-code",
      "Ingresá el código de 6 dígitos."
    );
  }

  const credential = PhoneAuthProvider.credential(
    verificationId,
    cleanCode
  );

  const assertion = PhoneMultiFactorGenerator.assertion(credential);

  await multiFactor(user).enroll(assertion, "Teléfono principal");
  await user.getIdToken(true);

  await update(ref(database, `users/${user.uid}`), {
    emailVerified: true,
    mfaEnabled: true,
    mfaUpdatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  });

  return user;
}

export async function startPhoneMfaSignIn({
  resolver,
  recaptchaVerifier,
}) {
  const phoneHint = getPhoneFactorHint(resolver);

  if (!phoneHint) {
    throw createAuthError(
      "auth/unsupported-second-factor",
      "La cuenta no tiene un teléfono compatible configurado."
    );
  }

  const phoneAuthProvider = new PhoneAuthProvider(auth);

  return phoneAuthProvider.verifyPhoneNumber(
    {
      multiFactorHint: phoneHint,
      session: resolver.session,
    },
    recaptchaVerifier
  );
}

export async function completePhoneMfaSignIn({
  resolver,
  verificationId,
  verificationCode,
}) {
  const cleanCode = String(verificationCode || "").trim();

  if (!/^\d{6}$/.test(cleanCode)) {
    throw createAuthError(
      "auth/invalid-verification-code",
      "Ingresá el código de 6 dígitos."
    );
  }

  const credential = PhoneAuthProvider.credential(
    verificationId,
    cleanCode
  );

  const assertion = PhoneMultiFactorGenerator.assertion(credential);

  /*
    Reafirmamos la persistencia antes de completar el segundo factor.
    Esto cubre tanto el ingreso por email como el ingreso con Google.
  */
  await ensurePersistentAuthSession();

  const userCredential = await resolver.resolveSignIn(assertion);

  await ensureUserRecord(userCredential.user);

  await update(ref(database, `users/${userCredential.user.uid}`), {
    emailVerified: true,
    mfaEnabled: true,
    lastLoginAt: serverTimestamp(),
  });

  return userCredential.user;
}

export function getAuthErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use":
      "Ya existe una cuenta registrada con ese correo.",
    "auth/invalid-email":
      "El correo electrónico ingresado no es válido.",
    "auth/weak-password":
      "La contraseña es demasiado débil. Usá al menos 6 caracteres.",
    "auth/invalid-credential":
      "El correo o la contraseña no son correctos.",
    "auth/wrong-password":
      "El correo o la contraseña no son correctos.",
    "auth/user-not-found":
      "El correo o la contraseña no son correctos.",
    "auth/user-disabled":
      "Esta cuenta fue deshabilitada.",
    "auth/popup-closed-by-user":
      "La ventana de Google se cerró antes de completar el ingreso.",
    "auth/popup-blocked":
      "El navegador bloqueó la ventana de Google. Habilitá las ventanas emergentes e intentá nuevamente.",
    "auth/cancelled-popup-request":
      "Ya hay una ventana de ingreso abierta.",
    "auth/network-request-failed":
      "No pudimos conectarnos con Firebase. Revisá tu conexión.",
    "auth/web-storage-unsupported":
      "El navegador está bloqueando el almacenamiento necesario para mantener la sesión. Habilitá las cookies y el almacenamiento del sitio.",
    "auth/too-many-requests":
      "Se realizaron demasiados intentos. Esperá unos minutos e intentá nuevamente.",
    "auth/invalid-phone-number":
      "Ingresá el número con código de país. Ejemplo: +5491123456789.",
    "auth/missing-phone-number":
      "Ingresá un número de teléfono.",
    "auth/quota-exceeded":
      "Se alcanzó temporalmente el límite de mensajes SMS.",
    "auth/captcha-check-failed":
      "No pudimos validar el reCAPTCHA. Intentá nuevamente.",
    "auth/invalid-verification-code":
      "El código ingresado no es correcto.",
    "auth/code-expired":
      "El código venció. Solicitá uno nuevo.",
    "auth/session-expired":
      "La sesión de verificación venció. Solicitá un código nuevo.",
    "auth/second-factor-already-in-use":
      "Ese teléfono ya está configurado como segundo factor.",
    "auth/unsupported-first-factor":
      "Este método de ingreso no admite autenticación multifactor.",
    "auth/unsupported-second-factor":
      "La cuenta no tiene un teléfono compatible configurado.",
    "auth/requires-recent-login":
      "Por seguridad, volvé a iniciar sesión antes de configurar el teléfono.",
    "auth/unverified-email":
      "Primero necesitás verificar tu correo electrónico.",
    "auth/account-exists-with-different-credential":
      "Ya existe una cuenta con ese correo usando otro método de ingreso.",
  };

  return (
    messages[error?.code] ||
    error?.message ||
    "No pudimos completar la operación. Intentá nuevamente."
  );
}

export async function logoutUser() {
  await signOut(auth);
}
