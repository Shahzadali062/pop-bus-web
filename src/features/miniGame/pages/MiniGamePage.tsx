import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Gauge, Pause, QrCode, Shield, Trophy, Zap } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import * as THREE from "three";

import { SERVER_URL } from "../../../shared/config/server";
import "./MiniGamePage.css";

type GameControl =
  | "boost"
  | "brake-down"
  | "brake-up"
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

type TrackSample = {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  yaw: number;
  distance: number;
};

type TrackData = {
  samples: TrackSample[];
  length: number;
};

type Checkpoint = {
  sampleIndex: number;
  label: string;
};

type OpponentBike = {
  root: THREE.Group;
  progress: number;
  speed: number;
  laneOffset: number;
};

type TrackObstacle = {
  root: THREE.Group;
  radius: number;
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

const TRACK_WIDTH = 6.4;
const TRACK_SAMPLE_COUNT = 760;
const TOTAL_LAPS = 3;
const MAX_ARMOR = 3;
const MAX_NITRO = 100;
const START_SAMPLE_INDEX = 12;

const TRACK_POINTS = [
  new THREE.Vector3(0, 0, 20),
  new THREE.Vector3(13, 0, 18),
  new THREE.Vector3(23, 0, 8),
  new THREE.Vector3(21, 0, -6),
  new THREE.Vector3(10, 0, -19),
  new THREE.Vector3(-5, 0, -22),
  new THREE.Vector3(-20, 0, -15),
  new THREE.Vector3(-25, 0, 0),
  new THREE.Vector3(-17, 0, 15),
  new THREE.Vector3(-4, 0, 23),
];

const CHECKPOINTS: Checkpoint[] = [
  { sampleIndex: 0, label: "Start line" },
  { sampleIndex: 100, label: "Hill bend" },
  { sampleIndex: 210, label: "Tunnel exit" },
  { sampleIndex: 320, label: "Back straight" },
  { sampleIndex: 430, label: "Hairpin" },
  { sampleIndex: 560, label: "Grandstand" },
  { sampleIndex: 670, label: "Final chicane" },
];

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function angleDelta(target: number, current: number) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function buildTrackData(): TrackData {
  const curve = new THREE.CatmullRomCurve3(TRACK_POINTS, true, "centripetal", 0.45);
  const samples: TrackSample[] = [];
  let distance = 0;
  let previous = curve.getPointAt(0);

  for (let index = 0; index < TRACK_SAMPLE_COUNT; index += 1) {
    const t = index / TRACK_SAMPLE_COUNT;
    const position = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).setY(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const yaw = Math.atan2(tangent.x, -tangent.z);

    if (index > 0) {
      distance += previous.distanceTo(position);
    }

    samples.push({
      position,
      tangent,
      normal,
      yaw,
      distance,
    });

    previous = position;
  }

  distance += previous.distanceTo(samples[0].position);

  return {
    samples,
    length: distance,
  };
}

const TRACK_DATA = buildTrackData();

function createBox(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material
) {
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
}

function setShadow(root: THREE.Object3D, cast = true, receive = true) {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    }
  });
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

function createTubeBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material
) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 12),
    material
  );

  tube.position.copy(start).addScaledVector(direction, 0.5);
  tube.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );

  return tube;
}

