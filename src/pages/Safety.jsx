import { Link } from "react-router";
import LogoMark from "../components/LogoMark";

const safetySteps = [
  {
    number: "01",
    title: "Aceptá la propuesta",
    text: "Antes de coordinar, revisá la publicación, el estado declarado, fotos, videos, reputación y condiciones del intercambio.",
  },
  {
    number: "02",
    title: "Acordá un punto seguro",
    text: "Elegí un lugar público, concurrido, iluminado y fácil de ubicar. Evitá domicilios particulares o zonas aisladas.",
  },
  {
    number: "03",
    title: "Concretá y calificá",
    text: "Revisá el producto o servicio antes de entregar lo tuyo. Luego calificá la operación para construir reputación dentro de la comunidad.",
  },
];

const dontShareItems = [
  "Contraseñas, claves, PIN o códigos de verificación.",
  "Fotos de tarjetas, cuentas bancarias, billeteras virtuales o comprobantes sensibles.",
  "Domicilio exacto si no es necesario para el intercambio.",
  "Fotos completas de DNI, pasaporte u otros documentos personales.",
  "Datos de acceso a redes sociales, mails, apps o cuentas digitales.",
  "Información personal de terceros que no participan del intercambio.",
];

const safePointTips = [
  "Preferí lugares públicos: centros comerciales, estaciones, plazas concurridas, locales o puntos con cámaras.",
  "Coordiná de día o en horarios con movimiento.",
  "Avisale a alguien de confianza dónde y con quién te vas a encontrar.",
  "No cambies el punto acordado a último momento si te genera desconfianza.",
  "Si el intercambio tiene alto valor, considerá ir acompañado.",
  "Revisá el producto antes de finalizar el intercambio y antes de calificar.",
];

const warningSignals = [
  "Te presionan para cerrar fuera de la plataforma.",
  "Quieren cambiar el punto seguro por un lugar aislado.",
  "Solicitud de códigos, claves o datos bancarios.",
  "La publicación no coincide con lo que muestran al encontrarse.",
  "Evitan responder preguntas simples sobre estado, origen o funcionamiento.",
  "Ofrecen condiciones demasiado buenas y presionan para concretar rápido.",
];

