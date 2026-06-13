import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import HomePage from "../features/home/pages/HomePage";
import DriverTrackingPage from "../features/driverTracking/pages/DriverTrackingPage";
import WebTrackingRuntime from "../features/driverTracking/runtime/WebTrackingRuntime";
import LiveMapPage from "../features/liveMap/pages/LiveMapPage";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <WebTrackingRuntime />

      <Routes>
        <Route path="/" element={<HomePage />} />

        <Route
          path="/driver"
          element={<DriverTrackingPage />}
        />

        <Route
          path="/map"
          element={<LiveMapPage />}
        />

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
