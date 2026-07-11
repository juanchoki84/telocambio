import { useEffect, useMemo, useState } from "react";
import {
  buildLocationFromLocality,
  fetchProvinces,
  searchLocalities,
} from "../services/geoService";

const MIN_SEARCH_LENGTH = 2;
const SEARCH_DELAY_MS = 450;

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
    centroid:
      value.lat && value.lon
        ? {
            lat: value.lat,
            lon: value.lon,
          }
        : null,
  };
}

function LocationPicker({ value, onChange, disabled = false }) {
  const [provinces, setProvinces] = useState([]);
  const [localities, setLocalities] = useState([]);
  const [selectedProvinceId, setSelectedProvinceId] = useState(
    value?.provinceId || ""
  );
  const [selectedLocalityId, setSelectedLocalityId] = useState(
    value?.localityId || ""
  );
  const [localitySearch, setLocalitySearch] = useState(value?.localityName || "");
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingLocalities, setLoadingLocalities] = useState(false);
  const [geoError, setGeoError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadProvinces() {
      try {
        setLoadingProvinces(true);
        setGeoError("");

        const data = await fetchProvinces();

        if (isMounted) {
          setProvinces(data);
        }
      } catch (error) {
        console.error(error);

        if (isMounted) {
          setGeoError(error?.message || "No pudimos cargar las provincias.");
        }
      } finally {
        if (isMounted) {
          setLoadingProvinces(false);
        }
      }
    }

    loadProvinces();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!value) return;

    setSelectedProvinceId(value.provinceId || "");
    setSelectedLocalityId(value.localityId || "");

    if (value.localityName && !localitySearch) {
      setLocalitySearch(value.localityName);
    }
  }, [value?.provinceId, value?.localityId, value?.localityName]);

  useEffect(() => {
    let isMounted = true;
    const normalizedSearch = normalizeText(localitySearch);

    if (!selectedProvinceId) {
      setLocalities([]);
      setLoadingLocalities(false);
      return undefined;
    }

    if (normalizedSearch.length < MIN_SEARCH_LENGTH) {
      setLocalities([]);
      setLoadingLocalities(false);
      setGeoError("");
      return undefined;
    }

    setLoadingLocalities(true);
    setGeoError("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const data = await searchLocalities({
          provinceId: selectedProvinceId,
          searchText: localitySearch,
          max: 70,
        });

        if (isMounted) {
          setLocalities(data);
        }
      } catch (error) {
        console.error(error);

        if (isMounted) {
          setLocalities([]);
          setGeoError(error?.message || "No pudimos cargar las localidades.");
        }
      } finally {
        if (isMounted) {
          setLoadingLocalities(false);
        }
      }
    }, SEARCH_DELAY_MS);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [selectedProvinceId, localitySearch]);

  const visibleLocalities = useMemo(() => {
    const selectedOption = getSelectedLocationAsOption(value);

    if (!selectedOption) {
      return localities;
    }

    const exists = localities.some((locality) => locality.id === selectedOption.id);

    if (exists) {
      return localities;
    }

    return [selectedOption, ...localities];
  }, [localities, value]);

  const helperText = useMemo(() => {
    if (!selectedProvinceId) return "Seleccioná una provincia para buscar localidades.";

    const normalizedSearch = normalizeText(localitySearch);

    if (normalizedSearch.length < MIN_SEARCH_LENGTH) {
      return "Escribí al menos 2 letras para buscar una localidad, partido o departamento.";
    }

    if (loadingLocalities) {
      return "Buscando localidades...";
    }

    if (visibleLocalities.length === 0) {
      return "No encontramos resultados con esa búsqueda. Probá con otro nombre.";
    }

    return "Mostramos los resultados más cercanos a tu búsqueda.";
  }, [selectedProvinceId, localitySearch, loadingLocalities, visibleLocalities.length]);

  const handleProvinceChange = (event) => {
    const provinceId = event.target.value;

    setSelectedProvinceId(provinceId);
    setSelectedLocalityId("");
    setLocalitySearch("");
    setLocalities([]);
    setGeoError("");
    onChange(null);
  };

  const handleSearchChange = (event) => {
    setLocalitySearch(event.target.value);
    setSelectedLocalityId("");
    setGeoError("");
  };

  const handleLocalityChange = (event) => {
    const localityId = event.target.value;
    const locality = visibleLocalities.find((item) => item.id === localityId);

    setSelectedLocalityId(localityId);
    onChange(buildLocationFromLocality(locality));
  };

  return (
    <div className="locationPicker">
      <label>
        Provincia
        <select
          value={selectedProvinceId}
          onChange={handleProvinceChange}
          disabled={disabled || loadingProvinces}
          required
        >
          <option value="">
            {loadingProvinces ? "Cargando provincias..." : "Seleccionar provincia"}
          </option>

          {provinces.map((province) => (
            <option value={province.id} key={province.id}>
              {province.name}
            </option>
          ))}
        </select>
      </label>

      {selectedProvinceId && (
        <label>
          Buscar localidad / partido / departamento
          <input
            placeholder="Ej: Morón, Rosario, Godoy Cruz..."
            value={localitySearch}
            onChange={handleSearchChange}
            disabled={disabled}
            autoComplete="off"
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
              normalizeText(localitySearch).length < MIN_SEARCH_LENGTH ||
              visibleLocalities.length === 0
            }
            required
          >
            <option value="">
              {loadingLocalities ? "Buscando localidades..." : "Seleccionar localidad"}
            </option>

            {visibleLocalities.map((locality) => (
              <option value={locality.id} key={locality.id}>
                {locality.name}
                {locality.departmentName ? ` · ${locality.departmentName}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedProvinceId && <p className="locationHelperText">{helperText}</p>}

      {value?.localityName && (
        <div className="selectedLocationBox">
          <span>Ubicación seleccionada</span>
          <strong>{value.localityName}</strong>
          <p>
            {value.departmentName ? `${value.departmentName} · ` : ""}
            {value.provinceName}
          </p>
        </div>
      )}

      {geoError && <p className="errorText">{geoError}</p>}
    </div>
  );
}

export default LocationPicker;
