import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Compass,
  Layers,
  LocateFixed,
  MapPinned,
  Maximize2,
  Navigation,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import "./MangosMapPage.css";

type CampusId = "chula" | "kku";

type LngLat = [number, number];

type CampusBuilding = {
  name: string;
  coordinate: LngLat;
  sizeMeters: [number, number];
  heightMeters: number;
  rotation: number;
  color: string;
};

type CampusLandmark = {
  name: string;
  coordinate: LngLat;
  tone: string;
};

type CampusRoute = {
  name: string;
  coordinates: LngLat[];
  color: string;
  widthMeters: number;
};

type Campus = {
  id: CampusId;
  name: string;
  city: string;
  center: LngLat;
  boundary: LngLat[];
  accent: string;
  areaLabel: string;
  focusLabel: string;
  landmarks: CampusLandmark[];
  buildings: CampusBuilding[];
  routes: CampusRoute[];
};

type ProjectedPoint = {
  x: number;
  z: number;
};

type ProjectionContext = {
  center: LngLat;
  metersToUnits: number;
  metersPerLng: number;
  metersPerLat: number;
  offsetX: number;
  offsetZ: number;
};

type ViewMode = "overview" | "close";

const CAMPUSES: Campus[] = [
  {
    id: "chula",
    name: "Chulalongkorn University",
    city: "Bangkok",
    center: [100.53124, 13.73857],
    accent: "#f472b6",
    areaLabel: "Pathum Wan campus",
    focusLabel: "compact city campus",
    boundary: [
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
    ],
    landmarks: [
      {
        name: "Central Campus",
        coordinate: [100.5323, 13.7385],
        tone: "#f9a8d4",
      },
      {
        name: "Auditorium Quarter",
        coordinate: [100.53175, 13.73715],
        tone: "#f472b6",
      },
      {
        name: "Engineering Core",
        coordinate: [100.52965, 13.73755],
        tone: "#38bdf8",
      },
      {
        name: "Siam Edge",
        coordinate: [100.53485, 13.7433],
        tone: "#f59e0b",
      },
    ],
    buildings: [
      {
        name: "Learning Tower",
        coordinate: [100.5322, 13.7386],
        sizeMeters: [120, 72],
        heightMeters: 62,
        rotation: -0.18,
        color: "#e879f9",
      },
      {
        name: "Engineering Block",
        coordinate: [100.52975, 13.7375],
        sizeMeters: [138, 80],
        heightMeters: 48,
        rotation: -0.16,
        color: "#22d3ee",
      },
      {
        name: "Sports Hall",
        coordinate: [100.52635, 13.74215],
        sizeMeters: [160, 96],
        heightMeters: 30,
        rotation: -0.14,
        color: "#facc15",
      },
      {
        name: "Academic Court",
        coordinate: [100.53455, 13.74015],
        sizeMeters: [125, 74],
        heightMeters: 42,
        rotation: -0.12,
        color: "#34d399",
      },
      {
        name: "Siam Wing",
        coordinate: [100.53565, 13.74305],
        sizeMeters: [110, 64],
        heightMeters: 56,
        rotation: -0.18,
        color: "#fb7185",
      },
    ],
    routes: [
      {
        name: "Campus Spine",
        color: "#f9a8d4",
        widthMeters: 18,
        coordinates: [
          [100.52525, 13.73645],
          [100.52725, 13.7371],
          [100.5301, 13.7381],
          [100.5326, 13.7391],
          [100.5352, 13.7406],
        ],
      },
      {
        name: "North Link",
        color: "#38bdf8",
        widthMeters: 14,
        coordinates: [
          [100.5261, 13.7431],
          [100.5295, 13.74285],
          [100.5324, 13.7425],
          [100.535, 13.74205],
        ],
      },
    ],
  },
  {
    id: "kku",
    name: "Khon Kaen University",
    city: "Khon Kaen",
    center: [102.81734, 16.4617],
    accent: "#f59e0b",
    areaLabel: "Mueang Khon Kaen campus",
    focusLabel: "wide green campus",
    boundary: [
      [102.802341, 16.4559641],
      [102.8075519, 16.4552595],
      [102.8096342, 16.44268],
      [102.818748, 16.4412998],
      [102.8194544, 16.4459114],
      [102.8216175, 16.4623456],
      [102.8317084, 16.4642971],
      [102.8322966, 16.4755824],
      [102.832319, 16.4820722],
      [102.8285754, 16.4821042],
      [102.8205029, 16.4805132],
      [102.8059182, 16.4807754],
      [102.8039774, 16.4687227],
      [102.802341, 16.4559641],
    ],
    landmarks: [
      {
        name: "Academic Core",
        coordinate: [102.8159, 16.47225],
        tone: "#fb923c",
      },
      {
        name: "Student Hub",
        coordinate: [102.8104, 16.45515],
        tone: "#38bdf8",
      },
      {
        name: "Research Zone",
        coordinate: [102.8232, 16.4644],
        tone: "#a3e635",
      },
      {
        name: "North Green",
        coordinate: [102.8243, 16.47925],
        tone: "#34d399",
      },
    ],
    buildings: [
      {
        name: "Academic Plaza",
        coordinate: [102.8159, 16.47225],
        sizeMeters: [180, 96],
        heightMeters: 42,
        rotation: 0.05,
        color: "#fb923c",
      },
      {
        name: "Research Tower",
        coordinate: [102.8232, 16.4644],
        sizeMeters: [145, 92],
        heightMeters: 58,
        rotation: 0.02,
        color: "#a3e635",
      },
      {
        name: "Student Union",
        coordinate: [102.8104, 16.45515],
        sizeMeters: [168, 84],
        heightMeters: 36,
        rotation: -0.08,
        color: "#38bdf8",
      },
      {
        name: "Innovation Hall",
        coordinate: [102.8192, 16.44595],
        sizeMeters: [150, 86],
        heightMeters: 44,
        rotation: 0.08,
        color: "#facc15",
      },
      {
        name: "North Residence",
        coordinate: [102.8248, 16.47915],
        sizeMeters: [210, 92],
        heightMeters: 34,
        rotation: 0.1,
        color: "#34d399",
      },
    ],
    routes: [
      {
        name: "Central Loop",
        color: "#f59e0b",
        widthMeters: 26,
        coordinates: [
          [102.806, 16.4562],
          [102.811, 16.4591],
          [102.816, 16.4637],
          [102.823, 16.4652],
          [102.829, 16.4665],
        ],
      },
      {
        name: "North Connector",
        color: "#34d399",
        widthMeters: 22,
        coordinates: [
          [102.812, 16.4793],
          [102.818, 16.4778],
          [102.824, 16.4784],
          [102.831, 16.4802],
        ],
      },
    ],
  },
];

