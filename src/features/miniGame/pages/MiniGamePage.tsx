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
  typeof window !== "undefined"
    ? window.location.origin
    : "https://pop-bus-web.vercel.app";

/*
  Soldier.glb ka forward axis movement vector se opposite ho sakta hai.
  Agar face phir bhi opposite direction dekhe, is value ko Math.PI se 0 kar dena.
*/
const MODEL_YAW_OFFSET = Math.PI;

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function randomPosition() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 1.8 + Math.random() * 5.8;

  return new THREE.Vector3(
    Math.cos(angle) * radius,
    0.35,
    Math.sin(angle) * radius
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
  const currentClipRef = useRef("");

  const velocityRef = useRef(new THREE.Vector3());
  const targetVelocityRef = useRef(new THREE.Vector3());
  const moveDirectionRef = useRef(new THREE.Vector3(0, 0, -1));
  const targetQuaternionRef = useRef(new THREE.Quaternion());
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0.9, 0));

  const jumpVelocityRef = useRef(0);
  const isGroundedRef = useRef(true);
  const boostUntilRef = useRef(0);
  const hitUntilRef = useRef(0);
  const hitCooldownRef = useRef(0);
  const knockbackVelocityRef = useRef(new THREE.Vector3());

  const scoreRef = useRef(0);
  const timeLeftRef = useRef(60);
  const gameStatusRef = useRef<GameStatus>("waiting");
  const coinsRef = useRef<THREE.Mesh[]>([]);
  const obstaclesRef = useRef<THREE.Mesh[]>([]);

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [controllerConnected, setControllerConnected] = useState(false);
  const [socketStatus, setSocketStatus] = useState("Connecting");
  const [gameStatus, setGameStatus] = useState<GameStatus>("waiting");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [message, setMessage] = useState("Scan QR with mobile to start.");

  const controllerUrl = `${PUBLIC_WEB_URL}/game-controller/${roomId}`;

  const playClip = useCallback((clipKeyword: string, timeScale = 1) => {
    const clipNames = Object.keys(actionsRef.current);
    const matchedClip = findClipName(clipKeyword, clipNames);

    if (!matchedClip) {
      return;
    }

    const nextAction = actionsRef.current[matchedClip];
    nextAction.timeScale = timeScale;

    if (currentClipRef.current === matchedClip) {
      return;
    }

    const currentAction = actionsRef.current[currentClipRef.current];

    currentAction?.fadeOut(0.18);
    nextAction.reset().fadeIn(0.18).play();

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
      player.quaternion.identity();
      player.rotation.set(0, 0, 0);
      player.scale.setScalar(1);
    }

    velocityRef.current.set(0, 0, 0);
    targetVelocityRef.current.set(0, 0, 0);
    knockbackVelocityRef.current.set(0, 0, 0);
    moveDirectionRef.current.set(0, 0, -1);
    jumpVelocityRef.current = 0;
    isGroundedRef.current = true;
    boostUntilRef.current = 0;
    hitUntilRef.current = 0;
    hitCooldownRef.current = 0;

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

      if (control === "jump" && isGroundedRef.current) {
        jumpVelocityRef.current = 5.4;
        isGroundedRef.current = false;
        setMessage("Jump!");
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
    scene.fog = new THREE.Fog(0x020617, 12, 34);

    const camera = new THREE.PerspectiveCamera(
      48,
      host.clientWidth / host.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 6.2, 9.8);

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
      obstacle.position.copy(randomPosition());
      obstacle.position.y = 0.35;
      scene.add(obstacle);
      obstacles.push(obstacle);
    }
    obstaclesRef.current = obstacles;

    const loader = new GLTFLoader();
    loader.load(
      "/models/soldier.glb",
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.frustumCulled = false;
            mesh.castShadow = true;
          }
        });

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
          action.enabled = true;
          actionMap[clip.name] = action;
        });

        actionsRef.current = actionMap;
        playClip("idle", 1);
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

    const inputDirection = new THREE.Vector3();
    const desiredVelocity = new THREE.Vector3();
    const horizontalVelocity = new THREE.Vector3();
    const cameraGoal = new THREE.Vector3();
    const lookGoal = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);

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

        inputDirection.set(0, 0, 0);

        if (pressed.forward) inputDirection.z -= 1;
        if (pressed.back) inputDirection.z += 1;
        if (pressed.left) inputDirection.x -= 1;
        if (pressed.right) inputDirection.x += 1;

        const hasInput = inputDirection.lengthSq() > 0.001;
        const isBoosting = now < boostUntilRef.current;

        if (hasInput) {
          inputDirection.normalize();
          moveDirectionRef.current.lerp(inputDirection, 1 - Math.exp(-16 * delta));
        }

        const targetSpeed = hasInput ? (isBoosting ? 5.2 : 2.85) : 0;

        desiredVelocity.copy(inputDirection).multiplyScalar(targetSpeed);
        targetVelocityRef.current.copy(desiredVelocity);

        const response = hasInput ? 1 - Math.exp(-9.5 * delta) : 1 - Math.exp(-13 * delta);
        velocityRef.current.lerp(targetVelocityRef.current, response);

        horizontalVelocity.copy(velocityRef.current);
        horizontalVelocity.y = 0;

        if (horizontalVelocity.lengthSq() > 0.002) {
          player.position.x += horizontalVelocity.x * delta;
          player.position.z += horizontalVelocity.z * delta;

          const actualMoveDir = horizontalVelocity.clone().normalize();
          const targetYaw =
            Math.atan2(actualMoveDir.x, actualMoveDir.z) + MODEL_YAW_OFFSET;

          targetQuaternionRef.current.setFromAxisAngle(yAxis, targetYaw);

          const turnAlpha = 1 - Math.exp(-10.5 * delta);
          player.quaternion.slerp(targetQuaternionRef.current, turnAlpha);

          playClip(isBoosting ? "run" : "walk", isBoosting ? 1.35 : 1);
        } else {
          playClip("idle", 1);
        }

        knockbackVelocityRef.current.multiplyScalar(1 - Math.min(1, delta * 7));
        player.position.x += knockbackVelocityRef.current.x * delta;
        player.position.z += knockbackVelocityRef.current.z * delta;

        jumpVelocityRef.current -= 13.2 * delta;
        player.position.y += jumpVelocityRef.current * delta;

        if (player.position.y <= 0) {
          player.position.y = 0;
          jumpVelocityRef.current = 0;
          isGroundedRef.current = true;
        }

        player.position.x = THREE.MathUtils.clamp(player.position.x, -7.2, 7.2);
        player.position.z = THREE.MathUtils.clamp(player.position.z, -7.2, 7.2);

        if (now < hitUntilRef.current) {
          player.rotation.z = Math.sin(now * 0.035) * 0.11;
          player.scale.setScalar(1.03);
        } else {
          player.rotation.z *= 1 - Math.min(1, delta * 9);
          player.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-8 * delta));
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

            const away = player.position.clone().sub(obstacle.position);
            away.y = 0;

            if (away.lengthSq() < 0.001) {
              away.set(0, 0, 1);
            }

            away.normalize();
            knockbackVelocityRef.current.copy(away.multiplyScalar(3.4));

            hitCooldownRef.current = now + 950;
            hitUntilRef.current = now + 420;

            setMessage("Obstacle hit. -2 points.");
          }
        });

        cameraGoal.set(
          player.position.x,
          player.position.y + 6.2,
          player.position.z + 9.6
        );

        lookGoal.set(player.position.x, player.position.y + 0.95, player.position.z);

        camera.position.lerp(cameraGoal, 1 - Math.exp(-4.2 * delta));
        cameraTargetRef.current.lerp(lookGoal, 1 - Math.exp(-7.2 * delta));
        camera.lookAt(cameraTargetRef.current);
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

          <button
            type="button"
            className="mini-game-copy"
            onClick={() => void copyControllerLink()}
          >
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

