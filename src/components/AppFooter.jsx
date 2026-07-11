import { Link } from "react-router";

const footerLinks = [
  {
    label: "Términos y condiciones",
    to: "/terminos-y-condiciones",
  },
  {
    label: "Cómo cuidamos tu privacidad",
    to: "/privacidad",
  },
  {
    label: "Ayuda",
    to: "/ayuda",
  },
  {
    label: "Seguridad en intercambios",
    to: "/seguridad",
  },
  {
    label: "Defensa del consumidor",
    href: "https://www.argentina.gob.ar/justicia/derechofacil/leysimple/defensa-del-consumidor",
  },
];

function AppFooter() {
  return (
    <footer className="appFooter">
      <div className="appFooterInner">
        <nav className="appFooterLinks" aria-label="Enlaces legales">
          {footerLinks.map((link) =>
            link.href ? (
              <a
                href={link.href}
                key={link.label}
                target="_blank"
                rel="noreferrer"
              >
                {link.label}
              </a>
            ) : (
              <Link to={link.to} key={link.label}>
                {link.label}
              </Link>
            )
          )}
        </nav>

        <div className="appFooterLegal">
          <p>Copyright © 2026 TeLoCambio. Todos los derechos reservados.</p>
          <p>
            Plataforma de conexión entre usuarios para coordinar intercambios.
            TeLoCambio no interviene como parte compradora, vendedora ni
            propietaria de los productos o servicios publicados.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default AppFooter;