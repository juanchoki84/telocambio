const GEOREF_BASE_URL = "https://apis.datos.gob.ar/georef/api";
const CACHE_PREFIX = "telocambio_georef_";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MIN_SEARCH_LENGTH = 2;
const MAX_PROVINCE_LOCALITIES = 5000;

const memoryCache = new Map();
const inflightRequests = new Map();

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getCachedValue(key) {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  try {
    const rawValue = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!rawValue) return null;

    const parsedValue = JSON.parse(rawValue);
    const isExpired = Date.now() - parsedValue.createdAt > CACHE_TTL_MS;

    if (isExpired) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }

    memoryCache.set(key, parsedValue.data);
    return parsedValue.data;
  } catch (error) {
    console.warn("No se pudo leer cache geográfica", error);
    return null;
  }
}

function setCachedValue(key, data) {
  memoryCache.set(key, data);

  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ createdAt: Date.now(), data })
    );
  } catch (error) {
    // Si localStorage se queda sin espacio, seguimos usando cache en memoria.
    console.warn("No se pudo guardar cache geográfica", error);
  }
}

async function fetchWithRetry(url, retries = 1) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url);

    if (response.status === 429) {
      lastError = new Error(
        "El servicio público de localidades limitó temporalmente las consultas. Esperá unos segundos e intentá escribir nuevamente."
      );

      if (attempt < retries) {
        await wait(1200);
        continue;
      }

      throw lastError;
    }

    if (!response.ok) {
      throw new Error(
        "No pudimos consultar la base de localidades. Intentá nuevamente."
      );
    }

    return response.json();
  }

  throw lastError;
}

