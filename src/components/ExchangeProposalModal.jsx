import { useEffect, useMemo, useState } from "react";
import { buildMatches } from "../utils/matchUtils";

function getExchangeTitle(exchange) {
  return exchange?.offerTitle || exchange?.searchTitle || "Publicación";
}

function getExchangeMeta(exchange) {
  const offerCategory = exchange?.offerCategory || "Categoría";
  const searchTitle = exchange?.searchTitle || "búsqueda no indicada";
  return `${offerCategory} · busca ${searchTitle}`;
}

function getLocationLabel(exchange) {
  const location = exchange?.location;

  if (location?.localityName && location?.provinceName) {
    return `${location.localityName}, ${location.provinceName}`;
  }

  if (location?.departmentName && location?.provinceName) {
    return `${location.departmentName}, ${location.provinceName}`;
  }

  return exchange?.zone || "Ubicación no indicada";
}

function normalizeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function getBestMatch(myExchanges, targetExchange, userId) {
  if (!targetExchange || !myExchanges?.length) return null;

  const matches = buildMatches(myExchanges, [targetExchange], userId || "").filter(
    (match) => match?.myExchange?.id && match?.otherExchange?.id === targetExchange.id
  );

  if (!matches.length) {
    const firstExchange = myExchanges[0];

    return {
      id: `${firstExchange.id}-${targetExchange.id}`,
      myExchange: firstExchange,
      otherExchange: targetExchange,
      score: 0,
      reasons: ["Propuesta manual"],
    };
  }

  return [...matches].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
}

function getMatchForSelectedExchange(myExchange, targetExchange, userId, fallbackMatch) {
  if (!myExchange || !targetExchange) return null;

  if (fallbackMatch?.myExchange?.id === myExchange.id) {
    return fallbackMatch;
  }

  const matches = buildMatches([myExchange], [targetExchange], userId || "").filter(
    (match) => match?.myExchange?.id === myExchange.id
  );

  if (!matches.length) {
    return {
      id: `${myExchange.id}-${targetExchange.id}`,
      myExchange,
      otherExchange: targetExchange,
      score: 0,
      reasons: ["Propuesta manual"],
    };
  }

  return matches[0];
}

