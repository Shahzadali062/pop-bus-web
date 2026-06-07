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
  className: "custom-bus-marker",
  html: `<div class="bus-pin"><span>🚌</span></div>`,
  iconSize: [52, 52],
  iconAnchor: [26, 26],
  popupAnchor: [0, -26],
});

function MapFollower({ location }: { location: BusLocation | null }) {
  const map = useMap();

  useEffect(() => {
    if (location) {
      map.flyTo([location.latitude, location.longitude], 16, {
        duration: 0.8,
      });
    }
  }, [location, map]);

  return null;
}

function formatSpeed(speed: number | null) {
  if (speed === null) return "N/A";
  return `${(speed * 3.6).toFixed(1)} km/h`;
}

export default function App() {
  const [serverStatus, setServerStatus] = useState("connecting");
  const [buses, setBuses] = useState<Record<string, BusLocation>>({});
  const [routeHistory, setRouteHistory] = useState<BusLocation[]>([]);

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
      const response = await fetch(`${SERVER_URL}/api/buses/${busId}/history?limit=100`);
      const data = await response.json();

      const orderedHistory = [...data.history].reverse();
      setRouteHistory(orderedHistory);
    } catch (error) {
      console.log("Failed to load route history:", error);
    }
  }

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("Web dashboard connected:", socket.id);
      setServerStatus("connected");
    });

    socket.on("disconnect", () => {
      setServerStatus("disconnected");
    });

    socket.on("connect_error", (error) => {
      console.log("Dashboard socket error:", error.message);
      setServerStatus("error");
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

        if (updated.length > 100) {
          return updated.slice(updated.length - 100);
        }

        return updated;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-icon">🚌</div>
          <div>
            <h1>Pop Bus Live</h1>
            <p>Real-time driver location showcase</p>
          </div>
        </div>

        <div className="status-grid">
          <div className="mini-card">
            <span>Server</span>
            <strong className={serverStatus === "connected" ? "green" : "red"}>
              {serverStatus}
            </strong>
          </div>

          <div className="mini-card">
            <span>Active Buses</span>
            <strong>{busList.length}</strong>
          </div>

          <div className="mini-card">
            <span>Route Points</span>
            <strong>{routeHistory.length}</strong>
          </div>

          <div className="mini-card">
            <span>Mode</span>
            <strong>Live</strong>
          </div>
        </div>

        <div className="section-title">Fleet Status</div>

        {busList.length === 0 && (
          <div className="empty-card">
            Waiting for driver app location...
          </div>
        )}

        {busList.map((bus) => (
          <div className="bus-card" key={bus.busId}>
            <div className="bus-card-header">
              <div>
                <h2>{bus.busId}</h2>
                <p>Driver app is streaming live</p>
              </div>
              <div className="live-badge">
                <span></span>
                LIVE
              </div>
            </div>

            <div className="data-row">
              <span>Latitude</span>
              <strong>{bus.latitude.toFixed(6)}</strong>
            </div>

            <div className="data-row">
              <span>Longitude</span>
              <strong>{bus.longitude.toFixed(6)}</strong>
            </div>

            <div className="data-row">
              <span>Speed</span>
              <strong>{formatSpeed(bus.speed)}</strong>
            </div>

            <div className="data-row">
              <span>Accuracy</span>
              <strong>
                {bus.accuracy !== null ? `${bus.accuracy.toFixed(1)} m` : "N/A"}
              </strong>
            </div>

            <div className="updated-text">
              Last updated {new Date(bus.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </aside>

      <main className="map-shell">
        <div className="map-topbar">
          <div>
            <h2>Live Route Map</h2>
            <p>Bus marker updates automatically from the driver phone</p>
          </div>

          <div className="topbar-pill">
            {firstBus ? firstBus.busId : "No Bus"}
          </div>
        </div>

        <MapContainer
          center={
            firstBus
              ? [firstBus.latitude, firstBus.longitude]
              : [13.73604, 100.53389]
          }
          zoom={16}
          className="map"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapFollower location={firstBus} />

          {routeLine.length > 1 && (
            <Polyline
              positions={routeLine}
              pathOptions={{
                color: "#2563eb",
                weight: 6,
                opacity: 0.85,
              }}
            />
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
                Accuracy: {bus.accuracy !== null ? `${bus.accuracy.toFixed(1)} m` : "N/A"}
                <br />
                Updated: {new Date(bus.timestamp).toLocaleTimeString()}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </main>
    </div>
  );
}
