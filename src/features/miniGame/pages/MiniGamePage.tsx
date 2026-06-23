import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, QrCode, Trophy } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { SERVER_URL } from "../../../shared/config/server";
import "./MiniGamePage.css";

type GameControl =
  | "forward-down"
  | "forward-up"
  | "back-down"
  | "back-up"
  | "left-down"
  | "left-up"
  | "right-down"
  | "right-up"
  | "jump"
  | "boost"
  | "restart";

type GameStatus = "waiting" | "playing" | "finished";

const PUBLIC_WEB_URL =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? window.location.origin
    : "https://pop-bus-web.vercel.app";

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function randomPosition() {
  return new THREE.Vector3(
    (Math.random() - 0.5) * 12,
    0.35,
    (Math.random() - 0.5) * 12
  );
}

function findClipName(keyword: string, clipNames: string[]) {
  return (
    clipNames.find((clipName) =>
      clipName.toLowerCase().includes(keyword.toLowerCase())
    ) ?? clipNames[0] ?? null
  );
}

export default function MiniGamePage() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const roomIdRef = useRef(createRoomId());
  const roomId = roomIdRef.current;

  const pressedRef = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
  });

  const playerRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const currentClipRef = useRef<string>("");
  const jumpVelocityRef = useRef(0);
  const boostUntilRef = useRef(0);
  const scoreRef = useRef(0);
  const timeLeftRef = useRef(60);
  const gameStatusRef = useRef<GameStatus>("waiting");
  const coinsRef = useRef<THREE.Mesh[]>([]);
  const obstaclesRef = useRef<THREE.Mesh[]>([]);
  const hitCooldownRef = useRef(0);

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [controllerConnected, setControllerConnected] = useState(false);
  const [socketStatus, setSocketStatus] = useState("Connecting");
  const [gameStatus, setGameStatus] = useState<GameStatus>("waiting");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [message, setMessage] = useState("Scan QR with mobile to start.");

  const controllerUrl = `${PUBLIC_WEB_URL}/game-controller/${roomId}`;

  const playClip = useCallback((clipKeyword: string) => {
    const clipNames = Object.keys(actionsRef.current);
    const matchedClip = findClipName(clipKeyword, clipNames);

    if (!matchedClip || currentClipRef.current === matchedClip) {
      return;
    }

    const nextAction = actionsRef.current[matchedClip];
    const currentAction = actionsRef.current[currentClipRef.current];

    currentAction?.fadeOut(0.15);
    nextAction.reset().fadeIn(0.15).play();

    currentClipRef.current = matchedClip;
  }, []);

  const resetGame = useCallback(() => {
    scoreRef.current = 0;
    timeLeftRef.current = 60;
    gameStatusRef.current = "playing";
    setScore(0);
    setTimeLeft(60);
    setGameStatus("playing");
    setMessage("Collect coins before time runs out.");

    const player = playerRef.current;
    if (player) {
      player.position.set(0, 0, 0);
      player.rotation.set(0, 0, 0);
      player.scale.setScalar(1);
    }

    jumpVelocityRef.current = 0;
    boostUntilRef.current = 0;

    coinsRef.current.forEach((coin) => {
      coin.position.copy(randomPosition());
      coin.visible = true;
    });
  }, []);

  const handleControl = useCallback(
    (control: GameControl) => {
      if (control === "forward-down") pressedRef.current.forward = true;
      if (control === "forward-up") pressedRef.current.forward = false;
      if (control === "back-down") pressedRef.current.back = true;
      if (control === "back-up") pressedRef.current.back = false;
      if (control === "left-down") pressedRef.current.left = true;
      if (control === "left-up") pressedRef.current.left = false;
      if (control === "right-down") pressedRef.current.right = true;
      if (control === "right-up") pressedRef.current.right = false;

      if (control === "jump" && Math.abs(jumpVelocityRef.current) < 0.001) {
        jumpVelocityRef.current = 5.2;
      }

      if (control === "boost") {
        boostUntilRef.current = Date.now() + 2200;
        setMessage("Speed boost activated.");
      }

      if (control === "restart") {
        resetGame();
      }
    },
    [resetGame]
  );

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
        setMessage("Mobile connected. Game loading...");
      }
    });

    socket.on("game:peer-left", (payload: { role?: string }) => {
      if (payload?.role === "controller") {
        setMessage("Mobile disconnected. Scan QR again if needed.");
      }
    });

    socket.on(
      "game:control-command",
      (payload: { control?: GameControl }) => {
        if (payload?.control) {
          handleControl(payload.control);
        }
      }
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [handleControl, roomId]);

  useEffect(() => {
    if (!controllerConnected) return;

    const host = canvasRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    scene.fog = new THREE.Fog(0x020617, 10, 32);

    const camera = new THREE.PerspectiveCamera(
      48,
      host.clientWidth / host.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 6, 9);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.4));

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(6, 8, 5);
    scene.add(keyLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(9, 96),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.78,
        metalness: 0.08,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    scene.add(ground);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(8.7, 9, 96),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);

    const playerRoot = new THREE.Group();
    scene.add(playerRoot);
    playerRef.current = playerRoot;

    const coinMaterial = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.3,
      metalness: 0.55,
      emissive: 0x713f12,
      emissiveIntensity: 0.35,
    });

    const coins: THREE.Mesh[] = [];
    for (let i = 0; i < 10; i += 1) {
      const coin = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.07, 12, 28),
        coinMaterial
      );
      coin.position.copy(randomPosition());
      coin.rotation.x = Math.PI / 2;
      scene.add(coin);
      coins.push(coin);
    }
    coinsRef.current = coins;

    const obstacleMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.25,
      roughness: 0.55,
    });

    const obstacles: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i += 1) {
      const obstacle = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.7, 0.7),
        obstacleMaterial
      );
      obstacle.position.set(
        (Math.random() - 0.5) * 11,
        0.35,
        (Math.random() - 0.5) * 11
      );
      scene.add(obstacle);
      obstacles.push(obstacle);
    }
    obstaclesRef.current = obstacles;

    const loader = new GLTFLoader();
    loader.load(
      "/models/soldier.glb",
      (gltf) => {
        const model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z) || 1;
        model.scale.setScalar(1.55 / maxAxis);

        const fittedBox = new THREE.Box3().setFromObject(model);
        const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
        model.position.x -= fittedCenter.x;
        model.position.y -= fittedBox.min.y;
        model.position.z -= fittedCenter.z;

        playerRoot.add(model);

        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;

        const actionMap: Record<string, THREE.AnimationAction> = {};
        gltf.animations.forEach((clip) => {
          const action = mixer.clipAction(clip);
          action.loop = THREE.LoopRepeat;
          actionMap[clip.name] = action;
        });

        actionsRef.current = actionMap;
        playClip("idle");
        resetGame();
      },
      undefined,
      () => {
        setMessage("Model failed to load.");
      }
    );

    let frameId = 0;
    let lastUiUpdate = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.04);
      const now = Date.now();
      const player = playerRef.current;

      mixerRef.current?.update(delta);

      if (gameStatusRef.current === "playing") {
        timeLeftRef.current = Math.max(0, timeLeftRef.current - delta);

        if (timeLeftRef.current <= 0) {
          gameStatusRef.current = "finished";
          setGameStatus("finished");
          setMessage(`Game over. Final score: ${scoreRef.current}`);
        }
      }

      if (player && gameStatusRef.current === "playing") {
        const pressed = pressedRef.current;
        const direction = new THREE.Vector3(0, 0, 0);

        if (pressed.forward) direction.z -= 1;
        if (pressed.back) direction.z += 1;
        if (pressed.left) direction.x -= 1;
        if (pressed.right) direction.x += 1;

        const isMoving = direction.lengthSq() > 0;
        const isBoosting = now < boostUntilRef.current;
        const speed = isBoosting ? 5.2 : 2.8;

        if (isMoving) {
          direction.normalize();
          player.position.x += direction.x * speed * delta;
          player.position.z += direction.z * speed * delta;
          player.rotation.y = Math.atan2(direction.x, direction.z);
          playClip(isBoosting ? "run" : "walk");
        } else {
          playClip("idle");
        }

        player.position.x = THREE.MathUtils.clamp(player.position.x, -7.2, 7.2);
        player.position.z = THREE.MathUtils.clamp(player.position.z, -7.2, 7.2);

        jumpVelocityRef.current -= 12.8 * delta;
        player.position.y += jumpVelocityRef.current * delta;

        if (player.position.y <= 0) {
          player.position.y = 0;
          jumpVelocityRef.current = 0;
        }

        coinsRef.current.forEach((coin) => {
          coin.rotation.y += delta * 4.2;
          if (coin.position.distanceTo(player.position) < 0.72) {
            scoreRef.current += 1;
            setScore(scoreRef.current);
            coin.position.copy(randomPosition());
            setMessage("+1 coin collected.");
          }
        });

        obstaclesRef.current.forEach((obstacle) => {
          obstacle.rotation.y += delta * 1.1;
          if (
            now > hitCooldownRef.current &&
            obstacle.position.distanceTo(player.position) < 0.82
          ) {
            scoreRef.current = Math.max(0, scoreRef.current - 2);
            setScore(scoreRef.current);
            hitCooldownRef.current = now + 1000;
            player.position.multiplyScalar(0.86);
            setMessage("Obstacle hit. -2 points.");
          }
        });

        const targetCamera = new THREE.Vector3(
          player.position.x,
          player.position.y + 5.2,
          player.position.z + 8.3
        );

        camera.position.lerp(targetCamera, 0.055);
        camera.lookAt(player.position.x, player.position.y + 0.9, player.position.z);
      }

      if (now - lastUiUpdate > 180) {
        lastUiUpdate = now;
        setTimeLeft(Math.ceil(timeLeftRef.current));
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
      playerRef.current = null;
      mixerRef.current = null;
      actionsRef.current = {};
      currentClipRef.current = "";
      coinsRef.current = [];
      obstaclesRef.current = [];
    };
  }, [controllerConnected, playClip, resetGame]);

  async function copyControllerLink() {
    await navigator.clipboard.writeText(controllerUrl);
    setMessage("Mobile controller link copied.");
  }

  return (
    <main className="mini-game-page">
      {!controllerConnected ? (
        <section className="mini-game-qr-card">
          <div className="mini-game-icon">
            <QrCode size={34} />
          </div>

          <h1>Play a Mini Game</h1>

          <p>
            Scan this QR on mobile. Your phone becomes the controller and this
            screen becomes the 3D game.
          </p>

          {qrDataUrl ? (
            <img className="mini-game-qr" src={qrDataUrl} alt="Mini game QR" />
          ) : (
            <div className="mini-game-qr-placeholder">QR loading...</div>
          )}

          <strong className="mini-game-room">{roomId}</strong>

          <button type="button" className="mini-game-copy" onClick={copyControllerLink}>
            <Copy size={18} />
            Copy Controller Link
          </button>

          <small>{socketStatus}</small>
        </section>
      ) : (
        <>
          <div ref={canvasRef} className="mini-game-canvas" />

          <section className="mini-game-hud">
            <div>
              <small>Score</small>
              <strong>{score}</strong>
            </div>

            <div>
              <small>Time</small>
              <strong>{timeLeft}s</strong>
            </div>

            <div>
              <small>Status</small>
              <strong>{gameStatus === "finished" ? "Game Over" : "Playing"}</strong>
            </div>
          </section>

          <section className="mini-game-message">
            <Trophy size={18} />
            {message}
          </section>
        </>
      )}
    </main>
  );
}

