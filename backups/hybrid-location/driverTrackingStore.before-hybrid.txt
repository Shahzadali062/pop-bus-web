import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  ConnectionStatus,
  TrackingStatus,
  WebBusLocation,
} from "../types/driverTracking";

type DriverTrackingState = {
  busId: string;
  isSharing: boolean;
  trackingStatus: TrackingStatus;
  connectionStatus: ConnectionStatus;
  currentLocation: WebBusLocation | null;
  lastSentAt: number | null;
  pageVisibility: DocumentVisibilityState;
  wakeLockSupported: boolean;
  wakeLockActive: boolean;
  error: string | null;

  setBusId: (busId: string) => void;
  startSharing: () => void;
  stopSharing: () => void;
  setTrackingStatus: (status: TrackingStatus) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setCurrentLocation: (location: WebBusLocation) => void;
  setLastSentAt: (timestamp: number) => void;
  setPageVisibility: (
    visibility: DocumentVisibilityState
  ) => void;
  setWakeLockSupported: (supported: boolean) => void;
  setWakeLockActive: (active: boolean) => void;
  setError: (error: string | null) => void;
};

export const useDriverTrackingStore =
  create<DriverTrackingState>()(
    persist(
      (set) => ({
        busId: "",
        isSharing: false,
        trackingStatus: "idle",
        connectionStatus: "idle",
        currentLocation: null,
        lastSentAt: null,
        pageVisibility: "visible",
        wakeLockSupported: false,
        wakeLockActive: false,
        error: null,

        setBusId: (busId) => {
          set({
            busId: busId.trim().toUpperCase(),
          });
        },

        startSharing: () => {
          set({
            isSharing: true,
            trackingStatus: "starting",
            connectionStatus: "idle",
            error: null,
          });
        },

        stopSharing: () => {
          set({
            isSharing: false,
            trackingStatus: "idle",
            connectionStatus: "idle",
            wakeLockActive: false,
            error: null,
          });
        },

        setTrackingStatus: (trackingStatus) => {
          set({ trackingStatus });
        },

        setConnectionStatus: (connectionStatus) => {
          set({ connectionStatus });
        },

        setCurrentLocation: (currentLocation) => {
          set({ currentLocation });
        },

        setLastSentAt: (lastSentAt) => {
          set({ lastSentAt });
        },

        setPageVisibility: (pageVisibility) => {
          set({ pageVisibility });
        },

        setWakeLockSupported: (wakeLockSupported) => {
          set({ wakeLockSupported });
        },

        setWakeLockActive: (wakeLockActive) => {
          set({ wakeLockActive });
        },

        setError: (error) => {
          set({ error });
        },
      }),
      {
        name: "pop-bus-web-driver",
        partialize: (state) => ({
          busId: state.busId,
          isSharing: state.isSharing,
        }),
      }
    )
  );