function ExchangeProposalModal({
  targetExchange,
  myExchanges = [],
  defaultMatch = null,
  userId = "",
  loading = false,
  error = "",
  onClose,
  onSubmit,
}) {
  const activeMyExchanges = useMemo(() => {
    return myExchanges.filter((exchange) => (exchange?.status || "active") === "active");
  }, [myExchanges]);

  const bestMatch = useMemo(() => {
    return defaultMatch || getBestMatch(activeMyExchanges, targetExchange, userId);
  }, [activeMyExchanges, defaultMatch, targetExchange, userId]);

  const [selectedExchangeId, setSelectedExchangeId] = useState("");
  const [proposalMessage, setProposalMessage] = useState("");
  const [extraProduct, setExtraProduct] = useState("");
  const [extraMoneyEnabled, setExtraMoneyEnabled] = useState(false);
  const [extraMoneyAmount, setExtraMoneyAmount] = useState("");

  useEffect(() => {
    setSelectedExchangeId(bestMatch?.myExchange?.id || activeMyExchanges[0]?.id || "");
    setProposalMessage("");
    setExtraProduct("");
    setExtraMoneyEnabled(false);
    setExtraMoneyAmount("");
  }, [bestMatch?.myExchange?.id, activeMyExchanges.length, targetExchange?.id]);

  if (!targetExchange) return null;

  const selectedExchange =
    activeMyExchanges.find((exchange) => exchange.id === selectedExchangeId) ||
    bestMatch?.myExchange ||
    null;

  const selectedMatch = getMatchForSelectedExchange(
    selectedExchange,
    targetExchange,
    userId,
    bestMatch
  );

  const selectedScore = Number(selectedMatch?.score || 0);
  const normalizedMoneyAmount = extraMoneyEnabled
    ? normalizeAmount(extraMoneyAmount)
    : 0;

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!selectedExchange || loading) return;

    onSubmit({
      myExchange: selectedExchange,
      otherExchange: targetExchange,
      score: selectedScore,
      reasons: selectedMatch?.reasons || [],
      proposalMessage,
      extraProduct,
      extraMoneyEnabled,
      extraMoneyAmount: normalizedMoneyAmount,
    });
  };

  return (
    <div className="proposalSendOverlay" role="dialog" aria-modal="true">
      <button
        type="button"
        className="proposalSendBackdrop"
        aria-label="Cerrar propuesta"
        onClick={loading ? undefined : onClose}
      />

      <form className="proposalSendModal" onSubmit={handleSubmit}>
        <div className="proposalSendHeader">
          <div>
            <span className="miniLabel">Enviar propuesta</span>
            <h3>{getExchangeTitle(targetExchange)}</h3>
            <p>
              {targetExchange.userName || "Usuario"} · {getLocationLabel(targetExchange)}
            </p>
          </div>

          <button type="button" onClick={onClose} disabled={loading}>
            ×
          </button>
        </div>

        <div className="proposalSendTargetBox">
          <span>Publicación que te interesa</span>
          <strong>{getExchangeTitle(targetExchange)}</strong>
          <p>{getExchangeMeta(targetExchange)}</p>
        </div>

        {activeMyExchanges.length === 0 ? (
          <div className="proposalSendEmptyBox">
            <strong>Necesitás una publicación activa</strong>
            <p>
              Para enviar una propuesta, primero cargá qué tenés para ofrecer en
              el intercambio.
            </p>
          </div>
        ) : (
          <>
            <label className="proposalSendField">
              Tu publicación para proponer
              <select
                value={selectedExchangeId}
                onChange={(event) => setSelectedExchangeId(event.target.value)}
                disabled={loading}
              >
                {activeMyExchanges.map((exchange) => (
                  <option value={exchange.id} key={exchange.id}>
                    {getExchangeTitle(exchange)}
                  </option>
                ))}
              </select>
            </label>

            {selectedExchange && (
              <div className="proposalSendOwnBox">
                <div>
                  <span>Vas a ofrecer</span>
                  <strong>{getExchangeTitle(selectedExchange)}</strong>
                  <p>{getExchangeMeta(selectedExchange)}</p>
                </div>

                <div className="proposalSendScore">
                  <strong>{selectedScore}%</strong>
                  <span>match</span>
                </div>
              </div>
            )}

            <label className="proposalSendField">
              Mensaje de la propuesta
              <textarea
                value={proposalMessage}
                onChange={(event) => setProposalMessage(event.target.value)}
                placeholder="Ej: Me interesa tu publicación. Te propongo mi producto y podemos coordinar un punto seguro."
                disabled={loading}
              />
            </label>

            <label className="proposalSendField">
              ¿Sumás otro producto o detalle adicional? Opcional
              <textarea
                value={extraProduct}
                onChange={(event) => setExtraProduct(event.target.value)}
                placeholder="Ej: También puedo sumar una funda, accesorio, repuesto o servicio adicional."
                disabled={loading}
              />
            </label>

            <label className="proposalSendCheckRow">
              <input
                type="checkbox"
                checked={extraMoneyEnabled}
                onChange={(event) => setExtraMoneyEnabled(event.target.checked)}
                disabled={loading}
              />
              <span>Puedo sumar dinero para completar la propuesta.</span>
            </label>

            {extraMoneyEnabled && (
              <label className="proposalSendField">
                Monto adicional estimado
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={extraMoneyAmount}
                  onChange={(event) => setExtraMoneyAmount(event.target.value)}
                  placeholder="Ej: 15000"
                  disabled={loading}
                />
              </label>
            )}
          </>
        )}

        {error && <p className="proposalSendError">{error}</p>}

        <div className="proposalSendActions">
          <button type="button" className="secondaryButton" onClick={onClose} disabled={loading}>
            Cancelar
          </button>

          <button
            type="submit"
            className="primaryButton"
            disabled={loading || activeMyExchanges.length === 0 || !selectedExchange}
          >
            {loading ? "Enviando..." : "Enviar propuesta"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ExchangeProposalModal;