function projectMeters(coordinate: LngLat, center: LngLat) {
  const centerLatRadians = (center[1] * Math.PI) / 180;
  const metersPerLat = 111_320;
  const metersPerLng = Math.cos(centerLatRadians) * metersPerLat;

  return {
    x: (coordinate[0] - center[0]) * metersPerLng,
    z: -(coordinate[1] - center[1]) * metersPerLat,
  };
}

function getBounds(points: ProjectedPoint[]) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minZ: Math.min(bounds.minZ, point.z),
      maxZ: Math.max(bounds.maxZ, point.z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    }
  );
}

function createProjectionContext(campus: Campus): ProjectionContext {
  const rawBoundary = campus.boundary.map((point) =>
    projectMeters(point, campus.center)
  );
  const rawBounds = getBounds(rawBoundary);
  const largestSpan = Math.max(
    rawBounds.maxX - rawBounds.minX,
    rawBounds.maxZ - rawBounds.minZ,
    1
  );
  const metersToUnits = 38 / largestSpan;
  const scaledBounds = getBounds(
    rawBoundary.map((point) => ({
      x: point.x * metersToUnits,
      z: point.z * metersToUnits,
    }))
  );

  return {
    center: campus.center,
    metersToUnits,
    metersPerLat: 111_320,
    metersPerLng:
      Math.cos((campus.center[1] * Math.PI) / 180) * 111_320,
    offsetX: -((scaledBounds.minX + scaledBounds.maxX) / 2),
    offsetZ: -((scaledBounds.minZ + scaledBounds.maxZ) / 2),
  };
}

function projectCoordinate(
  coordinate: LngLat,
  context: ProjectionContext
): ProjectedPoint {
  return {
    x:
      (coordinate[0] - context.center[0]) *
        context.metersPerLng *
        context.metersToUnits +
      context.offsetX,
    z:
      -(coordinate[1] - context.center[1]) *
        context.metersPerLat *
        context.metersToUnits +
      context.offsetZ,
  };
}

