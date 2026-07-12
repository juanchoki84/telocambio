const GEOREF_BASE_URL =
  "https://apis.datos.gob.ar/georef/api";

const CACHE_PREFIX = "telocambio_georef_v3_";
const PROVINCES_CACHE_TTL_MS =
  1000 * 60 * 60 * 24 * 30;
const SEARCH_CACHE_TTL_MS =
  1000 * 60 * 60 * 24 * 7;

const MIN_SEARCH_LENGTH = 2;
const DEFAULT_MAX_RESULTS = 12;
const MAX_ALLOWED_RESULTS = 20;
const REQUEST_TIMEOUT_MS = 9000;

const memoryCache = new Map();

function createAbortError() {
  return new DOMException(
    "La solicitud fue cancelada.",
    "AbortError"
  );
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timeoutId = window.setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId);
        reject(createAbortError());
      },
      { once: true }
    );
  });
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getCachedValue(key, ttlMs) {
  const memoryValue = memoryCache.get(key);

  if (
    memoryValue &&
    Date.now() - memoryValue.createdAt <= ttlMs
  ) {
    return memoryValue.data;
  }

  if (memoryValue) {
    memoryCache.delete(key);
  }

  try {
    const rawValue = localStorage.getItem(
      `${CACHE_PREFIX}${key}`
    );

    if (!rawValue) return null;

    const parsedValue = JSON.parse(rawValue);
    const isExpired =
      Date.now() - parsedValue.createdAt > ttlMs;

    if (isExpired) {
      localStorage.removeItem(
        `${CACHE_PREFIX}${key}`
      );
      return null;
    }

    memoryCache.set(key, parsedValue);
    return parsedValue.data;
  } catch (error) {
    console.warn(
      "No se pudo leer la caché geográfica.",
      error
    );
    return null;
  }
}

function setCachedValue(key, data) {
  const cacheEntry = {
    createdAt: Date.now(),
    data,
  };

  memoryCache.set(key, cacheEntry);

  try {
    const serializedValue =
      JSON.stringify(cacheEntry);

    if (serializedValue.length <= 120000) {
      localStorage.setItem(
        `${CACHE_PREFIX}${key}`,
        serializedValue
      );
    }
  } catch (error) {
    console.warn(
      "No se pudo guardar la caché geográfica.",
      error
    );
  }
}

function buildRequestUrl(path, params = {}) {
  const url = new URL(
    `${GEOREF_BASE_URL}${path}`
  );

  Object.entries(params).forEach(
    ([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(key, value);
      }
    }
  );

  return url.toString();
}

async function fetchJson(
  url,
  {
    signal,
    retries = 1,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = {}
) {
  let lastError = null;

  for (
    let attempt = 0;
    attempt <= retries;
    attempt += 1
  ) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    const controller = new AbortController();
    let timedOut = false;

    const abortFromParent = () => {
      controller.abort();
    };

    signal?.addEventListener(
      "abort",
      abortFromParent,
      { once: true }
    );

    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      if (response.status === 429) {
        lastError = new Error(
          "El servicio público de localidades limitó temporalmente las consultas. Esperá unos segundos e intentá nuevamente."
        );

        if (attempt < retries) {
          await wait(1000, signal);
          continue;
        }

        throw lastError;
      }

      if (!response.ok) {
        throw new Error(
          "No pudimos consultar la base de localidades. Intentá nuevamente."
        );
      }

      return await response.json();
    } catch (error) {
      if (signal?.aborted) {
        throw createAbortError();
      }

      if (
        error?.name === "AbortError" &&
        timedOut
      ) {
        lastError = new Error(
          "La búsqueda demoró demasiado. Revisá tu conexión e intentá nuevamente."
        );
      } else {
        lastError = error;
      }

      if (
        attempt < retries &&
        error?.name !== "AbortError"
      ) {
        await wait(700, signal);
        continue;
      }

      throw lastError;
    } finally {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener(
        "abort",
        abortFromParent
      );
    }
  }

  throw lastError;
}

async function requestGeoref(
  path,
  params = {},
  options = {}
) {
  const url = buildRequestUrl(path, params);

  return fetchJson(url, options);
}

function normalizeProvince(province) {
  return {
    id: province.id,
    name: province.nombre,
    centroid: province.centroide
      ? {
          lat: province.centroide.lat,
          lon: province.centroide.lon,
        }
      : null,
  };
}

function normalizeLocality(locality) {
  return {
    id: locality.id,
    name: locality.nombre,
    category: locality.categoria || "",
    provinceId:
      locality.provincia?.id || "",
    provinceName:
      locality.provincia?.nombre || "",
    departmentId:
      locality.departamento?.id || "",
    departmentName:
      locality.departamento?.nombre || "",
    municipalityId:
      locality.municipio?.id || "",
    municipalityName:
      locality.municipio?.nombre || "",
    censusLocalityId:
      locality.localidad_censal?.id || "",
    censusLocalityName:
      locality.localidad_censal?.nombre || "",
    centroid: locality.centroide
      ? {
          lat: locality.centroide.lat,
          lon: locality.centroide.lon,
        }
      : null,
  };
}

