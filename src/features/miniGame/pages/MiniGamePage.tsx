import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Heart, Pause, QrCode, Shield, Trophy, Zap } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { SERVER_URL } from "../../../shared/config/server";
import "./MiniGamePage.css";

type GameControl = "jump" | "boost" | "restart" | "pause" | "resume" | "start";

type GameStatus = "waiting" | "ready" | "playing" | "paused" | "finished";

type CollectEffect = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
};

type GameBestScore = {
  score?: number;
  roomId?: string;
  updatedAt?: string;
};

const PUBLIC_WEB_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://pop-bus-web.vercel.app";

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

  const [roomId] = useState(createRoomId);

  const joystickRef = useRef({
    x: 0,
    y: 0,
    magnitude: 0,
  });

  const playerRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const currentClipRef = useRef("");

  const velocityRef = useRef(new THREE.Vector3());
  const currentSpeedRef = useRef(0);
  const moveDirectionRef = useRef(new THREE.Vector3(0, 0, -1));
  const playerYawRef = useRef(0);
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0.9, 0));

  const jumpVelocityRef = useRef(0);
  const isGroundedRef = useRef(true);
  const boostUntilRef = useRef(0);
  const hitUntilRef = useRef(0);
  const hitCooldownRef = useRef(0);
  const knockbackVelocityRef = useRef(new THREE.Vector3());
  const screenShakeRef = useRef(0);

  const scoreRef = useRef(0);
  const bestScoreRef = useRef(0);
  const livesRef = useRef(3);
  const levelRef = useRef(1);
  const timeLeftRef = useRef(75);
  const gameStatusRef = useRef<GameStatus>("waiting");

  const coinsRef = useRef<THREE.Mesh[]>([]);
  const obstaclesRef = useRef<THREE.Mesh[]>([]);
  const effectsRef = useRef<CollectEffect[]>([]);

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [controllerConnected, setControllerConnected] = useState(false);
  const [socketStatus, setSocketStatus] = useState("Connecting");
  const [gameStatus, setGameStatus] = useState<GameStatus>("waiting");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(75);
  const [message, setMessage] = useState("Scan QR with mobile to start.");
  const [hitFlash, setHitFlash] = useState(false);

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

  const createCollectEffect = useCallback((scene: THREE.Scene, position: THREE.Vector3) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.95,
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), material);
    mesh.position.copy(position);
    scene.add(mesh);

    effectsRef.current.push({
      mesh,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        1.2 + Math.random() * 0.6,
        (Math.random() - 0.5) * 1.2
      ),
      life: 0.48,
      maxLife: 0.48,
    });
  }, []);

  const setStatus = useCallback((status: GameStatus) => {
    gameStatusRef.current = status;
    setGameStatus(status);
  }, []);

  const applyBestScore = useCallback((payload?: GameBestScore) => {
    const nextBestScore =
      typeof payload?.score === "number" && Number.isFinite(payload.score)
        ? Math.max(0, Math.floor(payload.score))
        : 0;

    bestScoreRef.current = nextBestScore;
    setBestScore(nextBestScore);
  }, []);

  const submitBestScore = useCallback(
    (nextScore: number) => {
      const scoreToSubmit = Math.max(0, Math.floor(nextScore));

      if (scoreToSubmit <= 0 || !socketRef.current?.connected) {
        return;
      }

      socketRef.current.emit(
        "game:score-submit",
        {
          roomId,
          score: scoreToSubmit,
        },
        (response?: {
          ok?: boolean;
          bestScore?: GameBestScore;
          updated?: boolean;
        }) => {
          if (response?.bestScore) {
            applyBestScore(response.bestScore);
          }

          if (response?.updated) {
            setMessage("New best score!");
          }
        }
      );
    },
    [applyBestScore, roomId]
  );

  const resetGame = useCallback(() => {
    scoreRef.current = 0;
    livesRef.current = 3;
    levelRef.current = 1;
    timeLeftRef.current = 75;

    setScore(0);
    setLives(3);
    setLevel(1);
    setTimeLeft(75);
    setStatus("playing");
    setMessage("Collect neon rings and avoid red obstacles.");

    const player = playerRef.current;
    if (player) {
      player.position.set(0, 0, 0);
      player.quaternion.identity();
      player.rotation.set(0, 0, 0);
      player.scale.setScalar(1);
    }

    joystickRef.current = { x: 0, y: 0, magnitude: 0 };
    velocityRef.current.set(0, 0, 0);
    currentSpeedRef.current = 0;
    knockbackVelocityRef.current.set(0, 0, 0);
    moveDirectionRef.current.set(0, 0, -1);
    playerYawRef.current = 0;
    jumpVelocityRef.current = 0;
    isGroundedRef.current = true;
    boostUntilRef.current = 0;
    hitUntilRef.current = 0;
    hitCooldownRef.current = 0;
    screenShakeRef.current = 0;

    coinsRef.current.forEach((coin) => {
      coin.position.copy(randomPosition());
      coin.visible = true;
    });

    obstaclesRef.current.forEach((obstacle) => {
      obstacle.position.copy(randomPosition());
      obstacle.position.y = 0.35;
    });
  }, [setStatus]);

  const handleControl = useCallback(
    (control: GameControl) => {
      if (control === "start" || control === "restart") {
        resetGame();
        return;
      }

      if (control === "pause" && gameStatusRef.current === "playing") {
        setStatus("paused");
        setMessage("Game paused.");
        return;
      }

      if (control === "resume" && gameStatusRef.current === "paused") {
        setStatus("playing");
        setMessage("Game resumed.");
        return;
      }

      if (gameStatusRef.current !== "playing") {
        return;
      }

      if (control === "jump" && isGroundedRef.current) {
        jumpVelocityRef.current = 5.6;
        isGroundedRef.current = false;
        setMessage("Jump!");
      }

      if (control === "boost") {
        boostUntilRef.current = Date.now() + 2300;
        setMessage("Speed boost activated.");
      }
    },
    [resetGame, setStatus]
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

      socket.emit(
        "game:best-score:get",
        (response?: { ok?: boolean; bestScore?: GameBestScore }) => {
          if (response?.bestScore) {
            applyBestScore(response.bestScore);
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
        setMessage("Mobile connected. Loading arena...");
      }
    });

    socket.on("game:peer-left", (payload: { role?: string }) => {
      if (payload?.role === "controller") {
        joystickRef.current = { x: 0, y: 0, magnitude: 0 };
        setMessage("Mobile disconnected. Scan QR again if needed.");
      }
    });

    socket.on("game:joystick-command", (payload: { x?: number; y?: number; magnitude?: number }) => {
      const x = typeof payload.x === "number" ? THREE.MathUtils.clamp(payload.x, -1, 1) : 0;
      const y = typeof payload.y === "number" ? THREE.MathUtils.clamp(payload.y, -1, 1) : 0;

      joystickRef.current = {
        x,
        y,
        magnitude: Math.min(1, Math.sqrt(x * x + y * y)),
      };
    });

    socket.on(
      "game:control-command",
      (payload: { control?: GameControl }) => {
        if (payload?.control) {
          handleControl(payload.control);
        }
      }
    );

    socket.on("game:best-score-updated", (payload: GameBestScore) => {
      applyBestScore(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyBestScore, handleControl, roomId]);

  useEffect(() => {
    if (!controllerConnected) return;

    const host = canvasRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    scene.fog = new THREE.Fog(0x020617, 12, 36);

    const camera = new THREE.PerspectiveCamera(
      48,
      host.clientWidth / host.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 6.4, 9.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.4));

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
    keyLight.position.set(6, 8, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x22d3ee, 1.4);
    rimLight.position.set(-5, 3, -4);
    scene.add(rimLight);

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

    const grid = new THREE.GridHelper(18, 24, 0x22d3ee, 0x1e293b);
    grid.position.y = 0.015;
    scene.add(grid);

    const pillarMaterial = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.55,
    });

    for (let i = 0; i < 18; i += 1) {
      const angle = (i / 18) * Math.PI * 2;
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.7 + Math.random() * 0.8, 0.08),
        pillarMaterial
      );
      pillar.position.set(Math.cos(angle) * 8.3, 0.35, Math.sin(angle) * 8.3);
      scene.add(pillar);
    }

    const playerRoot = new THREE.Group();
    scene.add(playerRoot);
    playerRef.current = playerRoot;

    const coinMaterial = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.25,
      metalness: 0.65,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
    });

    const coins: THREE.Mesh[] = [];
    for (let i = 0; i < 12; i += 1) {
      const coin = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.07, 12, 28),
        coinMaterial
      );
      coin.position.copy(randomPosition());
      coin.rotation.x = Math.PI / 2;
      coin.userData.pulse = Math.random() * Math.PI * 2;
      scene.add(coin);
      coins.push(coin);
    }
    coinsRef.current = coins;

    const obstacleMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.35,
      roughness: 0.55,
    });

    const obstacles: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i += 1) {
      const obstacle = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.72, 0.72),
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

        if (gameStatusRef.current === "waiting") {
          setStatus("ready");
          setMessage("Press Start on mobile controller.");
        }
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
    const facingDirection = new THREE.Vector3();
    const targetVelocity = new THREE.Vector3();
    const cameraGoal = new THREE.Vector3();
    const lookGoal = new THREE.Vector3();
    const scaleOne = new THREE.Vector3(1, 1, 1);

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.04);
      const now = Date.now();
      const player = playerRef.current;
      const status = gameStatusRef.current;

      if (status !== "paused" && status !== "finished") {
        mixerRef.current?.update(delta);
      }

      if (status === "playing") {
        timeLeftRef.current = Math.max(0, timeLeftRef.current - delta);

        if (timeLeftRef.current <= 0) {
          submitBestScore(scoreRef.current);
          setStatus("finished");
          setMessage(`Mission complete. Final score: ${scoreRef.current}`);
        }
      }

      if (player && status === "playing") {
        const joystick = joystickRef.current;

        /*
          Natural 3D character movement fix:
          - Joystick down/back is preserved.
          - Character does NOT slide/drag backward.
          - If direction changes a lot, character turns first, then walks.
          - Movement follows character facing direction.
          - Only Y-axis rotation is allowed.
          - World/camera/ground remain stable.
        */
        const deadZone = 0.08;

        const rawX = THREE.MathUtils.clamp(joystick.x, -1, 1);
        const rawY = THREE.MathUtils.clamp(joystick.y, -1, 1);

        const rawMagnitude = Math.min(
          1,
          Math.sqrt(rawX * rawX + rawY * rawY)
        );

        const inputPower =
          rawMagnitude < deadZone
            ? 0
            : Math.min(1, (rawMagnitude - deadZone) / (1 - deadZone));

        inputDirection.set(rawX, 0, rawY);

        const hasInput = inputPower > 0.02 && inputDirection.lengthSq() > 0.001;
        const isBoosting = now < boostUntilRef.current;

        if (hasInput) {
          inputDirection.normalize();

          const targetYaw =
            Math.atan2(inputDirection.x, inputDirection.z) + MODEL_YAW_OFFSET;

          const currentYaw = playerYawRef.current;

          // Shortest Y-axis angle difference.
          const yawDiff = Math.atan2(
            Math.sin(targetYaw - currentYaw),
            Math.cos(targetYaw - currentYaw)
          );

          const absYawDiff = Math.abs(yawDiff);

          /*
            Important:
            180-degree reverse/down direction needs quick turn-in-place.
            Movement is reduced while turning, so character does not look dragged.
          */
          const turnSpeed =
            THREE.MathUtils.lerp(9.5, 17.5, inputPower) +
            (absYawDiff > 1.55 ? 8.5 : 0) +
            (isBoosting ? 2.5 : 0);

          const maxTurnStep = turnSpeed * delta;
          const yawStep = THREE.MathUtils.clamp(
            yawDiff,
            -maxTurnStep,
            maxTurnStep
          );

          const nextYaw = currentYaw + yawStep;

          playerYawRef.current = nextYaw;
          player.rotation.set(0, nextYaw, 0);

          facingDirection
            .set(
              Math.sin(nextYaw - MODEL_YAW_OFFSET),
              0,
              Math.cos(nextYaw - MODEL_YAW_OFFSET)
            )
            .normalize();

          moveDirectionRef.current.copy(facingDirection);

          /*
            Alignment gate:
            Reverse/down input should never keep drifting in the old direction.
            Movement ramps in only after the character starts facing the
            requested joystick direction.
          */
          const directionAlignment = THREE.MathUtils.clamp(
            facingDirection.dot(inputDirection),
            -1,
            1
          );

          if (
            directionAlignment < 0 &&
            velocityRef.current.dot(inputDirection) < 0
          ) {
            velocityRef.current.multiplyScalar(Math.exp(-24 * delta));
            currentSpeedRef.current *= Math.exp(-18 * delta);
          }

          const alignmentFactor = THREE.MathUtils.smoothstep(
            directionAlignment,
            -0.05,
            0.92
          );

          const slowWalkSpeed = 0.55;
          const fastWalkSpeed = 1.75;
          const boostSpeed = 2.35;

          const targetSpeed =
            (isBoosting
              ? boostSpeed
              : THREE.MathUtils.lerp(slowWalkSpeed, fastWalkSpeed, inputPower)) *
            alignmentFactor;

          currentSpeedRef.current +=
            (targetSpeed - currentSpeedRef.current) *
            (1 - Math.exp(-10.5 * delta));

          targetVelocity
            .copy(facingDirection)
            .multiplyScalar(currentSpeedRef.current);

          velocityRef.current.lerp(
            targetVelocity,
            1 - Math.exp(-18 * delta)
          );

          player.position.x += velocityRef.current.x * delta;
          player.position.z += velocityRef.current.z * delta;

          const speedRatio = Math.min(1, currentSpeedRef.current / fastWalkSpeed);

          // During big turn, keep walk animation slow so it feels like turning.
          if (absYawDiff > 0.85) {
            playClip("walk", 0.62);
          } else {
            playClip("walk", THREE.MathUtils.lerp(0.72, 1.02, speedRatio));
          }
        } else {
          currentSpeedRef.current +=
            (0 - currentSpeedRef.current) *
            (1 - Math.exp(-12.5 * delta));

          velocityRef.current.multiplyScalar(Math.exp(-10.5 * delta));

          if (velocityRef.current.lengthSq() > 0.0008) {
            player.position.x += velocityRef.current.x * delta;
            player.position.z += velocityRef.current.z * delta;
            playClip("walk", 0.65);
          } else {
            currentSpeedRef.current = 0;
            velocityRef.current.set(0, 0, 0);
            playClip("idle", 1);
          }

          player.rotation.set(0, playerYawRef.current, 0);
        }

        knockbackVelocityRef.current.multiplyScalar(1 - Math.min(1, delta * 7));
        player.position.x += knockbackVelocityRef.current.x * delta;
        player.position.z += knockbackVelocityRef.current.z * delta;

        jumpVelocityRef.current -= 13.4 * delta;
        player.position.y += jumpVelocityRef.current * delta;

        if (player.position.y <= 0) {
          player.position.y = 0;
          jumpVelocityRef.current = 0;
          isGroundedRef.current = true;
        }

        player.position.x = THREE.MathUtils.clamp(player.position.x, -7.2, 7.2);
        player.position.z = THREE.MathUtils.clamp(player.position.z, -7.2, 7.2);

        if (now < hitUntilRef.current) {
          const hitPulse = 1.02 + Math.abs(Math.sin(now * 0.045)) * 0.025;
          player.scale.setScalar(hitPulse);
        } else {
          player.scale.lerp(scaleOne, 1 - Math.exp(-8 * delta));
        }

        // Critical upright lock: keep player on Y-axis yaw only.
        player.rotation.set(0, playerYawRef.current, 0);

        coinsRef.current.forEach((coin) => {
          coin.rotation.y += delta * 4.5;
          coin.position.y = 0.35 + Math.sin(now * 0.004 + coin.userData.pulse) * 0.08;

          if (coin.position.distanceTo(player.position) < 0.72) {
            scoreRef.current += 1;
            setScore(scoreRef.current);
            submitBestScore(scoreRef.current);
            createCollectEffect(scene, coin.position.clone());

            const nextLevel = Math.min(9, Math.floor(scoreRef.current / 6) + 1);

            if (nextLevel !== levelRef.current) {
              levelRef.current = nextLevel;
              setLevel(nextLevel);
              setMessage(`Level ${nextLevel}. Difficulty increased.`);
            } else {
              setMessage("+1 ring collected.");
            }

            coin.position.copy(randomPosition());
          }
        });

        obstaclesRef.current.forEach((obstacle, index) => {
          obstacle.rotation.y += delta * (1.1 + levelRef.current * 0.08);
          obstacle.position.y = 0.35 + Math.sin(now * 0.002 + index) * 0.04;

          if (
            now > hitCooldownRef.current &&
            obstacle.position.distanceTo(player.position) < 0.84
          ) {
            livesRef.current = Math.max(0, livesRef.current - 1);
            setLives(livesRef.current);

            const away = player.position.clone().sub(obstacle.position);
            away.y = 0;

            if (away.lengthSq() < 0.001) {
              away.set(0, 0, 1);
            }

            away.normalize();
            knockbackVelocityRef.current.copy(away.multiplyScalar(3.8));

            hitCooldownRef.current = now + 1050;
            hitUntilRef.current = now + 450;
            screenShakeRef.current = 0.35;

            setHitFlash(true);
            window.setTimeout(() => setHitFlash(false), 180);

            if (livesRef.current <= 0) {
              submitBestScore(scoreRef.current);
              setStatus("finished");
              setMessage(`Game over. Final score: ${scoreRef.current}`);
            } else {
              setMessage(`Obstacle hit. ${livesRef.current} lives left.`);
            }
          }
        });
      } else if (player && status !== "waiting") {
        playClip("idle", 1);
      }

      effectsRef.current = effectsRef.current.filter((effect) => {
        effect.life -= delta;
        effect.mesh.position.addScaledVector(effect.velocity, delta);
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

      if (player) {
        // Final frame safety: keep character standing upright.
        player.rotation.set(0, playerYawRef.current, 0);

        /*
          Stable adventure-game camera:
          - Fixed offset behind/above the arena.
          - It follows player position only.
          - It does NOT orbit based on joystick direction.
        */
        cameraGoal.set(
          player.position.x,
          player.position.y + 6.2,
          player.position.z + 9.6
        );

        if (screenShakeRef.current > 0) {
          cameraGoal.x += (Math.random() - 0.5) * screenShakeRef.current;
          cameraGoal.y += (Math.random() - 0.5) * screenShakeRef.current * 0.6;
          screenShakeRef.current = Math.max(0, screenShakeRef.current - delta * 1.9);
        }

        lookGoal.set(
          player.position.x,
          player.position.y + 0.9,
          player.position.z
        );

        camera.position.lerp(cameraGoal, 1 - Math.exp(-4.2 * delta));
        cameraTargetRef.current.lerp(lookGoal, 1 - Math.exp(-7.2 * delta));
        camera.lookAt(cameraTargetRef.current);
      }

      if (now - lastUiUpdate > 170) {
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
      effectsRef.current = [];
    };
  }, [
    controllerConnected,
    createCollectEffect,
    playClip,
    resetGame,
    setStatus,
    submitBestScore,
  ]);

  async function copyControllerLink() {
    await navigator.clipboard.writeText(controllerUrl);
    setMessage("Mobile controller link copied.");
  }

  return (
    <main className={hitFlash ? "mini-game-page hit-flash" : "mini-game-page"}>
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
            <div className="hud-card">
              <small>Score</small>
              <strong>{score}</strong>
            </div>

            <div className="hud-card best-score">
              <small>Best</small>
              <strong>{bestScore}</strong>
            </div>

            <div className="hud-card">
              <small>Time</small>
              <strong>{timeLeft}s</strong>
            </div>

            <div className="hud-card">
              <small>Level</small>
              <strong>{level}</strong>
            </div>

            <div className="hud-card lives">
              <small>Lives</small>
              <strong>
                {Array.from({ length: 3 }).map((_, index) => (
                  <Heart
                    key={index}
                    size={18}
                    fill={index < lives ? "currentColor" : "none"}
                  />
                ))}
              </strong>
            </div>
          </section>

          <section className="mini-game-status-chip">
            {gameStatus === "paused" ? <Pause size={18} /> : <Shield size={18} />}
            {gameStatus === "ready"
              ? "Ready"
              : gameStatus === "paused"
                ? "Paused"
                : gameStatus === "finished"
                  ? "Game Over"
                  : "Playing"}
          </section>

          {gameStatus !== "playing" && (
            <section className="mini-game-overlay-card">
              <div className="mini-game-overlay-icon">
                {gameStatus === "paused" ? <Pause size={34} /> : <Trophy size={34} />}
              </div>

              <h2>
                {gameStatus === "ready"
                  ? "Ready to Run"
                  : gameStatus === "paused"
                    ? "Paused"
                    : "Game Over"}
              </h2>

              <p>
                {gameStatus === "ready"
                  ? "Press Start on your mobile controller."
                  : gameStatus === "paused"
                    ? "Press Resume on mobile to continue."
                    : `Final score: ${score}`}
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