function createMotorcycleModel(primaryColor: number, riderColor: number) {
  const root = new THREE.Group();

  const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x070707,
    metalness: 0.12,
    roughness: 0.62,
  });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9dde4,
    metalness: 0.8,
    roughness: 0.22,
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x151515,
    metalness: 0.7,
    roughness: 0.26,
  });
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: primaryColor,
    metalness: 0.42,
    roughness: 0.24,
  });
  const riderSuitMaterial = new THREE.MeshStandardMaterial({
    color: riderColor,
    metalness: 0.08,
    roughness: 0.44,
  });
  const helmetMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    metalness: 0.35,
    roughness: 0.18,
  });
  const visorMaterial = new THREE.MeshStandardMaterial({
    color: 0x111827,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.18,
    metalness: 0.52,
    roughness: 0.18,
  });
  const lightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff7d6,
    emissive: 0xfff1a8,
    emissiveIntensity: 1.45,
    roughness: 0.25,
  });

  const wheelGeometry = new THREE.TorusGeometry(0.43, 0.105, 16, 34);
  const rimGeometry = new THREE.TorusGeometry(0.26, 0.035, 12, 28);

  [-1.06, 1.05].forEach((z) => {
    const tire = new THREE.Mesh(wheelGeometry, tireMaterial);
    tire.rotation.y = Math.PI / 2;
    tire.position.set(0, 0.47, z);
    root.add(tire);

    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.y = Math.PI / 2;
    rim.position.copy(tire.position);
    root.add(rim);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.36, 18),
      rimMaterial
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(tire.position);
    root.add(hub);
  });

  root.add(
    createTubeBetween(
      new THREE.Vector3(0, 0.58, -1.04),
      new THREE.Vector3(0, 0.9, -0.25),
      0.055,
      frameMaterial
    )
  );
  root.add(
    createTubeBetween(
      new THREE.Vector3(0, 0.58, 1.04),
      new THREE.Vector3(0, 0.82, 0.18),
      0.055,
      frameMaterial
    )
  );
  root.add(
    createTubeBetween(
      new THREE.Vector3(0, 0.82, 0.18),
      new THREE.Vector3(0, 0.9, -0.25),
      0.05,
      frameMaterial
    )
  );

  const fairing = createBox(0.62, 0.42, 0.88, bodyMaterial);
  fairing.position.set(0, 0.88, -0.42);
  fairing.rotation.x = -0.12;
  root.add(fairing);

  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 14), bodyMaterial);
  tank.scale.set(0.92, 0.48, 1.18);
  tank.position.set(0, 1.08, 0.28);
  root.add(tank);

  const tail = createBox(0.5, 0.2, 0.64, bodyMaterial);
  tail.position.set(0, 0.98, 0.96);
  tail.rotation.x = 0.22;
  root.add(tail);

  const seat = createBox(0.46, 0.12, 0.78, frameMaterial);
  seat.position.set(0, 1.15, 0.72);
  seat.rotation.x = 0.08;
  root.add(seat);

  const headlight = createBox(0.3, 0.16, 0.055, lightMaterial);
  headlight.position.set(0, 0.92, -1.16);
  root.add(headlight);

  const headLamp = new THREE.PointLight(0xfff1a8, 1.35, 5.5);
  headLamp.position.set(0, 0.92, -1.35);
  root.add(headLamp);

  const handlebar = createTubeBetween(
    new THREE.Vector3(-0.44, 1.18, -0.62),
    new THREE.Vector3(0.44, 1.18, -0.62),
    0.035,
    frameMaterial
  );
  root.add(handlebar);

  const rider = new THREE.Group();
  rider.position.set(0, 0.08, 0.18);
  rider.rotation.x = -0.18;
  root.add(rider);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.18, 0.44, 5, 12),
    riderSuitMaterial
  );
  torso.position.set(0, 1.48, 0.08);
  torso.rotation.x = Math.PI / 2.8;
  rider.add(torso);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 22, 16), helmetMaterial);
  helmet.position.set(0, 1.72, -0.32);
  rider.add(helmet);

  const visor = createBox(0.28, 0.075, 0.035, visorMaterial);
  visor.position.set(0, 1.72, -0.51);
  rider.add(visor);

  [-0.26, 0.26].forEach((x) => {
    rider.add(
      createTubeBetween(
        new THREE.Vector3(x * 0.55, 1.45, -0.08),
        new THREE.Vector3(x, 1.17, -0.62),
        0.045,
        riderSuitMaterial
      )
    );
    rider.add(
      createTubeBetween(
        new THREE.Vector3(x * 0.45, 1.15, 0.34),
        new THREE.Vector3(x * 0.78, 0.66, 0.82),
        0.055,
        riderSuitMaterial
      )
    );
  });

  const exhaust = createTubeBetween(
    new THREE.Vector3(0.34, 0.56, 0.18),
    new THREE.Vector3(0.46, 0.48, 1.12),
    0.06,
    rimMaterial
  );
  root.add(exhaust);

  setShadow(root, true, false);

  return root;
}