function createLabelSprite(label: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 144;

  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.Sprite();
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(2, 6, 23, 0.88)";
  context.strokeStyle = color;
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(18, 24, 476, 92, 26);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "700 34px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 256, 70, 430);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(Math.min(7.2, 2.9 + label.length * 0.16), 1.65, 1);

  return sprite;
}

function createCampusGround(
  campus: Campus,
  context: ProjectionContext,
  scene: THREE.Scene
) {
  const projectedBoundary = campus.boundary.map((point) =>
    projectCoordinate(point, context)
  );
  const shape = new THREE.Shape();

  projectedBoundary.forEach((point, index) => {
    if (index === 0) {
      shape.moveTo(point.x, point.z);
      return;
    }

    shape.lineTo(point.x, point.z);
  });

  const campusGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22,
    bevelEnabled: false,
  });
  campusGeometry.rotateX(Math.PI / 2);

  const campusMaterial = new THREE.MeshStandardMaterial({
    color: "#13251f",
    roughness: 0.78,
    metalness: 0.08,
  });
  const campusMesh = new THREE.Mesh(campusGeometry, campusMaterial);
  campusMesh.receiveShadow = true;
  campusMesh.position.y = 0.08;
  scene.add(campusMesh);

  const haloGeometry = new THREE.ShapeGeometry(shape);
  haloGeometry.rotateX(Math.PI / 2);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: campus.accent,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
  });
  const haloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
  haloMesh.position.y = 0.18;
  scene.add(haloMesh);

  const boundaryPoints = projectedBoundary.map(
    (point) => new THREE.Vector3(point.x, 0.33, point.z)
  );
  const boundaryCurve = new THREE.CatmullRomCurve3(boundaryPoints, true);
  const boundaryGeometry = new THREE.TubeGeometry(
    boundaryCurve,
    boundaryPoints.length * 9,
    0.07,
    8,
    true
  );
  const boundaryMaterial = new THREE.MeshStandardMaterial({
    color: campus.accent,
    emissive: campus.accent,
    emissiveIntensity: 0.28,
    roughness: 0.35,
  });
  const boundaryMesh = new THREE.Mesh(boundaryGeometry, boundaryMaterial);
  scene.add(boundaryMesh);

  return projectedBoundary;
}

function addRoutes(
  campus: Campus,
  context: ProjectionContext,
  scene: THREE.Scene
) {
  campus.routes.forEach((route) => {
    const routePoints = route.coordinates.map((coordinate) => {
      const point = projectCoordinate(coordinate, context);
      return new THREE.Vector3(point.x, 0.42, point.z);
    });

    const routeCurve = new THREE.CatmullRomCurve3(routePoints);
    const radius = Math.max(
      0.05,
      route.widthMeters * context.metersToUnits * 0.18
    );
    const routeGeometry = new THREE.TubeGeometry(
      routeCurve,
      Math.max(36, routePoints.length * 18),
      radius,
      10,
      false
    );
    const routeMaterial = new THREE.MeshStandardMaterial({
      color: route.color,
      emissive: route.color,
      emissiveIntensity: 0.18,
      roughness: 0.4,
    });
    const routeMesh = new THREE.Mesh(routeGeometry, routeMaterial);
    routeMesh.name = route.name;
    scene.add(routeMesh);
  });
}

function addBuildings(
  campus: Campus,
  context: ProjectionContext,
  scene: THREE.Scene
) {
  campus.buildings.forEach((building) => {
    const point = projectCoordinate(building.coordinate, context);
    const width = Math.max(0.68, building.sizeMeters[0] * context.metersToUnits);
    const depth = Math.max(0.58, building.sizeMeters[1] * context.metersToUnits);
    const height = 0.55 + building.heightMeters * 0.035;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: building.color,
      emissive: building.color,
      emissiveIntensity: 0.06,
      roughness: 0.52,
      metalness: 0.14,
    });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(point.x, height / 2 + 0.32, point.z);
    mesh.rotation.y = building.rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = building.name;
    scene.add(mesh);

    const roofGeometry = new THREE.BoxGeometry(width * 0.82, 0.08, depth * 0.82);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: "#f8fafc",
      roughness: 0.3,
      metalness: 0.22,
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);

    roof.position.set(point.x, height + 0.39, point.z);
    roof.rotation.y = building.rotation;
    scene.add(roof);
  });
}

