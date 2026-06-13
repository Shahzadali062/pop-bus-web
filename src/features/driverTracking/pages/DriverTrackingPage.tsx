import {
  UserRound,
  Activity,
  Eye,
  EyeOff,
  LocateFixed,
  Map,
  Navigation,
  Play,
  Radio,
  ShieldCheck,
  Square,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useDriverTrackingStore } from "../store/driverTrackingStore";
import "./DriverTrackingPage.css";

function formatLastSent(
  timestamp: number | null,
  now: number
) {
  if (!timestamp) return "Not sent yet";

  const seconds = Math.max(
    0,
    Math.floor((now - timestamp) / 1000)
  );

  if (seconds < 2) return "Just now";
  if (seconds < 60) {
    return `${seconds} seconds ago`;
  }

  const minutes = Math.floor(seconds / 60);
  return `${minutes} minutes ago`;
}

export default function DriverTrackingPage() {
  const navigate = useNavigate();

  const {
    busId,
    isSharing,
    trackingStatus,
    connectionStatus,
    currentLocation,
    lastSentAt,
    pageVisibility,
    wakeLockSupported,
    wakeLockActive,
    error,
    setBusId,
    startSharing,
    stopSharing,
  } = useDriverTrackingStore();

  const [validationError, setValidationError] =
    useState("");

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  function handleBusIdChange(value: string) {
    const cleanValue = value
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 12);

    setValidationError("");
    setBusId(cleanValue);
  }

  function handleStart() {
    if (!/^[A-Z0-9-]{1,12}$/.test(busId)) {
      setValidationError(
        "Enter a valid student name / ID using letters, numbers or hyphens."
      );
      return;
    }

    setValidationError("");
    startSharing();
  }

  const serverOnline =
    connectionStatus === "online";

  return (
    <main className="driver-page">
      <div className="driver-background-orb orb-one" />
      <div className="driver-background-orb orb-two" />

      <section className="driver-shell">
        <header className="driver-header">
          <div className="driver-brand-icon">
            <UserRound size={29} />
          </div>

          <div>
            <span className="driver-eyebrow">
              STUDENTS
            </span>

            <h1>Student Location Sharing</h1>

          </div>
        </header>

        <div className="driver-id-card">
          <label htmlFor="bus-id">
            Student name / IDentification
          </label>

          <div className="driver-input-row">
            <UserRound size={20} />

            <input
              id="bus-id"
              value={busId}
              disabled={isSharing}
              onChange={(event) =>
                handleBusIdChange(
                  event.target.value
                )
              }
              placeholder="Example: 141"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          {validationError && (
            <p className="driver-error">
              {validationError}
            </p>
          )}
        </div>

        <div className="driver-status-grid">
          <article className="driver-status-card">
            <span className="status-icon">
              <Radio size={19} />
            </span>

            <div>
              <small>Tracking</small>
              <strong>{trackingStatus}</strong>
            </div>
          </article>

          <article className="driver-status-card">
            <span className="status-icon">
              {serverOnline ? (
                <Wifi size={19} />
              ) : (
                <WifiOff size={19} />
              )}
            </span>

            <div>
              <small>Server</small>
              <strong>{connectionStatus}</strong>
            </div>
          </article>

          <article className="driver-status-card">
            <span className="status-icon">
              {pageVisibility === "visible" ? (
                <Eye size={19} />
              ) : (
                <EyeOff size={19} />
              )}
            </span>

            <div>
              <small>Page</small>
              <strong>{pageVisibility}</strong>
            </div>
          </article>

          <article className="driver-status-card">
            <span className="status-icon">
              <ShieldCheck size={19} />
            </span>

            <div>
              <small>Screen awake</small>

              <strong>
                {!wakeLockSupported
                  ? "unsupported"
                  : wakeLockActive
                    ? "active"
                    : "inactive"}
              </strong>
            </div>
          </article>
        </div>

        <section className="driver-location-card">
          <div className="location-title">
            <LocateFixed size={20} />
            <strong>Current location</strong>
          </div>

          {currentLocation ? (
            <div className="location-details">
              <div>
                <small>Latitude</small>
                <strong>
                  {currentLocation.latitude.toFixed(6)}
                </strong>
              </div>

              <div>
                <small>Longitude</small>
                <strong>
                  {currentLocation.longitude.toFixed(6)}
                </strong>
              </div>

              <div>
                <small>Accuracy</small>
                <strong>
                  {currentLocation.accuracy
                    ? `${currentLocation.accuracy.toFixed(1)} m`
                    : "Unavailable"}
                </strong>
              </div>

              <div>
                <small>Last sent</small>
                <strong>
                  {formatLastSent(lastSentAt, now)}
                </strong>
              </div>
            </div>
          ) : (
            <p className="location-empty">
              Start location sharing to receive GPS
              information.
            </p>
          )}
        </section>

        {(error ||
          pageVisibility === "hidden") && (
          <div className="driver-warning">
            <Activity size={19} />

            <span>
              {error ||
                "This page is in the background. The browser may reduce or pause location updates."}
            </span>
          </div>
        )}

        <div className="driver-actions">
          {!isSharing ? (
            <button
              className="driver-primary-button"
              onClick={handleStart}
            >
              <Play size={19} />
              Start Location Sharing
            </button>
          ) : (
            <button
              className="driver-stop-button"
              onClick={stopSharing}
            >
              <Square size={18} />
              Stop Location Sharing
            </button>
          )}

          <button
            className="driver-map-button"
            onClick={() => navigate("/map")}
          >
            <Map size={19} />
            View Online Students
            <Navigation size={17} />
          </button>
        </div>

        <p className="driver-browser-note">
          Keep the browser open for continuous tracking.
          Switching to the map inside this website does not
          stop the global tracking runtime.
        </p>
      </section>
    </main>
  );
}



