export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function hasTextMatch(firstValue, secondValue) {
  const first = normalizeText(firstValue);
  const second = normalizeText(secondValue);

  if (!first || !second) return false;

  return first.includes(second) || second.includes(first);
}

export function calculateMatchScore(myExchange, otherExchange) {
  let score = 0;
  const reasons = [];

  const searchCategoryMatches =
    myExchange.searchCategory &&
    otherExchange.offerCategory &&
    myExchange.searchCategory === otherExchange.offerCategory;

  const offerCategoryMatches =
    myExchange.offerCategory &&
    otherExchange.searchCategory &&
    myExchange.offerCategory === otherExchange.searchCategory;

  const searchTitleMatches = hasTextMatch(
    myExchange.searchTitle,
    otherExchange.offerTitle
  );

  const offerTitleMatches = hasTextMatch(
    myExchange.offerTitle,
    otherExchange.searchTitle
  );

  if (searchCategoryMatches) {
    score += 25;
    reasons.push("Tiene algo de la categoría que buscás");
  }

  if (offerCategoryMatches) {
    score += 25;
    reasons.push("Busca algo de la categoría que ofrecés");
  }

  if (searchTitleMatches) {
    score += 25;
    reasons.push("Ofrece algo parecido a lo que buscás");
  }

  if (offerTitleMatches) {
    score += 25;
    reasons.push("Busca algo parecido a lo que ofrecés");
  }

  if (searchTitleMatches && offerTitleMatches) {
    score += 10;
    reasons.push("Hay coincidencia directa entre ambos intereses");
  }

  return {
    score: Math.min(score, 100),
    reasons,
  };
}

export function buildMatches(myExchanges, allExchanges, userId) {
  const myActiveExchanges = myExchanges.filter(
    (exchange) => exchange.status === "active"
  );

  const otherActiveExchanges = allExchanges.filter(
    (exchange) => exchange.userId !== userId && exchange.status === "active"
  );

  const results = [];

  myActiveExchanges.forEach((myExchange) => {
    otherActiveExchanges.forEach((otherExchange) => {
      const match = calculateMatchScore(myExchange, otherExchange);

      if (match.score >= 25) {
        results.push({
          id: `${myExchange.id}-${otherExchange.id}`,
          myExchange,
          otherExchange,
          score: match.score,
          reasons: match.reasons,
        });
      }
    });
  });

  return results.sort((a, b) => b.score - a.score);
}