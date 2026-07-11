import { Link } from "react-router";
import AppNavbar from "../components/AppNavbar";

const privacyHighlights = [
  {
    title: "Datos que usás en TeLoCambio",
    text: "Nombre visible, email, teléfono opcional, ubicación aproximada, publicaciones, propuestas, chats, fotos, videos y calificaciones.",
  },
  {
    title: "Para qué los usamos",
    text: "Para crear tu cuenta, mostrar publicaciones cercanas, calcular distancias, coordinar intercambios, prevenir abusos y mejorar la seguridad.",
  },
  {
    title: "Lo que no hacemos",
    text: "No vendemos tus datos personales. Tampoco pedimos claves bancarias, códigos de verificación ni datos sensibles para concretar intercambios.",
  },
];

const collectedData = [
  "Datos de cuenta: nombre visible, email, teléfono o WhatsApp si lo cargás voluntariamente.",
  "Datos de ubicación: provincia, localidad, partido o departamento, coordenadas aproximadas y radio de búsqueda configurado.",
  "Datos de publicaciones: productos o servicios buscados/ofrecidos, categorías, estado, descripción, fotos, videos y ubicación del intercambio.",
  "Datos de interacción: propuestas enviadas o recibidas, aceptación/rechazo, coordinación de punto seguro, chat interno y calificaciones.",
  "Datos técnicos: identificadores del dispositivo o navegador, fecha y hora de uso, eventos de seguridad, errores y registros necesarios para operar el servicio.",
];

const userRights = [
  "Acceder a los datos personales asociados a tu cuenta.",
  "Solicitar la corrección o actualización de información incorrecta.",
  "Solicitar la eliminación de datos cuando corresponda legalmente.",
  "Oponerte o limitar ciertos tratamientos cuando resulte aplicable.",
  "Solicitar información sobre cómo usamos y protegemos tus datos.",
];

