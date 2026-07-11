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

    const unsubscribeActiveExchanges = listenActiveExchanges(setAllExchanges);

    const unsubscribeInterests = listenUserInterests(
      user.uid,
      ({ received }) => {
        setReceivedInterests(received || []);
      }
    );

    const unsubscribeChats = listenUserChats(user.uid, setUserChats);

    return () => {
      unsubscribeMyExchanges?.();
      unsubscribeActiveExchanges?.();
      unsubscribeInterests?.();
      unsubscribeChats?.();
    };
  }, [isLoggedIn, user?.uid]);

  const matchCount = useMemo(() => {
    if (!user?.uid) return 0;

    return buildMatches(myExchanges, allExchanges, user.uid).length;
  }, [myExchanges, allExchanges, user?.uid]);

  const pendingInterestCount = useMemo(() => {
    return receivedInterests.filter((item) => item.status === "pending").length;
  }, [receivedInterests]);

  const unreadMessagesCount = useMemo(() => {
    return userChats.reduce((total, chat) => {
      return total + Number(chat.unreadCount || 0);
    }, 0);
  }, [userChats]);

  const handleLogout = async () => {
    await logoutUser();
    navigate("/");
  };

  if (!isLoggedIn) {
    return null;
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
              isActive ? "appNavbarLink active" : "appNavbarLink"
            }
          >
            Panel
          </NavLink>

          <NavLink
            to="/matches"
            className={({ isActive }) =>
              isActive ? "appNavbarLink active" : "appNavbarLink"
            }
          >
            <span>Matches</span>
            <Badge count={matchCount} />
          </NavLink>

          <NavLink
            to="/propuestas"
            className={({ isActive }) =>
              isActive ? "appNavbarLink active" : "appNavbarLink"
            }
          >
            <span>Propuestas</span>
            <Badge count={pendingInterestCount} />
          </NavLink>

          <NavLink to="/favoritos" className="appNavbarLink">
           Favoritos
          </NavLink>

          <NavLink
            to="/chats"
            className={({ isActive }) =>
              isActive ? "appNavbarLink active" : "appNavbarLink"
            }
          >
            <span>Chats</span>
            <Badge count={unreadMessagesCount} type="message" />
          </NavLink>

          <NavLink
            to="/publicar"
            className={({ isActive }) =>
              isActive ? "appNavbarLink active" : "appNavbarLink"
            }
          >
            Publicar
          </NavLink>

          <NavLink
            to="/usuario"
            className={({ isActive }) =>
              isActive ? "appNavbarLink active" : "appNavbarLink"
            }
          >
            Mi perfil
          </NavLink>
        </nav>

        <div className="appNavbarUser">
          <div className="userAvatar">{initials}</div>

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