function createTrackMesh(trackData: TrackData, material: THREE.Material) {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  trackData.samples.forEach((sample, index) => {
    const left = sample.position.clone().addScaledVector(sample.normal, TRACK_WIDTH / 2);
    const right = sample.position.clone().addScaledVector(sample.normal, -TRACK_WIDTH / 2);

    vertices.push(left.x, 0.025, left.z, right.x, 0.025, right.z);
    uvs.push(index / 12, 0, index / 12, 1);
  });

  for (let index = 0; index < trackData.samples.length; index += 1) {
    const next = (index + 1) % trackData.samples.length;
    const a = index * 2;
    const b = a + 1;
    const c = next * 2;
    const d = c + 1;

    indices.push(a, b, c, b, d, c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;

  return mesh;
}

function createAsphaltTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.fillStyle = "#2a2b2d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 2600; index += 1) {
    const value = 32 + Math.floor(Math.random() * 42);
    ctx.fillStyle = `rgba(${value}, ${value}, ${value}, ${0.16 + Math.random() * 0.18})`;
    ctx.fillRect(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      1 + Math.random() * 2,
      1 + Math.random() * 2
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 2);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createGrassTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.fillStyle = "#273b21";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 1700; index += 1) {
    const green = 55 + Math.floor(Math.random() * 65);
    ctx.fillStyle = `rgba(${20 + Math.random() * 30}, ${green}, ${22}, 0.45)`;
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function getTrackPose(distance: number, laneOffset = 0) {
  const normalizedDistance =
    ((distance % TRACK_DATA.length) + TRACK_DATA.length) % TRACK_DATA.length;
  let index = 0;

  for (let sampleIndex = 1; sampleIndex < TRACK_DATA.samples.length; sampleIndex += 1) {
    if (TRACK_DATA.samples[sampleIndex].distance >= normalizedDistance) {
      index = sampleIndex;
      break;
    }
  }

  const sample = TRACK_DATA.samples[index];
  const position = sample.position.clone().addScaledVector(sample.normal, laneOffset);

  return {
    sample,
    position,
  };
}

function findNearestTrackSample(position: THREE.Vector3) {
  let nearest = TRACK_DATA.samples[0];
  let nearestIndex = 0;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (let index = 0; index < TRACK_DATA.samples.length; index += 2) {
    const sample = TRACK_DATA.samples[index];
    const dx = position.x - sample.position.x;
    const dz = position.z - sample.position.z;
    const distanceSq = dx * dx + dz * dz;

    if (distanceSq < nearestDistanceSq) {
      nearest = sample;
      nearestIndex = index;
      nearestDistanceSq = distanceSq;
    }
  }

  return {
    sample: nearest,
    index: nearestIndex,
    distance: Math.sqrt(nearestDistanceSq),
  };
}

function createCheckpointGate() {
  const root = new THREE.Group();
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
  const padMaterial = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
  });

  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.5, 54), padMaterial);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.04;
  root.add(pad);

  [-2.25, 2.25].forEach((x) => {
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 2.3, 14),
      glowMaterial
    );
    column.position.set(x, 1.16, 0);
    root.add(column);
  });

  const top = createBox(4.7, 0.1, 0.1, glowMaterial);
  top.position.y = 2.3;
  root.add(top);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.035, 10, 64), glowMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  root.add(ring);

  return root;
}

function createCone() {
  const root = new THREE.Group();
  const coneMaterial = new THREE.MeshStandardMaterial({
    color: 0xff6b2b,
    roughness: 0.48,
    metalness: 0.04,
  });
  const stripeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.4,
  });

  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.72, 18), coneMaterial);
  cone.position.y = 0.38;
  root.add(cone);

  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 18), stripeMaterial);
  stripe.position.y = 0.44;
  stripe.rotation.x = Math.PI / 2;
  root.add(stripe);

  setShadow(root, true, false);

  return root;
}

function createSpark(scene: THREE.Scene, position: THREE.Vector3, color: number) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), material);
  mesh.position.copy(position);
  scene.add(mesh);

  return {
    mesh,
    velocity: new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(2.4),
      THREE.MathUtils.randFloat(1.1, 2.4),
      THREE.MathUtils.randFloatSpread(2.4)
    ),
    life: 0.5,
    maxLife: 0.5,
  };
}

