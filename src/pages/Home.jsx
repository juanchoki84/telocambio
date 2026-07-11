import { useEffect } from "react";
import { Link } from "react-router";
import "../App.css";
import exchangePeopleImage from "../assets/home-exchange-people-real.png";
import phoneImage from "../assets/home-phone.png";
import sofaImage from "../assets/home-sofa.png";
import bikeImage from "../assets/home-bike.png";
import consoleImage from "../assets/home-console.png";
import LogoMark from "../components/LogoMark";
import {
  ArrowRight,
  Baby,
  Bike,
  Briefcase,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  Gamepad2,
  Guitar,
  Heart,
  House,
  Laptop,
  MapPin,
  MapPinned,
  MessageCircle,
  PawPrint,
  PlayCircle,
  Plug,
  ShieldCheck,
  Shirt,
  Smartphone,
  Sparkles,
  Star,
  UsersRound,
  Wrench,
} from "lucide-react";

const categories = [
  {
    label: "Tecnología",
    hint: "Celulares, notebooks y periféricos",
    icon: Laptop,
  },
  {
    label: "Hogar y muebles",
    hint: "Muebles, decoración y objetos del hogar",
    icon: House,
  },
  {
    label: "Electrodomésticos",
    hint: "Cocina, limpieza y pequeños aparatos",
    icon: Plug,
  },
  {
    label: "Herramientas",
    hint: "Manual, eléctrica y uso profesional",
    icon: Wrench,
  },
  {
    label: "Deportes y fitness",
    hint: "Entrenamiento, outdoor y accesorios",
    icon: Dumbbell,
  },
  {
    label: "Accesorios para vehículos",
    hint: "Auto, moto y complementos",
    icon: Car,
  },
  {
    label: "Mascotas",
    hint: "Accesorios, cuidado y bienestar",
    icon: PawPrint,
  },
  {
    label: "Moda",
    hint: "Indumentaria, calzado y accesorios",
    icon: Shirt,
  },
  {
    label: "Juegos y juguetes",
    hint: "Consolas, juguetes y entretenimiento",
    icon: Gamepad2,
  },
  {
    label: "Bebés",
    hint: "Artículos infantiles y primeras etapas",
    icon: Baby,
  },
  {
    label: "Belleza y cuidado personal",
    hint: "Cuidado, estética y bienestar diario",
    icon: Sparkles,
  },
  {
    label: "Servicios",
    hint: "Oficios, asesorías y trabajo independiente",
    icon: Briefcase,
  },
];

const showcaseListings = [
  {
    title: "iPhone 13 128GB",
    description: "Impecable, con funda y cargador original.",
    category: "Tecnología",
    categoryTone: "tech",
    match: "96%",
    wants: "Notebook",
    location: "Palermo, CABA",
    image: phoneImage,
    WantIcon: Laptop,
  },
  {
    title: "Sofá 2 cuerpos",
    description: "Excelente estado, cómodo y listo para retirar.",
    category: "Hogar y muebles",
    categoryTone: "home",
    match: "89%",
    wants: "Bicicleta",
    location: "Villa Urquiza, CABA",
    image: sofaImage,
    WantIcon: Bike,
  },
  {
    title: "Bicicleta MTB",
    description: "Rodado 29, 21 cambios, lista para usar.",
    category: "Deportes y Fitness",
    categoryTone: "sports",
    match: "91%",
    wants: "Guitarra",
    location: "Haedo, Buenos Aires",
    image: bikeImage,
    WantIcon: Guitar,
  },
  {
    title: "PlayStation 5",
    description: "Con 2 joysticks y juegos incluidos.",
    category: "Tecnología",
    categoryTone: "games",
    match: "94%",
    wants: "Celular",
    location: "Belgrano, CABA",
    image: consoleImage,
    WantIcon: Smartphone,
  },
];

const heroBenefits = [
];

const processSteps = [
  {
    number: "01",
    icon: ClipboardCheck,
    title: "Publicás lo que buscás",
    text: "Contanos qué producto o servicio necesitás conseguir.",
    tone: "teal",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Cargás lo que ofrecés",
    text: "Sumá aquello que podés entregar para concretar el intercambio.",
    tone: "yellow",
  },
  {
    number: "03",
    icon: UsersRound,
    title: "Recibís matches",
    text: "Te mostramos personas con publicaciones realmente compatibles.",
    tone: "blue",
  },
  {
    number: "04",
    icon: MessageCircle,
    title: "Coordinás el cambio",
    text: "Conversá, acordá un punto seguro y completá la operación.",
    tone: "purple",
  },
];

const panelBenefits = [
  {
    icon: ShieldCheck,
    title: "Usuarios con reputación",
    text: "Más confianza",
    tone: "green",
  },
  {
    icon: ClipboardCheck,
    title: "Publicaciones verificadas",
    text: "Checklist por categoría",
    tone: "blue",
  },
  {
    icon: MessageCircle,
    title: "Chat interno seguro",
    text: "Coordiná todo",
    tone: "purple",
  },
  {
    icon: MapPinned,
    title: "Puntos seguros",
    text: "Más tranquilidad",
    tone: "orange",
  },
];

