import { useEffect, useRef, useState } from "react";
import { Activity, Gamepad2, RotateCcw, Zap } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { useParams } from "react-router-dom";

import { SERVER_URL } from "../../../shared/config/server";
import "./MiniGameControllerPage.css";

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

export default function MiniGameControllerPage() {
  const { roomId = "" } = useParams();
  const socketRef = useRef<Socket | null>(null);

  const cleanRoomId = roomId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  const [socketStatus, setSocketStatus] = useState("Connecting");
  const [message, setMessage] = useState("Hold direction buttons to move.");

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

  function holdButton(label: string, down: GameControl, up: GameControl) {
    return (
      <button
        type="button"
        className="game-control-button"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          sendControl(down);
        }}
        onPointerUp={() => sendControl(up)}
        onPointerCancel={() => sendControl(up)}
        onPointerLeave={() => sendControl(up)}
      >
        {label}
      </button>
    );
  }

  return (
    <main className="game-controller-page">
      <section className="game-controller-card">
        <div className="game-controller-header">
          <div className="game-controller-icon">
            <Gamepad2 size={25} />
          </div>

          <div>
            <span>Mobile Controller</span>
            <h1>Coin Collector</h1>
          </div>
        </div>

        <div className="game-controller-status">
          <div>
            <small>Room</small>
            <strong>{cleanRoomId || "Missing"}</strong>
          </div>

          <div>
            <small>Status</small>
            <strong>{socketStatus}</strong>
          </div>
        </div>

        <div className="game-dpad">
          <span />
          {holdButton("Forward", "forward-down", "forward-up")}
          <span />

          {holdButton("Left", "left-down", "left-up")}
          {holdButton("Back", "back-down", "back-up")}
          {holdButton("Right", "right-down", "right-up")}
        </div>

        <div className="game-action-grid">
          <button
            type="button"
            className="game-action-button"
            onClick={() => sendControl("jump")}
          >
            <Activity size={22} />
            Jump
          </button>

          <button
            type="button"
            className="game-action-button"
            onClick={() => sendControl("boost")}
          >
            <Zap size={22} />
            Boost
          </button>

          <button
            type="button"
            className="game-action-button restart"
            onClick={() => sendControl("restart")}
          >
            <RotateCcw size={22} />
            Restart
          </button>
        </div>

        <p className="game-controller-message">{message}</p>
      </section>
    </main>
  );
}