function mergeLocalities(...groups) {
  const localitiesById = new Map();

  groups.flat().forEach((locality) => {
    if (!locality?.id) return;

    localitiesById.set(
      locality.id,
      locality
    );
  });

  return Array.from(
    localitiesById.values()
  );
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

function matchesLocality(
  locality,
  normalizedSearch
) {
  const tokens = normalizedSearch
    .split(" ")
    .filter(Boolean);

  const fields =
    getSearchableFields(locality);

  return tokens.every((token) =>
    fields.some((field) =>
      field.includes(token)
    )
  );
}

function getLocalityScore(
  locality,
  normalizedSearch
) {
  const name = normalizeText(locality.name);
  const department = normalizeText(
    locality.departmentName
  );
  const municipality = normalizeText(
    locality.municipalityName
  );
  const censusLocality = normalizeText(
    locality.censusLocalityName
  );

  if (name === normalizedSearch) return 0;
  if (name.startsWith(normalizedSearch)) return 1;
  if (censusLocality === normalizedSearch) return 2;
  if (
    censusLocality.startsWith(normalizedSearch)
  ) {
    return 3;
  }
  if (department === normalizedSearch) return 4;
  if (municipality === normalizedSearch) return 5;
  if (
    department.startsWith(normalizedSearch)
  ) {
    return 6;
  }
  if (
    municipality.startsWith(normalizedSearch)
  ) {
    return 7;
  }
  if (name.includes(normalizedSearch)) return 8;
  if (
    censusLocality.includes(normalizedSearch)
  ) {
    return 9;
  }
  if (
    department.includes(normalizedSearch)
  ) {
    return 10;
  }
  if (
    municipality.includes(normalizedSearch)
  ) {
    return 11;
  }

  return 20;
}

function filterAndSortLocalities(
  localities,
  normalizedSearch,
  max
) {
  return localities
    .filter((locality) =>
      matchesLocality(
        locality,
        normalizedSearch
      )
    )
    .sort((first, second) => {
      const firstScore = getLocalityScore(
        first,
        normalizedSearch
      );
      const secondScore = getLocalityScore(
        second,
        normalizedSearch
      );

      if (firstScore !== secondScore) {
        return firstScore - secondScore;
      }

      return first.name.localeCompare(
        second.name,
        "es"
      );
    })
    .slice(0, max);
}

async function searchByField({
  provinceId,
  searchText,
  field,
  max,
  signal,
}) {
  const data = await requestGeoref(
    "/localidades",
    {
      provincia: provinceId,
      campos:
        "id,nombre,categoria,provincia,departamento,municipio,localidad_censal,centroide",
      max,
      [field]: searchText,
    },
    {
      signal,
      retries: 0,
    }
  );

  return (data.localidades || []).map(
    normalizeLocality
  );
}

async function runSearchGroup(
  searches,
  signal
) {
  const results = await Promise.allSettled(
    searches
  );

  if (signal?.aborted) {
    throw createAbortError();
  }

  return results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    if (result.reason?.name !== "AbortError") {
      console.warn(
        "Una búsqueda geográfica parcial falló.",
        result.reason
      );
    }

    return [];
  });
}

export async function fetchProvinces(
  { signal } = {}
) {
  const cacheKey = "provinces";
  const cachedProvinces = getCachedValue(
    cacheKey,
    PROVINCES_CACHE_TTL_MS
  );

  if (cachedProvinces) {
    return cachedProvinces;
  }

  const data = await requestGeoref(
    "/provincias",
    {
      campos: "id,nombre,centroide",
      max: 100,
    },
    {
      signal,
      retries: 1,
    }
  );

  const provinces = (
    data.provincias || []
  )
    .map(normalizeProvince)
    .sort((first, second) =>
      first.name.localeCompare(
        second.name,
        "es"
      )
    );

  setCachedValue(cacheKey, provinces);

  return provinces;
}

export async function searchLocalities({
  provinceId,
  searchText,
  max = DEFAULT_MAX_RESULTS,
  signal,
}) {
  const normalizedSearch =
    normalizeText(searchText);

  if (
    !provinceId ||
    normalizedSearch.length <
      MIN_SEARCH_LENGTH
  ) {
    return [];
  }

  const safeMax = Math.max(
    1,
    Math.min(
      Number(max) || DEFAULT_MAX_RESULTS,
      MAX_ALLOWED_RESULTS
    )
  );

  const cacheKey =
    `localities_search_${provinceId}_` +
    `${normalizedSearch}_${safeMax}`;

  const cachedLocalities = getCachedValue(
    cacheKey,
    SEARCH_CACHE_TTL_MS
  );

  if (cachedLocalities) {
    return cachedLocalities;
  }

  const primaryResults = await runSearchGroup(
    [
      searchByField({
        provinceId,
        searchText,
        field: "nombre",
        max: safeMax,
        signal,
      }),
      searchByField({
        provinceId,
        searchText,
        field: "departamento",
        max: safeMax,
        signal,
      }),
    ],
    signal
  );

  let mergedResults =
    mergeLocalities(primaryResults);

  if (mergedResults.length < safeMax) {
    const secondaryResults =
      await runSearchGroup(
        [
          searchByField({
            provinceId,
            searchText,
            field: "municipio",
            max: safeMax,
            signal,
          }),
          searchByField({
            provinceId,
            searchText,
            field: "localidad_censal",
            max: safeMax,
            signal,
          }),
        ],
        signal
      );

    mergedResults = mergeLocalities(
      mergedResults,
      secondaryResults
    );
  }

  const localities =
    filterAndSortLocalities(
      mergedResults,
      normalizedSearch,
      safeMax
    );

  setCachedValue(cacheKey, localities);

  return localities;
}

export function buildLocationFromLocality(
  locality
) {
  if (!locality) return null;

  return {
    provinceId: locality.provinceId,
    provinceName: locality.provinceName,
    departmentId: locality.departmentId,
    departmentName:
      locality.departmentName,
    municipalityId:
      locality.municipalityId,
    municipalityName:
      locality.municipalityName,
    censusLocalityId:
      locality.censusLocalityId,
    censusLocalityName:
      locality.censusLocalityName,
    localityId: locality.id,
    localityName: locality.name,
    lat: locality.centroid?.lat ?? null,
    lon: locality.centroid?.lon ?? null,
  };
}