function addLandmarks(
  campus: Campus,
  context: ProjectionContext,
  scene: THREE.Scene
) {
  const animated: THREE.Object3D[] = [];

  campus.landmarks.forEach((landmark) => {
    const point = projectCoordinate(landmark.coordinate, context);
    const group = new THREE.Group();

    const baseGeometry = new THREE.CylinderGeometry(0.36, 0.48, 0.18, 28);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: landmark.tone,
      emissive: landmark.tone,
      emissiveIntensity: 0.28,
      roughness: 0.4,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.58;
    group.add(base);

    const needleGeometry = new THREE.ConeGeometry(0.24, 1.45, 28);
    const needleMaterial = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      emissive: landmark.tone,
      emissiveIntensity: 0.32,
      roughness: 0.28,
    });
    const needle = new THREE.Mesh(needleGeometry, needleMaterial);
    needle.position.y = 1.34;
    group.add(needle);

    const ringGeometry = new THREE.TorusGeometry(0.72, 0.035, 10, 44);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: landmark.tone,
      transparent: true,
      opacity: 0.72,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.48;
    group.add(ring);
    animated.push(ring);

    const label = createLabelSprite(landmark.name, landmark.tone);
    label.position.set(0, 2.5, 0);
    group.add(label);

    group.position.set(point.x, 0, point.z);
    scene.add(group);
  });

  return animated;
}

function addCompass(scene: THREE.Scene) {
  const compassGroup = new THREE.Group();
  const northMaterial = new THREE.MeshBasicMaterial({ color: "#38bdf8" });
  const southMaterial = new THREE.MeshBasicMaterial({ color: "#f59e0b" });
  const north = new THREE.Mesh(
    new THREE.ConeGeometry(0.36, 1.9, 4),
    northMaterial
  );
  const south = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 1.2, 4),
    southMaterial
  );

  north.position.z = -22;
  north.position.y = 1;
  north.rotation.y = Math.PI / 4;
  south.position.z = 22;
  south.position.y = 0.72;
  south.rotation.set(Math.PI, Math.PI / 4, 0);
  compassGroup.add(north);
  compassGroup.add(south);
  scene.add(compassGroup);
}

function disposeMaterial(material: THREE.Material) {
  const materialWithMap = material as THREE.Material & {
    map?: THREE.Texture;
  };

  materialWithMap.map?.dispose();
  material.dispose();
}

function setupCampusScene(
  host: HTMLDivElement,
  campus: Campus,
  viewMode: ViewMode,
  autoOrbit: boolean
) {
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 220);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
  });
  const context = createProjectionContext(campus);

  scene.background = new THREE.Color("#07111e");
  scene.fog = new THREE.Fog("#07111e", 42, 96);

  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const ambientLight = new THREE.HemisphereLight("#e0f2fe", "#172554", 1.65);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight("#ffffff", 2.4);
  keyLight.position.set(-18, 28, 18);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(campus.accent, 1.25);
  rimLight.position.set(18, 16, -16);
  scene.add(rimLight);

  const baseGeometry = new THREE.PlaneGeometry(72, 72, 24, 24);
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: "#091422",
    roughness: 0.86,
    metalness: 0.06,
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.03;
  base.receiveShadow = true;
  scene.add(base);

  const grid = new THREE.GridHelper(72, 24, "#1f9f8a", "#193144");
  grid.position.y = 0.02;
  scene.add(grid);

  createCampusGround(campus, context, scene);
  addRoutes(campus, context, scene);
  addBuildings(campus, context, scene);
  const animated = addLandmarks(campus, context, scene);
  addCompass(scene);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 15;
  controls.maxDistance = 62;
  controls.minPolarAngle = 0.32;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.autoRotate = autoOrbit;
  controls.autoRotateSpeed = 0.62;
  controls.target.set(0, 0.2, 0);

  if (viewMode === "close") {
    camera.position.set(-18, 18, 21);
  } else {
    camera.position.set(0, 30, 36);
  }

  controls.update();

  const resize = () => {
    const nextWidth = Math.max(1, host.clientWidth);
    const nextHeight = Math.max(1, host.clientHeight);

    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight, false);
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);

  const clock = new THREE.Clock();
  let animationId = 0;

  const animate = () => {
    const elapsed = clock.getElapsedTime();

    animated.forEach((item, index) => {
      const pulse = 1 + Math.sin(elapsed * 2.15 + index * 0.7) * 0.14;
      item.scale.set(pulse, pulse, pulse);
      item.rotation.z += 0.01;
    });

    controls.update();
    renderer.render(scene, camera);
    animationId = window.requestAnimationFrame(animate);
  };

  animate();

  return () => {
    window.cancelAnimationFrame(animationId);
    resizeObserver.disconnect();
    controls.dispose();

    scene.traverse((object) => {
      const renderable = object as {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };

      renderable.geometry?.dispose();

      const material = renderable.material;

      if (!material) {
        return;
      }

      if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
      } else {
        disposeMaterial(material);
      }
    });

    renderer.dispose();

    if (renderer.domElement.parentElement === host) {
      host.removeChild(renderer.domElement);
    }
  };
}

