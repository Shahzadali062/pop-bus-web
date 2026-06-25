import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Heart, Pause, QrCode, Shield, Trophy, Zap } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import * as THREE from "three";

import { SERVER_URL } from "../../../shared/config/server";
import "./MiniGamePage.css";

type GameControl =
  | "boost"
  | "drift-down"
  | "drift-up"
  | "jump"
  | "pause"
  | "restart"
  | "resume"
  | "start";

type GameStatus = "waiting" | "ready" | "playing" | "paused" | "finished";

type JoystickState = {
  x: number;
  y: number;
  magnitude: number;
};

type PassengerStop = {
  label: string;
  position: THREE.Vector3;
  color: number;
};

type DropZone = {
  label: string;
  position: THREE.Vector3;
  color: number;
};

type StopMarker = {
  root: THREE.Group;
  ring: THREE.Mesh;
  glow: THREE.Mesh;
  people: THREE.Group;
};

type TrafficActor = {
  root: THREE.Group;
  axis: "x" | "z";
  direction: 1 | -1;
  lane: number;
  speed: number;
  wrapMin: number;
  wrapMax: number;
};

type EnergyCell = {
  root: THREE.Group;
  pulse: number;
};

type ParticleEffect = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
};

const PUBLIC_WEB_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://pop-bus-web.vercel.app";

const CITY_LIMIT_X = 18;
const CITY_LIMIT_Z = 13;
const INITIAL_TIME = 120;
const MAX_LIVES = 4;

const PASSENGER_STOPS: PassengerStop[] = [
  {
    label: "Market Stop",
    position: new THREE.Vector3(-13.8, 0, -8.8),
    color: 0x22c55e,
  },
  {
    label: "Cinema Corner",
    position: new THREE.Vector3(12.9, 0, -9.2),
    color: 0xf59e0b,
  },
  {
    label: "Campus Gate",
    position: new THREE.Vector3(-14.1, 0, 7.9),
    color: 0x38bdf8,
  },
  {
    label: "Clinic Lane",
    position: new THREE.Vector3(13.4, 0, 8.6),
    color: 0xfb7185,
  },
  {
    label: "Metro Plaza",
    position: new THREE.Vector3(0, 0, -11.2),
    color: 0xa3e635,
  },
];

const DROP_ZONES: DropZone[] = [
  {
    label: "Central Terminal",
    position: new THREE.Vector3(0, 0, 10.8),
    color: 0x60a5fa,
  },
  {
    label: "Night Depot",
    position: new THREE.Vector3(15.1, 0, 0.8),
    color: 0xf97316,
  },
  {
    label: "Harbor Stand",
    position: new THREE.Vector3(-15.2, 0, -0.6),
    color: 0x2dd4bf,
  },
];

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function pickDifferentIndex(length: number, currentIndex: number) {
  if (length <= 1) return 0;

  let nextIndex = Math.floor(Math.random() * length);

  if (nextIndex === currentIndex) {
    nextIndex = (nextIndex + 1) % length;
  }

  return nextIndex;
}

function createBox(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material
) {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
}

function setShadow(mesh: THREE.Object3D, cast = true, receive = true) {
  mesh.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const item = child as THREE.Mesh;
      item.castShadow = cast;
      item.receiveShadow = receive;
    }
  });
}

function createBusModel() {
  const root = new THREE.Group();
  root.name = "pop-bus";

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    metalness: 0.18,
    roughness: 0.42,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc857,
    metalness: 0.12,
    roughness: 0.36,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x9be7ff,
    emissive: 0x075985,
    emissiveIntensity: 0.35,
    metalness: 0.08,
    roughness: 0.18,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.24,
    roughness: 0.58,
  });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    metalness: 0.68,
    roughness: 0.3,
  });
  const lightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfacc15,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });
  const tailLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 0.9,
    roughness: 0.35,
  });

  const body = createBox(1.55, 0.62, 2.42, bodyMaterial);
  body.position.y = 0.54;
  root.add(body);

  const roof = createBox(1.34, 0.42, 1.8, roofMaterial);
  roof.position.set(0, 1.05, -0.08);
  root.add(roof);

  const windshield = createBox(1.04, 0.28, 0.035, glassMaterial);
  windshield.position.set(0, 1.03, -1.14);
  root.add(windshield);

  const rearWindow = createBox(0.96, 0.24, 0.035, glassMaterial);
  rearWindow.position.set(0, 0.96, 1.13);
  root.add(rearWindow);

  [-0.66, 0.66].forEach((x) => {
    [-0.52, 0.1, 0.72].forEach((z) => {
      const windowPanel = createBox(0.035, 0.22, 0.34, glassMaterial);
      windowPanel.position.set(x, 0.94, z);
      root.add(windowPanel);
    });
  });

  [-0.55, 0.55].forEach((x) => {
    const headlight = createBox(0.24, 0.12, 0.045, lightMaterial);
    headlight.position.set(x, 0.55, -1.25);
    root.add(headlight);

    const tailLight = createBox(0.2, 0.1, 0.045, tailLightMaterial);
    tailLight.position.set(x, 0.55, 1.25);
    root.add(tailLight);
  });

  [-0.83, 0.83].forEach((x) => {
    [-0.78, 0.78].forEach((z) => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.2, 22),
        wheelMaterial
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.31, z);
      root.add(wheel);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.215, 18),
        rimMaterial
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.copy(wheel.position);
      root.add(rim);
    });
  });

  const routeSign = createBox(0.82, 0.18, 0.04, glassMaterial);
  routeSign.position.set(0, 1.33, -0.94);
  root.add(routeSign);

  const underGlow = new THREE.PointLight(0x22c55e, 2.1, 4.2);
  underGlow.position.set(0, 0.22, 0.05);
  root.add(underGlow);

  setShadow(root, true, false);

  return root;
}

