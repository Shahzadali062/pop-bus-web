import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";

const SERVER_URL = "https://pop-bus-server.onrender.com";
const MAP_CENTER: [number, number] = [100.53389, 13.73604];

type BusLocation = {
  busId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

type MarkerPosition = {
  lng: number;
  lat: number;
};

function add3DBuildings(map: MapLibreMap) {
  try {
    const style = map.getStyle();
    const sources = style.sources as Record<string, unknown>;
    const sourceId = sources.openmaptiles
      ? "openmaptiles"
      : Object.keys(sources)[0];

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
            "#172033",
            16,
            "#284864",
            17,
            "#4f9fbe",
          ],
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15,
            0,
            16,
            ["to-number", ["get", "render_height"], 28],
          ],
          "fill-extrusion-base": [
            "to-number",
            ["get", "render_min_height"],
            0,
          ],
          "fill-extrusion-opacity": 0.78,
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
    <div class="bus-vehicle"></div>
    <div class="bus-label">${busId}</div>
  `;

  return element;
}

function animateMarkerTo(
  marker: Marker,
  from: MarkerPosition,
  to: MarkerPosition,
  duration = 1850,
  onUpdate?: (position: MarkerPosition) => void
) {
  const startTime = performance.now();

  function animate(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const eased =
      progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    const lng = from.lng + (to.lng - from.lng) * eased;
    const lat = from.lat + (to.lat - from.lat) * eased;

    const nextPosition = { lng, lat };

    marker.setLngLat([lng, lat]);
    onUpdate?.(nextPosition);

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Record<string, Marker>>({});
  const markerPositionRefs = useRef<Record<string, MarkerPosition>>({});

  const [buses, setBuses] = useState<Record<string, BusLocation>>({});

  const busList = Object.values(buses);
  const activeBusCount = busList.length;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: MAP_CENTER,
      zoom: 15.6,
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
        const cleanBusId = location.busId.trim().toUpperCase();
        locationMap[cleanBusId] = {
          ...location,
          busId: cleanBusId,
        };
      });

      setBuses(locationMap);
    });

    socket.on("bus:location-updated", (location: BusLocation) => {
      const cleanBusId = location.busId.trim().toUpperCase();

      setBuses((previous) => ({
        ...previous,
        [cleanBusId]: {
          ...location,
          busId: cleanBusId,
        },
      }));
    });

    socket.on("bus:removed", ({ busId }: { busId: string }) => {
      const cleanBusId = busId.trim().toUpperCase();

      setBuses((previous) => {
        const updated = { ...previous };
        delete updated[cleanBusId];
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
      const busId = bus.busId.trim().toUpperCase();
      const nextPosition: MarkerPosition = {
        lng: bus.longitude,
        lat: bus.latitude,
      };

      if (!markerRefs.current[busId]) {
        const marker = new maplibregl.Marker({
          element: createBusMarkerElement(busId),
          anchor: "center",
        })
          .setLngLat([nextPosition.lng, nextPosition.lat])
          .addTo(map);

        markerRefs.current[busId] = marker;
        markerPositionRefs.current[busId] = nextPosition;
      } else {
        const marker = markerRefs.current[busId];
        const currentPosition = markerPositionRefs.current[busId] ?? nextPosition;

        animateMarkerTo(marker, currentPosition, nextPosition, 1850, (position) => {
          markerPositionRefs.current[busId] = position;
        });
      }
    });

    Object.keys(markerRefs.current).forEach((busId) => {
      const stillExists = busList.some(
        (bus) => bus.busId.trim().toUpperCase() === busId
      );

      if (!stillExists) {
        markerRefs.current[busId].remove();
        delete markerRefs.current[busId];
        delete markerPositionRefs.current[busId];
      }
    });
  }, [busList]);

  return (
    <main className="map-page">
      <div ref={mapContainerRef} className="map" />

      <div className="active-bus-pill">
        Active Buses: {activeBusCount}
      </div>
    </main>
  );
}
