import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
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
          "fill-extrusion-color": "#4f9fbe",
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15,
            0,
            16,
            ["to-number", ["get", "render_height"], 24],
          ],
          "fill-extrusion-base": [
            "to-number",
            ["get", "render_min_height"],
            0,
          ],
          "fill-extrusion-opacity": 0.76,
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
  element.className = "bus-marker";
  element.innerHTML = `
    <div class="bus-pulse"></div>
    <div class="bus-icon">🚌</div>
    <div class="bus-label">${busId}</div>
  `;

  return element;
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Record<string, Marker>>({});

  const [buses, setBuses] = useState<Record<string, BusLocation>>({});

  const busList = Object.values(buses);
  const firstBus = busList[0] ?? null;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: CHULA_CENTER,
      zoom: 16.4,
      pitch: 68,
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

    socket.on("server:latest-locations", (locations: BusLocation[]) => {
      const locationMap: Record<string, BusLocation> = {};

      locations.forEach((location) => {
        locationMap[location.busId] = location;
      });

      setBuses(locationMap);
    });

    socket.on("bus:location-updated", (location: BusLocation) => {
      setBuses((previous) => ({
        ...previous,
        [location.busId]: location,
      }));
    });

    socket.on("bus:removed", ({ busId }: { busId: string }) => {
      setBuses((previous) => {
        const updated = { ...previous };
        delete updated[busId];
        return updated;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    busList.forEach((bus) => {
      const coordinates: [number, number] = [bus.longitude, bus.latitude];

      if (!markerRefs.current[bus.busId]) {
        const marker = new maplibregl.Marker({
          element: createBusMarkerElement(bus.busId),
          anchor: "center",
        })
          .setLngLat(coordinates)
          .addTo(map);

        markerRefs.current[bus.busId] = marker;
      } else {
        markerRefs.current[bus.busId].setLngLat(coordinates);
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
        zoom: 16.8,
        pitch: 68,
        bearing: -28,
        duration: 900,
      });
    }
  }, [busList, firstBus]);

  return (
    <main className="map-page">
      <div ref={mapContainerRef} className="map" />
    </main>
  );
}
