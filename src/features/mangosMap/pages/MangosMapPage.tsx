import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Compass,
  Crosshair,
  Layers,
  MapPinned,
} from "lucide-react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import "./MangosMapPage.css";

type LngLat = [number, number];

type CameraPreset = "inside" | "boundary" | "threeD";

type CampusLandmark = {
  name: string;
  category: string;
  coordinates: LngLat;
};

const CHULA_CENTER: LngLat = [100.53124, 13.73857];

const CHULA_BOUNDS: [LngLat, LngLat] = [
  [100.5237, 13.7322],
  [100.5389, 13.7449],
];

const CHULA_BOUNDARY: LngLat[] = [
  [100.5244538, 13.7437529],
  [100.5293136, 13.7442108],
  [100.5353565, 13.7434761],
  [100.5380273, 13.733544],
  [100.5376845, 13.7327444],
  [100.5353768, 13.7330223],
  [100.531886, 13.7331111],
  [100.5290588, 13.733634],
  [100.5248099, 13.7362107],
  [100.5244538, 13.7437529],
];

const LANDMARKS: CampusLandmark[] = [
  {
    name: "Central Campus",
    category: "Core",
    coordinates: [100.5323, 13.7385],
  },
  {
    name: "Auditorium Quarter",
    category: "Academic",
    coordinates: [100.53175, 13.73715],
  },
  {
    name: "Engineering Core",
    category: "Faculty",
    coordinates: [100.52965, 13.73755],
  },
  {
    name: "Siam Edge",
    category: "North",
    coordinates: [100.53485, 13.7433],
  },
];

const CAMERA_PRESETS: Record<
  CameraPreset,
  {
    center: LngLat;
    zoom: number;
    pitch: number;
    bearing: number;
  }
> = {
  inside: {
    center: CHULA_CENTER,
    zoom: 16.85,
    pitch: 0,
    bearing: 0,
  },
  boundary: {
    center: [100.5312, 13.73855],
    zoom: 16.25,
    pitch: 0,
    bearing: 0,
  },
  threeD: {
    center: [100.5312, 13.73855],
    zoom: 17.35,
    pitch: 62,
    bearing: -32,
  },
};

function createCampusFeature(): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Chulalongkorn University",
        },
        geometry: {
          type: "Polygon",
          coordinates: [CHULA_BOUNDARY],
        },
      },
    ],
  };
}

function createMaskFeature(): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Outside Chula hidden area",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-180, -85],
              [180, -85],
              [180, 85],
              [-180, 85],
              [-180, -85],
            ],
            [...CHULA_BOUNDARY].reverse(),
          ],
        },
      },
    ],
  };
}

function createLandmarkFeature(): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: LANDMARKS.map((landmark) => ({
      type: "Feature",
      properties: {
        name: landmark.name,
        category: landmark.category,
      },
      geometry: {
        type: "Point",
        coordinates: landmark.coordinates,
      },
    })),
  };
}

function findLabelLayerId(map: MapLibreMap) {
  return map
    .getStyle()
    .layers?.find(
      (layer) => layer.type === "symbol" && layer.layout?.["text-field"]
    )?.id;
}

function add3DBuildings(map: MapLibreMap) {
  try {
    const style = map.getStyle();
    const sourceId = Object.keys(style.sources).find((source) =>
      source.toLowerCase().includes("openmaptiles")
    );

    if (!sourceId || map.getLayer("mangos-chula-3d-buildings")) {
      return;
    }

    map.addLayer(
      {
        id: "mangos-chula-3d-buildings",
        type: "fill-extrusion",
        source: sourceId,
        "source-layer": "building",
        minzoom: 15,
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15,
            "#6b7280",
            17,
            "#f0b7d7",
          ],
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
      },
      findLabelLayerId(map)
    );
  } catch (error) {
    console.log("MANGOs 3D buildings layer skipped:", error);
  }
}

