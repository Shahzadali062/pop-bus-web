import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import maplibregl, {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";

const SERVER_URL = "https://pop-bus-server.onrender.com";

const CHULA_CENTER: [number, number] = [100.53389, 13.73604];

type BusLocation = {
  busId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

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

function createEmptyRouteGeoJson() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [],
        },
      },
    ],
  } as any;
}

function createRouteGeoJson(points: BusLocation[]) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: points.map((point) => [
            point.longitude,
            point.latitude,
          ]),
        },
      },
    ],
  } as any;
}

function add3DBuildings(map: MapLibreMap) {
  try {
    const style = map.getStyle();
    const sourceId = style.sources.openmaptiles
      ? "openmaptiles"
      : Object.keys(style.sources)[0];

    const labelLayer = style.layers?.find(
      (layer: any) => layer.type === "symbol" && layer.layout?.["text-field"]
    );

    if (map.getLayer("popbus-3d-buildings")) return;

    map.addLayer(
      {
        id: "popbus-3d-buildings",
        source: sourceId,
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 15,
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15,
            "#1e293b",
            16,
            "#334155",
            17,
            "#38bdf8",
          ],
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15,
            0,
            16,
            ["to-number", ["get", "render_height"], 20],
          ],
          "fill-extrusion-base": [
            "to-number",
            ["get", "render_min_height"],
            0,
          ],
          "fill-extrusion-opacity": 0.72,
        },
      } as any,
      labelLayer?.id
    );
  } catch (error) {
    console.log("3D buildings layer could not be added:", error);
  }
}

function createBusMarkerElement(busId: string) {
  const element = document.createElement("div");
  element.className = "premium-bus-marker";
  element.innerHTML = `
    <div class="marker-orbit">
      <div class="marker-core">
        <span>🚌</span>
      </div>
      <div class="marker-label">${busId}</div>
    </div>
  `;

  return element;
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Record<string, Marker>>({});

  const [serverStatus, setServerStatus] = useState("connecting");
  const [buses, setBuses] = useState<Record<string, BusLocation>>({});
  const [routeHistory, setRouteHistory] = useState<BusLocation[]>([]);
  const [lastEvent, setLastEvent] = useState("Waiting for driver feed...");

  const busList = Object.values(buses);
  const firstBus = busList[0] ?? null;

  const routeLine = useMemo(() => routeHistory, [routeHistory]);

  async function loadRouteHistory(busId: string) {
    try {
      const response = await fetch(
        `${SERVER_URL}/api/buses/${busId}/history?limit=120`
      );
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
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: CHULA_CENTER,
      zoom: 16.3,
      pitch: 64,
      bearing: -28,

    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
      }),
      "bottom-right"
    );

    map.on("load", () => {
      add3DBuildings(map);

      map.addSource("live-route", {
        type: "geojson",
        data: createEmptyRouteGeoJson(),
      });

      map.addLayer({
        id: "live-route-glow",
        type: "line",
        source: "live-route",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#0ea5e9",
          "line-width": 15,
          "line-opacity": 0.25,
          "line-blur": 2,
        },
      });

      map.addLayer({
        id: "live-route-main",
        type: "line",
        source: "live-route",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#38bdf8",
          "line-width": 5,
          "line-opacity": 0.95,
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

      setLastEvent(
        `${location.busId} updated at ${new Date(
          location.timestamp
        ).toLocaleTimeString()}`
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("live-route") as GeoJSONSource | undefined;

    if (source) {
      source.setData(createRouteGeoJson(routeLine));
    }
  }, [routeLine]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    busList.forEach((bus) => {
      const coordinates: [number, number] = [bus.longitude, bus.latitude];

      if (!markerRefs.current[bus.busId]) {
        const markerElement = createBusMarkerElement(bus.busId);

        const marker = new maplibregl.Marker({
          element: markerElement,
          anchor: "center",
        })
          .setLngLat(coordinates)
          .setPopup(
            new maplibregl.Popup({
              offset: 34,
              closeButton: false,
            }).setHTML(`
              <div class="popup-card">
                <strong>${bus.busId}</strong>
                <span>Speed: ${formatSpeed(bus.speed)}</span>
                <span>Accuracy: ${formatAccuracy(bus.accuracy)}</span>
                <span>Updated: ${new Date(bus.timestamp).toLocaleTimeString()}</span>
              </div>
            `)
          )
          .addTo(map);

        markerRefs.current[bus.busId] = marker;
      } else {
        markerRefs.current[bus.busId]
          .setLngLat(coordinates)
          .setPopup(
            new maplibregl.Popup({
              offset: 34,
              closeButton: false,
            }).setHTML(`
              <div class="popup-card">
                <strong>${bus.busId}</strong>
                <span>Speed: ${formatSpeed(bus.speed)}</span>
                <span>Accuracy: ${formatAccuracy(bus.accuracy)}</span>
                <span>Updated: ${new Date(bus.timestamp).toLocaleTimeString()}</span>
              </div>
            `)
          );
      }
    });

    Object.keys(markerRefs.current).forEach((busId) => {
      const stillExists = busList.some((bus) => bus.busId === busId);

      if (!stillExists) {
        markerRefs.current[busId].remove();
        delete markerRefs.current[busId];
      }
    });

    if (firstBus) {
      map.easeTo({
        center: [firstBus.longitude, firstBus.latitude],
        zoom: 16.6,
        pitch: 64,
        bearing: -28,
        duration: 900,
      });
    }
  }, [busList, firstBus]);

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
            <h1>3D Fleet Command</h1>
            <p className="brand-subtitle">
              Interactive 3D Chulalongkorn map with live driver tracking,
              route trail, and cloud-based fleet visibility.
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
            <p>Map Mode</p>
            <h3>3D</h3>
          </div>

          <div className="metric-card">
            <p>Network</p>
            <h3>Cloud</h3>
          </div>
        </div>

        <div className="section-label">Live Vehicles</div>

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
            <h2>3D Chulalongkorn Live Map</h2>
            <span>
              Tilt, rotate, zoom, and track buses in a 3D campus-style view.
            </span>
          </div>

          <div className="map-badge">
            <span className="pulse-dot"></span>
            {firstBus ? firstBus.busId : "No active bus"}
          </div>
        </div>

        <div className="map-frame">
          <div ref={mapContainerRef} className="map" />

          <div className="floating-card top-left">
            <p>3D Mode</p>
            <strong>Buildings + Tilt</strong>
          </div>

          <div className="floating-card bottom-right">
            <p>Live Backend</p>
            <strong>Render + Socket.IO</strong>
          </div>
        </div>
      </main>
    </div>
  );
}
