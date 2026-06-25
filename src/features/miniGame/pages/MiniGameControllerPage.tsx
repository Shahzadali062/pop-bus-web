import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Rocket,
  Zap,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { useParams } from "react-router-dom";

import { SERVER_URL } from "../../../shared/config/server";
import "./MiniGameControllerPage.css";

type GameControl =
  | "boost"
  | "drift-down"
  | "drift-up"
  | "pause"
  | "restart"
  | "resume"
  | "start";

type JoystickVector = {
  x: number;
  y: number;
};

const KNOB_LIMIT = 58;

export default function MiniGameControllerPage() {
  const { roomId = "" } = useParams();
  const socketRef = useRef<Socket | null>(null);
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickVectorRef = useRef<JoystickVector>({ x: 0, y: 0 });
  const joystickActiveRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const driftPointerIdRef = useRef<number | null>(null);

  const cleanRoomId = roomId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  const [socketStatus, setSocketStatus] = useState(() =>
    cleanRoomId ? "Connecting" : "Invalid room"
  );
  const [message, setMessage] = useState("Ready for dispatch.");
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const [isDrifting, setIsDrifting] = useState(false);

  const sendJoystick = useCallback(
    (x: number, y: number) => {
      socketRef.current?.emit("game:joystick-command", {
        roomId: cleanRoomId,
        x,
        y,
      });
    },
    [cleanRoomId]
  );

  useEffect(() => {
    if (!cleanRoomId) return;

    const socket = io(SERVER_URL, {
      transports: ["websocket"],
      reconnection: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketStatus("Connected");

      socket.emit(
        "game:join-room",
        {
          roomId: cleanRoomId,
          role: "controller",
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

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [cleanRoomId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const vector = joystickVectorRef.current;

      if (socketRef.current?.connected) {
        sendJoystick(vector.x, vector.y);
      }
    }, 50);

    return () => {
      window.clearInterval(interval);
    };
  }, [sendJoystick]);

  function sendControl(control: GameControl) {
    if (!socketRef.current?.connected) {
      setMessage("Controller is not connected yet.");
      return;
    }

    socketRef.current.emit(
      "game:control-command",
      {
        roomId: cleanRoomId,
        control,
      },
      (response?: { ok?: boolean; message?: string }) => {
        if (!response?.ok) {
          setMessage(response?.message ?? "Command failed.");
        }
      }
    );
  }

  function updateJoystickFromPointer(clientX: number, clientY: number) {
    const base = joystickBaseRef.current;

    if (!base) {
      return;
    }

    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > KNOB_LIMIT) {
      dx = (dx / distance) * KNOB_LIMIT;
      dy = (dy / distance) * KNOB_LIMIT;
    }

    const normalizedX = dx / KNOB_LIMIT;
    const normalizedY = dy / KNOB_LIMIT;

    joystickVectorRef.current = {
      x: normalizedX,
      y: normalizedY,
    };

    setKnob({ x: dx, y: dy });
    sendJoystick(normalizedX, normalizedY);
  }

  function resetJoystick() {
    joystickActiveRef.current = false;
    activePointerIdRef.current = null;
    joystickVectorRef.current = { x: 0, y: 0 };
    setKnob({ x: 0, y: 0 });
    sendJoystick(0, 0);
  }

  function startDrift(pointerId: number) {
    driftPointerIdRef.current = pointerId;
    setIsDrifting(true);
    sendControl("drift-down");
    setMessage("Drift engaged.");
  }

  function stopDrift(pointerId?: number) {
    if (pointerId !== undefined && driftPointerIdRef.current !== pointerId) {
      return;
    }

    driftPointerIdRef.current = null;
    setIsDrifting(false);
    sendControl("drift-up");
    setMessage("Grip restored.");
  }

  function togglePause() {
    if (isPaused) {
      sendControl("resume");
      setIsPaused(false);
      setMessage("Route resumed.");
      return;
    }

    sendControl("pause");
    setIsPaused(true);
    setMessage("Route paused.");
  }

  return (
    <main className="game-controller-page">
      <section className="game-controller-shell">
        <header className="game-controller-topbar">
          <div className="game-controller-title">
            <div className="game-controller-icon">
              <Gamepad2 size={24} />
            </div>

            <div>
              <span>Mobile Controller</span>
              <h1>Pop Bus Rush</h1>
            </div>
          </div>

          <div className="game-controller-pill">{socketStatus}</div>
        </header>

        <section className="game-controller-room">
          <small>Room</small>
          <strong>{cleanRoomId || "Missing"}</strong>
        </section>

        <section className="game-controller-playbar">
          <button
            type="button"
            className="game-primary-button"
            onClick={() => {
              sendControl("start");
              setIsPaused(false);
              setMessage("Shift started.");
            }}
          >
            <Play size={20} />
            Start
          </button>

          <button
            type="button"
            className="game-secondary-button"
            onClick={togglePause}
          >
            {isPaused ? <Play size={20} /> : <Pause size={20} />}
            {isPaused ? "Resume" : "Pause"}
          </button>

          <button
            type="button"
            className="game-secondary-button danger"
            onClick={() => {
              sendControl("restart");
              setIsPaused(false);
              setMessage("Route reset.");
            }}
          >
            <RotateCcw size={20} />
            Restart
          </button>
        </section>

        <section className="game-controller-main">
          <div className="joystick-zone">
            <div
              ref={joystickBaseRef}
              className="virtual-joystick"
              onPointerDown={(event) => {
                joystickActiveRef.current = true;
                activePointerIdRef.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                updateJoystickFromPointer(event.clientX, event.clientY);
              }}
              onPointerMove={(event) => {
                if (
                  joystickActiveRef.current &&
                  activePointerIdRef.current === event.pointerId
                ) {
                  updateJoystickFromPointer(event.clientX, event.clientY);
                }
              }}
              onPointerUp={(event) => {
                if (activePointerIdRef.current === event.pointerId) {
                  resetJoystick();
                }
              }}
              onPointerCancel={(event) => {
                if (activePointerIdRef.current === event.pointerId) {
                  resetJoystick();
                }
              }}
              onLostPointerCapture={resetJoystick}
            >
              <div className="joystick-crosshair" />
              <div
                className="joystick-knob"
                style={{
                  transform: `translate(${knob.x}px, ${knob.y}px)`,
                }}
              >
                <Rocket size={24} />
              </div>
            </div>

            <p>Drive</p>
          </div>

          <div className="game-action-column">
            <button
              type="button"
              className="game-big-action turbo"
              onClick={() => {
                sendControl("boost");
                setMessage("Turbo fired.");
              }}
            >
              <Zap size={24} />
              Turbo
            </button>

            <button
              type="button"
              className={isDrifting ? "game-big-action drift active" : "game-big-action drift"}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                startDrift(event.pointerId);
              }}
              onPointerUp={(event) => stopDrift(event.pointerId)}
              onPointerCancel={(event) => stopDrift(event.pointerId)}
              onLostPointerCapture={() => stopDrift()}
            >
              <Activity size={24} />
              Drift
            </button>
          </div>
        </section>

        <p className="game-controller-message">{message}</p>
      </section>
    </main>
  );
}
