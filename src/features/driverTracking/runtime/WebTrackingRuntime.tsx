import {
  useEffect,
  useRef,
} from "react";

import {
  connectWebDriverSocket,
  disconnectWebDriverSocket,
  isWebDriverSocketConnected,
  sendWebDriverLocation,
  stopWebDriverSocketSharing,
  type WebDriverSocketStatus,
} from "../services/webDriverSocket";
import { useDriverTrackingStore } from "../store/driverTrackingStore";
import type { WebBusLocation } from "../types/driverTracking";

const LOCATION_SEND_INTERVAL_MS = 5000;
const IMMEDIATE_SEND_MIN_GAP_MS = 2000;

type WakeLockHandle = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (
    event: "release",
    listener: () => void
  ) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (
      type: "screen"
    ) => Promise<WakeLockHandle>;
  };
};

export default function WebTrackingRuntime() {
  const busId = useDriverTrackingStore(
    (state) => state.busId
  );

  const isSharing = useDriverTrackingStore(
    (state) => state.isSharing
  );

  const latestLocationRef =
    useRef<WebBusLocation | null>(null);

  const socketConnectedRef =
    useRef(false);

  const lastSocketSentAtRef =
    useRef(0);

  const firstLocationSentRef =
    useRef(false);

  const wakeLockRef =
    useRef<WakeLockHandle | null>(null);

  useEffect(() => {
    function updateVisibility() {
      useDriverTrackingStore
        .getState()
        .setPageVisibility(
          document.visibilityState
        );
    }

    updateVisibility();

    document.addEventListener(
      "visibilitychange",
      updateVisibility
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        updateVisibility
      );
    };
  }, [isSharing]);

  useEffect(() => {
    const wakeNavigator =
      navigator as WakeLockNavigator;

    const store =
      useDriverTrackingStore.getState();

    store.setWakeLockSupported(
      Boolean(wakeNavigator.wakeLock)
    );

    let disposed = false;

    async function releaseWakeLock() {
      const current = wakeLockRef.current;
      wakeLockRef.current = null;

      if (current && !current.released) {
        try {
          await current.release();
        } catch {
          // Browser may already have released it.
        }
      }

      store.setWakeLockActive(false);
    }

    async function requestWakeLock() {
      if (
        disposed ||
        !isSharing ||
        document.visibilityState !==
          "visible" ||
        !wakeNavigator.wakeLock ||
        wakeLockRef.current
      ) {
        return;
      }

      try {
        const sentinel =
          await wakeNavigator.wakeLock.request(
            "screen"
          );

        if (disposed) {
          await sentinel.release();
          return;
        }

        wakeLockRef.current = sentinel;
        store.setWakeLockActive(true);

        sentinel.addEventListener(
          "release",
          () => {
            if (
              wakeLockRef.current ===
              sentinel
            ) {
              wakeLockRef.current = null;
            }

            store.setWakeLockActive(false);
          }
        );
      } catch {
        store.setWakeLockActive(false);
      }
    }

    function handleWakeVisibility() {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void requestWakeLock();
      }
    }

    if (isSharing) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }

    document.addEventListener(
      "visibilitychange",
      handleWakeVisibility
    );

    return () => {
      disposed = true;

      document.removeEventListener(
        "visibilitychange",
        handleWakeVisibility
      );

      void releaseWakeLock();
    };
  }, [isSharing]);

  useEffect(() => {
    if (!isSharing || !busId) {
      disconnectWebDriverSocket();
      return;
    }

    const store =
      useDriverTrackingStore.getState();

    if (!navigator.geolocation) {
      store.setTrackingStatus("error");
      store.setConnectionStatus("offline");
      store.setError(
        "Geolocation is not supported by this browser."
      );
      return;
    }

    let disposed = false;

    firstLocationSentRef.current = false;
    lastSocketSentAtRef.current = 0;

    function emitLatestLocation(
      force = false
    ) {
      const location =
        latestLocationRef.current;

      if (
        disposed ||
        !location ||
        !socketConnectedRef.current ||
        !isWebDriverSocketConnected()
      ) {
        return false;
      }

      const now = Date.now();
      const elapsed =
        now -
        lastSocketSentAtRef.current;

      if (
        !force &&
        elapsed <
          IMMEDIATE_SEND_MIN_GAP_MS
      ) {
        return false;
      }

      const sent =
        sendWebDriverLocation(location);

      if (!sent) {
        return false;
      }

      lastSocketSentAtRef.current = now;

      store.setLastSentAt(now);
      store.setConnectionStatus("online");
      store.setTrackingStatus("sharing");
      store.setError(null);

      return true;
    }

    function handleSocketStatus(
      status: WebDriverSocketStatus
    ) {
      if (disposed) {
        return;
      }

      if (status === "connected") {
        socketConnectedRef.current = true;

        store.setConnectionStatus("online");
        store.setError(null);

        emitLatestLocation(true);
        return;
      }

      if (status === "connecting") {
        socketConnectedRef.current = false;

        store.setConnectionStatus("sending");
        return;
      }

      socketConnectedRef.current = false;
      store.setConnectionStatus("offline");

      if (status === "error") {
        store.setError(
          "Live socket connection failed. Retrying automatically..."
        );
      } else {
        store.setError(
          "Live socket disconnected. Reconnecting automatically..."
        );
      }
    }

    function handlePosition(
      position: GeolocationPosition
    ) {
      const speed =
        typeof position.coords.speed ===
          "number" &&
        Number.isFinite(
          position.coords.speed
        )
          ? position.coords.speed
          : null;

      const heading =
        typeof position.coords.heading ===
          "number" &&
        Number.isFinite(
          position.coords.heading
        )
          ? position.coords.heading
          : null;

      const location: WebBusLocation = {
        busId,
        latitude:
          position.coords.latitude,
        longitude:
          position.coords.longitude,
        accuracy:
          Number.isFinite(
            position.coords.accuracy
          )
            ? position.coords.accuracy
            : null,
        speed,
        heading,
        timestamp:
          position.timestamp ||
          Date.now(),
      };

      latestLocationRef.current =
        location;

      store.setCurrentLocation(
        location
      );

      store.setTrackingStatus(
        "sharing"
      );

      const firstLocation =
        !firstLocationSentRef.current;

      firstLocationSentRef.current = true;

      emitLatestLocation(
        firstLocation
      );
    }

    function handlePositionError(
      error: GeolocationPositionError
    ) {
      store.setTrackingStatus("error");

      if (
        error.code ===
        error.PERMISSION_DENIED
      ) {
        store.setError(
          "Location permission was denied. Allow location access in browser settings."
        );
        return;
      }

      if (
        error.code ===
        error.POSITION_UNAVAILABLE
      ) {
        store.setError(
          "The current GPS location is unavailable."
        );
        return;
      }

      store.setError(
        "The location request timed out. The browser will keep trying."
      );
    }

    store.setTrackingStatus("starting");
    store.setConnectionStatus("sending");
    store.setError(null);

    connectWebDriverSocket(
      handleSocketStatus
    );

    const watchId =
      navigator.geolocation.watchPosition(
        handlePosition,
        handlePositionError,
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 30000,
        }
      );

    const sendInterval =
      window.setInterval(() => {
        emitLatestLocation(true);
      }, LOCATION_SEND_INTERVAL_MS);

    return () => {
      disposed = true;

      navigator.geolocation.clearWatch(
        watchId
      );

      window.clearInterval(
        sendInterval
      );

      const currentState =
        useDriverTrackingStore.getState();

      const explicitStopOrBusChange =
        !currentState.isSharing ||
        currentState.busId !== busId;

      if (explicitStopOrBusChange) {
        void stopWebDriverSocketSharing(
          busId
        ).finally(() => {
          disconnectWebDriverSocket();
        });
      } else {
        disconnectWebDriverSocket();
      }

      socketConnectedRef.current =
        false;

      latestLocationRef.current =
        null;

      firstLocationSentRef.current =
        false;
    };
  }, [busId, isSharing]);

  return null;
}

