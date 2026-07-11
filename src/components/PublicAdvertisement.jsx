import { useEffect, useMemo, useState } from "react";

function getAssetUrl(
  advertisement,
  preferredSlot,
  fallbackSlots = []
) {
  const slots = [preferredSlot, ...fallbackSlots];

  for (const slot of slots) {
    const asset = advertisement?.assets?.[slot];
    const url = asset?.url || asset?.downloadUrl || "";

    if (url) return url;
  }

  return "";
}

function PublicAdvertisement({
  advertisements = [],
  variant = "feed",
  className = "",
  rotationMs = 8000,
}) {
  const availableAdvertisements = useMemo(
    () => advertisements.filter(Boolean),
    [advertisements]
  );

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= availableAdvertisements.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, availableAdvertisements.length]);

  useEffect(() => {
    if (availableAdvertisements.length <= 1) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((current) =>
        current >= availableAdvertisements.length - 1
          ? 0
          : current + 1
      );
    }, rotationMs);

    return () => window.clearInterval(intervalId);
  }, [availableAdvertisements.length, rotationMs]);

  if (!availableAdvertisements.length) {
    return null;
  }

  const advertisement =
    availableAdvertisements[activeIndex] ||
    availableAdvertisements[0];

  const preferredSlot =
    variant === "sidebar" || variant === "feed"
      ? "square"
      : "desktop";

  const fallbackSlots =
    variant === "sidebar" || variant === "feed"
      ? ["mobile", "desktop"]
      : ["square", "mobile"];

  const imageUrl = getAssetUrl(
    advertisement,
    preferredSlot,
    fallbackSlots
  );

  if (!imageUrl) {
    return null;
  }

  const destinationUrl =
    advertisement?.destinationUrl || "";

  const campaignName =
    advertisement?.campaignName ||
    advertisement?.companyName ||
    "Publicidad";

  const content = (
    <article
      className={`publicAdvertisement publicAdvertisement-${variant} ${className}`.trim()}
    >
      <div className="publicAdvertisementMedia">
        <img
          src={imageUrl}
          alt={campaignName}
          loading="lazy"
          decoding="async"
        />

        <span className="publicAdvertisementLabel">
          Publicidad
        </span>

        {availableAdvertisements.length > 1 && (
          <div
            className="publicAdvertisementDots"
            aria-label="Publicidades disponibles"
          >
            {availableAdvertisements.map((item, index) => (
              <button
                type="button"
                key={item.id || index}
                className={index === activeIndex ? "active" : ""}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveIndex(index);
                }}
                aria-label={`Ver publicidad ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );

  if (!destinationUrl) {
    return content;
  }

  return (
    <a
      className="publicAdvertisementLink"
      href={destinationUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label={`Abrir publicidad de ${campaignName}`}
    >
      {content}
    </a>
  );
}

export default PublicAdvertisement;
