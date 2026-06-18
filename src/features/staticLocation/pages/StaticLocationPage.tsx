import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Send,
  Target,
} from "lucide-react";
import maplibregl, {
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { SERVER_URL } from "../../../shared/config/server";
import "./StaticLocationPage.css";

type SelectedPoint = {
  latitude: number;
  longitude: number;
};

type Step = "pick" | "details";

const KKU_CENTER: [number, number] = [102.8215, 16.46];

const KKU_BOUNDS: [[number, number], [number, number]] = [
  [102.798, 16.438],
  [102.845, 16.482],
];

const COLLEGE_OF_LOCAL_ADMINISTRATION: [number, number] = [
  102.830636,
  16.473921,
];

const ROYAL_DEGREE_HALL: [number, number] = [
  102.82806,
  16.473655,
];

function addKkuCampusLayers(map: MapLibreMap) {
  const campusPolygon = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Khon Kaen University Campus",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              KKU_BOUNDS[0],
              [KKU_BOUNDS[1][0], KKU_BOUNDS[0][1]],
              KKU_BOUNDS[1],
              [KKU_BOUNDS[0][0], KKU_BOUNDS[1][1]],
              KKU_BOUNDS[0],
            ],
          ],
        },
      },
    ],
  };

  const landmarks = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "College of Local Administration",
        },
        geometry: {
          type: "Point",
          coordinates: COLLEGE_OF_LOCAL_ADMINISTRATION,
        },
      },
      {
        type: "Feature",
        properties: {
          name: "Royal Degree Presentation Hall",
        },
        geometry: {
          type: "Point",
          coordinates: ROYAL_DEGREE_HALL,
        },
      },
    ],
  };

  if (!map.getSource("kku-campus")) {
    map.addSource("kku-campus", {
      type: "geojson",
      data: campusPolygon as any,
    });
  }

  if (!map.getLayer("kku-campus-fill")) {
    map.addLayer({
      id: "kku-campus-fill",
      type: "fill",
      source: "kku-campus",
      paint: {
        "fill-color": "#38bdf8",
        "fill-opacity": 0.12,
      },
    });
  }

  if (!map.getLayer("kku-campus-border")) {
    map.addLayer({
      id: "kku-campus-border",
      type: "line",
      source: "kku-campus",
      paint: {
        "line-color": "#22d3ee",
        "line-width": 3,
        "line-opacity": 0.9,
      },
    });
  }

  if (!map.getSource("kku-landmarks")) {
    map.addSource("kku-landmarks", {
      type: "geojson",
      data: landmarks as any,
    });
  }

  if (!map.getLayer("kku-landmark-dots")) {
    map.addLayer({
      id: "kku-landmark-dots",
      type: "circle",
      source: "kku-landmarks",
      paint: {
        "circle-radius": 7,
        "circle-color": "#8b5cf6",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  if (!map.getLayer("kku-landmark-labels")) {
    map.addLayer({
      id: "kku-landmark-labels",
      type: "symbol",
      source: "kku-landmarks",
      layout: {
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-offset": [0, 1.4],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#0f172a",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    });
  }
}

export default function StaticLocationPage() {
  const navigate = useNavigate();

  const mapContainerRef =
    useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  const [selectedPoint, setSelectedPoint] =
    useState<SelectedPoint | null>(null);
  const [studentId, setStudentId] = useState("");
  const [step, setStep] = useState<Step>("pick");
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] =
    useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: KKU_CENTER,
      zoom: 16.8,
      minZoom: 15.8,
      maxZoom: 20,
      maxBounds: KKU_BOUNDS,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
      }),
      "bottom-right"
    );

    map.on("load", () => {
      addKkuCampusLayers(map);

      map.fitBounds(KKU_BOUNDS, {
        padding: 48,
        duration: 0,
      });
    });

    map.on("click", (event) => {
      const nextPoint = {
        latitude: Number(event.lngLat.lat.toFixed(6)),
        longitude: Number(event.lngLat.lng.toFixed(6)),
      };

      setSelectedPoint(nextPoint);
      setStatusMessage(null);
      setError(null);

      const lngLat: [number, number] = [
        nextPoint.longitude,
        nextPoint.latitude,
      ];

      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({
          color: "#8b5cf6",
        })
          .setLngLat(lngLat)
          .addTo(map);
      } else {
        markerRef.current.setLngLat(lngLat);
      }
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  function handleStudentIdChange(value: string) {
    const cleanValue = value
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 16);

    setStudentId(cleanValue);
    setError(null);
  }

  async function sendStaticLocation() {
    if (!selectedPoint) {
      setError("Please select a point on the KKU map first.");
      return;
    }

    const cleanStudentId = studentId.trim().toUpperCase();

    if (!/^[A-Z0-9-]{1,16}$/.test(cleanStudentId)) {
      setError(
        "Enter a valid student name / ID using letters, numbers or hyphens."
      );
      return;
    }

    setSending(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(
        `${SERVER_URL}/api/driver/location-update`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            busId: cleanStudentId,
            latitude: selectedPoint.latitude,
            longitude: selectedPoint.longitude,
            accuracy: 1,
            speed: 0,
            heading: 0,
            timestamp: Date.now(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      setStatusMessage(
        `${cleanStudentId} static location was sent successfully.`
      );
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Static location could not be sent."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="static-location-page">
      <div className="static-map-area">
        <div
          ref={mapContainerRef}
          className="static-map"
        />
      </div>

      <button
        type="button"
        className="static-back-button"
        onClick={() => navigate(-1)}
        aria-label="Go back"
      >
        <ArrowLeft size={23} />
      </button>

      <section className="static-panel">
        <div className="static-panel-header">
          <div className="static-icon">
            <MapPin size={22} />
          </div>

          <div>
            <span>KKU Static Location</span>
            <h1>
              {step === "pick"
                ? "Select a point"
                : "Send student location"}
            </h1>
          </div>
        </div>

        {step === "pick" ? (
          <>
            <p className="static-help">
              Tap anywhere inside the Khon Kaen University
              campus area to place the avatar location.
            </p>

            <div className="static-selected-card">
              <Target size={18} />

              <div>
                <small>Selected point</small>

                <strong>
                  {selectedPoint
                    ? `${selectedPoint.latitude.toFixed(
                        6
                      )}, ${selectedPoint.longitude.toFixed(6)}`
                    : "No point selected yet"}
                </strong>
              </div>
            </div>

            <button
              type="button"
              className="static-primary-button"
              disabled={!selectedPoint}
              onClick={() => setStep("details")}
            >
              Continue
              <CheckCircle2 size={18} />
            </button>
          </>
        ) : (
          <>
            <div className="static-selected-card">
              <Target size={18} />

              <div>
                <small>Selected point</small>

                <strong>
                  {selectedPoint
                    ? `${selectedPoint.latitude.toFixed(
                        6
                      )}, ${selectedPoint.longitude.toFixed(6)}`
                    : "No point selected"}
                </strong>
              </div>
            </div>

            <label className="static-label">
              Student name / ID
              <input
                value={studentId}
                onChange={(event) =>
                  handleStudentIdChange(event.target.value)
                }
                placeholder="Example: CHULA"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>

            {error && (
              <p className="static-error">{error}</p>
            )}

            {statusMessage && (
              <p className="static-success">
                {statusMessage}
              </p>
            )}

            <div className="static-actions">
              <button
                type="button"
                className="static-secondary-button"
                onClick={() => setStep("pick")}
              >
                Change point
              </button>

              <button
                type="button"
                className="static-primary-button"
                disabled={sending}
                onClick={() => void sendStaticLocation()}
              >
                {sending ? "Sending..." : "Send"}
                <Send size={18} />
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

