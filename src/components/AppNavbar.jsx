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
    if (!mobileMenuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    const handleResize = () => {
      if (window.innerWidth > 760) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
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

  return (
    <header
      className={
        mobileMenuOpen
          ? "mainAppNavbar mobileMenuIsOpen"
          : "mainAppNavbar"
      }
    >
      <div className="mainAppNavbarInner">
        <div className="appNavbarUser">
          <div className="appNavbarUserIdentity">
            <div className="userAvatar">
              {initials}
            </div>

            <div className="userInfo">
              <span>{userName}</span>
              <small>Cuenta activa</small>
            </div>
          </div>

          <button
            type="button"
            className="navbarLogoutButton"
            onClick={handleLogout}
          >
            Salir
          </button>
        </div>

        <Link
          to="/panel"
          className="appNavbarBrand"
          onClick={closeMobileMenu}
        >
          <LogoMark />
          <span>TeLoCambio</span>
        </Link>

        <button
          type="button"
          className={
            mobileMenuOpen
              ? "appNavbarMobileMenuButton active"
              : "appNavbarMobileMenuButton"
          }
          aria-label={
            mobileMenuOpen
              ? "Cerrar menú de navegación"
              : "Abrir menú de navegación"
          }
          aria-expanded={mobileMenuOpen}
          aria-controls="app-main-navigation"
          onClick={() =>
            setMobileMenuOpen((current) => !current)
          }
        >
          <span />
          <span />
          <span />
        </button>

        <nav
          id="app-main-navigation"
          className={
            mobileMenuOpen
              ? "appNavbarLinks mobileOpen"
              : "appNavbarLinks"
          }
        >
          <NavLink
            to="/panel"
            onClick={closeMobileMenu}
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            <span>Panel</span>
          </NavLink>

          <NavLink
            to="/matches"
            onClick={closeMobileMenu}
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
            onClick={closeMobileMenu}
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
            onClick={closeMobileMenu}
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            <span>Favoritos</span>
          </NavLink>

          <NavLink
            to="/chats"
            onClick={closeMobileMenu}
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
            onClick={closeMobileMenu}
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            <span>Publicar</span>
          </NavLink>

          <NavLink
            to="/usuario"
            onClick={closeMobileMenu}
            className={({ isActive }) =>
              isActive
                ? "appNavbarLink active"
                : "appNavbarLink"
            }
          >
            <span>Mi perfil</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

export default AppNavbar;