function Privacy() {
  return (
    <main className="dashboardPage legalPage privacyPage">
      <AppNavbar />

      <section className="legalHero privacyHero privacyUnifiedHero">
        <div className="privacyUnifiedHeroMain">
          <h1>Cómo cuidamos tu privacidad</h1>
          <small>Última actualización: Julio 2026</small>
        </div>

        <div className="privacyUnifiedHeroIntro">
          <span className="badge">Privacidad</span>
          <p>
            En TeLoCambio usamos tus datos para que puedas publicar, encontrar
            intercambios cercanos, coordinar propuestas con otros usuarios y
            construir reputación dentro de la comunidad.
          </p>
        </div>
      </section>

      <section className="privacyHighlightsGrid">
        {privacyHighlights.map((item) => (
          <article key={item.title}>
            <span className="miniLabel">Resumen</span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className="legalLayout">
        <aside className="legalIndexCard">
          <span className="miniLabel">Contenido</span>
          <a href="#responsable">Responsable</a>
          <a href="#datos">Datos que recolectamos</a>
          <a href="#uso">Uso de la información</a>
          <a href="#visibilidad">Información visible</a>
          <a href="#compartir">Con quién compartimos datos</a>
          <a href="#seguridad">Seguridad y conservación</a>
          <a href="#derechos">Tus derechos</a>
          <a href="#contacto">Contacto</a>
        </aside>

        <section className="legalContentCard">
          <article id="responsable" className="legalSectionBlock">
            <span className="miniLabel">1</span>
            <h2>Responsable del tratamiento</h2>
            <p>
              La plataforma TeLoCambio será responsable del tratamiento de los
              datos personales que se carguen o generen durante el uso del sitio.
            </p>
          </article>

          <article id="datos" className="legalSectionBlock">
            <span className="miniLabel">2</span>
            <h2>Qué datos recolectamos</h2>
            <p>
              Recolectamos únicamente los datos necesarios para operar la cuenta,
              mostrar publicaciones relevantes, facilitar la coordinación de
              intercambios y mejorar la seguridad de la comunidad.
            </p>

            <ul className="privacyList">
              {collectedData.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article id="uso" className="legalSectionBlock">
            <span className="miniLabel">3</span>
            <h2>Para qué usamos tus datos</h2>
            <div className="privacyUseGrid">
              <div>
                <strong>Operar el servicio</strong>
                <p>
                  Crear y mantener tu cuenta, guardar publicaciones, enviar y
                  recibir propuestas, habilitar chats y registrar calificaciones.
                </p>
              </div>
              <div>
                <strong>Mostrar sugerencias cercanas</strong>
                <p>
                  Usamos tu localidad y radio configurado para priorizar
                  publicaciones dentro de la distancia que estás dispuesto a
                  recorrer.
                </p>
              </div>
              <div>
                <strong>Construir confianza</strong>
                <p>
                  Mostramos reputación, historial de calificaciones y señales de
                  seguridad para que puedas evaluar mejor con quién intercambiás.
                </p>
              </div>
              <div>
                <strong>Prevenir abusos</strong>
                <p>
                  Podemos analizar actividad sospechosa, denuncias, intentos de
                  fraude o incumplimientos de nuestros términos y condiciones.
                </p>
              </div>
            </div>
          </article>

          <article id="visibilidad" className="legalSectionBlock">
            <span className="miniLabel">4</span>
            <h2>Qué información puede ver otro usuario</h2>
            <p>
              Para facilitar el intercambio, otros usuarios pueden ver tu nombre
              visible, reputación, publicaciones activas, localidad aproximada,
              fotos o videos de tus publicaciones y la información que decidas
              compartir dentro del chat o la coordinación del punto seguro.
            </p>
            <div className="privacyWarningBox">
              <strong>No compartas datos sensibles</strong>
              <p>
                No compartas contraseñas, códigos de verificación, datos
                bancarios completos, imágenes de documentos, domicilio exacto,
                información de tarjetas o claves de billeteras digitales.
              </p>
            </div>
          </article>

          <article id="compartir" className="legalSectionBlock">
            <span className="miniLabel">5</span>
            <h2>Con quién podemos compartir información</h2>
            <p>
              No vendemos tus datos personales. Podemos compartir información en
              forma limitada cuando sea necesario para operar el servicio,
              cumplir obligaciones legales, responder requerimientos de autoridad
              competente, prevenir fraude o trabajar con proveedores técnicos que
              nos ayudan a alojar, mantener o proteger la plataforma.
            </p>
            <p>
              Si usamos proveedores externos, estos deberán tratar la información
              únicamente para las finalidades indicadas por TeLoCambio y bajo
              medidas razonables de confidencialidad y seguridad.
            </p>
          </article>

          <article id="seguridad" className="legalSectionBlock">
            <span className="miniLabel">6</span>
            <h2>Seguridad y conservación</h2>
            <p>
              Adoptamos medidas técnicas y organizativas para proteger la
              información frente a accesos no autorizados, pérdida, alteración o
              uso indebido. Aun así, ningún sistema conectado a internet puede
              garantizar seguridad absoluta.
            </p>
            <p>
              Conservaremos tus datos mientras tu cuenta esté activa o mientras
              sea necesario para cumplir finalidades operativas, legales,
              regulatorias, de seguridad, resolución de disputas o prevención de
              fraude. Cuando ya no sean necesarios, podremos eliminarlos,
              anonimizarlos o conservarlos bloqueados cuando la ley lo requiera.
            </p>
          </article>

          <article id="derechos" className="legalSectionBlock">
            <span className="miniLabel">7</span>
            <h2>Tus derechos sobre tus datos</h2>
            <p>
              De acuerdo con la normativa aplicable, podés solicitar información
              sobre tus datos personales y ejercer los derechos que correspondan.
            </p>
            <ul className="privacyList compact">
              {userRights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="legalSectionBlock">
            <span className="miniLabel">8</span>
            <h2>Cookies y tecnologías similares</h2>
            <p>
              Podemos usar cookies, almacenamiento local u otras tecnologías
              similares para mantener tu sesión, recordar preferencias, mejorar
              la experiencia de navegación, medir rendimiento, detectar errores y
              reforzar la seguridad del sitio.
            </p>
          </article>

          <article className="legalSectionBlock">
            <span className="miniLabel">9</span>
            <h2>Menores de edad</h2>
            <p>
              TeLoCambio no está dirigido a menores de edad. Si detectamos una
              cuenta creada por una persona que no cumple la edad mínima legal o
              autorizada para operar, podremos suspenderla o eliminarla.
            </p>
          </article>

          <article className="legalSectionBlock">
            <span className="miniLabel">10</span>
            <h2>Cambios en esta política</h2>
            <p>
              Podemos actualizar esta Política de Privacidad para reflejar cambios
              en el servicio, obligaciones legales o mejoras operativas. Cuando
              los cambios sean relevantes, procuraremos informarlo dentro del
              sitio o por los canales de contacto disponibles.
            </p>
          </article>

          <article id="contacto" className="legalSectionBlock contactBlock">
            <span className="miniLabel">Contacto</span>
            <h2>Consultas sobre privacidad</h2>
            <p>
              Para consultas o solicitudes relacionadas con privacidad y datos
              personales, podés comunicarte directamente con TeLoCambio desde
              nuestra página de Ayuda.
            </p>

            <Link to="/ayuda" className="primaryLink">
              Ir a la página de Ayuda
            </Link>

            <Link to="/terminos-y-condiciones" className="secondaryActionLink">
              Ver términos y condiciones
            </Link>
          </article>
        </section>
      </section>
    </main>
  );
}

export default Privacy;
