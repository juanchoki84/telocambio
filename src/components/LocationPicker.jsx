import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildLocationFromLocality,
  fetchProvinces,
  searchLocalities,
} from "../services/geoService";

const MIN_SEARCH_LENGTH = 2;
const SEARCH_DELAY_MS = 550;
const MAX_VISIBLE_LOCALITIES = 12;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function getSelectedLocationAsOption(value) {
  if (!value?.localityId) return null;

  return {
    id: value.localityId,
    name: value.localityName,
    provinceId: value.provinceId,
    provinceName: value.provinceName,
    departmentId: value.departmentId,
    departmentName: value.departmentName,
    municipalityId: value.municipalityId,
    municipalityName: value.municipalityName,
    censusLocalityId: value.censusLocalityId,
    censusLocalityName: value.censusLocalityName,
    centroid:
      value.lat != null && value.lon != null
        ? {
            lat: value.lat,
            lon: value.lon,
          }
        : null,
  };
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function LocationPicker({
  value,
  onChange,
  disabled = false,
}) {
  const searchSequenceRef = useRef(0);

  const [provinces, setProvinces] = useState([]);
  const [localities, setLocalities] = useState([]);

  const [selectedProvinceId, setSelectedProvinceId] =
    useState(value?.provinceId || "");
  const [selectedLocalityId, setSelectedLocalityId] =
    useState(value?.localityId || "");
  const [localitySearch, setLocalitySearch] = useState(
    value?.localityName || ""
  );

  const [loadingProvinces, setLoadingProvinces] =
    useState(true);
  const [loadingLocalities, setLoadingLocalities] =
    useState(false);
  const [geoError, setGeoError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadProvinces() {
      try {
        setLoadingProvinces(true);
        setGeoError("");

        const data = await fetchProvinces({
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setProvinces(data);
        }
      } catch (error) {
        if (isAbortError(error)) return;

        console.error(error);

        if (!controller.signal.aborted) {
          setGeoError(
            error?.message ||
              "No pudimos cargar las provincias."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingProvinces(false);
        }
      }
    }

    loadProvinces();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!value) return;

    setSelectedProvinceId(value.provinceId || "");
    setSelectedLocalityId(value.localityId || "");

    if (value.localityName) {
      setLocalitySearch(value.localityName);
    }
  }, [
    value?.provinceId,
    value?.localityId,
    value?.localityName,
  ]);

  useEffect(() => {
    const normalizedSearch =
      normalizeText(localitySearch);

    const requestId = searchSequenceRef.current + 1;
    searchSequenceRef.current = requestId;

    const controller = new AbortController();

    if (!selectedProvinceId) {
      setLocalities([]);
      setLoadingLocalities(false);
      return () => controller.abort();
    }

    if (
      normalizedSearch.length < MIN_SEARCH_LENGTH
    ) {
      setLocalities([]);
      setLoadingLocalities(false);
      setGeoError("");
      return () => controller.abort();
    }

    setLoadingLocalities(true);
    setGeoError("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const data = await searchLocalities({
          provinceId: selectedProvinceId,
          searchText: localitySearch,
          max: MAX_VISIBLE_LOCALITIES,
          signal: controller.signal,
        });

        const isCurrentRequest =
          requestId === searchSequenceRef.current;

        if (
          !controller.signal.aborted &&
          isCurrentRequest
        ) {
          setLocalities(data);
        }
      } catch (error) {
        if (isAbortError(error)) return;

        console.error(error);

        const isCurrentRequest =
          requestId === searchSequenceRef.current;

        if (
          !controller.signal.aborted &&
          isCurrentRequest
        ) {
          setLocalities([]);
          setGeoError(
            error?.message ||
              "No pudimos cargar las localidades."
          );
        }
      } finally {
        const isCurrentRequest =
          requestId === searchSequenceRef.current;

        if (
          !controller.signal.aborted &&
          isCurrentRequest
        ) {
          setLoadingLocalities(false);
        }
      }
    }, SEARCH_DELAY_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [selectedProvinceId, localitySearch]);

  const visibleLocalities = useMemo(() => {
    const selectedOption =
      getSelectedLocationAsOption(value);

    if (!selectedOption) {
      return localities;
    }

    const exists = localities.some(
      (locality) =>
        locality.id === selectedOption.id
    );

    if (exists) {
      return localities;
    }

    return [selectedOption, ...localities].slice(
      0,
      MAX_VISIBLE_LOCALITIES + 1
    );
  }, [localities, value]);

  const helperText = useMemo(() => {
    if (!selectedProvinceId) {
      return "Seleccioná una provincia para buscar localidades.";
    }

    const normalizedSearch =
      normalizeText(localitySearch);

    if (
      normalizedSearch.length < MIN_SEARCH_LENGTH
    ) {
      return "Escribí al menos 2 letras para buscar una localidad, partido o departamento.";
    }

    if (loadingLocalities) {
      return "Buscando localidades...";
    }

    if (visibleLocalities.length === 0) {
      return "No encontramos resultados con esa búsqueda. Probá con otro nombre.";
    }

    return "Seleccioná una localidad de la lista para confirmar tu ubicación.";
  }, [
    selectedProvinceId,
    localitySearch,
    loadingLocalities,
    visibleLocalities.length,
  ]);

  const handleProvinceChange = (event) => {
    const provinceId = event.target.value;

    searchSequenceRef.current += 1;

    setSelectedProvinceId(provinceId);
    setSelectedLocalityId("");
    setLocalitySearch("");
    setLocalities([]);
    setLoadingLocalities(false);
    setGeoError("");

    onChange(null);
  };

  const handleSearchChange = (event) => {
    const nextSearch = event.target.value;

    setLocalitySearch(nextSearch);
    setSelectedLocalityId("");
    setGeoError("");

    if (value?.localityId) {
      onChange(null);
    }
  };

  const handleLocalityChange = (event) => {
    const localityId = event.target.value;

    if (!localityId) {
      setSelectedLocalityId("");
      onChange(null);
      return;
    }

    const locality = visibleLocalities.find(
      (item) => item.id === localityId
    );

    if (!locality) {
      setSelectedLocalityId("");
      onChange(null);
      return;
    }

    setSelectedLocalityId(localityId);
    setLocalitySearch(locality.name);
    setGeoError("");

    onChange(buildLocationFromLocality(locality));
  };

  return (
    <div className="locationPicker">
      <label>
        Provincia
        <select
          value={selectedProvinceId}
          onChange={handleProvinceChange}
          disabled={
            disabled || loadingProvinces
          }
          required
        >
          <option value="">
            {loadingProvinces
              ? "Cargando provincias..."
              : "Seleccionar provincia"}
          </option>

          {provinces.map((province) => (
            <option
              value={province.id}
              key={province.id}
            >
              {province.name}
            </option>
          ))}
        </select>
      </label>

      {selectedProvinceId && (
        <label>
          Buscar localidad / partido / departamento
          <input
            type="search"
            placeholder="Ej: Morón, Rosario, Godoy Cruz..."
            value={localitySearch}
            onChange={handleSearchChange}
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="search"
            spellCheck="false"
            aria-busy={loadingLocalities}
          />
        </label>
      )}

      {selectedProvinceId && (
        <label>
          Localidad
          <select
            value={selectedLocalityId}
            onChange={handleLocalityChange}
            disabled={
              disabled ||
              loadingLocalities ||
              normalizeText(localitySearch).length <
                MIN_SEARCH_LENGTH ||
              visibleLocalities.length === 0
            }
            required
          >
            <option value="">
              {loadingLocalities
                ? "Buscando localidades..."
                : "Seleccionar localidad"}
            </option>

            {visibleLocalities.map((locality) => (
              <option
                value={locality.id}
                key={locality.id}
              >
                {locality.name}
                {locality.departmentName
                  ? ` · ${locality.departmentName}`
                  : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedProvinceId && (
        <p
          className="locationHelperText"
          aria-live="polite"
        >
          {helperText}
        </p>
      )}

      {value?.localityName && (
        <div className="selectedLocationBox">
          <span>Ubicación seleccionada</span>
          <strong>{value.localityName}</strong>
          <p>
            {value.departmentName
              ? `${value.departmentName} · `
              : ""}
            {value.provinceName}
          </p>
        </div>
      )}

      {geoError && (
        <p className="errorText">{geoError}</p>
      )}
    </div>
  );
}

export default LocationPicker;
