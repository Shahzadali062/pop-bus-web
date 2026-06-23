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
import StaticLocationPage from "../features/staticLocation/pages/StaticLocationPage";
import CharacterAnimationPage from "../features/characterAnimation/pages/CharacterAnimationPage";
import CharacterControllerPage from "../features/characterAnimation/pages/CharacterControllerPage";
import MiniGamePage from "../features/miniGame/pages/MiniGamePage";
import MiniGameControllerPage from "../features/miniGame/pages/MiniGameControllerPage";

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
          path="/static-location"
          element={<StaticLocationPage />}
        />

        <Route
          path="/character"
          element={<CharacterAnimationPage />}
        />

        <Route
          path="/character-controller/:roomId"
          element={<CharacterControllerPage />}
        />

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
              <Route path="/game" element={<MiniGamePage />} />
        <Route path="/game-controller/:roomId" element={<MiniGameControllerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
