import { Route, Routes } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import TopNav from './components/TopNav';
import ProtectedRoute from './components/ProtectedRoute';
import MapPage from './pages/Map';
import PriceVsMarketPage from './pages/PriceVsMarket';
import UndervaluedPage from './pages/Undervalued';
import AmenityPremiumPage from './pages/AmenityPremium';
import ChatPage from './pages/Chat';
import LoginPage from './pages/Login';
import AuthCallbackPage from './pages/AuthCallback';
import BillingPage from './pages/Billing';

// Fix default marker icon paths broken by bundlers.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function App() {
  return (
    <div className="app-shell">
      <TopNav />
      <div className="app-body">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MapPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics/price-vs-market"
            element={
              <ProtectedRoute>
                <PriceVsMarketPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics/undervalued"
            element={
              <ProtectedRoute>
                <UndervaluedPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics/amenity-premium"
            element={
              <ProtectedRoute>
                <AmenityPremiumPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                <BillingPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </div>
  );
}
