const EARTH_RADIUS_KM = 6371;

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

export function calculateDistanceKm(firstPoint, secondPoint) {
  if (
    firstPoint?.lat === undefined ||
    firstPoint?.lon === undefined ||
    secondPoint?.lat === undefined ||
    secondPoint?.lon === undefined ||
    firstPoint.lat === null ||
    firstPoint.lon === null ||
    secondPoint.lat === null ||
    secondPoint.lon === null
  ) {
    return null;
  }

  const lat1 = toRadians(firstPoint.lat);
  const lat2 = toRadians(secondPoint.lat);
  const deltaLat = toRadians(secondPoint.lat - firstPoint.lat);
  const deltaLon = toRadians(secondPoint.lon - firstPoint.lon);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_KM * c * 10) / 10;
}

export function getExchangePoint(exchange) {
  if (exchange?.location?.lat && exchange?.location?.lon) {
    return { lat: exchange.location.lat, lon: exchange.location.lon };
  }

  if (exchange?.lat && exchange?.lon) {
    return { lat: exchange.lat, lon: exchange.lon };
  }

  return null;
}

export function getUserProfilePoint(profile) {
  const location = profile?.location || profile?.profile?.location;
  if (!location?.lat || !location?.lon) return null;
  return { lat: location.lat, lon: location.lon };
}

export function isExchangeInsideUserRadius(exchange, userProfile) {
  const profile = userProfile?.profile || userProfile;
  const preferences = profile?.preferences;

  if (!profile || !preferences) return true;
  if (preferences.showNationalResults) return true;

  const radiusKm = Number(preferences.searchRadiusKm || 50);
  const userPoint = getUserProfilePoint(profile);
  const exchangePoint = getExchangePoint(exchange);

  if (!userPoint || !exchangePoint) return true;

  const distanceKm = calculateDistanceKm(userPoint, exchangePoint);
  if (distanceKm === null) return true;

  return distanceKm <= radiusKm;
}
