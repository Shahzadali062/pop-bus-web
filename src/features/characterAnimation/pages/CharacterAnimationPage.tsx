import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, QrCode, Smartphone, Sparkles } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { SERVER_URL } from "../../../shared/config/server";
import "./CharacterAnimationPage.css";

type CharacterAction = "idle" | "walk" | "run" | "superjump" | "fastspin" | "moonwalk" | "power" | "victory" | "slowmo" | "speedboost";

const ACTIONS: CharacterAction[] = ["idle", "walk", "run", "superjump", "fastspin", "moonwalk", "power", "victory", "slowmo", "speedboost"];

const ACTION_LABELS: Record<CharacterAction, string> = {
  idle: "Idle",
  walk: "Walk",
  run: "Run",
  superjump: "Super Jump",
  fastspin: "Fast Spin",
  moonwalk: "Moonwalk",
  power: "Power Mode",
  victory: "Victory",
  slowmo: "Slow Motion",
  speedboost: "Speed Boost",
};

const ACTION_KEYWORDS: Record<CharacterAction, string[]> = {
  idle: ["idle"],
  walk: ["walk"],
  run: ["run"],
  superjump: ["run", "walk", "idle"],
  fastspin: ["run", "walk", "idle"],
  moonwalk: ["walk"],
  power: ["idle"],
  victory: ["run", "walk", "idle"],
  slowmo: ["walk", "run", "idle"],
  speedboost: ["run"],
};

const PUBLIC_WEB_URL = "https://pop-bus-web.vercel.app";

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function findClipName(action: CharacterAction, clipNames: string[]) {
  const keywords = ACTION_KEYWORDS[action];

  return (
    clipNames.find((clipName) => {
      const cleanName = clipName.toLowerCase();
      return keywords.some((keyword) => cleanName.includes(keyword));
    }) ?? clipNames[0] ?? null
  );
}