function Safety() {
  return (
    <main className="safetyPage">
      <nav className="legalNavbar">
        <Link to="/" className="appNavbarBrand legalBrandLink">
          <LogoMark />
          <span>TeLoCambio</span>
        </Link>

        <div className="legalNavbarActions">
          <Link
            to="/terminos-y-condiciones"
            className="secondaryButton legalNavButton"
          >
            Términos
          </Link>

          <Link to="/login" className="primaryButton legalNavButton">
            Ingresar
          </Link>
        </div>
      </nav>

      <section className="safetyHero safetyUnifiedHero">
        <div className="safetyUnifiedHeroMain">
          <h1>Intercambios más seguros, claros y coordinados</h1>
          <small>La seguridad siempre está primero</small>
        </div>

        <div className="safetyUnifiedHeroIntro">
          <span className="badge">Seguridad</span>

          <p>
            TeLoCambio conecta personas para intercambiar productos o servicios.
            Para cuidar a la comunidad, recomendamos coordinar siempre desde el
            chat, elegir puntos seguros y no compartir datos sensibles.
          </p>

          <div className="safetyHeroRule">
            <strong>Regla principal</strong>
            <p>
              Si algo te genera dudas, no concretes el intercambio. Pausá la
              operación y priorizá siempre tu seguridad.
            </p>
          </div>
        </div>
      </section>

      <section className="safetyLayout">
        <aside className="safetyIndexCard">
          <span className="miniLabel">Contenido</span>
          <a href="#acuerdo">Acuerdo de intercambio</a>
          <a href="#puntos-seguros">Puntos seguros</a>
          <a href="#datos">Datos que no debés compartir</a>
          <a href="#consejos">Consejos de seguridad</a>
          <a href="#alertas">Señales de alerta</a>
          <a href="#reputacion">Reputación</a>
        </aside>

        <div className="safetyContent">
          <section className="safetyCard" id="acuerdo">
            <span className="miniLabel">Acuerdo y coordinación</span>
            <h2>Cómo coordinar un intercambio seguro</h2>
            <p>
              Una vez aceptada una propuesta, usá el chat para confirmar qué se
              entrega, en qué estado se encuentra, si hay accesorios incluidos y
              cuál será el punto de encuentro. Todo lo acordado debería quedar
              escrito dentro de la plataforma.
            </p>

            <div className="safetyFlowGrid">
              {safetySteps.map((step) => (
                <article className="safetyFlowCard" key={step.number}>
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="safetyCard" id="puntos-seguros">
            <div className="safetySplitHeader">
              <div>
                <span className="miniLabel">Puntos de entrega</span>
                <h2>Elegí lugares públicos y fáciles de reconocer</h2>
              </div>

              <div className="safePointVisual" aria-hidden="true">
                <span className="safePointPin">●</span>
                <span className="safePointRoute" />
                <span className="safePointPeople">↔</span>
              </div>
            </div>

            <p>
              Los puntos seguros ayudan a reducir riesgos. Al coordinar una
              propuesta aceptada, priorizá lugares con circulación de personas,
              buena iluminación y referencias claras. Evitá encuentros en casas,
              depósitos, estacionamientos vacíos o zonas sin movimiento.
            </p>

            <div className="safetyChecklistGrid">
              {safePointTips.map((tip) => (
                <article key={tip}>
                  <span>✓</span>
                  <p>{tip}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="safetyCard" id="datos">
            <span className="miniLabel">Privacidad</span>
            <h2>Datos que no debés compartir</h2>
            <p>
              Para coordinar un intercambio no necesitás compartir información
              sensible. Mantené la conversación dentro de TeLoCambio y compartí
              solo los datos mínimos necesarios para concretar el encuentro.
            </p>

            <div className="doNotShareGrid">
              {dontShareItems.map((item) => (
                <article key={item}>
                  <span>!</span>
                  <p>{item}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="safetyCard" id="consejos">
            <span className="miniLabel">Buenas prácticas</span>
            <h2>Consejos antes, durante y después del intercambio</h2>

            <div className="safetyAdviceColumns">
              <article>
                <h3>Antes</h3>
                <p>
                  Revisá fotos, videos, descripción, reputación y preguntas
                  respondidas.
                </p>
                <p>
                  Confirmá el punto seguro, horario y qué incluye cada parte del
                  intercambio.
                </p>
              </article>

              <article>
                <h3>Durante</h3>
                <p>Verificá que el producto coincida con lo publicado.</p>
                <p>
                  No entregues tu producto si la otra parte cambia condiciones
                  clave.
                </p>
              </article>

              <article>
                <h3>Después</h3>
                <p>Calificá la operación con honestidad.</p>
                <p>
                  Reportá comportamientos sospechosos o incumplimientos
                  relevantes.
                </p>
              </article>
            </div>
          </section>

          <section className="safetyCard" id="alertas">
            <span className="miniLabel">Atención</span>
            <h2>Señales de alerta</h2>
            <p>
              Si aparece alguna de estas situaciones, pausá la operación y no
              avances hasta sentirte seguro.
            </p>

            <div className="warningGrid">
              {warningSignals.map((signal) => (
                <article key={signal}>
                  <strong>Alerta</strong>
                  <p>{signal}</p>
                </article>
              ))}
            </div>
          </section>

          <section
            className="safetyCard safetyReputationCard"
            id="reputacion"
          >
            <div>
              <span className="miniLabel">Comunidad</span>
              <h2>La reputación ayuda a generar confianza</h2>
              <p>
                Después de cada operación, las personas pueden calificar el
                intercambio. Estas calificaciones construyen reputación y ayudan
                a que otros usuarios sepan con quién están coordinando.
              </p>
            </div>

            <div className="reputationGraphic">
              <strong>4.8</strong>
              <span>★★★★★</span>
              <p>Ejemplo de reputación visible en propuestas</p>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

export default Safety;
