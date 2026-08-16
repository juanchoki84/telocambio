import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { logoutUser } from "../services/authService";
import {
  listenActiveExchanges,
  listenUserExchanges,
  listenUserInterests,
} from "../services/exchangeService";
import { listenUserChats } from "../services/chatService";
import { buildMatches } from "../utils/matchUtils";
import LogoMark from "./LogoMark";
import "./AppNavbar.css";

function getInitials(nameOrEmail) {
  if (!nameOrEmail) return "U";

  const cleanValue = nameOrEmail.trim();

  if (cleanValue.includes("@")) {
    return cleanValue[0].toUpperCase();
  }

  const words = cleanValue.split(" ").filter(Boolean);

  if (words.length === 1) {
    return words[0][0].toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function Badge({ count, type = "default" }) {
  if (!count) return null;

  return (
    <span
      className={
        type === "message"
          ? "navNotificationBadge navMessageBadge"
          : "navNotificationBadge"
      }
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function AppNavbar() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [myExchanges, setMyExchanges] = useState([]);
  const [allExchanges, setAllExchanges] = useState([]);
  const [receivedInterests, setReceivedInterests] = useState([]);
  const [userChats, setUserChats] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 760px)").matches;
  });

  const isLoggedIn = Boolean(user?.uid);

  const userName = user?.displayName || user?.email || "Usuario";
  const initials = getInitials(userName);

  useEffect(() => {
    if (!isLoggedIn) {
      setMyExchanges([]);
      setAllExchanges([]);
      setReceivedInterests([]);
      setUserChats([]);
      return undefined;
    }

    const unsubscribeMyExchanges = listenUserExchanges(
      user.uid,
      setMyExchanges
    );

    const unsubscribeActiveExchanges = listenActiveExchanges(
      setAllExchanges
    );

    const unsubscribeInterests = listenUserInterests(
      user.uid,
      ({ received }) => {
        setReceivedInterests(received || []);
      }
    );

    const unsubscribeChats = listenUserChats(
      user.uid,
      setUserChats
    );

    return () => {
      unsubscribeMyExchanges?.();
      unsubscribeActiveExchanges?.();
      unsubscribeInterests?.();
      unsubscribeChats?.();
    };
  }, [isLoggedIn, user?.uid]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 760px)");

    const handleViewportChange = (event) => {
      setIsMobileViewport(event.matches);

      if (!event.matches) {
        setMobileMenuOpen(false);
      }
    };

    setIsMobileViewport(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleViewportChange);

      return () => {
        mediaQuery.removeEventListener("change", handleViewportChange);
      };
    }

    mediaQuery.addListener(handleViewportChange);

    return () => {
      mediaQuery.removeListener(handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const matchCount = useMemo(() => {
    if (!user?.uid) return 0;

    const matches = buildMatches(
      myExchanges,
      allExchanges,
      user.uid
    );

    /*
      Una misma publicación externa puede coincidir con varias
      publicaciones propias. El badge debe contar cada publicación
      externa una sola vez, igual que la página de Matches.
    */
    const uniqueExternalPublicationIds = new Set(
      matches
        .map((match) => {
          const externalExchangeId = String(
            match?.otherExchange?.id || ""
          ).trim();

          return externalExchangeId || match?.id || "";
        })
        .filter(Boolean)
    );

    return uniqueExternalPublicationIds.size;
  }, [myExchanges, allExchanges, user?.uid]);

  const pendingInterestCount = useMemo(() => {
    return receivedInterests.filter(
      (item) => item.status === "pending"
    ).length;
  }, [receivedInterests]);

  const unreadMessagesCount = useMemo(() => {
    return userChats.reduce((total, chat) => {
      return total + Number(chat.unreadCount || 0);
    }, 0);
  }, [userChats]);

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logoutUser();
    navigate("/");
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  if (!isLoggedIn) {
    return null;
  }

  if (isMobileViewport) {
    return (
      <header className="tlcMobileNavbar">
        <div className="tlcMobileUserRow">
          <div className="tlcMobileUserIdentity">
            <div className="userAvatar">
              {initials}
            </div>

            <div className="tlcMobileUserInfo">
              <strong>{userName}</strong>
              <small>Cuenta activa</small>
            </div>
          </div>

          <button
            type="button"
            className="tlcMobileLogoutButton"
            onClick={handleLogout}
          >
            Salir
          </button>
        </div>

        <div className="tlcMobileBrandRow">
          <Link
            to="/panel"
            className="tlcMobileBrand"
            onClick={closeMobileMenu}
          >
            <LogoMark />
            <span>TeLoCambio</span>
          </Link>

          <button
            type="button"
            className={
              mobileMenuOpen
                ? "tlcMobileMenuButton active"
                : "tlcMobileMenuButton"
            }
            aria-label={
              mobileMenuOpen
                ? "Cerrar menú"
                : "Abrir menú"
            }
            aria-expanded={mobileMenuOpen}
            onClick={() =>
              setMobileMenuOpen((current) => !current)
            }
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        {mobileMenuOpen && (
          <nav className="tlcMobileMenu">
            <NavLink
              to="/panel"
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                isActive
                  ? "tlcMobileMenuLink active"
                  : "tlcMobileMenuLink"
              }
            >
              <span>Panel</span>
              <span className="tlcMobileMenuChevron">›</span>
            </NavLink>

            <NavLink
              to="/matches"
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                isActive
                  ? "tlcMobileMenuLink active"
                  : "tlcMobileMenuLink"
              }
            >
              <span className="tlcMobileMenuLabel">
                Matches
                <Badge count={matchCount} />
              </span>
              <span className="tlcMobileMenuChevron">›</span>
            </NavLink>

            <NavLink
              to="/propuestas"
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                isActive
                  ? "tlcMobileMenuLink active"
                  : "tlcMobileMenuLink"
              }
            >
              <span className="tlcMobileMenuLabel">
                Propuestas
                <Badge count={pendingInterestCount} />
              </span>
              <span className="tlcMobileMenuChevron">›</span>
            </NavLink>

            <NavLink
              to="/favoritos"
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                isActive
                  ? "tlcMobileMenuLink active"
                  : "tlcMobileMenuLink"
              }
            >
              <span>Favoritos</span>
              <span className="tlcMobileMenuChevron">›</span>
            </NavLink>

            <NavLink
              to="/chats"
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                isActive
                  ? "tlcMobileMenuLink active"
                  : "tlcMobileMenuLink"
              }
            >
              <span className="tlcMobileMenuLabel">
                Chats
                <Badge
                  count={unreadMessagesCount}
                  type="message"
                />
              </span>
              <span className="tlcMobileMenuChevron">›</span>
            </NavLink>

            <NavLink
              to="/publicar"
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                isActive
                  ? "tlcMobileMenuLink active"
                  : "tlcMobileMenuLink"
              }
            >
              <span>Publicar</span>
              <span className="tlcMobileMenuChevron">›</span>
            </NavLink>

            <NavLink
              to="/usuario"
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                isActive
                  ? "tlcMobileMenuLink active"
                  : "tlcMobileMenuLink"
              }
            >
              <span>Mi perfil</span>
              <span className="tlcMobileMenuChevron">›</span>
            </NavLink>
          </nav>
        )}
      </header>
    );
  }

  return (
    <header className="mainAppNavbar">
      <div className="mainAppNavbarInner">
        <Link to="/panel" className="appNavbarBrand">
          <LogoMark />
          <span>TeLoCambio</span>
        </Link>

        <nav className="appNavbarLinks">
          <NavLink
            to="/panel"
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            Panel
          </NavLink>

          <NavLink
            to="/matches"
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            <span>Matches</span>
            <Badge count={matchCount} />
          </NavLink>

          <NavLink
            to="/propuestas"
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            <span>Propuestas</span>
            <Badge count={pendingInterestCount} />
          </NavLink>

          <NavLink
            to="/favoritos"
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            Favoritos
          </NavLink>

          <NavLink
            to="/chats"
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            <span>Chats</span>
            <Badge
              count={unreadMessagesCount}
              type="message"
            />
          </NavLink>

          <NavLink
            to="/publicar"
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            Publicar
          </NavLink>

          <NavLink
            to="/usuario"
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            Mi perfil
          </NavLink>
        </nav>

        <div className="appNavbarUser">
          <div className="userAvatar">
            {initials}
          </div>

          <div className="userInfo">
            <span>{userName}</span>
            <small>Cuenta activa</small>
          </div>

          <button
            type="button"
            className="navbarLogoutButton"
            onClick={handleLogout}
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}

export default AppNavbar;