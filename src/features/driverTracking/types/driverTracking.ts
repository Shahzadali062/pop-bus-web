export type TrackingStatus =
  | "idle"
  | "starting"
  | "sharing"
  | "error";

export type ConnectionStatus =
  | "idle"
  | "sending"
  | "online"
  | "offline";

export type WebBusLocation = {
  busId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};
