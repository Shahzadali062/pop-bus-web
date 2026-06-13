const fs = require("fs");

const file = "src/features/liveMap/pages/LiveMapPage.tsx";
let code = fs.readFileSync(file, "utf8");

function replaceFunction(source, functionName, replacement) {
  const start = source.indexOf(`function ${functionName}`);
  if (start === -1) {
    throw new Error(`Function not found: ${functionName}`);
  }

  const braceStart = source.indexOf("{", start);
  let depth = 0;

  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];

    if (char === "{") depth += 1;

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(0, start) + replacement + source.slice(i + 1);
      }
    }
  }

  throw new Error(`Could not replace function: ${functionName}`);
}

function replaceLiveCameraConstant(source) {
  const fixedCamera = `const LIVE_CAMERA: {
  zoom: number;
  pitch: number;
  bearing: number;
} = {
  zoom: 20.276,
  pitch: 60,
  bearing: -78.69,
};`;

  const start = source.indexOf("const LIVE_CAMERA");

  if (start !== -1) {
    const end = source.indexOf("};", start);

    if (end === -1) {
      throw new Error("LIVE_CAMERA exists but ending }; was not found");
    }

    return source.slice(0, start) + fixedCamera + source.slice(end + 2);
  }

  return source.replace(
    /const MAP_CENTER: \[number, number\] = \[[^\]]+\];/,
    `const MAP_CENTER: [number, number] = [100.53389, 13.73604];\n\n${fixedCamera}`
  );
}

code = replaceLiveCameraConstant(code);

/* Remove debugger import and call */
code = code.replace(
  /import \{ setupGlbCharacterDebugger \} from "\.\.\/debug\/glbCharacterDebugger";\r?\n/g,
  ""
);
code = code.replace(/\r?\n\s*setupGlbCharacterDebugger\(\);/g, "");

/* Ensure model-viewer import */
if (!code.includes('@google/model-viewer')) {
  code = code.replace(
    `import "maplibre-gl/dist/maplibre-gl.css";`,
    `import "maplibre-gl/dist/maplibre-gl.css";\nimport "@google/model-viewer";`
  );
}

const createMarker = `function createBusMarkerElement(busId: string) {
  const safeBusId = String(busId).replace(
    /[&<>"']/g,
    (character) => {
      if (character === "&") return "&amp;";
      if (character === "<") return "&lt;";
      if (character === ">") return "&gt;";
      if (character === '"') return "&quot;";
      if (character === "'") return "&#039;";
      return character;
    }
  );

  const element = document.createElement("div");
  element.className = "glb-human-marker";

  element.innerHTML = \`
    <div class="glb-human-label">\${safeBusId}</div>
    <div class="glb-human-shadow"></div>

    <model-viewer
      class="glb-human-model"
      src="/models/runner.glb"
      camera-orbit="180deg 62deg 2.25m"
      camera-target="0m 0.95m 0m"
      exposure="1.05"
      shadow-intensity="0.75"
      interaction-prompt="none"
      disable-zoom
      disable-pan
    >
      <div class="glb-human-loading" slot="poster">
        Loading 3D
      </div>
    </model-viewer>
  \`;

  return element;
}`;

const animateMarker = `function animateMarkerTo(
  marker: Marker,
  from: MarkerPosition,
  to: MarkerPosition,
  duration = 5200,
  onUpdate?: (position: MarkerPosition) => void
) {
  const markerElement = marker.getElement();
  const modelViewer = markerElement.querySelector(
    "model-viewer"
  ) as any | null;

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

    try {
      if (modelViewer) {
        modelViewer.currentTime = 0;
      }
    } catch {
      // Some GLB files do not expose currentTime before fully loaded.
    }
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
}`;

code = replaceFunction(code, "createBusMarkerElement", createMarker);
code = replaceFunction(code, "animateMarkerTo", animateMarker);

/* Feet must sit on GPS/map coordinate */
code = code.replace(/anchor:\s*"center"/g, 'anchor: "bottom"');

/* Camera values should always use the approved live camera */
code = code.replace(/zoom:\s*(?:LIVE_CAMERA\.zoom|[0-9.]+),/g, "zoom: LIVE_CAMERA.zoom,");
code = code.replace(/pitch:\s*(?:LIVE_CAMERA\.pitch|-?[0-9.]+),/g, "pitch: LIVE_CAMERA.pitch,");
code = code.replace(/bearing:\s*(?:LIVE_CAMERA\.bearing|-?[0-9.]+),/g, "bearing: LIVE_CAMERA.bearing,");
code = code.replace(/map\.setPitch\([^)]*\);/g, "map.setPitch(LIVE_CAMERA.pitch);");
code = code.replace(/map\.setBearing\([^)]*\);/g, "map.setBearing(LIVE_CAMERA.bearing);");
code = code.replace(/map\.setZoom\([^)]*\);/g, "map.setZoom(LIVE_CAMERA.zoom);");

/* Lock manual rotate so angle stays professional */
code = code.replace(/map\.dragRotate\.(enable|disable)\(\);/g, "map.dragRotate.disable();");
code = code.replace(/map\.touchZoomRotate\.(enableRotation|disableRotation)\(\);/g, "map.touchZoomRotate.disableRotation();");

/* Keep character centered on first active bus on load and updates */
if (!code.includes("AUTO_FOLLOW_LIVE_BUS_CAMERA")) {
  code = code.replace(
    `  return (\n    <main className="map-page">`,
    `  // AUTO_FOLLOW_LIVE_BUS_CAMERA\n  useEffect(() => {\n    const map = mapRef.current;\n    const firstLiveBus = Object.values(buses)[0];\n\n    if (!map || !firstLiveBus) {\n      return;\n    }\n\n    map.easeTo({\n      center: [\n        firstLiveBus.longitude,\n        firstLiveBus.latitude,\n      ],\n      zoom: LIVE_CAMERA.zoom,\n      pitch: LIVE_CAMERA.pitch,\n      bearing: LIVE_CAMERA.bearing,\n      duration: 850,\n      essential: true,\n    });\n  }, [buses]);\n\n  return (\n    <main className="map-page">`
  );
}

fs.writeFileSync(file, code, "utf8");
console.log("LiveMapPage GLB marker fixed.");