export default function MangosMapPage() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const [activeCampusId, setActiveCampusId] = useState<CampusId>("chula");
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [autoOrbit, setAutoOrbit] = useState(true);

  const activeCampus = useMemo(
    () =>
      CAMPUSES.find((campus) => campus.id === activeCampusId) ?? CAMPUSES[0],
    [activeCampusId]
  );

  useEffect(() => {
    const host = canvasHostRef.current;

    if (!host) {
      return;
    }

    host.replaceChildren();

    return setupCampusScene(host, activeCampus, viewMode, autoOrbit);
  }, [activeCampus, autoOrbit, viewMode]);

  return (
    <main className="mangos-map-page">
      <section className="mangos-map-stage" aria-label="MANGOs 3D campus map">
        <div ref={canvasHostRef} className="mangos-map-canvas" />

        <div className="mangos-map-topbar">
          <Link to="/" className="mangos-map-back" aria-label="Back home">
            <ArrowLeft size={20} />
          </Link>

          <div className="mangos-map-brand">
            <span className="mangos-map-brand-icon">
              <MapPinned size={22} />
            </span>
            <div>
              <strong>MANGOs Map</strong>
              <small>Selected campus areas</small>
            </div>
          </div>
        </div>

        <div className="mangos-map-viewbar" aria-label="Map view controls">
          <button
            type="button"
            className={viewMode === "overview" ? "active" : ""}
            onClick={() => setViewMode("overview")}
          >
            <Maximize2 size={17} />
            Overview
          </button>
          <button
            type="button"
            className={viewMode === "close" ? "active" : ""}
            onClick={() => setViewMode("close")}
          >
            <LocateFixed size={17} />
            Focus
          </button>
          <button
            type="button"
            className={autoOrbit ? "active" : ""}
            onClick={() => setAutoOrbit((current) => !current)}
          >
            <Compass size={17} />
            Orbit
          </button>
        </div>
      </section>

      <aside className="mangos-map-panel">
        <div className="mangos-map-heading">
          <span>Area Set</span>
          <h1>University map</h1>
        </div>

        <div className="mangos-campus-list">
          {CAMPUSES.map((campus) => (
            <button
              key={campus.id}
              type="button"
              className={campus.id === activeCampus.id ? "active" : ""}
              onClick={() => {
                setActiveCampusId(campus.id);
                setViewMode("overview");
              }}
            >
              <span
                className="mangos-campus-swatch"
                style={{ background: campus.accent }}
              />
              <span>
                <strong>{campus.name}</strong>
                <small>{campus.city}</small>
              </span>
              <Navigation size={18} />
            </button>
          ))}
        </div>

        <div className="mangos-map-stats">
          <div>
            <Layers size={18} />
            <span>
              <small>Boundary</small>
              <strong>{activeCampus.areaLabel}</strong>
            </span>
          </div>
          <div>
            <Building2 size={18} />
            <span>
              <small>Landmarks</small>
              <strong>{activeCampus.landmarks.length} focus points</strong>
            </span>
          </div>
          <div>
            <Compass size={18} />
            <span>
              <small>View</small>
              <strong>{activeCampus.focusLabel}</strong>
            </span>
          </div>
        </div>

        <div className="mangos-landmark-list">
          {activeCampus.landmarks.map((landmark) => (
            <span key={landmark.name}>
              <i style={{ background: landmark.tone }} />
              {landmark.name}
            </span>
          ))}
        </div>
      </aside>
    </main>
  );
}