async function requestGeoref(path, params = {}) {
  const url = new URL(`${GEOREF_BASE_URL}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const requestKey = url.toString();

  if (inflightRequests.has(requestKey)) {
    return inflightRequests.get(requestKey);
  }

  const requestPromise = fetchWithRetry(requestKey, 1).finally(() => {
    inflightRequests.delete(requestKey);
  });

  inflightRequests.set(requestKey, requestPromise);
  return requestPromise;
}

function normalizeProvince(province) {
  return {
    id: province.id,
    name: province.nombre,
    centroid: province.centroide
      ? { lat: province.centroide.lat, lon: province.centroide.lon }
      : null,
  };
}

function normalizeLocality(locality) {
  return {
    id: locality.id,
    name: locality.nombre,
    category: locality.categoria || "",
    provinceId: locality.provincia?.id || "",
    provinceName: locality.provincia?.nombre || "",
    departmentId: locality.departamento?.id || "",
    departmentName: locality.departamento?.nombre || "",
    municipalityId: locality.municipio?.id || "",
    municipalityName: locality.municipio?.nombre || "",
    censusLocalityId: locality.localidad_censal?.id || "",
    censusLocalityName: locality.localidad_censal?.nombre || "",
    centroid: locality.centroide
      ? { lat: locality.centroide.lat, lon: locality.centroide.lon }
      : null,
  };
}

function sortLocalities(localities) {
  return [...localities].sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, "es");
    if (nameCompare !== 0) return nameCompare;

    const departmentCompare = a.departmentName.localeCompare(
      b.departmentName,
      "es"
    );
    if (departmentCompare !== 0) return departmentCompare;

    return a.provinceName.localeCompare(b.provinceName, "es");
  });
}

function mergeLocalities(...groups) {
  const map = new Map();

  groups.flat().forEach((locality) => {
    if (!locality?.id) return;
    map.set(locality.id, locality);
  });

  return sortLocalities(Array.from(map.values()));
}

function getSearchableFields(locality) {
  return [
    locality.name,
    locality.departmentName,
    locality.municipalityName,
    locality.censusLocalityName,
    locality.provinceName,
  ].map(normalizeText);
}

function matchesLocality(locality, normalizedSearch) {
  const tokens = normalizedSearch.split(" ").filter(Boolean);
  const fields = getSearchableFields(locality);

  return tokens.every((token) => fields.some((field) => field.includes(token)));
}

function getLocalityScore(locality, normalizedSearch) {
  const name = normalizeText(locality.name);
  const department = normalizeText(locality.departmentName);
  const municipality = normalizeText(locality.municipalityName);
  const censusLocality = normalizeText(locality.censusLocalityName);

  if (name === normalizedSearch) return 0;
  if (name.startsWith(normalizedSearch)) return 1;
  if (censusLocality === normalizedSearch) return 2;
  if (censusLocality.startsWith(normalizedSearch)) return 3;
  if (department === normalizedSearch) return 4;
  if (municipality === normalizedSearch) return 5;
  if (department.startsWith(normalizedSearch)) return 6;
  if (municipality.startsWith(normalizedSearch)) return 7;
  if (name.includes(normalizedSearch)) return 8;
  if (censusLocality.includes(normalizedSearch)) return 9;
  if (department.includes(normalizedSearch)) return 10;
  if (municipality.includes(normalizedSearch)) return 11;

  return 20;
}

function filterAndSortLocalities(localities, normalizedSearch, max) {
  return localities
    .filter((locality) => matchesLocality(locality, normalizedSearch))
    .sort((first, second) => {
      const firstScore = getLocalityScore(first, normalizedSearch);
      const secondScore = getLocalityScore(second, normalizedSearch);

      if (firstScore !== secondScore) return firstScore - secondScore;

      return first.name.localeCompare(second.name, "es");
    })
    .slice(0, max);
}

async function fetchLocalitiesByProvince(provinceId) {
  const cacheKey = `localities_by_province_${provinceId}`;
  const cachedLocalities = getCachedValue(cacheKey);
  if (cachedLocalities) return cachedLocalities;

  const data = await requestGeoref("/localidades", {
    provincia: provinceId,
    campos:
      "id,nombre,categoria,provincia,departamento,municipio,localidad_censal,centroide",
    max: MAX_PROVINCE_LOCALITIES,
  });

  const localities = sortLocalities((data.localidades || []).map(normalizeLocality));
  setCachedValue(cacheKey, localities);

  return localities;
}

async function searchLocalitiesByEndpoint({ provinceId, searchText, max }) {
  const commonParams = {
    provincia: provinceId,
    campos:
      "id,nombre,categoria,provincia,departamento,municipio,localidad_censal,centroide",
    max,
  };

  const byLocalityData = await requestGeoref("/localidades", {
    ...commonParams,
    nombre: searchText,
  });

  const byLocality = (byLocalityData.localidades || []).map(normalizeLocality);

  let byDepartment = [];
  let byMunicipality = [];
  let byCensusLocality = [];

  try {
    const data = await requestGeoref("/localidades", {
      ...commonParams,
      departamento: searchText,
    });
    byDepartment = (data.localidades || []).map(normalizeLocality);
  } catch (error) {
    console.warn("No se pudo buscar por departamento", error);
  }

  try {
    const data = await requestGeoref("/localidades", {
      ...commonParams,
      municipio: searchText,
    });
    byMunicipality = (data.localidades || []).map(normalizeLocality);
  } catch (error) {
    console.warn("No se pudo buscar por municipio", error);
  }

  try {
    const data = await requestGeoref("/localidades", {
      ...commonParams,
      localidad_censal: searchText,
    });
    byCensusLocality = (data.localidades || []).map(normalizeLocality);
  } catch (error) {
    console.warn("No se pudo buscar por localidad censal", error);
  }

  return mergeLocalities(
    byLocality,
    byDepartment,
    byMunicipality,
    byCensusLocality
  ).slice(0, max);
}

export async function fetchProvinces() {
  const cacheKey = "provinces";
  const cachedProvinces = getCachedValue(cacheKey);
  if (cachedProvinces) return cachedProvinces;

  const data = await requestGeoref("/provincias", {
    campos: "id,nombre,centroide",
    max: 100,
  });

  const provinces = (data.provincias || [])
    .map(normalizeProvince)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  setCachedValue(cacheKey, provinces);
  return provinces;
}

export async function searchLocalities({ provinceId, searchText, max = 60 }) {
  const normalizedSearch = normalizeText(searchText);

  if (!provinceId || normalizedSearch.length < MIN_SEARCH_LENGTH) {
    return [];
  }

  const cacheKey = `localities_search_v2_${provinceId}_${normalizedSearch}_${max}`;
  const cachedLocalities = getCachedValue(cacheKey);
  if (cachedLocalities) return cachedLocalities;

  try {
    const provinceLocalities = await fetchLocalitiesByProvince(provinceId);
    const localities = filterAndSortLocalities(
      provinceLocalities,
      normalizedSearch,
      max
    );

    setCachedValue(cacheKey, localities);
    return localities;
  } catch (error) {
    console.warn("No se pudo cargar la base completa de la provincia", error);

    const fallbackLocalities = await searchLocalitiesByEndpoint({
      provinceId,
      searchText,
      max,
    });

    const localities = filterAndSortLocalities(
      fallbackLocalities,
      normalizedSearch,
      max
    );

    setCachedValue(cacheKey, localities);
    return localities;
  }
}

export function buildLocationFromLocality(locality) {
  if (!locality) return null;

  return {
    provinceId: locality.provinceId,
    provinceName: locality.provinceName,
    departmentId: locality.departmentId,
    departmentName: locality.departmentName,
    municipalityId: locality.municipalityId,
    municipalityName: locality.municipalityName,
    censusLocalityId: locality.censusLocalityId,
    censusLocalityName: locality.censusLocalityName,
    localityId: locality.id,
    localityName: locality.name,
    lat: locality.centroid?.lat || null,
    lon: locality.centroid?.lon || null,
  };
}