function createTrafficVehicle(color: number) {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.2,
    roughness: 0.45,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xc7f9ff,
    emissive: 0x0e7490,
    emissiveIntensity: 0.24,
    roughness: 0.2,
  });
  const tire = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.65,
  });

  const base = createBox(1.12, 0.36, 1.82, paint);
  base.position.y = 0.36;
  root.add(base);

  const cabin = createBox(0.82, 0.32, 0.78, glass);
  cabin.position.set(0, 0.68, -0.08);
  root.add(cabin);

  [-0.6, 0.6].forEach((x) => {
    [-0.58, 0.58].forEach((z) => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.17, 0.16, 14),
        tire
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.23, z);
      root.add(wheel);
    });
  });

  setShadow(root, true, false);

  return root;
}

function createPassengerMarker(stop: PassengerStop) {
  const root = new THREE.Group();
  root.position.copy(stop.position);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: stop.color,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: stop.color,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
  });
  const personMaterial = new THREE.MeshStandardMaterial({
    color: stop.color,
    emissive: stop.color,
    emissiveIntensity: 0.18,
    roughness: 0.55,
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd7b5,
    roughness: 0.62,
  });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.035, 10, 44), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.035;
  root.add(ring);

  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.05, 44), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.025;
  root.add(glow);

  const people = new THREE.Group();

  [-0.24, 0.2].forEach((x, index) => {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.28, 4, 8), personMaterial);
    body.position.set(x, 0.38, index === 0 ? -0.08 : 0.12);
    people.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), headMaterial);
    head.position.set(x, 0.68, index === 0 ? -0.08 : 0.12);
    people.add(head);
  });

  root.add(people);

  return {
    root,
    ring,
    glow,
    people,
  };
}

function createDropGate() {
  const root = new THREE.Group();
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.88,
  });
  const floorMaterial = new THREE.MeshBasicMaterial({
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
  });

  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.45, 64), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.035;
  root.add(floor);

  [-0.92, 0.92].forEach((x) => {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.75, 14), beamMaterial);
    column.position.set(x, 0.9, 0);
    root.add(column);
  });

  const top = createBox(1.95, 0.08, 0.08, beamMaterial);
  top.position.y = 1.72;
  root.add(top);

  root.visible = false;

  return root;
}

function createEnergyCell() {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x2dd4bf,
    emissive: 0x14b8a6,
    emissiveIntensity: 0.8,
    metalness: 0.35,
    roughness: 0.24,
  });
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xa7f3d0,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
  });

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), material);
  core.position.y = 0.54;
  root.add(core);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 32), haloMaterial);
  halo.position.y = 0.54;
  root.add(halo);

  return root;
}

function randomRoadPosition() {
  const lanes = [-9, -3, 3, 9];
  const lane = lanes[Math.floor(Math.random() * lanes.length)];

  if (Math.random() > 0.5) {
    return new THREE.Vector3(THREE.MathUtils.randFloat(-15.5, 15.5), 0, lane);
  }

  return new THREE.Vector3(lane, 0, THREE.MathUtils.randFloat(-10.5, 10.5));
}

function createSpark(scene: THREE.Scene, position: THREE.Vector3, color: number) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.92,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), material);
  mesh.position.copy(position);
  scene.add(mesh);

  return {
    mesh,
    velocity: new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(2.2),
      THREE.MathUtils.randFloat(1.4, 2.5),
      THREE.MathUtils.randFloatSpread(2.2)
    ),
    life: 0.58,
    maxLife: 0.58,
  };
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
    return;
  }

  material.dispose();
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      disposeMaterial(mesh.material);
    }
  });
}

