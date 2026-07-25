import { Navigate, Route, Routes } from "react-router";
import "./App.css";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import PublicationDetail from "./pages/PublicationDetail";
import PublishExchange from "./pages/PublishExchange";
import Matches from "./pages/Matches";
import Proposals from "./pages/Proposals";
import Chat from "./pages/Chat";
import UserProfile from "./pages/UserProfile";
import TermsAndConditions from "./pages/TermsAndConditions";
import AppFooter from "./components/AppFooter";
import Safety from "./pages/Safety";
import Privacy from "./pages/Privacy";
import ScrollToTop from "./components/ScrollToTop";
import Help from "./pages/Help";
import Favorites from "./pages/Favorites";

function App() {
  return (
    <>
      <ScrollToTop />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/panel" element={<Dashboard />} />

        <Route
          path="/publicacion/:exchangeId"
          element={<PublicationDetail />}
        />

        <Route path="/publicar" element={<PublishExchange />} />
        <Route
          path="/editar/:exchangeId"
          element={<PublishExchange />}
        />

        <Route path="/matches" element={<Matches />} />
        <Route path="/propuestas" element={<Proposals />} />
        <Route path="/chats" element={<Chat />} />
        <Route path="/chat/:chatId" element={<Chat />} />
        <Route path="/usuario" element={<UserProfile />} />
        <Route path="/favoritos" element={<Favorites />} />

        <Route
          path="/terminos-y-condiciones"
          element={<TermsAndConditions />}
        />
        <Route path="/seguridad" element={<Safety />} />
        <Route path="/privacidad" element={<Privacy />} />
        <Route path="/ayuda" element={<Help />} />

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>

      <AppFooter />
    </>
  );
}

export default App;