function ListingPreviewCard({ listing, index }) {
  const WantIcon = listing.WantIcon;

  return (
    <article
      className="homeListingPreviewCard"
      style={{ "--delay": `${index * 0.12}s` }}
    >
      <div className="homeListingImageWrap">
        <img src={listing.image} alt={listing.title} />
        <span className="homeListingMatchPill">Match</span>
        <span className="homeListingScorePill">{listing.match}</span>
      </div>

      <div className="homeListingBody">
        <span className={`homeListingCategory ${listing.categoryTone}`}>
          {listing.category}
        </span>

        <h3>{listing.title}</h3>
        <p>{listing.description}</p>

        <div className="homeListingWantsBox">
          <div>
            <span>Busca a cambio:</span>
            <strong>{listing.wants}</strong>
          </div>
          <WantIcon strokeWidth={2.1} />
        </div>

        <div className="homeListingLocation">
          <MapPin size={17} strokeWidth={2.2} />
          <span>{listing.location}</span>
        </div>

        <div className="homeListingActions">
          <button type="button">Me interesa</button>
          <span>
            <Heart size={19} strokeWidth={2.4} />
          </span>
        </div>
      </div>
    </article>
  );
}

function Home() {
  useEffect(() => {
    document.body.classList.add("homeFullBackgroundPage");

    return () => {
      document.body.classList.remove("homeFullBackgroundPage");
    };
  }, []);
  return (
    <main className="app homeShowcaseApp">
      <nav className="navbar homeShowcaseNavbar">
        <Link to="/" className="brand homeBrand">
          <LogoMark />
          <span>TeLoCambio</span>
        </Link>

        <div className="navLinks homeNavLinks">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#categorias">Categorías</a>
          <a href="#seguridad">Seguridad</a>
          
        </div>

        <div className="homeNavActions">
          <Link to="/login" className="loginLink homeLoginButton">
            Ingresar
          </Link>
        </div>
      </nav>

      <section className="homeShowcaseHero">
        <div className="homeHeroCopy">
          <span className="badge homeHeroBadge">
            <Sparkles size={16} strokeWidth={2.4} />
            E-trueque inteligente
          </span>

          <h1 className="homeHeroTitle">
            <span>Cambiá</span>
            <strong>lo que tenés</strong>
            <span>
              por lo que <em>querés.</em>
            </span>
          </h1>

          <p className="homeHeroText">
            Publicá qué buscás, cargá qué ofrecés y encontrá personas con lo que
            necesitás.
          </p>

          <div className="homeHeroActions">
            <Link to="/login" className="primaryButton homePrimaryHeroButton">
              Empezar ahora
              <ArrowRight size={20} strokeWidth={2.6} />
            </Link>

            <a href="#como-funciona" className="secondaryButton homeSecondaryHeroButton">
              Cómo funciona
              <ArrowRight size={20} strokeWidth={2.6} />
            </a>
          </div>

          <div className="homeHeroMiniBenefits">
            {heroBenefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <article key={benefit.title}>
                  <Icon size={27} strokeWidth={2.2} />
                  <div>
                    <strong>{benefit.title}</strong>
                    <span>{benefit.text}</span>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="homeHeroPeopleVisual" aria-hidden="true">
            <img src={exchangePeopleImage} alt="" />
          </div>
        </div>

        <div className="homePanelShowcase" aria-label="Ejemplos de publicaciones en TeLoCambio">
          <div className="homePanelDoodle homePanelDoodleOne" aria-hidden="true" />
          <div className="homePanelDoodle homePanelDoodleTwo" aria-hidden="true" />

          <div className="homePanelTitleRow">
            
            <h2>
              ¡Buscá, <span>ofrecé</span> y cambiá!
            </h2>
            
          </div>

          <div className="homePanelCardShell">
            <button type="button" className="homePanelArrow previous" aria-label="Anterior">
              <ChevronLeft size={28} strokeWidth={2.4} />
            </button>

            <div className="homeListingsPreviewGrid">
              {showcaseListings.map((listing, index) => (
                <ListingPreviewCard
                  key={listing.title}
                  listing={listing}
                  index={index}
                />
              ))}
            </div>

            <button type="button" className="homePanelArrow next" aria-label="Siguiente">
              <ChevronRight size={28} strokeWidth={2.4} />
            </button>
          </div>

          <div className="homePanelDots" aria-hidden="true">
            <span className="active" />
            <span />
            <span />
            <span />
            <span />
          </div>

          <div className="homePanelBenefitsRow">
            {panelBenefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <article key={benefit.title} className={benefit.tone}>
                  <span>
                    <Icon size={25} strokeWidth={2.2} />
                  </span>
                  <div>
                    <strong>{benefit.title}</strong>
                    <p>{benefit.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="section homeHowItWorksSection homeImpactProcess"
        id="como-funciona"
      >
        <span className="homeProcessGlow homeProcessGlowOne" aria-hidden="true" />
        <span className="homeProcessGlow homeProcessGlowTwo" aria-hidden="true" />

        <div className="homeProcessHeader">
          <div>
            <span className="eyebrow homeLightEyebrow">Proceso simple</span>
            <h2>De lo que buscás al intercambio, en cuatro pasos.</h2>
            <p>
              Una experiencia clara para publicar, descubrir coincidencias y
              coordinar con otras personas sin perder tiempo.
            </p>
          </div>

          <article className="homeProcessIntroCard">
            <span>
              <PlayCircle size={26} strokeWidth={2.2} />
            </span>
            <div>
              <strong>Simple de principio a fin</strong>
              <p>Publicá, conectá y coordiná desde un mismo lugar.</p>
            </div>
          </article>
        </div>

        <div className="homeProcessTimeline">
          {processSteps.map((step, index) => {
            const Icon = step.icon;

            return (
              <article
                className={`homeProcessStep ${step.tone}`}
                key={step.number}
              >
                <div className="homeProcessStepTop">
                  <span className="homeProcessNumber">{step.number}</span>
                  <span className="homeProcessIcon">
                    <Icon size={25} strokeWidth={2.2} />
                  </span>
                </div>

                <h3>{step.title}</h3>
                <p>{step.text}</p>

                {index < processSteps.length - 1 && (
                  <span className="homeProcessStepArrow" aria-hidden="true">
                    <ArrowRight size={20} strokeWidth={2.4} />
                  </span>
                )}
              </article>
            );
          })}
        </div>

        <div className="homeProcessFooter">
          <div>
            <CheckCircle2 size={21} strokeWidth={2.4} />
            <span>No necesitás dinero para empezar a intercambiar.</span>
          </div>

          <Link to="/login" className="homeProcessCta">
            Crear mi primera publicación
            <ArrowRight size={18} strokeWidth={2.5} />
          </Link>
        </div>
      </section>

      <section className="section categoriesSection" id="categorias">
        <div className="categoriesHeader homeCategoriesHeader">
          <div>
            <span className="eyebrow">Categorías</span>
            <h2>Un universo de posibilidades para intercambiar.</h2>
          </div>
        </div>

        <div className="categoriesShowcase homeCategoriesShowcase">
          {categories.map((category, index) => {
            const Icon = category.icon;

            return (
              <article
                className="modernCategoryCard homeCategoryCard"
                key={category.label}
              >
                <div className="homeCategoryCardTop">
                  <span className="categoryCardIndex">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className="categoryIconShell">
                    <Icon className="categorySvgIcon" strokeWidth={2.1} />
                  </div>
                </div>

                <strong>{category.label}</strong>
                <p>{category.hint}</p>

                <span className="homeCategoryCardArrow" aria-hidden="true">
                  <ArrowRight size={18} strokeWidth={2.4} />
                </span>
              </article>
            );
          })}
        </div>

        <div className="homeCategoriesFooter">
          <div>
            <Sparkles size={21} strokeWidth={2.3} />
            <span>
              Cada publicación combina lo que buscás con aquello que ofrecés.
            </span>
          </div>

          <Link to="/login">
            Explorar oportunidades
            <ArrowRight size={18} strokeWidth={2.5} />
          </Link>
        </div>
      </section>

      <section className="trustSection homeTrustSection" id="seguridad">
        <span className="homeTrustGlow" aria-hidden="true" />

        <div className="homeTrustCopy">
          <span className="eyebrow homeLightEyebrow">Confianza</span>
          <h2>La tranquilidad también forma parte del intercambio.</h2>
          <p>
            Reputación, información clara y herramientas de coordinación para
            que cada decisión sea más segura.
          </p>

          <Link to="/seguridad" className="homeTrustCta">
            Conocer recomendaciones de seguridad
            <ArrowRight size={18} strokeWidth={2.5} />
          </Link>
        </div>

        <div className="homeTrustExperience">
          <article className="homeTrustScoreCard">
            <div className="homeTrustScoreIcon">
              <ShieldCheck size={30} strokeWidth={2.2} />
            </div>

            <div>
              <span>Confianza visible</span>
              <strong>4.8</strong>
              <p>★★★★★</p>
            </div>
          </article>

          <div className="homeTrustFeatureGrid">
            {panelBenefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <article key={benefit.title} className={benefit.tone}>
                  <span>
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <div>
                    <strong>{benefit.title}</strong>
                    <p>{benefit.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="homeFinalCta">
        <span className="homeFinalCtaGlow homeFinalCtaGlowOne" aria-hidden="true" />
        <span className="homeFinalCtaGlow homeFinalCtaGlowTwo" aria-hidden="true" />

        <div>
          <span className="eyebrow">Tu próximo intercambio</span>
          <h2>Eso que ya no usás puede acercarte a lo que querés.</h2>
          <p>
            Sumate a TeLoCambio y empezá a descubrir nuevas oportunidades.
          </p>
        </div>

        <Link to="/login" className="primaryButton homeFinalCtaButton">
          Empezar ahora
          <ArrowRight size={20} strokeWidth={2.6} />
        </Link>
      </section>
    </main>
  );
}

export default Home;
