import { SERVER_URL } from "../../../shared/config/server";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  FileText,
  Radio,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { io } from "socket.io-client";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "../../../App.css";

const MAP_CENTER: [number, number] = [100.53389, 13.73604];

const LIVE_CAMERA: {
  zoom: number;
  pitch: number;
  bearing: number;
} = {
  zoom: 20.6,
  pitch: 62,
  bearing: -78.69,
};

type CameraMode = "back" | "front" | "top" | "free";

const CAMERA_PRESETS: Record<
  Exclude<CameraMode, "free">,
  {
    zoom: number;
    pitch: number;
    bearing: number;
  }
> = {
  back: {
    zoom: 20.6,
    pitch: 62,
    bearing: -78.69,
  },
  front: {
    zoom: 20.6,
    pitch: 62,
    bearing: 101.31,
  },
  top: {
    zoom: 20.95,
    pitch: 0,
    bearing: -78.69,
  },
};

type BusLocation = {
  busId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
  lastSeen?: number;
  clientSentAt?: number;
  deviceTimestamp?: number;
  source?: string;
  visibility?: string;
  sequence?: number;
};

type MarkerPosition = {
  lng: number;
  lat: number;
};

function normalizeBusLocation(
  location: BusLocation,
  forceFreshTimestamp = false
): BusLocation {
  const now = Date.now();

  const timestamp = forceFreshTimestamp
    ? now
    : Number(
        location.lastSeen ??
          location.clientSentAt ??
          location.timestamp ??
          now
      );

  return {
    ...location,
    busId: location.busId.trim().toUpperCase(),
    timestamp: Number.isFinite(timestamp)
      ? timestamp
      : now,
  };
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
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
        minzoom: LIVE_CAMERA.zoom,
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



function getEnteredDisplayName(bus: any) {
  const value =
    bus?.busId ??
    bus?.id ??
    bus?.busNumber ??
    bus?.vehicleId ??
    bus?.vehicle_id ??
    bus?.name ??
    bus?.displayName ??
    bus?.label ??
    bus?.driverName ??
    bus?.studentName ??
    bus?.payload?.busId ??
    bus?.payload?.id ??
    bus?.payload?.name ??
    bus?.data?.busId ??
    bus?.data?.id ??
    bus?.data?.name ??
    "";

  return String(value).trim();
}

function createBusMarkerElement(bus: any) {
  const element = document.createElement("div");
  element.className = "student-live-marker";

  const enteredName = getEnteredDisplayName(bus);
  element.setAttribute("data-marker-name", enteredName);

  const avatar = document.createElement("div");
  avatar.className = "student-live-marker-avatar";
  avatar.textContent = "🧑‍🎓";

  const label = document.createElement("div");
  label.className = "student-live-marker-label";
  label.textContent = enteredName;

  element.appendChild(avatar);
  element.appendChild(label);

  return element;
}

function animateMarkerTo(
  marker: Marker,
  from: MarkerPosition,
  to: MarkerPosition,
  duration = 5200,
  onUpdate?: (position: MarkerPosition) => void
) {
  const markerElement = marker.getElement();
  const modelViewer =
    markerElement.querySelector("model-viewer") as any | null;

  function distanceMeters(
    a: MarkerPosition,
    b: MarkerPosition
  ) {
    const earthRadius = 6371000;
    const fromLat = (a.lat * Math.PI) / 180;
    const toLat = (b.lat * Math.PI) / 180;
    const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
    const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;

    const h =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(fromLat) *
        Math.cos(toLat) *
        Math.sin(deltaLng / 2) ** 2;

    return (
      2 *
      earthRadius *
      Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
    );
  }

  function setRunning(isRunning: boolean) {
    if (isRunning) {
      markerElement.classList.add("is-moving");
      void modelViewer?.play?.();
      return;
    }

    markerElement.classList.remove("is-moving");
    modelViewer?.pause?.();
  }

  const distance = distanceMeters(from, to);

  if (distance < 3) {
    setRunning(false);
    marker.setLngLat([to.lng, to.lat]);
    onUpdate?.(to);

    return () => undefined;
  }

  setRunning(true);

  const startTime = performance.now();
  let animationFrameId = 0;

  function animate(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const eased =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    const lng = from.lng + (to.lng - from.lng) * eased;
    const lat = from.lat + (to.lat - from.lat) * eased;

    const nextPosition = { lng, lat };

    marker.setLngLat([lng, lat]);
    onUpdate?.(nextPosition);

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
      return;
    }

    marker.setLngLat([to.lng, to.lat]);
    onUpdate?.(to);
    setRunning(false);
  }

  animationFrameId = requestAnimationFrame(animate);

  return () => {
    cancelAnimationFrame(animationFrameId);
    setRunning(false);
  };
}

