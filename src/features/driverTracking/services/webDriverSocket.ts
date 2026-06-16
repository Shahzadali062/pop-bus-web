import {
  io,
  type Socket,
} from "socket.io-client";

import type { WebBusLocation } from "../types/driverTracking";

import { SERVER_URL } from "../../../shared/config/server";

export type WebDriverSocketStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

type StatusListener = (
  status: WebDriverSocketStatus
) => void;

let socket: Socket | null = null;
let statusListener: StatusListener | null = null;
let locationSequence = 0;

function notifyStatus(
  status: WebDriverSocketStatus
) {
  statusListener?.(status);
}

function createSocket() {
  const nextSocket = io(SERVER_URL, {
    autoConnect: false,
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.4,
    timeout: 15000,
  });

  nextSocket.on("connect", () => {
    notifyStatus("connected");
  });

  nextSocket.on("disconnect", () => {
    notifyStatus("disconnected");
  });

  nextSocket.on("connect_error", () => {
    notifyStatus("error");
  });

  nextSocket.on("server:error", () => {
    notifyStatus("error");
  });

  return nextSocket;
}

export function connectWebDriverSocket(
  onStatusChange?: StatusListener
) {
  statusListener = onStatusChange ?? null;

  if (!socket) {
    socket = createSocket();
  }

  if (socket.connected) {
    notifyStatus("connected");
    return socket;
  }

  notifyStatus("connecting");
  socket.connect();

  return socket;
}

export function isWebDriverSocketConnected() {
  return Boolean(socket?.connected);
}

export function sendWebDriverLocation(
  location: WebBusLocation
) {
  if (!socket?.connected) {
    return false;
  }

  const clientSentAt = Date.now();
  locationSequence += 1;

  socket.emit("driver:location-update", {
    ...location,
    timestamp: clientSentAt,
    deviceTimestamp: location.timestamp,
    source: "web",
    visibility: document.visibilityState,
    clientSentAt,
    sequence: locationSequence,
  });

  return true;
}

export function stopWebDriverSocketSharing(
  busId: string
) {
  return new Promise<boolean>((resolve) => {
    if (!socket?.connected) {
      resolve(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      resolve(false);
    }, 3500);

    socket.emit(
      "driver:stop-sharing",
      {
        busId,
        source: "web",
      },
      (response?: { ok?: boolean }) => {
        window.clearTimeout(timeout);
        resolve(response?.ok === true);
      }
    );
  });
}

export function disconnectWebDriverSocket() {
  statusListener = null;

  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
}

export async function stopWebDriverSharingEverywhere(busId: string) {
  const cleanBusId = busId.trim().toUpperCase();

  if (!cleanBusId) {
    return false;
  }

  const socketStopPromise = stopWebDriverSocketSharing(cleanBusId).catch(
    () => false
  );

  const httpStopPromise = fetch(`${SERVER_URL}/api/driver/stop-sharing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      busId: cleanBusId,
      source: "web-manual-stop",
    }),
    keepalive: true,
  })
    .then((response) => response.ok)
    .catch(() => false);

  const [socketStopped, httpStopped] = await Promise.all([
    socketStopPromise,
    httpStopPromise,
  ]);

  return socketStopped || httpStopped;
}
