import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  Polyline,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const SERVER_URL = "https://pop-bus-server.onrender.com";

type BusLocation = {
  busId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

const busIcon = L.divIcon({
  className: "premium-bus-marker",
  html: `
    <div class="marker-orbit">
      <div class="marker-core">
        <span>🚌</span>
      </div>
    </div>
  `,
  iconSize: [70, 70],
  iconAnchor: [35, 35],
  popupAnchor: [0, -34],
});

function MapFollower({ location }: { location: BusLocation | null }) {
  const map = useMap();

  useEffect(() => {
    if (location) {
      map.flyTo([location.latitude, location.longitude], 16, {
        duration: 1,
      });
    }
  }, [location, map]);

  return null;
}

function formatSpeed(speed: number | null) {
  if (speed === null) return "N/A";
  return `${(speed * 3.6).toFixed(1)} km/h`;
}

function formatAccuracy(accuracy: number | null) {
  if (accuracy === null) return "N/A";
  return `${accuracy.toFixed(1)} m`;
}

function formatHeading(heading: number | null) {
  if (heading === null) return "N/A";
  return `${heading.toFixed(1)} deg`;
}

function timeAgo(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function App() {
  const [serverStatus, setServerStatus] = useState("connecting");
  const [buses, setBuses] = useState<Record<string, BusLocation>>({});
  const [routeHistory, setRouteHistory] = useState<BusLocation[]>([]);
  const [lastEvent, setLastEvent] = useState("Waiting for driver feed...");

  const busList = Object.values(buses);
  const firstBus = busList[0] ?? null;

  const routeLine = useMemo(() => {
    return routeHistory.map((point) => [
      point.latitude,
      point.longitude,
    ]) as [number, number][];
  }, [routeHistory]);

  async function loadRouteHistory(busId: string) {
    try {
      const response = await fetch(`${SERVER_URL}/api/buses/${busId}/history?limit=120`);
      const data = await response.json();

      const history = Array.isArray(data.history) ? data.history : [];
      const orderedHistory = [...history].reverse();

      setRouteHistory(orderedHistory);
      setLastEvent(`Loaded ${orderedHistory.length} route points`);
    } catch (error) {
      console.log("Failed to load route history:", error);
      setLastEvent("Route history could not be loaded");
    }
  }

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("Web dashboard connected:", socket.id);
      setServerStatus("connected");
      setLastEvent("Connected to live tracking server");
    });

    socket.on("disconnect", () => {
      setServerStatus("disconnected");
      setLastEvent("Dashboard disconnected from server");
    });

    socket.on("connect_error", (error) => {
      console.log("Dashboard socket error:", error.message);
      setServerStatus("error");
      setLastEvent("Server connection issue");
    });

    socket.on("server:latest-locations", (locations: BusLocation[]) => {
      const locationMap: Record<string, BusLocation> = {};

      locations.forEach((location) => {
        locationMap[location.busId] = location;
      });

      setBuses(locationMap);

      if (locations.length > 0) {
        loadRouteHistory(locations[0].busId);
      }
    });

    socket.on("bus:location-updated", (location: BusLocation) => {
      setBuses((previous) => ({
        ...previous,
        [location.busId]: location,
      }));

      setRouteHistory((previous) => {
        const updated = [...previous, location];

        if (updated.length > 120) {
          return updated.slice(updated.length - 120);
        }

        return updated;
      });

      setLastEvent(`${location.busId} updated at ${new Date(location.timestamp).toLocaleTimeString()}`);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const connectionClass =
    serverStatus === "connected" ? "status-green" : "status-red";

  return (
    <div className="showcase">
      <aside className="control-panel">
        <div className="brand-box">
          <div className="brand-glow"></div>
          <div className="brand-icon">🚌</div>
          <div>
            <p className="eyebrow">Pop Bus Intelligence</p>
            <h1>Live Fleet Command</h1>
            <p className="brand-subtitle">
              Real-time driver tracking, route trail, and live operation visibility.
            </p>
          </div>
        </div>

        <div className="hero-card">
          <div>
            <p>System Health</p>
            <h2 className={connectionClass}>{serverStatus}</h2>
          </div>

          <div className="signal-bars">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>

        <div className="metrics-grid">
          <div className="metric-card">
            <p>Active Buses</p>
            <h3>{busList.length}</h3>
          </div>

          <div className="metric-card">
            <p>Route Points</p>
            <h3>{routeHistory.length}</h3>
          </div>

          <div className="metric-card">
            <p>Mode</p>
            <h3>Live</h3>
          </div>

          <div className="metric-card">
            <p>Network</p>
            <h3>Cloud</h3>
          </div>
        </div>

        <div className="section-label">Live Vehicle</div>

        {busList.length === 0 && (
          <div className="empty-state">
            <div className="empty-pulse"></div>
            <h3>Waiting for driver app</h3>
            <p>Open the APK and allow location permission to start streaming.</p>
          </div>
        )}

        {busList.map((bus) => (
          <div className="vehicle-card" key={bus.busId}>
            <div className="vehicle-header">
              <div>
                <p className="vehicle-label">Vehicle ID</p>
                <h2>{bus.busId}</h2>
              </div>

              <div className="live-chip">
                <span></span>
                LIVE
              </div>
            </div>

            <div className="driver-line">
              <div className="driver-avatar">D</div>
              <div>
                <strong>Driver Device</strong>
                <p>Streaming location from Android APK</p>
              </div>
            </div>

            <div className="telemetry">
              <div>
                <span>Latitude</span>
                <strong>{bus.latitude.toFixed(6)}</strong>
              </div>

              <div>
                <span>Longitude</span>
                <strong>{bus.longitude.toFixed(6)}</strong>
              </div>

              <div>
                <span>Speed</span>
                <strong>{formatSpeed(bus.speed)}</strong>
              </div>

              <div>
                <span>Accuracy</span>
                <strong>{formatAccuracy(bus.accuracy)}</strong>
              </div>

              <div>
                <span>Heading</span>
                <strong>{formatHeading(bus.heading)}</strong>
              </div>

              <div>
                <span>Updated</span>
                <strong>{timeAgo(bus.timestamp)}</strong>
              </div>
            </div>
          </div>
        ))}

        <div className="activity-card">
          <p>Latest Activity</p>
          <strong>{lastEvent}</strong>
        </div>
      </aside>

      <main className="map-stage">
        <div className="map-header">
          <div>
            <p className="eyebrow">Client Showcase View</p>
            <h2>Live Route Map</h2>
            <span>
              The bus marker moves automatically as the driver phone streams location.
            </span>
          </div>

          <div className="map-badge">
            <span className="pulse-dot"></span>
            {firstBus ? firstBus.busId : "No active bus"}
          </div>
        </div>

        <div className="map-frame">
          <MapContainer
            center={
              firstBus
                ? [firstBus.latitude, firstBus.longitude]
                : [13.73604, 100.53389]
            }
            zoom={16}
            className="map"
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapFollower location={firstBus} />

            {routeLine.length > 1 && (
              <>
                <Polyline
                  positions={routeLine}
                  pathOptions={{
                    color: "#0ea5e9",
                    weight: 12,
                    opacity: 0.22,
                  }}
                />

                <Polyline
                  positions={routeLine}
                  pathOptions={{
                    color: "#2563eb",
                    weight: 5,
                    opacity: 0.95,
                  }}
                />
              </>
            )}

            {busList.map((bus) => (
              <Marker
                key={bus.busId}
                position={[bus.latitude, bus.longitude]}
                icon={busIcon}
              >
                <Popup>
                  <strong>{bus.busId}</strong>
                  <br />
                  Speed: {formatSpeed(bus.speed)}
                  <br />
                  Accuracy: {formatAccuracy(bus.accuracy)}
                  <br />
                  Updated: {new Date(bus.timestamp).toLocaleTimeString()}
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <div className="floating-card top-left">
            <p>Live Feed</p>
            <strong>{serverStatus === "connected" ? "Online" : "Waiting"}</strong>
          </div>

          <div className="floating-card bottom-right">
            <p>Cloud Backend</p>
            <strong>Render + Socket.IO</strong>
          </div>
        </div>
      </main>
    </div>
  );
}