function formatSpeed(speed: number | null) {
  if (speed === null) return "N/A";
  return `${(speed * 3.6).toFixed(1)} km/h`;
}

function formatUpdated(timestamp: number | string | null | undefined, currentTime: number) {
  let time = typeof timestamp === "number" ? timestamp : Number(timestamp);

  if (!Number.isFinite(time) && typeof timestamp === "string") {
    time = Date.parse(timestamp);
  }

  if (!Number.isFinite(time)) return "just now";

  if (time < 1000000000000) {
    time = time * 1000;
  }

  const seconds = Math.max(0, Math.floor((currentTime - time) / 1000));

  if (seconds < 3) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
export default function LiveMapPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Record<string, Marker>>({});
  const markerPositionRefs = useRef<Record<string, MarkerPosition>>({});
  const markerAnimationRefs = useRef<Record<string, () => void>>({});
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const [buses, setBuses] = useState<Record<string, BusLocation>>({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("back");
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [cameraDebug, setCameraDebug] = useState({
    lng: 0,
    lat: 0,
    zoom: LIVE_CAMERA.zoom,
    pitch: LIVE_CAMERA.pitch,
    bearing: LIVE_CAMERA.bearing,
  });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);

  const [chatMessages, setChatMessages] =
    useState<ChatMessage[]>([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Hello! I?m your AI Fleet Copilot. Ask me about live buses, locations, speed, GPS quality, tracking history or fleet performance.",
      },
    ]);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const busList = Object.values(buses).sort((a, b) =>
    a.busId.localeCompare(b.busId)
  );

  const activeBusCount = busList.length;

  async function askAi(customQuestion?: string) {
    const question = (customQuestion ?? aiQuestion).trim();

    if (!question || aiLoading || aiTyping) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
    };

    const history = chatMessages
      .filter(
        (message) =>
          message.id !== "welcome" &&
          message.content.trim()
      )
      .map(({ role, content }) => ({
        role,
        content,
      }));

    setChatMessages((previous) => [
      ...previous,
      userMessage,
    ]);

    setAiQuestion("");
    setAiLoading(true);

    try {
      const socket = socketRef.current;

      if (!socket) {
        throw new Error(
          "The live AI connection is not ready."
        );
      }

      if (!socket.connected) {
        socket.connect();

        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            cleanup();
            reject(
              new Error(
                "Could not connect to the AI server."
              )
            );
          }, 15000);

          const handleConnect = () => {
            cleanup();
            resolve();
          };

          const handleError = () => {
            cleanup();
            reject(
              new Error(
                "Could not connect to the AI server."
              )
            );
          };

          const cleanup = () => {
            window.clearTimeout(timeout);
            socket.off("connect", handleConnect);
            socket.off(
              "connect_error",
              handleError
            );
          };

          socket.once("connect", handleConnect);
          socket.once(
            "connect_error",
            handleError
          );
        });
      }

      const acknowledgement =
        await new Promise<{
          status?: string;
          jobId?: string;
          message?: string;
        }>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            reject(
              new Error(
                "The AI server did not accept the request."
              )
            );
          }, 15000);

          socket.emit(
            "ai:submit",
            {
              message: question,
              history,
            },
            (result: {
              status?: string;
              jobId?: string;
              message?: string;
            }) => {
              window.clearTimeout(timeout);

              if (
                result?.status !== "accepted" ||
                !result.jobId
              ) {
                reject(
                  new Error(
                    result?.message ||
                      "The AI request was rejected."
                  )
                );

                return;
              }

              resolve(result);
            }
          );
        });

      const jobId = String(
        acknowledgement.jobId
      );

      const answer = await new Promise<string>(
        (resolve, reject) => {
          const timeout = window.setTimeout(() => {
            cleanup();

            reject(
              new Error(
                "The AI response took too long."
              )
            );
          }, 120000);

          const handleCompleted = (payload: {
            jobId?: string;
            answer?: string;
          }) => {
            if (
              String(payload?.jobId || "") !==
              jobId
            ) {
              return;
            }

            const completedAnswer = String(
              payload.answer || ""
            ).trim();

            cleanup();

            if (!completedAnswer) {
              reject(
                new Error(
                  "The AI returned an empty answer."
                )
              );

              return;
            }

            resolve(completedAnswer);
          };

          const handleFailed = (payload: {
            jobId?: string;
            error?: string;
          }) => {
            if (
              String(payload?.jobId || "") !==
              jobId
            ) {
              return;
            }

            cleanup();

            reject(
              new Error(
                payload.error ||
                  "The AI worker could not process the request."
              )
            );
          };

          const handleDisconnect = () => {
            cleanup();

            reject(
              new Error(
                "The live AI connection was interrupted."
              )
            );
          };

          const cleanup = () => {
            window.clearTimeout(timeout);

            socket.off(
              "ai:completed",
              handleCompleted
            );

            socket.off(
              "ai:failed",
              handleFailed
            );

            socket.off(
              "disconnect",
              handleDisconnect
            );
          };

          socket.on(
            "ai:completed",
            handleCompleted
          );

          socket.on(
            "ai:failed",
            handleFailed
          );

          socket.once(
            "disconnect",
            handleDisconnect
          );
        }
      );

      const assistantId =
        `assistant-${Date.now()}`;

      setChatMessages((previous) => [
        ...previous,
        {
          id: assistantId,
          role: "assistant",
          content: "",
        },
      ]);

      setAiLoading(false);
      setAiTyping(true);

      let characterIndex = 0;

      await new Promise<void>((resolve) => {
        const typingTimer = window.setInterval(() => {
          characterIndex = Math.min(
            characterIndex + 3,
            answer.length
          );

          setChatMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: answer.slice(
                      0,
                      characterIndex
                    ),
                  }
                : message
            )
          );

          if (characterIndex >= answer.length) {
            window.clearInterval(typingTimer);
            setAiTyping(false);
            resolve();
          }
        }, 16);
      });
    } catch (error) {
      setAiLoading(false);
      setAiTyping(false);

      setChatMessages((previous) => [
        ...previous,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "The AI service is unavailable.",
        },
      ]);
    }
  }

  function focusBus(bus: BusLocation) {
    const map = mapRef.current;

    if (!map) return;

    map.easeTo({
      center: [bus.longitude, bus.latitude],
      zoom: LIVE_CAMERA.zoom,
      pitch: LIVE_CAMERA.pitch,
      bearing: LIVE_CAMERA.bearing,
      duration: 950,
    });

    setDropdownOpen(false);
  }

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [chatMessages, aiLoading, aiTyping]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: MAP_CENTER,
      zoom: LIVE_CAMERA.zoom,
      pitch: LIVE_CAMERA.pitch,
      bearing: LIVE_CAMERA.bearing,
    });

    mapRef.current = map;

    const switchToFreeCameraMode = (event: any) => {
      if (event?.originalEvent) {
        setCameraMode("free");
      }
    };

    const updateCharacterZoomScale = () => {
      const zoom = map.getZoom();
      const scale = Math.min(
        1.55,
        Math.max(0.72, 0.72 + (zoom - 18) * 0.28)
      );

      document.documentElement.style.setProperty(
        "--glb-zoom-scale",
        scale.toFixed(3)
      );
    };

    map.on("movestart", switchToFreeCameraMode);
    map.on("zoomstart", switchToFreeCameraMode);
    map.on("rotatestart", switchToFreeCameraMode);
    map.on("pitchstart", switchToFreeCameraMode);
    map.on("zoom", updateCharacterZoomScale);
    map.once("idle", updateCharacterZoomScale);

    const updateCameraDebug = () => {
      const center = map.getCenter();

      const camera = {
        lng: Number(center.lng.toFixed(6)),
        lat: Number(center.lat.toFixed(6)),
        zoom: Number(map.getZoom().toFixed(3)),
        pitch: Number(map.getPitch().toFixed(2)),
        bearing: Number(map.getBearing().toFixed(2)),
      };

      setCameraDebug(camera);
      console.log("[MAP_CAMERA]", camera);
    };

    map.on("move", updateCameraDebug);
    map.on("zoom", updateCameraDebug);
    map.on("pitch", updateCameraDebug);
    map.on("rotate", updateCameraDebug);
    map.once("idle", updateCameraDebug);

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
      map.off("move", updateCameraDebug);
      map.off("zoom", updateCameraDebug);
      map.off("pitch", updateCameraDebug);
      map.off("rotate", updateCameraDebug);

      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("server:latest-locations", (locations: BusLocation[]) => {
      const locationMap: Record<string, BusLocation> = {};

      locations.forEach((location) => {
        const cleanBusId = location.busId.trim().toUpperCase();
        locationMap[cleanBusId] = normalizeBusLocation({
          ...location,
          busId: cleanBusId,
        });
      });

      setBuses(locationMap);
    });

    socket.on("bus:location-updated", (location: BusLocation) => {
      const cleanBusId = location.busId.trim().toUpperCase();

      const normalizedLocation = normalizeBusLocation(
        {
          ...location,
          busId: cleanBusId,
        },
        true
      );

      socket.emit("debug:map-received", {
        busId: cleanBusId,
        event: "bus:location-updated",
        sequence: normalizedLocation.sequence ?? null,
        mapReceivedAt: Date.now(),
        locationTimestamp: normalizedLocation.timestamp,
      });

      setBuses((previous) => ({
        ...previous,
        [cleanBusId]: normalizedLocation,
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
      socketRef.current = null;
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
          anchor: "bottom",
        })
          .setLngLat([nextPosition.lng, nextPosition.lat])
          .addTo(map);

        markerRefs.current[busId] = marker;
        markerPositionRefs.current[busId] = nextPosition;
      } else {
        const marker = markerRefs.current[busId];
        const currentPosition = markerPositionRefs.current[busId] ?? nextPosition;

        markerAnimationRefs.current[busId]?.();

        markerAnimationRefs.current[busId] = animateMarkerTo(
          marker,
          currentPosition,
          nextPosition,
          5200,
          (position) => {
            markerPositionRefs.current[busId] = position;
          }
        );
      }
    });

    Object.keys(markerRefs.current).forEach((busId) => {
      const stillExists = busList.some(
        (bus) => bus.busId.trim().toUpperCase() === busId
      );

      if (!stillExists) {
        markerAnimationRefs.current[busId]?.();
        delete markerAnimationRefs.current[busId];

        markerRefs.current[busId].remove();
        delete markerRefs.current[busId];
        delete markerPositionRefs.current[busId];
      }
    });
  }, [busList]);
  // CAMERA_MODE_FOLLOW_CHARACTER
  useEffect(() => {
    const map = mapRef.current;
    const firstLiveBus = Object.values(buses)[0];

    if (!map || !firstLiveBus || cameraMode === "free") {
      return;
    }

    const camera = CAMERA_PRESETS[cameraMode];

    map.easeTo({
      center: [
        firstLiveBus.longitude,
        firstLiveBus.latitude,
      ],
      zoom: camera.zoom,
      pitch: camera.pitch,
      bearing: camera.bearing,
      duration: 650,
      essential: true,
    });
  }, [buses, cameraMode]);
  // GLB_MODEL_VIEW_SYNC
  useEffect(() => {
    const map = mapRef.current;
    const mapEvents = map as any;

    const updateGlbModelView = () => {
      const mapBearing = map?.getBearing() ?? 0;
      const mapPitch = map?.getPitch() ?? CAMERA_PRESETS.back.pitch;
      const mapZoom = map?.getZoom() ?? CAMERA_PRESETS.back.zoom;

      let theta = 180;
      let phi = 62;
      let radius = 4.1;

      if (cameraMode === "front") {
        theta = 0;
        phi = 62;
        radius = 4.1;
      }

      if (cameraMode === "top") {
        theta = 180;
        phi = 20;
        radius = 4.75;
      }

      if (cameraMode === "free") {
        theta = 180 - mapBearing;
        phi = Math.max(
          18,
          Math.min(72, 76 - mapPitch * 0.62)
        );
        radius = Math.max(
          2.6,
          Math.min(5.2, 5.2 - (mapZoom - 18) * 0.42)
        );
      }

      document
        .querySelectorAll("model-viewer.glb-human-model")
        .forEach((modelViewer) => {
          modelViewer.setAttribute(
            "camera-orbit",
            `${theta.toFixed(2)}deg ${phi.toFixed(2)}deg ${radius.toFixed(2)}m`
          );

          modelViewer.setAttribute(
            "camera-target",
            "0m 0.75m 0m"
          );
        });
    };

    updateGlbModelView();

    mapEvents?.on("move", updateGlbModelView);
    mapEvents?.on("zoom", updateGlbModelView);
    mapEvents?.on("rotate", updateGlbModelView);
    mapEvents?.on("pitch", updateGlbModelView);

    return () => {
      mapEvents?.off("move", updateGlbModelView);
      mapEvents?.off("zoom", updateGlbModelView);
      mapEvents?.off("rotate", updateGlbModelView);
      mapEvents?.off("pitch", updateGlbModelView);
    };
  }, [cameraMode]);
  return (
    <main className="map-page">
      <div ref={mapContainerRef} className="map" />

      <div className="map-camera-debug-panel">
        <strong>Camera</strong>
        <span>Lng: {cameraDebug.lng}</span>
        <span>Lat: {cameraDebug.lat}</span>
        <span>Zoom: {cameraDebug.zoom}</span>
        <span>Pitch: {cameraDebug.pitch}</span>
        <span>Bearing: {cameraDebug.bearing}</span>
      </div>

      <div className="active-bus-panel">
        <button
          className="active-bus-pill"
          onClick={() => setDropdownOpen((previous) => !previous)}
        >
          <span className="bus-pill-left">
            <span className="bus-pill-icon">BUS</span>
            <span>
              <span className="bus-pill-title">Active Buses</span>
              <span className="bus-pill-subtitle">{activeBusCount} vehicles online</span>
            </span>
          </span>
          <span className={dropdownOpen ? "chevron open" : "chevron"}>v</span>
        </button>

        <div className={dropdownOpen ? "bus-dropdown open" : "bus-dropdown"}>
          <div className="bus-dropdown-header">
            <span>Live Fleet</span>
            <span>{activeBusCount}</span>
          </div>

          <div className="camera-mode-controls">
            <button
              className={cameraMode === "back" ? "active" : ""}
              onClick={() => setCameraMode("back")}
            >
              Back
            </button>
            <button
              className={cameraMode === "front" ? "active" : ""}
              onClick={() => setCameraMode("front")}
            >
              Front
            </button>
            <button
              className={cameraMode === "top" ? "active" : ""}
              onClick={() => setCameraMode("top")}
            >
              Top
            </button>
            <button
              className={cameraMode === "free" ? "active" : ""}
              onClick={() => setCameraMode("free")}
            >
              Free
            </button>
          </div>

          {busList.length === 0 && (
            <div className="empty-dropdown">
              <span className="empty-icon">ðŸ›°ï¸</span>
              <span>No active buses</span>
            </div>
          )}

          {busList.map((bus) => (
            <button
              key={bus.busId}
              className="bus-dropdown-item"
              onClick={() => focusBus(bus)}
            >
              <div>
                <strong>{bus.busId}</strong>
                <span>{bus.latitude.toFixed(5)}, {bus.longitude.toFixed(5)}</span>
              </div>

              <div className="bus-meta">
                <span>{formatSpeed(bus.speed)}</span>
                <span>Updated {formatUpdated(bus.timestamp, currentTime)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    <button
        className="ai-floating-button"
        onClick={() => setAiOpen(true)}
      >
        <span className="ai-fab-orb">
          <Sparkles size={21} strokeWidth={2.4} />
        </span>

        <span className="ai-fab-copy">
          <strong>AI Fleet Copilot</strong>
          <small>Ask about your buses</small>
        </span>
      </button>

      {aiOpen && (
        <section className="ai-chat-shell">
          <header className="ai-chat-header">
            <div className="ai-agent">
              <div className="ai-avatar">
                <Bot size={24} strokeWidth={2.2} />
              </div>

              <div>
                <strong>Pop Bus AI</strong>
                <span>
                  <i />
                  Fleet intelligence online
                </span>
              </div>
            </div>

            <button
              className="ai-close-button"
              onClick={() => setAiOpen(false)}
              aria-label="Close assistant"
            >
              <X size={20} strokeWidth={2.4} />
            </button>
          </header>

          <div className="ai-suggestions">
            <button
              onClick={() =>
                void askAi(
                  "Which buses are active and where are they right now?"
                )
              }
            >
              <Radio size={14} />
              <span>Live fleet</span>
            </button>

            <button
              onClick={() =>
                void askAi(
                  "Analyze the GPS quality of all active buses."
                )
              }
            >
              <Activity size={14} />
              <span>GPS health</span>
            </button>

            <button
              onClick={() =>
                void askAi(
                  "Give me a detailed fleet status report."
                )
              }
            >
              <FileText size={14} />
              <span>Fleet report</span>
            </button>
          </div>

          <div className="ai-message-list">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`ai-message-row ${message.role}`}
              >
                {message.role === "assistant" && (
                  <div className="ai-message-avatar">
                    <Bot size={16} strokeWidth={2.3} />
                  </div>
                )}

                <div className="ai-message-bubble">
                  {message.content}

                  {message.role === "assistant" &&
                    aiTyping &&
                    message.id ===
                      chatMessages[
                        chatMessages.length - 1
                      ]?.id && (
                      <span className="ai-cursor" />
                    )}
                </div>
              </div>
            ))}

            {aiLoading && (
              <div className="ai-message-row assistant">
                <div className="ai-message-avatar">
                    <Bot size={16} strokeWidth={2.3} />
                  </div>

                <div className="ai-message-bubble ai-thinking">
                  <span />
                  <span />
                  <span />
                  <em>Analyzing fleet data</em>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <footer className="ai-composer">
            <textarea
              value={aiQuestion}
              onChange={(event) =>
                setAiQuestion(event.target.value)
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  void askAi();
                }
              }}
              placeholder="Ask anything about your fleet..."
              rows={1}
            />

            <button
              className="ai-send-button"
              onClick={() => void askAi()}
              disabled={
                !aiQuestion.trim() ||
                aiLoading ||
                aiTyping
              }
              aria-label="Send message"
            >
              <Send size={19} strokeWidth={2.4} />
            </button>
          </footer>
        </section>
      )}
    </main>
  );
}












