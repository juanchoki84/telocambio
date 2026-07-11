import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Crown, Images, PlayCircle, Rocket, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import AppNavbar from "../components/AppNavbar";
import { useAuth } from "../context/AuthContext";
import {
  assignCurrentUserPlan,
  ensureUserPlan,
  getPlanLimitLabel,
  listenActivePlans,
} from "../services/planService";

const ALLOW_MANUAL_PAID_SELECTION =
  import.meta.env.VITE_ALLOW_MANUAL_PAID_PLAN_SELECTION === "true";

function formatCurrency(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getPlanIcon(planId) {
  if (planId === "pro") return Crown;
  if (planId === "basic") return Rocket;
  return ShieldCheck;
}

function PlanBenefitList({ plan }) {
  const benefits = plan?.benefits || {};
  const limits = plan?.limits || {};

  return (
    <ul className="sitePlanBenefits">
      <li>
        <CheckCircle2 size={17} />
        <span>{limits.maxActivePublications} publicaciones activas</span>
      </li>
      <li>
        <Images size={17} />
        <span>{limits.maxMediaPerPublication} archivos por publicación</span>
      </li>
      <li>
        <PlayCircle size={17} />
        <span>
          {limits.maxVideosPerPublication > 0
            ? `${limits.maxVideosPerPublication} video por publicación · ${limits.maxVideoSizeMb} MB máximo`
            : "Sin videos"}
        </span>
      </li>
      <li>
        <CheckCircle2 size={17} />
        <span>{benefits.canUseChat ? "Chat habilitado" : "Chat no incluido"}</span>
      </li>
      <li>
        <CheckCircle2 size={17} />
        <span>
          {benefits.canReceiveProposals
            ? "Recibe propuestas de intercambio"
            : "No recibe propuestas"}
        </span>
      </li>
      <li>
        <CheckCircle2 size={17} />
        <span>Soporte {benefits.supportLevel || "standard"}</span>
      </li>
    </ul>
  );
}

function Plans() {
  const { user } = useAuth();

  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [updatingPlanId, setUpdatingPlanId] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    setError("");

    const unsubscribe = listenActivePlans(
      (items) => {
        setPlans(items);
        setLoading(false);
      },
      () => {
        setError("No pudimos cargar los planes disponibles.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadUserPlan() {
      if (!user?.uid) {
        setCurrentPlan(null);
        return;
      }

      try {
        const plan = await ensureUserPlan(user.uid);
        if (!ignore) setCurrentPlan(plan);
      } catch (err) {
        console.error(err);
        if (!ignore) setError("No pudimos cargar tu plan actual.");
      }
    }

    loadUserPlan();

    return () => {
      ignore = true;
    };
  }, [user?.uid]);

  const featuredPlanId = useMemo(() => {
    if (plans.some((plan) => plan.id === "basic")) return "basic";
    return plans[1]?.id || plans[0]?.id || "";
  }, [plans]);

  const handleChoosePlan = async (plan) => {
    if (!user?.uid) {
      setError("Iniciá sesión para elegir un plan.");
      return;
    }

    if (plan.priceMonthly > 0 && !ALLOW_MANUAL_PAID_SELECTION) {
      setError(
        "Los planes pagos todavía se asignan desde administración hasta conectar Mercado Pago."
      );
      return;
    }

    setError("");
    setSuccessMessage("");
    setUpdatingPlanId(plan.id);

    try {
      const selectedPlan = await assignCurrentUserPlan({
        user,
        planId: plan.id,
        billingCycle,
      });

      setCurrentPlan(selectedPlan);
      setSuccessMessage(`Tu plan actual ahora es ${selectedPlan.name}.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "No pudimos actualizar tu plan.");
    } finally {
      setUpdatingPlanId("");
    }
  };

  if (loading) {
    return (
      <main className="plansPage sitePlansPage">
        <AppNavbar />

        <section className="plansHero">
          <span>Planes TeLoCambio</span>
          <h1>Cargando planes...</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="plansPage sitePlansPage">
      <AppNavbar />

      <section className="plansHero sitePlansHero">
        <div>
          <span>Planes TeLoCambio</span>
          <h1>Elegí cómo querés intercambiar</h1>
          <p>
            Cada plan define cuántas publicaciones activas podés tener, cuántos
            archivos podés subir y si podés incluir videos.
          </p>
        </div>

        {currentPlan && (
          <aside className="siteCurrentPlanCard">
            <small>Tu plan actual</small>
            <strong>{currentPlan.name}</strong>
            <p>{getPlanLimitLabel(currentPlan)}</p>
          </aside>
        )}
      </section>

      {error && <section className="sitePlanMessage error">{error}</section>}
      {successMessage && (
        <section className="sitePlanMessage success">{successMessage}</section>
      )}

      <section className="siteBillingToggle" aria-label="Frecuencia de pago">
        <button
          type="button"
          className={billingCycle === "monthly" ? "active" : ""}
          onClick={() => setBillingCycle("monthly")}
        >
          Mensual
        </button>
        <button
          type="button"
          className={billingCycle === "yearly" ? "active" : ""}
          onClick={() => setBillingCycle("yearly")}
        >
          Anual
        </button>
      </section>

      <section className="sitePlansGrid">
        {plans.map((plan) => {
          const Icon = getPlanIcon(plan.id);
          const isCurrent = currentPlan?.id === plan.id;
          const isFeatured = plan.id === featuredPlanId;
          const price =
            billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
          const isPaid = Number(plan.priceMonthly || 0) > 0;
          const isDisabled =
            updatingPlanId === plan.id ||
            isCurrent ||
            (isPaid && !ALLOW_MANUAL_PAID_SELECTION);

          return (
            <article
              className={`sitePlanCard ${isFeatured ? "featured" : ""}`}
              key={plan.id}
            >
              {isFeatured && <span className="sitePlanFeaturedBadge">Recomendado</span>}

              <div className="sitePlanHeader">
                <span>
                  <Icon size={24} />
                </span>
                <div>
                  <h2>{plan.name}</h2>
                  <p>{plan.description || "Plan disponible para usuarios TeLoCambio."}</p>
                </div>
              </div>

              <div className="sitePlanPrice">
                <strong>{formatCurrency(price)}</strong>
                <small>{billingCycle === "yearly" ? "/ año" : "/ mes"}</small>
              </div>

              <PlanBenefitList plan={plan} />

              <button
                type="button"
                disabled={isDisabled}
                onClick={() => handleChoosePlan(plan)}
              >
                {isCurrent
                  ? "Plan actual"
                  : isPaid && !ALLOW_MANUAL_PAID_SELECTION
                    ? "Disponible pronto"
                    : updatingPlanId === plan.id
                      ? "Actualizando..."
                      : "Elegir plan"}
              </button>
            </article>
          );
        })}
      </section>

      {!user?.uid && (
        <section className="sitePlanLoginNotice">
          <strong>Para elegir un plan necesitás iniciar sesión.</strong>
          <Link to="/login">Ingresar</Link>
        </section>
      )}
    </main>
  );
}

export default Plans;