export default function MiniGamePage() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [roomId] = useState(createRoomId);

  const joystickRef = useRef<JoystickState>({ x: 0, y: 0, magnitude: 0 });
  const bikeRef = useRef<THREE.Group | null>(null);
  const headingRef = useRef(TRACK_DATA.samples[START_SAMPLE_INDEX].yaw);
  const speedRef = useRef(0);
  const brakeHeldRef = useRef(false);
  const boostUntilRef = useRef(0);
  const nitroRef = useRef(MAX_NITRO);
  const armorRef = useRef(MAX_ARMOR);
  const lapRef = useRef(1);
  const nextCheckpointRef = useRef(1);
  const raceTimeRef = useRef(0);
  const bestLapRef = useRef<number | null>(null);
  const lapStartedAtRef = useRef(0);
  const checkpointGateRef = useRef<THREE.Group | null>(null);
  const opponentsRef = useRef<OpponentBike[]>([]);
  const obstaclesRef = useRef<TrackObstacle[]>([]);
  const effectsRef = useRef<ParticleEffect[]>([]);
  const damageCooldownRef = useRef(0);
  const screenShakeRef = useRef(0);
  const cameraTargetRef = useRef(new THREE.Vector3());
  const gameStatusRef = useRef<GameStatus>("waiting");

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [controllerConnected, setControllerConnected] = useState(false);
  const [socketStatus, setSocketStatus] = useState("Connecting");
  const [gameStatus, setGameStatus] = useState<GameStatus>("waiting");
  const [lap, setLap] = useState(1);
  const [checkpoint, setCheckpoint] = useState(1);
  const [raceTime, setRaceTime] = useState(0);
  const [bestLap, setBestLap] = useState<number | null>(null);
  const [speed, setSpeed] = useState(0);
  const [nitro, setNitro] = useState(MAX_NITRO);
  const [armor, setArmor] = useState(MAX_ARMOR);
  const [message, setMessage] = useState("Scan QR with mobile to race.");
  const [hitFlash, setHitFlash] = useState(false);

  const controllerUrl = `${PUBLIC_WEB_URL}/game-controller/${roomId}`;

  const setStatus = useCallback((status: GameStatus) => {
    gameStatusRef.current = status;
    setGameStatus(status);
  }, []);

  const resetRace = useCallback(() => {
    const startSample = TRACK_DATA.samples[START_SAMPLE_INDEX];
    const bike = bikeRef.current;

    headingRef.current = startSample.yaw;
    speedRef.current = 0;
    brakeHeldRef.current = false;
    boostUntilRef.current = 0;
    nitroRef.current = MAX_NITRO;
    armorRef.current = MAX_ARMOR;
    lapRef.current = 1;
    nextCheckpointRef.current = 1;
    raceTimeRef.current = 0;
    lapStartedAtRef.current = 0;
    bestLapRef.current = null;
    damageCooldownRef.current = 0;
    screenShakeRef.current = 0;
    joystickRef.current = { x: 0, y: 0, magnitude: 0 };

    if (bike) {
      bike.position.copy(startSample.position);
      bike.position.y = 0.08;
      bike.rotation.set(0, startSample.yaw, 0);
    }

    opponentsRef.current.forEach((opponent, index) => {
      opponent.progress = 12 + index * 38;
      opponent.speed = 8.4 + index * 0.55;
    });

    setLap(1);
    setCheckpoint(1);
    setRaceTime(0);
    setBestLap(null);
    setSpeed(0);
    setNitro(MAX_NITRO);
    setArmor(MAX_ARMOR);
    setStatus("playing");
    setMessage("Race live. Smooth throttle, lean into corners.");
  }, [setStatus]);

  const handleControl = useCallback(
    (control: GameControl) => {
      if (control === "start" || control === "restart") {
        resetRace();
        return;
      }

      if (control === "pause" && gameStatusRef.current === "playing") {
        setStatus("paused");
        setMessage("Race paused.");
        return;
      }

      if (control === "resume" && gameStatusRef.current === "paused") {
        setStatus("playing");
        setMessage("Back on track.");
        return;
      }

      if (
        control === "brake-down" ||
        control === "drift-down" ||
        control === "jump"
      ) {
        brakeHeldRef.current = true;
        return;
      }

      if (control === "brake-up" || control === "drift-up") {
        brakeHeldRef.current = false;
        return;
      }

      if (gameStatusRef.current !== "playing") return;

      if (control === "boost") {
        if (nitroRef.current < 18) {
          setMessage("Nitro is recharging.");
          return;
        }

        boostUntilRef.current = Date.now() + 1650;
        setMessage("Nitro engaged.");
      }
    },
    [resetRace, setStatus]
  );

  useEffect(() => {
    QRCode.toDataURL(controllerUrl, {
      width: 340,
      margin: 2,
      color: {
        dark: "#161616",
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
        setMessage("Controller paired. Loading racing circuit...");
      }
    });

    socket.on("game:peer-left", (payload: { role?: string }) => {
      if (payload?.role === "controller") {
        joystickRef.current = { x: 0, y: 0, magnitude: 0 };
        brakeHeldRef.current = false;
        setControllerConnected(false);
        setStatus("waiting");
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
    scene.background = new THREE.Color(0x151716);
    scene.fog = new THREE.Fog(0x151716, 36, 72);

    const camera = new THREE.PerspectiveCamera(
      58,
      Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1),
      0.1,
      110
    );
    camera.position.set(0, 6.1, 12.5);
    cameraTargetRef.current.copy(TRACK_DATA.samples[START_SAMPLE_INDEX].position);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setSize(Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xffffff, 0x2f3b28, 1.65);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff7df, 3.4);
    sun.position.set(-16, 22, 11);
    sun.castShadow = true;
    sun.shadow.camera.left = -36;
    sun.shadow.camera.right = 36;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 80;
    scene.add(sun);

    const trackLight = new THREE.DirectionalLight(0x93c5fd, 1.2);
    trackLight.position.set(14, 8, -16);
    scene.add(trackLight);

    const asphaltTexture = createAsphaltTexture();
    const grassTexture = createGrassTexture();
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f4428,
      map: grassTexture,
      roughness: 0.9,
      metalness: 0.02,
    });
    const asphaltMaterial = new THREE.MeshStandardMaterial({
      color: 0x343538,
      map: asphaltTexture,
      roughness: 0.78,
      metalness: 0.05,
    });

    const ground = createBox(82, 0.08, 82, groundMaterial);
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    scene.add(ground);

    const road = createTrackMesh(TRACK_DATA, asphaltMaterial);
    scene.add(road);

    const stripeMaterial = new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
      transparent: true,
      opacity: 0.85,
    });
    const curbRed = new THREE.MeshStandardMaterial({
      color: 0xd73a31,
      roughness: 0.45,
    });
    const curbWhite = new THREE.MeshStandardMaterial({
      color: 0xf4f4f0,
      roughness: 0.38,
    });
    const barrierMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8c0cc,
      metalness: 0.28,
      roughness: 0.42,
    });

    for (let index = 0; index < TRACK_DATA.samples.length; index += 18) {
      const sample = TRACK_DATA.samples[index];

      if (index % 36 === 0) {
        const dash = createBox(0.1, 0.035, 1.32, stripeMaterial);
        dash.position.copy(sample.position);
        dash.position.y = 0.07;
        dash.rotation.y = sample.yaw;
        scene.add(dash);
      }

      [-1, 1].forEach((side) => {
        const curb = createBox(
          0.44,
          0.08,
          1.25,
          (index / 18) % 2 === 0 ? curbRed : curbWhite
        );
        curb.position.copy(sample.position).addScaledVector(
          sample.normal,
          side * (TRACK_WIDTH / 2 + 0.28)
        );
        curb.position.y = 0.08;
        curb.rotation.y = sample.yaw;
        scene.add(curb);

        if (index % 54 === 0) {
          const rail = createBox(0.14, 0.46, 1.8, barrierMaterial);
          rail.position.copy(sample.position).addScaledVector(
            sample.normal,
            side * (TRACK_WIDTH / 2 + 1.1)
          );
          rail.position.y = 0.32;
          rail.rotation.y = sample.yaw;
          scene.add(rail);
        }
      });
    }

    const bannerMaterial = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.42,
      metalness: 0.08,
    });
    const standMaterial = new THREE.MeshStandardMaterial({
      color: 0x4b5563,
      roughness: 0.62,
    });

    [
      { d: 22, side: 1 },
      { d: 58, side: -1 },
      { d: 105, side: 1 },
      { d: 142, side: -1 },
    ].forEach((item, index) => {
      const pose = getTrackPose(item.d, item.side * (TRACK_WIDTH / 2 + 5.1));
      const stand = createBox(5.4, 1.4, 2.2, standMaterial);
      stand.position.copy(pose.position);
      stand.position.y = 0.64;
      stand.rotation.y = pose.sample.yaw;
      scene.add(stand);

      const banner = createBox(4.8, 0.64, 0.08, bannerMaterial);
      banner.position.copy(pose.position).addScaledVector(pose.sample.tangent, 0.1);
      banner.position.y = 1.74;
      banner.rotation.y = pose.sample.yaw;
      scene.add(banner);

      const light = new THREE.PointLight(index % 2 === 0 ? 0xfacc15 : 0x60a5fa, 0.9, 8);
      light.position.copy(pose.position);
      light.position.y = 2.35;
      scene.add(light);
    });

    const playerBike = createMotorcycleModel(0xe11d48, 0x111827);
    const startSample = TRACK_DATA.samples[START_SAMPLE_INDEX];
    playerBike.position.copy(startSample.position);
    playerBike.position.y = 0.08;
    playerBike.rotation.y = startSample.yaw;
    bikeRef.current = playerBike;
    scene.add(playerBike);

    const checkpointGate = createCheckpointGate();
    checkpointGateRef.current = checkpointGate;
    scene.add(checkpointGate);

    const opponents: OpponentBike[] = [
      {
        root: createMotorcycleModel(0x2563eb, 0xf8fafc),
        progress: 16,
        speed: 8.2,
        laneOffset: -1.15,
      },
      {
        root: createMotorcycleModel(0x22c55e, 0x1f2937),
        progress: 46,
        speed: 8.8,
        laneOffset: 1.1,
      },
      {
        root: createMotorcycleModel(0xf59e0b, 0x111827),
        progress: 76,
        speed: 8.55,
        laneOffset: -0.2,
      },
    ];

    opponents.forEach((opponent) => scene.add(opponent.root));
    opponentsRef.current = opponents;

    const obstacles: TrackObstacle[] = [];
    [72, 118, 164, 214, 268, 322, 380, 438, 492, 548, 612, 690].forEach(
      (sampleIndex, index) => {
        const sample = TRACK_DATA.samples[sampleIndex % TRACK_DATA.samples.length];
        const cone = createCone();
        const side = index % 2 === 0 ? 1 : -1;
        cone.position.copy(sample.position).addScaledVector(
          sample.normal,
          side * (TRACK_WIDTH / 2 - 0.8)
        );
        cone.rotation.y = sample.yaw + side * 0.18;
        scene.add(cone);
        obstacles.push({
          root: cone,
          radius: 0.72,
        });
      }
    );
    obstaclesRef.current = obstacles;

    if (gameStatusRef.current === "waiting") {
      setStatus("ready");
      setMessage("Press Start on mobile. Up joystick accelerates, left/right leans.");
    }

    let frameId = 0;
    let lastUiUpdate = 0;
    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const cameraGoal = new THREE.Vector3();
    const lookGoal = new THREE.Vector3();

    const placeGate = () => {
      const gate = checkpointGateRef.current;
      if (!gate) return;

      const checkpointTarget = CHECKPOINTS[nextCheckpointRef.current];
      const sample = TRACK_DATA.samples[checkpointTarget.sampleIndex];
      gate.position.copy(sample.position);
      gate.position.y = 0.02;
      gate.rotation.y = sample.yaw;
    };

    const applyDamage = (reason: string) => {
      const now = Date.now();

      if (now < damageCooldownRef.current || gameStatusRef.current !== "playing") {
        return;
      }

      armorRef.current = Math.max(0, armorRef.current - 1);
      damageCooldownRef.current = now + 1200;
      speedRef.current *= 0.38;
      screenShakeRef.current = 0.42;
      setArmor(armorRef.current);
      setHitFlash(true);
      window.setTimeout(() => setHitFlash(false), 180);

      if (bikeRef.current) {
        effectsRef.current.push(
          createSpark(scene, bikeRef.current.position.clone().add(new THREE.Vector3(0, 0.55, 0)), 0xff5a3c)
        );
      }

      if (armorRef.current <= 0) {
        setStatus("finished");
        setMessage(`${reason}. Bike retired on lap ${lapRef.current}.`);
      } else {
        setMessage(`${reason}. ${armorRef.current} armor left.`);
      }
    };

    const passCheckpoint = () => {
      const currentIndex = nextCheckpointRef.current;

      if (currentIndex === 0) {
        const completedLap = lapRef.current;
        const completedLapTime = raceTimeRef.current - lapStartedAtRef.current;
        bestLapRef.current =
          bestLapRef.current === null
            ? completedLapTime
            : Math.min(bestLapRef.current, completedLapTime);

        if (completedLap >= TOTAL_LAPS) {
          setBestLap(bestLapRef.current);
          setStatus("finished");
          setMessage(`Finish! Total ${raceTimeRef.current.toFixed(1)}s.`);
          return;
        }

        lapRef.current += 1;
        lapStartedAtRef.current = raceTimeRef.current;
        nextCheckpointRef.current = 1;
        setLap(lapRef.current);
        setCheckpoint(1);
        setBestLap(bestLapRef.current);
        setMessage(`Lap ${lapRef.current}/${TOTAL_LAPS}. Keep the line tight.`);
        return;
      }

      nextCheckpointRef.current = (currentIndex + 1) % CHECKPOINTS.length;
      setCheckpoint(nextCheckpointRef.current);
      setMessage(`Checkpoint: ${CHECKPOINTS[currentIndex].label}.`);
    };

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.04);
      const now = Date.now();
      const status = gameStatusRef.current;
      const bike = bikeRef.current;

      opponentsRef.current.forEach((opponent, index) => {
        opponent.progress += opponent.speed * delta;
        const laneWave = Math.sin(now * 0.0012 + index) * 0.35;
        const pose = getTrackPose(opponent.progress, opponent.laneOffset + laneWave);
        opponent.root.position.copy(pose.position);
        opponent.root.position.y = 0.08;
        opponent.root.rotation.y = pose.sample.yaw;
        opponent.root.rotation.z = Math.sin(now * 0.003 + index) * 0.08;

        if (
          status === "playing" &&
          bike &&
          opponent.root.position.distanceTo(bike.position) < 1.28
        ) {
          applyDamage("Rival contact");
        }
      });

      placeGate();

      if (status === "playing" && bike) {
        raceTimeRef.current += delta;
        const joystick = joystickRef.current;
        const rawX = THREE.MathUtils.clamp(joystick.x, -1, 1);
        const rawY = THREE.MathUtils.clamp(joystick.y, -1, 1);
        const deadZone = joystick.magnitude < 0.07;
        const steer = deadZone ? 0 : rawX;
        const throttle = deadZone ? 0 : THREE.MathUtils.clamp(-rawY, 0, 1);
        const joystickBrake = deadZone ? 0 : THREE.MathUtils.clamp(rawY, 0, 1);
        const braking = brakeHeldRef.current || joystickBrake > 0.16;
        const nearestTrack = findNearestTrackSample(bike.position);
        const offroad = nearestTrack.distance > TRACK_WIDTH / 2 + 0.65;
        const grass = nearestTrack.distance > TRACK_WIDTH / 2 + 2.1;
        const isBoosting =
          now < boostUntilRef.current && nitroRef.current > 0 && throttle > 0.18;

        if (isBoosting) {
          nitroRef.current = Math.max(0, nitroRef.current - delta * 31);
        } else {
          nitroRef.current = Math.min(
            MAX_NITRO,
            nitroRef.current + delta * (offroad ? 4.5 : 8.2)
          );
        }

        if (nitroRef.current <= 0) {
          boostUntilRef.current = 0;
        }

        const grip = grass ? 0.52 : offroad ? 0.72 : 1;
        const maxSpeed = (isBoosting ? 19.2 : 14.2) * grip;
        const acceleration = (isBoosting ? 13.5 : 9.2) * grip;

        if (throttle > 0.02) {
          speedRef.current += acceleration * throttle * delta;
        } else {
          speedRef.current *= Math.exp(-(offroad ? 1.18 : 0.34) * delta);
        }

        if (braking) {
          speedRef.current -= (grass ? 8.5 : 13.5) * (0.45 + joystickBrake) * delta;
        }

        speedRef.current = THREE.MathUtils.clamp(speedRef.current, 0, maxSpeed);

        const speedRatio = THREE.MathUtils.clamp(speedRef.current / 14.2, 0, 1);
        const turnRate = THREE.MathUtils.lerp(1.1, 1.95, speedRatio) * grip;
        const brakeTurnBoost = braking ? 1.22 : 1;
        headingRef.current += steer * turnRate * brakeTurnBoost * delta;

        const alignment = angleDelta(nearestTrack.sample.yaw, headingRef.current);
        const steeringCommitment = Math.min(0.9, Math.abs(steer) * 0.72);
        const assistStrength = (offroad ? 1.9 : 0.42) * (1 - steeringCommitment) * speedRatio;
        headingRef.current += alignment * (1 - Math.exp(-assistStrength * delta));

        forward.set(Math.sin(headingRef.current), 0, -Math.cos(headingRef.current));
        bike.position.addScaledVector(forward, speedRef.current * delta);
        bike.position.y = 0.08 + Math.sin(now * 0.028) * speedRatio * 0.015;

        const postTrack = findNearestTrackSample(bike.position);
        const lateralOffset = bike.position
          .clone()
          .sub(postTrack.sample.position)
          .dot(postTrack.sample.normal);
        const clampedLateralOffset = THREE.MathUtils.clamp(
          lateralOffset,
          -TRACK_WIDTH / 2 + 0.72,
          TRACK_WIDTH / 2 - 0.72
        );

        if (Math.abs(lateralOffset) > TRACK_WIDTH / 2 - 0.5) {
          const recoverTarget = postTrack.sample.position
            .clone()
            .addScaledVector(postTrack.sample.normal, clampedLateralOffset);
          bike.position.lerp(recoverTarget, 1 - Math.exp(-3.2 * delta));
        }

        const lean = -steer * THREE.MathUtils.lerp(0.14, 0.48, speedRatio) * grip;
        bike.rotation.y = headingRef.current;
        bike.rotation.z = THREE.MathUtils.lerp(bike.rotation.z, lean, 1 - Math.exp(-10 * delta));
        bike.rotation.x = THREE.MathUtils.lerp(
          bike.rotation.x,
          braking ? -0.07 : speedRatio * 0.04,
          1 - Math.exp(-8 * delta)
        );

        if (offroad) {
          speedRef.current *= 1 - Math.min(0.2, delta * 0.72);

          if (grass && speedRef.current > 7.2 && Math.random() < 0.08) {
            effectsRef.current.push(
              createSpark(scene, bike.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 0x91c46c)
            );
          }
        }

        obstaclesRef.current.forEach((obstacle) => {
          if (obstacle.root.position.distanceTo(bike.position) < obstacle.radius) {
            applyDamage("Cone hit");
          }
        });

        const targetCheckpoint = CHECKPOINTS[nextCheckpointRef.current];
        const targetSample = TRACK_DATA.samples[targetCheckpoint.sampleIndex];

        if (bike.position.distanceTo(targetSample.position) < 3.35) {
          passCheckpoint();
        }
      } else if (bike) {
        speedRef.current *= Math.exp(-2.8 * delta);
        const coastForward = new THREE.Vector3(
          Math.sin(headingRef.current),
          0,
          -Math.cos(headingRef.current)
        );
        bike.position.addScaledVector(coastForward, speedRef.current * delta);
        bike.rotation.z = THREE.MathUtils.lerp(bike.rotation.z, 0, 1 - Math.exp(-6 * delta));
      }

      effectsRef.current = effectsRef.current.filter((effect) => {
        effect.life -= delta;
        effect.mesh.position.addScaledVector(effect.velocity, delta);
        effect.velocity.y -= 3.8 * delta;

        const alpha = Math.max(0, effect.life / effect.maxLife);
        effect.mesh.scale.setScalar(1 + (1 - alpha) * 2.4);

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

      if (checkpointGateRef.current) {
        checkpointGateRef.current.rotation.z += delta * 0.8;
        checkpointGateRef.current.scale.setScalar(1 + Math.sin(now * 0.006) * 0.03);
      }

      if (bike) {
        const cameraDistance = THREE.MathUtils.lerp(10.4, 14.6, Math.min(1, speedRef.current / 18));
        const cameraHeight = THREE.MathUtils.lerp(5.1, 6.4, Math.min(1, speedRef.current / 18));
        const cameraForward = new THREE.Vector3(
          Math.sin(headingRef.current),
          0,
          -Math.cos(headingRef.current)
        );

        cameraGoal.copy(bike.position).addScaledVector(cameraForward, -cameraDistance);
        cameraGoal.y += cameraHeight;

        if (screenShakeRef.current > 0) {
          cameraGoal.x += THREE.MathUtils.randFloatSpread(screenShakeRef.current);
          cameraGoal.y += THREE.MathUtils.randFloatSpread(screenShakeRef.current * 0.5);
          screenShakeRef.current = Math.max(0, screenShakeRef.current - delta * 1.8);
        }

        lookGoal.copy(bike.position).addScaledVector(cameraForward, 5.6);
        lookGoal.y += 1.18;
        camera.position.lerp(cameraGoal, 1 - Math.exp(-5.6 * delta));
        cameraTargetRef.current.lerp(lookGoal, 1 - Math.exp(-8.8 * delta));
        camera.lookAt(cameraTargetRef.current);
      }

      if (now - lastUiUpdate > 120) {
        lastUiUpdate = now;
        setRaceTime(raceTimeRef.current);
        setSpeed(Math.round(speedRef.current * 16));
        setNitro(Math.round(nitroRef.current));
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      asphaltTexture?.dispose();
      grassTexture?.dispose();
      disposeObjectTree(scene);
      renderer.dispose();
      host.innerHTML = "";

      bikeRef.current = null;
      checkpointGateRef.current = null;
      opponentsRef.current = [];
      obstaclesRef.current = [];
      effectsRef.current = [];
    };
  }, [controllerConnected, setStatus]);

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
          ? "Finished"
          : gameStatus === "waiting"
            ? "Waiting"
            : "Racing";

  const bestLapText = bestLap === null ? "--" : `${bestLap.toFixed(1)}s`;
  const nextGateLabel = CHECKPOINTS[checkpoint].label;

  return (
    <main className={hitFlash ? "mini-game-page hit-flash" : "mini-game-page"}>
      {!controllerConnected ? (
        <section className="mini-game-connect-panel">
          <div className="mini-game-icon">
            <QrCode size={34} />
          </div>

          <h1>Apex Moto</h1>

          <p>Scan with mobile. The phone becomes your throttle and steering.</p>

          {qrDataUrl ? (
            <img className="mini-game-qr" src={qrDataUrl} alt="Apex Moto controller QR" />
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

          <section className="bike-game-hud">
            <div className="hud-panel">
              <small>Lap</small>
              <strong>
                {lap}/{TOTAL_LAPS}
              </strong>
            </div>

            <div className="hud-panel">
              <small>Time</small>
              <strong>{raceTime.toFixed(1)}s</strong>
            </div>

            <div className="hud-panel">
              <small>Speed</small>
              <strong>{speed}</strong>
            </div>

            <div className="hud-panel">
              <small>Nitro</small>
              <strong>{nitro}%</strong>
            </div>

            <div className="hud-panel">
              <small>Sector</small>
              <strong>{checkpoint}/{CHECKPOINTS.length - 1}</strong>
            </div>

            <div className="hud-panel">
              <small>Best</small>
              <strong>{bestLapText}</strong>
            </div>

            <div className="hud-panel armor">
              <small>Armor</small>
              <strong>{Array.from({ length: armor }).map(() => "I").join("")}</strong>
            </div>
          </section>

          <section className="bike-game-status-chip">
            {gameStatus === "paused" ? <Pause size={18} /> : <Gauge size={18} />}
            {statusLabel}
          </section>

          <section className="bike-game-race-card">
            <small>Next Gate</small>
            <strong>{nextGateLabel}</strong>
          </section>

          {gameStatus !== "playing" && (
            <section className="mini-game-overlay-card">
              <div className="mini-game-overlay-icon">
                {gameStatus === "paused" ? <Pause size={34} /> : <Trophy size={34} />}
              </div>

              <h2>
                {gameStatus === "ready"
                  ? "Ready on Grid"
                  : gameStatus === "paused"
                    ? "Race Paused"
                    : "Race Complete"}
              </h2>

              <p>
                {gameStatus === "ready"
                  ? "Press Start on the mobile controller."
                  : gameStatus === "paused"
                    ? "Resume from your phone."
                    : `Time ${raceTime.toFixed(1)}s / Best lap ${bestLapText}`}
              </p>
            </section>
          )}

          <section className="mini-game-message">
            {armor > 0 ? <Zap size={18} /> : <Shield size={18} />}
            {message}
          </section>
        </>
      )}
    </main>
  );
}
