const SERVICE_IMAGE_BASE_PATH = "/images/services";

const SERVICE_IMAGE_FILES = {
  Gasista: "servicio-gasista.png",
  Electricista: "servicio-electricista.png",
  Plomero: "servicio-plomero.png",
  Cerrajero: "servicio-cerrajero.png",
  Pintor: "servicio-pintor.png",
  Albañil: "servicio-albanil.png",
  Mecánico: "servicio-mecanico.png",
  Otro: "servicio-otro.png",
};

export function getServiceImageFileName(serviceType) {
  if (!serviceType) return "";

  return (
    SERVICE_IMAGE_FILES[serviceType] ||
    SERVICE_IMAGE_FILES.Otro
  );
}

export function getServiceImageUrl(serviceType) {
  const fileName = getServiceImageFileName(serviceType);

  return fileName
    ? `${SERVICE_IMAGE_BASE_PATH}/${fileName}`
    : "";
}

export function buildServiceDefaultMedia(serviceType) {
  const fileName = getServiceImageFileName(serviceType);
  const imageUrl = getServiceImageUrl(serviceType);

  if (!fileName || !imageUrl) {
    return null;
  }

  const mediaId = `service-default-${fileName.replace(
    /\.(png|jpe?g|webp)$/i,
    ""
  )}`;

  return {
    mediaId,
    type: "image",
    status: "ready",
    url: imageUrl,
    downloadUrl: imageUrl,
    path: "",
    fullPath: "",
    originalUrl: imageUrl,
    originalDownloadUrl: imageUrl,
    originalPath: "",
    originalFullPath: "",
    bucket: "",
    name: fileName,
    contentType: "image/png",
    originalContentType: "image/png",
    size: 0,
    uploadedAt: 0,
    isServiceDefault: true,
    serviceType,
  };
}