export default function MiniGamePage() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [roomId] = useState(createRoomId);

  const joystickRef = useRef<JoystickState>({ x: 0, y: 0, magnitude: 0 });
  const busRef = useRef<THREE.Group | null>(null);
  const velocityRef = useRef(new THREE.Vector3());
  const headingRef = useRef(0);
  const speedRef = useRef(0);
  const cameraTargetRef = useRef(new THREE.Vector3());
  const driftActiveRef = useRef(false);
  const turboUntilRef = useRef(0);
  const turboRef = useRef(100);
  const damageCooldownRef = useRef(0);
  const screenShakeRef = useRef(0);
  const carryingPassengerRef = useRef(false);
  const activeStopIndexRef = useRef(0);
  const activeDropIndexRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const deliveriesRef = useRef(0);
  const comboRef = useRef(1);
  const levelRef = useRef(1);
  const timeLeftRef = useRef(INITIAL_TIME);
  const gameStatusRef = useRef<GameStatus>("waiting");
  const stopMarkersRef = useRef<StopMarker[]>([]);
  const dropGateRef = useRef<THREE.Group | null>(null);
  const trafficRef = useRef<TrafficActor[]>([]);
  const energyCellsRef = useRef<EnergyCell[]>([]);
  const effectsRef = useRef<ParticleEffect[]>([]);

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [controllerConnected, setControllerConnected] = useState(false);
  const [socketStatus, setSocketStatus] = useState("Connecting");
  const [gameStatus, setGameStatus] = useState<GameStatus>("waiting");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [deliveries, setDeliveries] = useState(0);
  const [combo, setCombo] = useState(1);
  const [level, setLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME);
  const [turbo, setTurbo] = useState(100);
  const [speed, setSpeed] = useState(0);
  const [mission, setMission] = useState("Pair mobile controller");
  const [message, setMessage] = useState("Scan QR with mobile to dispatch.");
  const [hitFlash, setHitFlash] = useState(false);

  const controllerUrl = `${PUBLIC_WEB_URL}/game-controller/${roomId}`;

  const setStatus = useCallback((status: GameStatus) => {
    gameStatusRef.current = status;
    setGameStatus(status);
  }, []);

  const updateMissionText = useCallback(() => {
    if (carryingPassengerRef.current) {
      setMission(`Drop at ${DROP_ZONES[activeDropIndexRef.current].label}`);
      return;
    }

    setMission(`Pick up at ${PASSENGER_STOPS[activeStopIndexRef.current].label}`);
  }, []);

  const resetGame = useCallback(() => {
    scoreRef.current = 0;
    livesRef.current = MAX_LIVES;
    deliveriesRef.current = 0;
    comboRef.current = 1;
    levelRef.current = 1;
    timeLeftRef.current = INITIAL_TIME;
    turboRef.current = 100;
    carryingPassengerRef.current = false;
    activeStopIndexRef.current = pickDifferentIndex(
      PASSENGER_STOPS.length,
      activeStopIndexRef.current
    );
    activeDropIndexRef.current = pickDifferentIndex(
      DROP_ZONES.length,
      activeDropIndexRef.current
    );
    joystickRef.current = { x: 0, y: 0, magnitude: 0 };
    velocityRef.current.set(0, 0, 0);
    headingRef.current = 0;
    speedRef.current = 0;
    driftActiveRef.current = false;
    turboUntilRef.current = 0;
    damageCooldownRef.current = 0;
    screenShakeRef.current = 0;

    const bus = busRef.current;

    if (bus) {
      bus.position.set(0, 0, 4.8);
      bus.rotation.set(0, 0, 0);
      bus.scale.setScalar(1);
    }

    trafficRef.current.forEach((actor, index) => {
      if (actor.axis === "x") {
        actor.root.position.set(index % 2 === 0 ? -16 : 16, 0, actor.lane);
      } else {
        actor.root.position.set(actor.lane, 0, index % 2 === 0 ? -11.5 : 11.5);
      }
    });

    energyCellsRef.current.forEach((cell) => {
      cell.root.position.copy(randomRoadPosition());
      cell.root.visible = true;
    });

    setScore(0);
    setLives(MAX_LIVES);
    setDeliveries(0);
    setCombo(1);
    setLevel(1);
    setTimeLeft(INITIAL_TIME);
    setTurbo(100);
    setSpeed(0);
    setStatus("playing");
    updateMissionText();
    setMessage("Shift started. Keep the route clean.");
  }, [setStatus, updateMissionText]);

  const handleControl = useCallback(
    (control: GameControl) => {
      if (control === "start" || control === "restart") {
        resetGame();
        return;
      }

      if (control === "pause" && gameStatusRef.current === "playing") {
        setStatus("paused");
        setMessage("Route paused.");
        return;
      }

      if (control === "resume" && gameStatusRef.current === "paused") {
        setStatus("playing");
        setMessage("Back on route.");
        return;
      }

      if (control === "drift-down" || control === "jump") {
        driftActiveRef.current = true;
        return;
      }

      if (control === "drift-up") {
        driftActiveRef.current = false;
        return;
      }

      if (gameStatusRef.current !== "playing") {
        return;
      }

      if (control === "boost") {
        if (turboRef.current < 18) {
          setMessage("Turbo is recharging.");
          return;
        }

        turboUntilRef.current = Date.now() + 1750;
        setMessage("Turbo surge ready.");
      }
    },
    [resetGame, setStatus]
  );

  useEffect(() => {
    QRCode.toDataURL(controllerUrl, {
      width: 340,
      margin: 2,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [controllerUrl]);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket"],
      reconnection: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketStatus("Connected");

      socket.emit(
        "game:join-room",
        { roomId, role: "viewer" },
        (response?: { ok?: boolean; message?: string }) => {
          if (!response?.ok) {
            setSocketStatus(response?.message ?? "Room join failed");
          }
        }
      );
    });

    socket.on("disconnect", () => {
      setSocketStatus("Disconnected");
    });

    socket.on("game:peer-joined", (payload: { role?: string }) => {
      if (payload?.role === "controller") {
        setControllerConnected(true);
        setMessage("Controller paired. Loading city route...");
      }
    });

    socket.on("game:peer-left", (payload: { role?: string }) => {
      if (payload?.role === "controller") {
        joystickRef.current = { x: 0, y: 0, magnitude: 0 };
        setControllerConnected(false);
        setStatus("waiting");
        setMission("Pair mobile controller");
        setMessage("Controller disconnected.");
      }
    });

    socket.on(
      "game:joystick-command",
      (payload: { x?: number; y?: number; magnitude?: number }) => {
        const x =
          typeof payload.x === "number" ? THREE.MathUtils.clamp(payload.x, -1, 1) : 0;
        const y =
          typeof payload.y === "number" ? THREE.MathUtils.clamp(payload.y, -1, 1) : 0;

        joystickRef.current = {
          x,
          y,
          magnitude:
            typeof payload.magnitude === "number"
              ? THREE.MathUtils.clamp(payload.magnitude, 0, 1)
              : Math.min(1, Math.sqrt(x * x + y * y)),
        };
      }
    );

    socket.on("game:control-command", (payload: { control?: GameControl }) => {
      if (payload?.control) {
        handleControl(payload.control);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [handleControl, roomId, setStatus]);

  useEffect(() => {
    if (!controllerConnected) return;

    const host = canvasRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161719);
    scene.fog = new THREE.Fog(0x161719, 22, 52);

    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 90);
    camera.position.set(0, 8.2, 13.8);
    cameraTargetRef.current.set(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xf8fafc, 0x262626, 1.75);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff7ed, 3.1);
    sun.position.set(-8, 12, 7);
    sun.castShadow = true;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    scene.add(sun);

    const cityGlow = new THREE.DirectionalLight(0x38bdf8, 1.25);
    cityGlow.position.set(8, 5, -10);
    scene.add(cityGlow);

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x202124,
      metalness: 0.04,
      roughness: 0.88,
    });
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f3033,
      roughness: 0.82,
      metalness: 0.05,
    });
    const curbMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8b2a6,
      roughness: 0.74,
      metalness: 0.02,
    });
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff4b8,
      transparent: true,
      opacity: 0.86,
    });

    const ground = createBox(43, 0.08, 32, groundMaterial);
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    scene.add(ground);

    [-9, -3, 3, 9].forEach((z) => {
      const road = createBox(39, 0.035, 2.4, roadMaterial);
      road.position.set(0, 0, z);
      road.receiveShadow = true;
      scene.add(road);

      for (let x = -17; x <= 17; x += 3.4) {
        const dash = createBox(1.35, 0.04, 0.045, lineMaterial);
        dash.position.set(x, 0.035, z);
        scene.add(dash);
      }
    });

    [-12, 0, 12].forEach((x) => {
      const road = createBox(2.5, 0.04, 29, roadMaterial);
      road.position.set(x, 0.01, 0);
      road.receiveShadow = true;
      scene.add(road);

      for (let z = -12; z <= 12; z += 3.2) {
        const dash = createBox(0.05, 0.045, 1.2, lineMaterial);
        dash.position.set(x, 0.045, z);
        scene.add(dash);
      }
    });

    [-20.6, 20.6].forEach((x) => {
      const curb = createBox(0.36, 0.2, 31, curbMaterial);
      curb.position.set(x, 0.04, 0);
      scene.add(curb);
    });

    [-15.4, 15.4].forEach((z) => {
      const curb = createBox(42, 0.2, 0.36, curbMaterial);
      curb.position.set(0, 0.04, z);
      scene.add(curb);
    });

    const buildingMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.68 }),
      new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.72 }),
      new THREE.MeshStandardMaterial({ color: 0x355070, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.64 }),
    ];
    const windowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe8a3,
      transparent: true,
      opacity: 0.78,
    });

    const buildingSlots = [
      [-17, -13],
      [-7.5, -13],
      [6.5, -13],
      [17, -13],
      [-17, 13],
      [-7.5, 13],
      [6.5, 13],
      [17, 13],
      [-20, -5.9],
      [20, -5.7],
      [-20, 5.8],
      [20, 5.8],
    ] as const;

    buildingSlots.forEach(([x, z], index) => {
      const height = 1.9 + (index % 4) * 0.72 + Math.random() * 0.45;
      const building = createBox(
        index % 2 === 0 ? 3.4 : 2.6,
        height,
        index % 3 === 0 ? 2.8 : 3.5,
        buildingMaterials[index % buildingMaterials.length]
      );
      building.position.set(x, height / 2 - 0.02, z);
      building.receiveShadow = true;
      building.castShadow = true;
      scene.add(building);

      const faceZ = z > 0 ? z - 1.78 : z + 1.78;
      for (let row = 0; row < 3; row += 1) {
        for (let col = -1; col <= 1; col += 1) {
          const windowLight = createBox(0.34, 0.18, 0.025, windowMaterial);
          windowLight.position.set(x + col * 0.7, 0.72 + row * 0.54, faceZ);
          scene.add(windowLight);
        }
      }
    });

    const lampMaterial = new THREE.MeshStandardMaterial({
      color: 0x52525b,
      metalness: 0.38,
      roughness: 0.42,
    });
    const lampLightMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff2bd,
    });

    [
      [-16, -6],
      [-6, -6],
      [6, -6],
      [16, -6],
      [-16, 6],
      [-6, 6],
      [6, 6],
      [16, 6],
    ].forEach(([x, z]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35, 10), lampMaterial);
      pole.position.set(x, 0.68, z);
      scene.add(pole);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), lampLightMaterial);
      bulb.position.set(x, 1.42, z);
      scene.add(bulb);

      const light = new THREE.PointLight(0xffe8a3, 0.85, 5);
      light.position.set(x, 1.48, z);
      scene.add(light);
    });

    const bus = createBusModel();
    bus.position.set(0, 0, 4.8);
    busRef.current = bus;
    scene.add(bus);

    const stopMarkers = PASSENGER_STOPS.map((stop) => {
      const marker = createPassengerMarker(stop);
      scene.add(marker.root);
      return marker;
    });
    stopMarkersRef.current = stopMarkers;

    const dropGate = createDropGate();
    dropGateRef.current = dropGate;
    scene.add(dropGate);

    const trafficSpecs: TrafficActor[] = [
      {
        root: createTrafficVehicle(0xfacc15),
        axis: "x",
        direction: 1,
        lane: -3,
        speed: 3.4,
        wrapMin: -20,
        wrapMax: 20,
      },
      {
        root: createTrafficVehicle(0xef4444),
        axis: "x",
        direction: -1,
        lane: 3,
        speed: 3.0,
        wrapMin: -20,
        wrapMax: 20,
      },
      {
        root: createTrafficVehicle(0x22c55e),
        axis: "x",
        direction: 1,
        lane: 9,
        speed: 2.85,
        wrapMin: -20,
        wrapMax: 20,
      },
      {
        root: createTrafficVehicle(0x60a5fa),
        axis: "z",
        direction: -1,
        lane: 12,
        speed: 3.15,
        wrapMin: -15,
        wrapMax: 15,
      },
      {
        root: createTrafficVehicle(0xf472b6),
        axis: "z",
        direction: 1,
        lane: -12,
        speed: 2.95,
        wrapMin: -15,
        wrapMax: 15,
      },
    ];

    trafficSpecs.forEach((actor, index) => {
      if (actor.axis === "x") {
        actor.root.position.set(index % 2 === 0 ? -16 : 16, 0, actor.lane);
        actor.root.rotation.y = actor.direction === 1 ? -Math.PI / 2 : Math.PI / 2;
      } else {
        actor.root.position.set(actor.lane, 0, actor.direction === 1 ? -11.5 : 11.5);
        actor.root.rotation.y = actor.direction === 1 ? 0 : Math.PI;
      }

      scene.add(actor.root);
    });
    trafficRef.current = trafficSpecs;

    const energyCells: EnergyCell[] = Array.from({ length: 7 }, (_, index) => {
      const cell = createEnergyCell();
      cell.position.copy(randomRoadPosition());
      scene.add(cell);

      return {
        root: cell,
        pulse: index * 0.9,
      };
    });
    energyCellsRef.current = energyCells;

    if (gameStatusRef.current === "waiting") {
      setStatus("ready");
      activeStopIndexRef.current = pickDifferentIndex(PASSENGER_STOPS.length, -1);
      activeDropIndexRef.current = pickDifferentIndex(DROP_ZONES.length, -1);
      updateMissionText();
      setMessage("Controller paired. Start the shift.");
    }

    let frameId = 0;
    let lastUiUpdate = 0;
    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const targetVelocity = new THREE.Vector3();
    const cameraGoal = new THREE.Vector3();
    const lookGoal = new THREE.Vector3();

    const applyDamage = (reason: string) => {
      const now = Date.now();

      if (now < damageCooldownRef.current || gameStatusRef.current !== "playing") {
        return;
      }

      livesRef.current = Math.max(0, livesRef.current - 1);
      comboRef.current = 1;
      damageCooldownRef.current = now + 1200;
      screenShakeRef.current = 0.46;
      speedRef.current *= -0.36;
      velocityRef.current.multiplyScalar(-0.25);
      setLives(livesRef.current);
      setCombo(1);
      setHitFlash(true);
      window.setTimeout(() => setHitFlash(false), 190);

      effectsRef.current.push(createSpark(scene, bus.position.clone().add(new THREE.Vector3(0, 0.55, 0)), 0xff7043));

      if (livesRef.current <= 0) {
        setStatus("finished");
        setMessage(`Shift failed: ${reason}. Final fare: ${scoreRef.current}`);
      } else {
        setMessage(`${reason}. ${livesRef.current} bus shields left.`);
      }
    };

    const completePickup = () => {
      carryingPassengerRef.current = true;
      activeDropIndexRef.current = pickDifferentIndex(
        DROP_ZONES.length,
        activeDropIndexRef.current
      );
      comboRef.current = Math.min(8, comboRef.current + 1);
      scoreRef.current += 10 + comboRef.current * 2;
      setCombo(comboRef.current);
      setScore(scoreRef.current);
      updateMissionText();
      setMessage("Passengers on board. Head to the terminal.");
      effectsRef.current.push(createSpark(scene, bus.position.clone().add(new THREE.Vector3(0, 0.75, 0)), 0x22c55e));
    };

    const completeDrop = () => {
      carryingPassengerRef.current = false;
      deliveriesRef.current += 1;

      const fare = 35 + comboRef.current * 12 + levelRef.current * 3;
      scoreRef.current += fare;
      timeLeftRef.current = Math.min(150, timeLeftRef.current + 8);

      if (deliveriesRef.current % 3 === 0) {
        levelRef.current = Math.min(8, levelRef.current + 1);
        setLevel(levelRef.current);
        setMessage(`Clean drop. City speed level ${levelRef.current}.`);
      } else {
        setMessage(`Drop complete. +${fare} fare.`);
      }

      activeStopIndexRef.current = pickDifferentIndex(
        PASSENGER_STOPS.length,
        activeStopIndexRef.current
      );
      setDeliveries(deliveriesRef.current);
      setScore(scoreRef.current);
      setTimeLeft(Math.ceil(timeLeftRef.current));
      updateMissionText();
      effectsRef.current.push(createSpark(scene, bus.position.clone().add(new THREE.Vector3(0, 0.75, 0)), 0xfacc15));
    };

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.042);
      const now = Date.now();
      const status = gameStatusRef.current;

      if (status === "playing") {
        timeLeftRef.current = Math.max(0, timeLeftRef.current - delta);

        if (timeLeftRef.current <= 0) {
          setStatus("finished");
          setMessage(`Shift complete. Final fare: ${scoreRef.current}`);
        }
      }

      const levelBoost = 1 + (levelRef.current - 1) * 0.08;

      trafficRef.current.forEach((actor) => {
        const trafficSpeed = actor.speed * levelBoost * (status === "playing" ? 1 : 0.35);

        if (actor.axis === "x") {
          actor.root.position.x += actor.direction * trafficSpeed * delta;

          if (actor.root.position.x > actor.wrapMax) actor.root.position.x = actor.wrapMin;
          if (actor.root.position.x < actor.wrapMin) actor.root.position.x = actor.wrapMax;
        } else {
          actor.root.position.z += actor.direction * trafficSpeed * delta;

          if (actor.root.position.z > actor.wrapMax) actor.root.position.z = actor.wrapMin;
          if (actor.root.position.z < actor.wrapMin) actor.root.position.z = actor.wrapMax;
        }

        if (status === "playing" && actor.root.position.distanceTo(bus.position) < 1.18) {
          applyDamage("Traffic hit");
        }
      });

      if (status === "playing") {
        const joystick = joystickRef.current;
        const deadZone = joystick.magnitude < 0.08;
        const steer = deadZone ? 0 : THREE.MathUtils.clamp(joystick.x, -1, 1);
        const throttleRaw = deadZone ? 0 : THREE.MathUtils.clamp(-joystick.y, -0.52, 1);
        const isTurbo = now < turboUntilRef.current && turboRef.current > 0;
        const isDrifting = driftActiveRef.current && Math.abs(speedRef.current) > 1.1;

        if (isTurbo && throttleRaw > 0.05) {
          turboRef.current = Math.max(0, turboRef.current - delta * 26);
        } else {
          turboRef.current = Math.min(100, turboRef.current + delta * (isDrifting ? 4 : 7.5));
        }

        if (turboRef.current <= 0) {
          turboUntilRef.current = 0;
        }

        const maxForwardSpeed = (isTurbo ? 9.8 : 6.4) + levelRef.current * 0.24;
        const maxReverseSpeed = 2.65;
        const targetSpeed =
          throttleRaw >= 0 ? throttleRaw * maxForwardSpeed : throttleRaw * maxReverseSpeed;
        const acceleration = throttleRaw >= 0 ? 4.8 : 3.3;

        speedRef.current +=
          (targetSpeed - speedRef.current) *
          (1 - Math.exp(-acceleration * delta));

        if (Math.abs(throttleRaw) < 0.04) {
          speedRef.current *= Math.exp(-2.2 * delta);
        }

        const movementPower = THREE.MathUtils.clamp(Math.abs(speedRef.current) / 5.8, 0.12, 1);
        const turnRate = (isDrifting ? 2.08 : 1.36) * movementPower;
        headingRef.current += steer * turnRate * delta * (speedRef.current >= 0 ? 1 : -1);
        bus.rotation.y = headingRef.current;

        forward.set(Math.sin(headingRef.current), 0, -Math.cos(headingRef.current)).normalize();
        targetVelocity.copy(forward).multiplyScalar(speedRef.current);
        velocityRef.current.lerp(targetVelocity, 1 - Math.exp((isDrifting ? -3.4 : -8.5) * delta));

        bus.position.addScaledVector(velocityRef.current, delta);

        if (isDrifting && Math.abs(steer) > 0.18) {
          const sparkBase = bus.position.clone().addScaledVector(forward, 0.62);

          if (Math.random() < 0.32) {
            effectsRef.current.push(createSpark(scene, sparkBase, 0xffd166));
          }
        }

        const bouncedX =
          bus.position.x < -CITY_LIMIT_X || bus.position.x > CITY_LIMIT_X;
        const bouncedZ =
          bus.position.z < -CITY_LIMIT_Z || bus.position.z > CITY_LIMIT_Z;

        bus.position.x = THREE.MathUtils.clamp(bus.position.x, -CITY_LIMIT_X, CITY_LIMIT_X);
        bus.position.z = THREE.MathUtils.clamp(bus.position.z, -CITY_LIMIT_Z, CITY_LIMIT_Z);

        if (bouncedX || bouncedZ) {
          applyDamage("Curb impact");
        }

        const activeStop = PASSENGER_STOPS[activeStopIndexRef.current];
        const activeDrop = DROP_ZONES[activeDropIndexRef.current];

        if (
          !carryingPassengerRef.current &&
          bus.position.distanceTo(activeStop.position) < 1.32
        ) {
          completePickup();
        }

        if (
          carryingPassengerRef.current &&
          bus.position.distanceTo(activeDrop.position) < 1.65
        ) {
          completeDrop();
        }

        energyCellsRef.current.forEach((cell) => {
          if (!cell.root.visible) return;

          if (cell.root.position.distanceTo(bus.position) < 1.02) {
            cell.root.visible = false;
            scoreRef.current += 8;
            turboRef.current = Math.min(100, turboRef.current + 28);
            timeLeftRef.current = Math.min(150, timeLeftRef.current + 2);
            setScore(scoreRef.current);
            setMessage("Energy cell collected.");
            effectsRef.current.push(createSpark(scene, cell.root.position.clone(), 0x2dd4bf));

            window.setTimeout(() => {
              cell.root.position.copy(randomRoadPosition());
              cell.root.visible = true;
            }, 3400);
          }
        });
      } else {
        speedRef.current *= Math.exp(-3.2 * delta);
        velocityRef.current.multiplyScalar(Math.exp(-3.2 * delta));
      }

      stopMarkersRef.current.forEach((marker, index) => {
        const isActive = !carryingPassengerRef.current && index === activeStopIndexRef.current;
        const pulse = 1 + Math.sin(now * 0.006 + index) * 0.07;

        marker.root.visible = !carryingPassengerRef.current || isActive;
        marker.ring.rotation.z += delta * (isActive ? 2.9 : 0.9);
        marker.people.rotation.y += delta * 0.8;
        marker.root.scale.lerp(
          new THREE.Vector3(isActive ? pulse : 0.82, isActive ? pulse : 0.82, isActive ? pulse : 0.82),
          1 - Math.exp(-7 * delta)
        );

        if (marker.ring.material instanceof THREE.MeshBasicMaterial) {
          marker.ring.material.opacity = isActive ? 0.94 : 0.34;
        }

        if (marker.glow.material instanceof THREE.MeshBasicMaterial) {
          marker.glow.material.opacity = isActive ? 0.22 : 0.07;
        }
      });

      const dropGate = dropGateRef.current;

      if (dropGate) {
        const activeDrop = DROP_ZONES[activeDropIndexRef.current];
        dropGate.visible = carryingPassengerRef.current;
        dropGate.position.copy(activeDrop.position);
        dropGate.rotation.y += delta * 1.6;
        dropGate.scale.setScalar(1 + Math.sin(now * 0.006) * 0.04);
      }

      energyCellsRef.current.forEach((cell) => {
        cell.root.rotation.y += delta * 2.1;
        cell.root.position.y = Math.sin(now * 0.003 + cell.pulse) * 0.08;
      });

      effectsRef.current = effectsRef.current.filter((effect) => {
        effect.life -= delta;
        effect.mesh.position.addScaledVector(effect.velocity, delta);
        effect.velocity.y -= 3.8 * delta;

        const alpha = Math.max(0, effect.life / effect.maxLife);
        effect.mesh.scale.setScalar(1 + (1 - alpha) * 2.2);

        if (effect.mesh.material instanceof THREE.MeshBasicMaterial) {
          effect.mesh.material.opacity = alpha;
        }

        if (effect.life <= 0) {
          scene.remove(effect.mesh);
          effect.mesh.geometry.dispose();

          if (effect.mesh.material instanceof THREE.Material) {
            effect.mesh.material.dispose();
          }

          return false;
        }

        return true;
      });

      const speedTilt = THREE.MathUtils.clamp(speedRef.current / 9, -0.4, 1);
      bus.rotation.z = THREE.MathUtils.lerp(bus.rotation.z, -joystickRef.current.x * 0.06 * speedTilt, 1 - Math.exp(-8 * delta));
      bus.rotation.x = THREE.MathUtils.lerp(bus.rotation.x, -Math.abs(speedTilt) * 0.025, 1 - Math.exp(-7 * delta));

      const cameraDistance = 10.8 + Math.min(2.4, Math.abs(speedRef.current) * 0.18);
      cameraGoal
        .copy(bus.position)
        .add(new THREE.Vector3(-Math.sin(headingRef.current) * cameraDistance, 6.4, Math.cos(headingRef.current) * cameraDistance));

      if (screenShakeRef.current > 0) {
        cameraGoal.x += THREE.MathUtils.randFloatSpread(screenShakeRef.current);
        cameraGoal.y += THREE.MathUtils.randFloatSpread(screenShakeRef.current * 0.5);
        screenShakeRef.current = Math.max(0, screenShakeRef.current - delta * 1.7);
      }

      lookGoal.copy(bus.position).add(new THREE.Vector3(0, 0.78, 0));
      camera.position.lerp(cameraGoal, 1 - Math.exp(-4.8 * delta));
      cameraTargetRef.current.lerp(lookGoal, 1 - Math.exp(-8.2 * delta));
      camera.lookAt(cameraTargetRef.current);

      if (now - lastUiUpdate > 140) {
        lastUiUpdate = now;
        setTimeLeft(Math.ceil(timeLeftRef.current));
        setTurbo(Math.round(turboRef.current));
        setSpeed(Math.round(Math.abs(speedRef.current) * 13));
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    const resize = () => {
      const nextWidth = Math.max(host.clientWidth, 1);
      const nextHeight = Math.max(host.clientHeight, 1);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };

    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      disposeObjectTree(scene);
      renderer.dispose();
      host.innerHTML = "";

      busRef.current = null;
      stopMarkersRef.current = [];
      dropGateRef.current = null;
      trafficRef.current = [];
      energyCellsRef.current = [];
      effectsRef.current = [];
    };
  }, [controllerConnected, setStatus, updateMissionText]);

  async function copyControllerLink() {
    await navigator.clipboard.writeText(controllerUrl);
    setMessage("Controller link copied.");
  }

  const statusLabel =
    gameStatus === "ready"
      ? "Ready"
      : gameStatus === "paused"
        ? "Paused"
        : gameStatus === "finished"
          ? "Complete"
          : gameStatus === "waiting"
            ? "Waiting"
            : "Live";

  return (
    <main className={hitFlash ? "mini-game-page hit-flash" : "mini-game-page"}>
      {!controllerConnected ? (
        <section className="mini-game-connect-panel">
          <div className="mini-game-icon">
            <QrCode size={34} />
          </div>

          <h1>Pop Bus Rush</h1>

          <p>Pair a mobile controller and turn this screen into the route.</p>

          {qrDataUrl ? (
            <img className="mini-game-qr" src={qrDataUrl} alt="Pop Bus Rush controller QR" />
          ) : (
            <div className="mini-game-qr-placeholder">QR loading</div>
          )}

          <strong className="mini-game-room">{roomId}</strong>

          <button
            type="button"
            className="mini-game-copy"
            onClick={() => void copyControllerLink()}
          >
            <Copy size={18} />
            Copy Link
          </button>

          <small>{socketStatus}</small>
        </section>
      ) : (
        <>
          <div ref={canvasRef} className="mini-game-canvas" />

          <section className="bus-game-hud">
            <div className="hud-panel">
              <small>Fare</small>
              <strong>{score}</strong>
            </div>

            <div className="hud-panel">
              <small>Time</small>
              <strong>{timeLeft}s</strong>
            </div>

            <div className="hud-panel">
              <small>Speed</small>
              <strong>{speed}</strong>
            </div>

            <div className="hud-panel">
              <small>Turbo</small>
              <strong>{turbo}%</strong>
            </div>

            <div className="hud-panel">
              <small>Drops</small>
              <strong>{deliveries}</strong>
            </div>

            <div className="hud-panel">
              <small>Combo</small>
              <strong>x{combo}</strong>
            </div>

            <div className="hud-panel lives">
              <small>Shield</small>
              <strong>
                {Array.from({ length: MAX_LIVES }).map((_, index) => (
                  <Heart
                    key={index}
                    size={17}
                    fill={index < lives ? "currentColor" : "none"}
                  />
                ))}
              </strong>
            </div>
          </section>

          <section className="bus-game-status-chip">
            {gameStatus === "paused" ? <Pause size={18} /> : <Shield size={18} />}
            {statusLabel} / L{level}
          </section>

          <section className="bus-game-route-card">
            <small>Mission</small>
            <strong>{mission}</strong>
          </section>

          {gameStatus !== "playing" && (
            <section className="mini-game-overlay-card">
              <div className="mini-game-overlay-icon">
                {gameStatus === "paused" ? <Pause size={34} /> : <Trophy size={34} />}
              </div>

              <h2>
                {gameStatus === "ready"
                  ? "Ready to Depart"
                  : gameStatus === "paused"
                    ? "Route Paused"
                    : "Shift Report"}
              </h2>

              <p>
                {gameStatus === "ready"
                  ? "Start from the mobile controller."
                  : gameStatus === "paused"
                    ? "Resume from the controller."
                    : `Fare ${score} / Drops ${deliveries}`}
              </p>
            </section>
          )}

          <section className="mini-game-message">
            <Zap size={18} />
            {message}
          </section>
        </>
      )}
    </main>
  );
}