export default function CharacterAnimationPage() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const manualActionRef = useRef<CharacterAction>("idle");
  const manualStartedAtRef = useRef(Date.now());

  const [roomId] = useState(createRoomId);
  const [socketStatus, setSocketStatus] = useState("Connecting");
  const [modelStatus, setModelStatus] = useState("Waiting for mobile");
  const [availableClips, setAvailableClips] = useState<string[]>([]);
  const [activeAction, setActiveAction] = useState<CharacterAction>("idle");
  const [notice, setNotice] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [controllerConnected, setControllerConnected] = useState(false);

  const controllerUrl = `${PUBLIC_WEB_URL}/character-controller/${roomId}`;

  const playCharacterAction = useCallback((action: CharacterAction) => {
    manualActionRef.current = action;
    manualStartedAtRef.current = Date.now();
    setActiveAction(action);

    const clipNames = Object.keys(actionsRef.current);
    const matchedClip = findClipName(action, clipNames);

    if (!matchedClip) {
      setNotice(`No "${ACTION_LABELS[action]}" clip found.`);
      return;
    }

    const nextAction = actionsRef.current[matchedClip];

    currentActionRef.current?.fadeOut(0.18);

    nextAction.timeScale =
      action === "slowmo" ? 0.35 : action === "speedboost" ? 2.4 : 1;

    nextAction.reset().fadeIn(0.18).play();

    currentActionRef.current = nextAction;
    setNotice(`Playing: ${matchedClip}`);
  }, []);

  useEffect(() => {
    QRCode.toDataURL(controllerUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: "#020617",
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
        "character:join-room",
        {
          roomId,
          role: "viewer",
        },
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

    socket.on("character:peer-joined", (payload: { role?: string }) => {
      if (payload?.role === "controller") {
        setControllerConnected(true);
        setModelStatus("Loading model");
        setNotice("Mobile controller connected.");
      }
    });

    socket.on("character:peer-left", (payload: { role?: string }) => {
      if (payload?.role === "controller") {
        setNotice("Mobile controller disconnected. Scan QR again if needed.");
      }
    });

    socket.on(
      "character:animation-command",
      (payload: { action?: CharacterAction }) => {
        if (payload?.action && ACTIONS.includes(payload.action)) {
          playCharacterAction(payload.action);
        }
      }
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [playCharacterAction, roomId]);

  useEffect(() => {
    if (!controllerConnected) {
      return;
    }

    const host = canvasHostRef.current;

    if (!host) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const camera = new THREE.PerspectiveCamera(
      45,
      host.clientWidth / host.clientHeight,
      0.1,
      100
    );

    camera.position.set(0, 0.8, 3.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 2.4);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 2.1);
    rimLight.position.set(-4, 2, -3);
    scene.add(rimLight);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);
    modelRootRef.current = modelRoot;

    const loader = new GLTFLoader();

    loader.load(
      "/models/soldier.glb",
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.frustumCulled = false;
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z) || 1;
        const scale = 3.4 / maxAxis;

        model.scale.setScalar(scale);

        const fittedBox = new THREE.Box3().setFromObject(model);
        const fittedCenter = fittedBox.getCenter(new THREE.Vector3());

        model.position.x -= fittedCenter.x;
        model.position.y -= fittedCenter.y;
        model.position.z -= fittedCenter.z;

        modelRoot.add(model);

        const finalBox = new THREE.Box3().setFromObject(modelRoot);
        const finalSize = finalBox.getSize(new THREE.Vector3());
        const finalCenter = finalBox.getCenter(new THREE.Vector3());
        const cameraDistance =
          Math.max(finalSize.x, finalSize.y, finalSize.z) * 1.25 + 1.4;

        camera.position.set(0, finalCenter.y + 0.15, cameraDistance);
        camera.lookAt(finalCenter.x, finalCenter.y, finalCenter.z);

        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;

        const actionMap: Record<string, THREE.AnimationAction> = {};

        gltf.animations.forEach((clip) => {
          const clipAction = mixer.clipAction(clip);
          clipAction.loop = THREE.LoopRepeat;
          actionMap[clip.name] = clipAction;
        });

        actionsRef.current = actionMap;

        const clips = gltf.animations.map((clip) => clip.name);
        setAvailableClips(clips);
        setModelStatus("Model ready");

        playCharacterAction("idle");
      },
      undefined,
      (error) => {
        console.error(error);
        setModelStatus("Model failed to load");
      }
    );

    const clock = new THREE.Clock();
    let frameId = 0;

    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = (Date.now() - manualStartedAtRef.current) / 1000;
      const action = manualActionRef.current;
      const modelRootNow = modelRootRef.current;

      mixerRef.current?.update(delta);

      if (modelRootNow) {
        if (action === "idle") {
          modelRootNow.rotation.y += delta * 0.18;
          modelRootNow.position.y = Math.sin(elapsed * 2.2) * 0.018;
          modelRootNow.scale.setScalar(1);
        }

        if (action === "walk") {
          modelRootNow.position.y = Math.abs(Math.sin(elapsed * 8)) * 0.045;
          modelRootNow.scale.setScalar(1);
        }

        if (action === "run") {
          modelRootNow.position.y = Math.abs(Math.sin(elapsed * 12)) * 0.07;
          modelRootNow.scale.setScalar(1);
        }

        if (action === "superjump") {
          modelRootNow.position.y =
            Math.max(0, Math.sin(elapsed * Math.PI * 1.8)) * 0.95;
          modelRootNow.rotation.y += delta * 1.1;
          modelRootNow.scale.setScalar(1.03);
        }

        if (action === "fastspin") {
          modelRootNow.rotation.y += delta * 5.4;
          modelRootNow.position.y = Math.sin(elapsed * 7) * 0.045;
          modelRootNow.scale.setScalar(1);
        }

        if (action === "moonwalk") {
          modelRootNow.rotation.y = Math.PI;
          modelRootNow.position.y = Math.abs(Math.sin(elapsed * 8)) * 0.045;
          modelRootNow.position.z = Math.sin(elapsed * 2.2) * 0.16;
          modelRootNow.scale.setScalar(1);
        }

        if (action === "power") {
          const pulse = 1 + Math.sin(elapsed * 8) * 0.055;
          modelRootNow.scale.setScalar(pulse);
          modelRootNow.rotation.y += delta * 0.75;
          modelRootNow.position.y = Math.abs(Math.sin(elapsed * 5)) * 0.09;
        }

        if (action === "victory") {
          modelRootNow.position.y =
            Math.abs(Math.sin(elapsed * Math.PI * 2.2)) * 0.45;
          modelRootNow.rotation.y += delta * 2.2;
          modelRootNow.scale.setScalar(1.04);
        }

        if (action === "slowmo") {
          modelRootNow.position.y = Math.abs(Math.sin(elapsed * 2.5)) * 0.03;
          modelRootNow.rotation.y += delta * 0.08;
          modelRootNow.scale.setScalar(1);
        }

        if (action === "speedboost") {
          modelRootNow.position.y = Math.abs(Math.sin(elapsed * 18)) * 0.09;
          modelRootNow.rotation.y += delta * 0.9;
          modelRootNow.scale.setScalar(1.02);
        }

        if (action !== "moonwalk") {
          modelRootNow.rotation.y += 0;
        }

        modelRootNow.rotation.x *= 0.9;
        modelRootNow.rotation.z *= 0.9;
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    animate();

    const resize = () => {
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };

    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      host.innerHTML = "";
      mixerRef.current = null;
      modelRootRef.current = null;
      actionsRef.current = {};
      currentActionRef.current = null;
    };
  }, [controllerConnected, playCharacterAction]);

  async function copyControllerLink() {
    await navigator.clipboard.writeText(controllerUrl);
    setNotice("Controller link copied.");
  }

  return (
    <main className="character-page">
      <section className="character-stage">
        {controllerConnected ? (
          <div ref={canvasHostRef} className="character-canvas" />
        ) : (
          <div className="character-wait-card">
            <div className="character-wait-icon">
              <QrCode size={34} />
            </div>

            <h1>Scan QR to Control Character</h1>

            <p>
              Open this controller on your mobile. After mobile connects, the 3D
              character will load here automatically.
            </p>

            {qrDataUrl ? (
              <img
                className="character-qr"
                src={qrDataUrl}
                alt="Mobile controller QR code"
              />
            ) : (
              <div className="character-qr-placeholder">QR loading...</div>
            )}

            <strong className="character-room-big">{roomId}</strong>

            <button
              type="button"
              className="character-copy-button character-copy-button-compact"
              onClick={() => void copyControllerLink()}
            >
              <Copy size={18} />
              Copy Mobile Link
            </button>
          </div>
        )}
      </section>

      <aside className="character-panel">
        <div className="character-panel-heading">
          <div className="character-icon">
            <Sparkles size={23} />
          </div>

          <div>
            <span>Three.js Character</span>
            <h1>3D Character Animation</h1>
          </div>
        </div>

        <div className="character-status-grid">
          <div>
            <small>Room ID</small>
            <strong>{roomId}</strong>
          </div>

          <div>
            <small>Socket</small>
            <strong>{socketStatus}</strong>
          </div>

          <div>
            <small>Mobile</small>
            <strong>{controllerConnected ? "Connected" : "Waiting"}</strong>
          </div>

          <div>
            <small>Model</small>
            <strong>{modelStatus}</strong>
          </div>

          <div>
            <small>Active</small>
            <strong>{ACTION_LABELS[activeAction]}</strong>
          </div>
        </div>

        <div className="character-link-card">
          <Smartphone size={18} />

          <div>
            <small>Mobile controller link</small>
            <strong>{controllerUrl}</strong>
          </div>
        </div>

        <button
          type="button"
          className="character-copy-button"
          onClick={() => void copyControllerLink()}
        >
          <Copy size={18} />
          Copy Mobile Controller Link
        </button>

        <p className="character-note">
          Use mobile controller buttons to control the character. Desktop buttons
          are intentionally removed.
        </p>

        {availableClips.length > 0 && (
          <p className="character-note">
            Available model clips: {availableClips.join(", ")}
          </p>
        )}

        {notice && <p className="character-notice">{notice}</p>}

        <Link to="/" className="character-home-link">
          Back to Home
        </Link>
      </aside>
    </main>
  );
}

