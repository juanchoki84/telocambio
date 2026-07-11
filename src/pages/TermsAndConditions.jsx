import { Link } from "react-router";
import LogoMark from "../components/LogoMark";

const lastUpdated = "2 de julio de 2026";

function TermsAndConditions() {
  return (
    <main className="legalPage">
      <nav className="legalNavbar">
        <Link to="/" className="appNavbarBrand legalBrandLink">
          <LogoMark />
          <span>TeLoCambio</span>
        </Link>

        <div className="legalNavbarActions">
          <Link to="/login" className="secondaryButton legalNavButton">
            Ingresar
          </Link>
          <Link to="/panel" className="primaryButton legalNavButton">
            Ir al panel
          </Link>
        </div>
      </nav>

      <section className="legalHero legalTermsHero">
        <div className="legalTermsHeroMain">
          <h1>Términos y condiciones de uso</h1>
          <small>Última actualización: {lastUpdated}</small>
        </div>

        <div className="legalTermsHeroIntro">
          <span className="badge">Marco legal</span>
          <p>
            Estos términos regulan el acceso y uso de TeLoCambio, una plataforma
            digital que conecta personas interesadas en realizar intercambios de
            productos o servicios.
          </p>
        </div>
      </section>

      <section className="legalLayout">
        <aside className="legalIndexCard">
          <span className="miniLabel">Contenido</span>
          <a href="#aceptacion">1. Aceptación</a>
          <a href="#servicio">2. Servicio de TeLoCambio</a>
          <a href="#usuarios">3. Usuarios y cuenta</a>
          <a href="#publicaciones">4. Publicaciones</a>
          <a href="#intercambios">5. Intercambios</a>
          <a href="#seguridad">6. Seguridad y puntos de entrega</a>
          <a href="#reputacion">7. Reputación</a>
          <a href="#prohibiciones">8. Usos prohibidos</a>
          <a href="#responsabilidad">9. Responsabilidad</a>
          <a href="#datos">10. Datos y privacidad</a>
          <a href="#modificaciones">11. Cambios</a>
          <a href="#ley">12. Ley aplicable</a>
          <a href="#contacto">13. Contacto</a>
        </aside>

        <article className="legalContentCard">
          <section id="aceptacion">
            <h2>1. Aceptación de los términos</h2>
            <p>
              Al registrarte, acceder, navegar o utilizar TeLoCambio, aceptás
              estos Términos y Condiciones, junto con las políticas, avisos o
              reglas complementarias que la plataforma publique o comunique.
            </p>
            <p>
              Si no estás de acuerdo con estos términos, deberás abstenerte de
              utilizar el sitio, la aplicación o cualquiera de sus servicios.
            </p>
          </section>

          <section id="servicio">
            <h2>2. Qué es TeLoCambio</h2>
            <p>
              TeLoCambio es una plataforma tecnológica que permite a sus usuarios
              publicar qué buscan, qué ofrecen a cambio, recibir coincidencias,
              enviar propuestas, conversar por chat y coordinar intercambios.
            </p>
            <p>
              TeLoCambio no compra, vende, entrega, almacena, verifica físicamente
              ni toma posesión de los productos o servicios publicados. La
              plataforma actúa como intermediaria tecnológica para facilitar el
              contacto entre usuarios.
            </p>
            <p>
              Las operaciones se concretan directamente entre los usuarios, bajo
              su exclusiva responsabilidad. TeLoCambio no garantiza que una
              publicación sea cierta, que un producto se encuentre en determinado
              estado, que un usuario concrete la operación ni que el intercambio
              resulte satisfactorio para las partes.
            </p>
          </section>

          <section id="usuarios">
            <h2>3. Usuarios, registro y cuenta</h2>
            <p>
              Para utilizar las funciones principales de TeLoCambio, el usuario
              deberá crear una cuenta con información verdadera, completa y
              actualizada. Cada usuario es responsable por la confidencialidad de
              sus credenciales y por todas las acciones realizadas desde su
              cuenta.
            </p>
            <p>
              El servicio está destinado a personas con capacidad legal para
              contratar. Los menores de edad no podrán utilizar la plataforma sin
              autorización suficiente de sus representantes legales, cuando ello
              corresponda según la normativa aplicable.
            </p>
            <p>
              TeLoCambio podrá suspender, limitar o cancelar cuentas ante usos
              indebidos, reportes, conductas sospechosas, incumplimientos de estos
              términos o cualquier actividad que pueda afectar la seguridad de la
              comunidad.
            </p>
          </section>

          <section id="publicaciones">
            <h2>4. Publicaciones y contenido cargado por usuarios</h2>
            <p>
              Los usuarios podrán crear publicaciones indicando qué producto o
              servicio buscan, qué ofrecen a cambio, ubicación aproximada,
              descripción, estado declarado, fotos, videos y demás información
              relevante.
            </p>
            <p>
              El usuario declara que cuenta con derechos suficientes sobre el
              contenido que publica y que la información proporcionada es clara,
              verdadera y no engañosa. El usuario es responsable por las fotos,
              videos, textos, comentarios y demás contenidos que cargue en la
              plataforma.
            </p>
            <p>
              TeLoCambio podrá moderar, ocultar, pausar o eliminar publicaciones
              que infrinjan estos términos, que sean reportadas por otros usuarios
              o que puedan afectar la seguridad, reputación o funcionamiento del
              servicio.
            </p>
          </section>

          <section id="intercambios">
            <h2>5. Propuestas, matches e intercambios</h2>
            <p>
              La plataforma puede sugerir coincidencias o publicaciones de interés
              mediante criterios como categorías, ubicación, radio de búsqueda,
              publicaciones activas, preferencias declaradas y comportamiento de
              uso. Dichas sugerencias son orientativas y no constituyen una
              garantía de compatibilidad real.
            </p>
            <p>
              Cuando un usuario marca interés, acepta una propuesta o inicia una
              conversación, las partes deberán revisar cuidadosamente la
              información de la publicación, el estado del producto, la reputación
              del otro usuario y las condiciones del intercambio antes de concretar
              la operación.
            </p>
            <p>
              Todo acuerdo sobre diferencias de valor, dinero adicional, gastos,
              traslados, plazos, condiciones de entrega o cualquier otra cuestión
              vinculada al intercambio será acordado directamente entre los
              usuarios.
            </p>
          </section>

          <section id="seguridad">
            <h2>6. Seguridad y puntos de entrega</h2>
            <p>
              TeLoCambio podrá ofrecer herramientas para que los usuarios propongan
              y coordinen puntos de entrega seguros, tales como lugares públicos,
              zonas iluminadas, comercios, espacios con
              cámaras o puntos de encuentro de alta circulación.
            </p>
            <p>
              Estos puntos son una herramienta de coordinación y prevención, pero
              no implican que TeLoCambio participe presencialmente, supervise,
              garantice o asuma responsabilidad por la entrega o por la conducta de
              los usuarios.
            </p>
            <p>
              Recomendamos no compartir domicilios exactos cuando no sea necesario,
              revisar los productos antes de entregarlos, evitar lugares aislados,
              coordinar durante horarios razonables y cancelar el encuentro ante
              cualquier situación sospechosa.
            </p>
          </section>

          <section id="reputacion">
            <h2>7. Reputación, calificaciones y comentarios</h2>
            <p>
              Los usuarios podrán calificar las operaciones realizadas y dejar
              comentarios sobre su experiencia. Estas calificaciones contribuyen a
              la reputación pública del usuario dentro de TeLoCambio.
            </p>
            <p>
              Las calificaciones deben basarse en experiencias reales, ser
              respetuosas y no contener insultos, discriminación, amenazas, datos
              personales sensibles, información falsa o contenido contrario a la
              ley.
            </p>
            <p>
              TeLoCambio podrá moderar, ocultar o eliminar calificaciones o
              comentarios cuando detecte abuso, manipulación, fraude, lenguaje
              ofensivo o incumplimiento de estos términos.
            </p>
          </section>

          <section id="prohibiciones">
            <h2>8. Productos, servicios y conductas prohibidas</h2>
            <p>
              Está prohibido publicar, ofrecer, solicitar, intercambiar o promover
              bienes o servicios ilegales, robados, falsificados, peligrosos,
              restringidos o que vulneren derechos de terceros.
            </p>
            <p>
              A modo enunciativo, no se permiten armas, municiones, explosivos,
              drogas, medicamentos sujetos a receta, productos falsificados,
              documentación personal, datos bancarios, contenido sexual explícito,
              animales cuando la normativa lo prohíba, productos que infrinjan
              propiedad intelectual, bienes robados o servicios ilícitos.
            </p>
            <p>
              También está prohibido usar la plataforma para cometer fraudes,
              hostigar a otros usuarios, eludir sistemas de seguridad, manipular
              reputaciones, publicar información engañosa, cargar malware o afectar
              el normal funcionamiento del servicio.
            </p>
          </section>

          <section id="responsabilidad">
            <h2>9. Responsabilidad de la plataforma</h2>
            <p>
              TeLoCambio no es parte de los acuerdos celebrados entre usuarios. La
              plataforma no garantiza la existencia, calidad, legitimidad,
              titularidad, estado, valor, utilidad, seguridad o disponibilidad de
              los productos o servicios publicados.
            </p>
            <p>
              En la máxima medida permitida por la normativa aplicable, TeLoCambio
              no será responsable por daños, pérdidas, reclamos, incumplimientos,
              accidentes, lesiones, diferencias económicas, controversias entre
              usuarios o cualquier consecuencia derivada de intercambios acordados
              fuera o dentro de la plataforma.
            </p>
            <p>
              Sin perjuicio de ello, TeLoCambio podrá colaborar con reportes,
              medidas de moderación, suspensión de cuentas y conservación de
              información cuando resulte necesario o legalmente requerido.
            </p>
          </section>

          <section id="datos">
            <h2>10. Datos personales y privacidad</h2>
            <p>
              Para operar la plataforma, TeLoCambio podrá tratar datos como nombre,
              email, teléfono, ubicación aproximada, publicaciones, fotos, videos,
              mensajes, propuestas, calificaciones y datos técnicos de uso.
            </p>
            <p>
              La ubicación se utiliza para calcular distancias y mostrar
              publicaciones dentro del radio configurado por el usuario. La
              plataforma no debería mostrar públicamente domicilios exactos salvo
              que el usuario los cargue voluntariamente en una conversación o
              publicación.
            </p>
            <p>
              El tratamiento de datos personales deberá complementarse con una
              Política de Privacidad específica, conforme a la normativa aplicable
              en la República Argentina, incluyendo la Ley 25.326 de Protección de
              Datos Personales y normas complementarias.
            </p>
          </section>

          <section id="modificaciones">
            <h2>11. Cambios en el servicio y en estos términos</h2>
            <p>
              TeLoCambio podrá modificar, suspender o discontinuar funcionalidades
              del servicio, así como actualizar estos Términos y Condiciones para
              reflejar cambios legales, técnicos, comerciales o de seguridad.
            </p>
            <p>
              Cuando los cambios sean relevantes, la plataforma podrá informarlos
              por medios razonables, como avisos dentro del sitio, email o
              notificaciones. El uso continuado de TeLoCambio luego de la entrada
              en vigencia de los cambios implicará la aceptación de la nueva
              versión.
            </p>
          </section>

          <section id="ley">
            <h2>12. Ley aplicable y jurisdicción</h2>
            <p>
              Estos términos se rigen por las leyes de la República Argentina.
              Cualquier controversia relacionada con su interpretación, validez,
              cumplimiento o uso de la plataforma será sometida a los tribunales
              competentes, salvo que normas de orden público, defensa del
              consumidor u otra legislación aplicable establezcan una jurisdicción
              diferente.
            </p>
          </section>

          <section id="contacto">
            <h2>13. Contacto</h2>
            <p>
              Para consultas, reportes, reclamos o solicitudes relacionadas con
              estos términos, los usuarios podrán comunicarse con TeLoCambio a
              través de nuestra{" "}
              <Link to="/ayuda" className="legalInlineLink">
                página de Ayuda
              </Link>
              , disponible como canal directo de contacto y soporte dentro del
              sitio.
            </p>
          </section>
        </article>
      </section>
    </main>
  );
}

export default TermsAndConditions;
