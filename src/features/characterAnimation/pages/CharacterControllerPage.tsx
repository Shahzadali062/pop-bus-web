import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Activity, Footprints, PersonStanding, Sparkles } from "lucide-react";
import { io, type Socket } from "socket.io-client";

import { SERVER_URL } from "../../../shared/config/server";
import "./CharacterControllerPage.css";

type CharacterAction = "idle" | "walk" | "run" | "jump" | "spin";

const CONTROLS: Array<{
  action: CharacterAction;
  label: string;
  hint: string;
}> = [
  { action: "idle", label: "Idle", hint: "Standing animation" },
  { action: "walk", label: "Walk", hint: "Walking animation" },
  { action: "run", label: "Run", hint: "Running animation" },
  { action: "jump", label: "Jump", hint: "Jump movement" },
  { action: "spin", label: "Spin", hint: "Rotate character" },
];

export default function CharacterControllerPage() {
  const { roomId = "" } = useParams();
  const socketRef = useRef<Socket | null>(null);

  const cleanRoomId = roomId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  const [socketStatus, setSocketStatus] = useState("Connecting");
  const [lastAction, setLastAction] = useState<CharacterAction | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!cleanRoomId) {
      setSocketStatus("Invalid room");
      return;
    }

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

  function sendAction(action: CharacterAction) {
    if (!socketRef.current?.connected) {
      setMessage("Controller is not connected yet.");
      return;
    }

    socketRef.current.emit(
      "character:animation-command",
      {
        roomId: cleanRoomId,
        action,
      },
      (response?: { ok?: boolean; message?: string }) => {
        if (!response?.ok) {
          setMessage(response?.message ?? "Command failed.");
          return;
        }

        setLastAction(action);
        setMessage(`${action.toUpperCase()} command sent.`);
      }
    );
  }

  return (
    <main className="controller-page">
      <section className="controller-card">
        <div className="controller-header">
          <div className="controller-icon">
            <Sparkles size={24} />
          </div>

          <div>
            <span>Mobile Controller</span>
            <h1>Character Actions</h1>
          </div>
        </div>

        <div className="controller-status">
          <div>
            <small>Room</small>
            <strong>{cleanRoomId || "Missing"}</strong>
          </div>

          <div>
            <small>Status</small>
            <strong>{socketStatus}</strong>
          </div>
        </div>

        <div className="controller-actions">
          {CONTROLS.map((control) => (
            <button
              key={control.action}
              type="button"
              onClick={() => sendAction(control.action)}
              className={
                lastAction === control.action
                  ? "controller-button active"
                  : "controller-button"
              }
            >
              <span className="controller-button-icon">
                {control.action === "walk" ? (
                  <Footprints size={22} />
                ) : control.action === "idle" ? (
                  <PersonStanding size={22} />
                ) : (
                  <Activity size={22} />
                )}
              </span>

              <span>
                <strong>{control.label}</strong>
                <small>{control.hint}</small>
              </span>
            </button>
          ))}
        </div>

        {message && (
          <p className="controller-message">{message}</p>
        )}
      </section>
    </main>
  );
}

