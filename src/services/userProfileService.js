import { updateProfile } from "firebase/auth";
import { get, onValue, ref, serverTimestamp, update } from "firebase/database";
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from "firebase/storage";
import { database, storage } from "./firebase";

export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_PHOTO_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function cleanString(value) {
  return String(value || "").trim();
}

function cleanProfile(profile) {
  return {
    personal: {
      name: cleanString(profile.personal?.name),
      phone: cleanString(profile.personal?.phone),
      photoURL: cleanString(profile.personal?.photoURL),
      photoPath: cleanString(profile.personal?.photoPath),
    },
    location: profile.location || null,
    preferences: {
      searchRadiusKm: Number(profile.preferences?.searchRadiusKm || 50),
      showNationalResults: Boolean(
        profile.preferences?.showNationalResults
      ),
      onlyWithMedia: Boolean(profile.preferences?.onlyWithMedia),
    },
  };
}

function getStoredProfile(data) {
  if (!data?.profile) return null;

  return cleanProfile({
    ...data.profile,
    personal: {
      ...data.profile.personal,
      photoURL:
        data.profile.personal?.photoURL ||
        data.photoURL ||
        "",
      photoPath:
        data.profile.personal?.photoPath ||
        data.photoPath ||
        "",
    },
  });
}

function getFileExtension(file) {
  const extensionByType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return extensionByType[file?.type] || "jpg";
}

function createProfilePhotoPath(userId, file) {
  const extension = getFileExtension(file);

  return `profilePhotos/${userId}/profile-${Date.now()}.${extension}`;
}

async function deleteStoredProfilePhoto(photoPath) {
  if (!photoPath) return;

  try {
    await deleteObject(storageRef(storage, photoPath));
  } catch (error) {
    if (error?.code !== "storage/object-not-found") {
      console.error("No pudimos eliminar la foto de perfil anterior.", error);
    }
  }
}

export function validateProfilePhoto(file) {
  if (!file) {
    throw new Error("Seleccioná una imagen para tu perfil.");
  }

  if (!PROFILE_PHOTO_ALLOWED_TYPES.includes(file.type)) {
    throw new Error(
      "La foto debe estar en formato JPG, PNG o WEBP."
    );
  }

  if (file.size > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error("La foto no puede superar los 5 MB.");
  }

  return true;
}

export function listenUserProfile(userId, callback, onError) {
  if (!userId) return () => {};

  const userRef = ref(database, `users/${userId}`);

  return onValue(
    userRef,
    (snapshot) => {
      const data = snapshot.val() || {};

      callback({
        uid: userId,
        email: data.email || "",
        role: data.role || "user",
        reputation: data.reputation || 0,
        photoURL:
          data.profile?.personal?.photoURL ||
          data.photoURL ||
          "",
        photoPath:
          data.profile?.personal?.photoPath ||
          data.photoPath ||
          "",
        profile: getStoredProfile(data),
      });
    },
    onError
  );
}

export async function getUserProfile(userId) {
  const snapshot = await get(ref(database, `users/${userId}`));
  const data = snapshot.val() || {};

  return getStoredProfile(data);
}

export async function uploadUserProfilePhoto(
  user,
  file,
  onProgress
) {
  if (!user?.uid) {
    throw new Error("Debes iniciar sesión para subir una foto.");
  }

  validateProfilePhoto(file);

  const photoPath = createProfilePhotoPath(user.uid, file);
  const photoReference = storageRef(storage, photoPath);

  const uploadTask = uploadBytesResumable(photoReference, file, {
    contentType: file.type,
    customMetadata: {
      ownerId: user.uid,
      kind: "profile-photo",
    },
  });

  const photoURL = await new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = snapshot.totalBytes
          ? Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            )
          : 0;

        onProgress?.(progress);
      },
      reject,
      async () => {
        try {
          const downloadURL = await getDownloadURL(
            uploadTask.snapshot.ref
          );

          onProgress?.(100);
          resolve(downloadURL);
        } catch (error) {
          reject(error);
        }
      }
    );
  });

  return {
    photoURL,
    photoPath,
  };
}

export async function saveUserProfile(
  user,
  profile,
  {
    photoFile = null,
    removePhoto = false,
    onUploadProgress,
  } = {}
) {
  if (!user) {
    throw new Error("Debes iniciar sesión para guardar tu perfil.");
  }

  const userRef = ref(database, `users/${user.uid}`);
  const currentSnapshot = await get(userRef);
  const currentData = currentSnapshot.val() || {};
  const currentProfile = getStoredProfile(currentData);

  const previousPhotoURL =
    currentProfile?.personal?.photoURL ||
    currentData.photoURL ||
    user.photoURL ||
    "";

  const previousPhotoPath =
    currentProfile?.personal?.photoPath ||
    currentData.photoPath ||
    "";

  let nextPhotoURL =
    profile.personal?.photoURL ||
    previousPhotoURL;

  let nextPhotoPath =
    profile.personal?.photoPath ||
    previousPhotoPath;

  let uploadedPhoto = null;

  if (removePhoto) {
    nextPhotoURL = "";
    nextPhotoPath = "";
  } else if (photoFile) {
    uploadedPhoto = await uploadUserProfilePhoto(
      user,
      photoFile,
      onUploadProgress
    );

    nextPhotoURL = uploadedPhoto.photoURL;
    nextPhotoPath = uploadedPhoto.photoPath;
  }

  const finalProfile = cleanProfile({
    ...profile,
    personal: {
      ...profile.personal,
      photoURL: nextPhotoURL,
      photoPath: nextPhotoPath,
    },
  });

  const nextDisplayName =
    finalProfile.personal.name ||
    user.displayName ||
    user.email ||
    "";

  try {
    /*
      Primero confirmamos el registro en Realtime Database.
      Si las reglas lo rechazan, eliminamos únicamente la foto nueva
      y no dejamos Firebase Auth apuntando a un archivo inexistente.
    */
    const userBasePath = `users/${user.uid}`;

    await update(ref(database), {
      [`${userBasePath}/displayName`]: nextDisplayName,
      [`${userBasePath}/photoURL`]:
        finalProfile.personal.photoURL,
      [`${userBasePath}/photoPath`]:
        finalProfile.personal.photoPath,
      [`${userBasePath}/profile`]: finalProfile,
      [`${userBasePath}/profileCompleted`]: Boolean(
        finalProfile.personal.name &&
          finalProfile.location?.localityId &&
          finalProfile.location?.lat != null &&
          finalProfile.location?.lon != null
      ),
      [`${userBasePath}/updatedAt`]: serverTimestamp(),
    });
  } catch (error) {
    if (uploadedPhoto?.photoPath) {
      await deleteStoredProfilePhoto(uploadedPhoto.photoPath);
    }

    throw error;
  }

  /*
    La sincronización con Authentication se hace después de que
    Realtime Database confirmó el guardado.
  */
  try {
    await updateProfile(user, {
      displayName: nextDisplayName,
      photoURL: finalProfile.personal.photoURL || null,
    });
  } catch (error) {
    console.error(
      "El perfil se guardó, pero no se pudo sincronizar Firebase Auth.",
      error
    );
  }

  if (
    previousPhotoPath &&
    previousPhotoPath !== finalProfile.personal.photoPath
  ) {
    await deleteStoredProfilePhoto(previousPhotoPath);
  }

  return finalProfile;
}