function addChulaLayers(map: MapLibreMap) {
  if (!map.getSource("mangos-chula-mask")) {
    map.addSource("mangos-chula-mask", {
      type: "geojson",
      data: createMaskFeature(),
    });
  }

  if (!map.getSource("mangos-chula-campus")) {
    map.addSource("mangos-chula-campus", {
      type: "geojson",
      data: createCampusFeature(),
    });
  }

  if (!map.getSource("mangos-chula-landmarks")) {
    map.addSource("mangos-chula-landmarks", {
      type: "geojson",
      data: createLandmarkFeature(),
    });
  }

  if (!map.getLayer("mangos-chula-campus-fill")) {
    map.addLayer({
      id: "mangos-chula-campus-fill",
      type: "fill",
      source: "mangos-chula-campus",
      paint: {
        "fill-color": "#ec4899",
        "fill-opacity": 0.14,
      },
    });
  }

  if (!map.getLayer("mangos-chula-campus-border-glow")) {
    map.addLayer({
      id: "mangos-chula-campus-border-glow",
      type: "line",
      source: "mangos-chula-campus",
      paint: {
        "line-color": "#f9a8d4",
        "line-width": 9,
        "line-opacity": 0.28,
      },
    });
  }

  if (!map.getLayer("mangos-chula-campus-border")) {
    map.addLayer({
      id: "mangos-chula-campus-border",
      type: "line",
      source: "mangos-chula-campus",
      paint: {
        "line-color": "#ec4899",
        "line-width": 3,
        "line-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer("mangos-chula-landmark-dots")) {
    map.addLayer({
      id: "mangos-chula-landmark-dots",
      type: "circle",
      source: "mangos-chula-landmarks",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          5,
          18,
          9,
        ],
        "circle-color": "#f59e0b",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  if (!map.getLayer("mangos-chula-landmark-labels")) {
    map.addLayer({
      id: "mangos-chula-landmark-labels",
      type: "symbol",
      source: "mangos-chula-landmarks",
      minzoom: 15.8,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-offset": [0, 1.45],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#0f172a",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    });
  }

  if (!map.getLayer("mangos-chula-outside-mask")) {
    map.addLayer({
      id: "mangos-chula-outside-mask",
      type: "fill",
      source: "mangos-chula-mask",
      paint: {
        "fill-color": "#020617",
        "fill-opacity": 0.66,
      },
    });
  }
}

function moveCamera(map: MapLibreMap, preset: CameraPreset, duration = 850) {
  const camera = CAMERA_PRESETS[preset];

  map.easeTo({
    center: camera.center,
    zoom: camera.zoom,
    pitch: camera.pitch,
    bearing: camera.bearing,
    duration,
  });
}

export default function MangosMapPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("threeD");
  const [mapStatus, setMapStatus] = useState("Loading real map");

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const startCamera = CAMERA_PRESETS.threeD;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: startCamera.center,
      zoom: startCamera.zoom,
      minZoom: 15.25,
      maxZoom: 20,
      maxBounds: CHULA_BOUNDS,
      pitch: startCamera.pitch,
      bearing: startCamera.bearing,
      attributionControl: false,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
      }),
      "bottom-right"
    );

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      }),
      "bottom-left"
    );

    map.on("load", () => {
      add3DBuildings(map);
      addChulaLayers(map);
      setMapStatus("Chula map ready");
      moveCamera(map, "threeD", 0);
    });

    map.on("error", () => {
      setMapStatus("Map loading issue");
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function handleCameraChange(nextPreset: CameraPreset) {
    setCameraPreset(nextPreset);

    if (mapRef.current) {
      moveCamera(mapRef.current, nextPreset);
    }
  }

  return (
    <main className="mangos-map-page">
      <div ref={mapContainerRef} className="mangos-map-canvas" />

      <header className="mangos-map-topbar">
        <Link to="/" className="mangos-map-back" aria-label="Back home">
          <ArrowLeft size={20} />
        </Link>

        <div className="mangos-map-brand">
          <span className="mangos-map-brand-icon">
            <MapPinned size={22} />
          </span>
          <div>
            <strong>MANGOs Map</strong>
            <small>{mapStatus}</small>
          </div>
        </div>
      </header>

      <section className="mangos-map-viewbar" aria-label="Chula map controls">
        <button
          type="button"
          className={cameraPreset === "threeD" ? "active" : ""}
          onClick={() => handleCameraChange("threeD")}
        >
          <Building2 size={17} />
          3D
        </button>
        <button
          type="button"
          className={cameraPreset === "inside" ? "active" : ""}
          onClick={() => handleCameraChange("inside")}
        >
          <Crosshair size={17} />
          Inside
        </button>
        <button
          type="button"
          className={cameraPreset === "boundary" ? "active" : ""}
          onClick={() => handleCameraChange("boundary")}
        >
          <Compass size={17} />
          Boundary
        </button>
      </section>

      <aside className="mangos-map-panel">
        <div className="mangos-map-heading">
          <span>Selected Area</span>
          <h1>Chulalongkorn University</h1>
        </div>

        <div className="mangos-map-stats">
          <div>
            <Layers size={18} />
            <span>
              <small>Campus</small>
              <strong>Pathum Wan, Bangkok</strong>
            </span>
          </div>
          <div>
            <MapPinned size={18} />
            <span>
              <small>Area</small>
              <strong>Chula boundary</strong>
            </span>
          </div>
          <div>
            <Building2 size={18} />
            <span>
              <small>View</small>
              <strong>3D campus angle</strong>
            </span>
          </div>
        </div>

        <div className="mangos-landmark-list">
          {LANDMARKS.map((landmark) => (
            <span key={landmark.name}>
              <i />
              <b>{landmark.name}</b>
              <small>{landmark.category}</small>
            </span>
          ))}
        </div>
      </aside>
    </main>
  );
}
