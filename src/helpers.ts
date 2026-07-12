import {
  ERR_CANNOT_CONNECT,
  ERR_CONNECTION_LOST,
  ERR_HASS_HOST_REQUIRED,
  ERR_INVALID_AUTH,
  ERR_INVALID_HTTPS_TO_HTTP,
} from "home-assistant-js-websocket";

// Helpers injected into the evaluation context of config files, both as
// globals (matching `declare global` in config files) and under `helpers`.
export const configFileHelpers = {
  sunIsUp,
  lookupDeviceId,
};

export interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
}

// The device registry can only be fetched once a connection to Home Assistant
// has been established; index.ts provides it via setDeviceRegistry before
// invoking buttonsConfigFn.
let deviceRegistry: Array<DeviceRegistryEntry> | null = null;

export function setDeviceRegistry(devices: Array<DeviceRegistryEntry>) {
  deviceRegistry = devices;
}

function lookupDeviceId(deviceName: string): string {
  if (deviceRegistry === null) {
    throw new Error(
      "lookupDeviceId is not ready yet; it can only be called inside buttonsConfigFn, which runs once the connection to Home Assistant has been established",
    );
  }

  return resolveDeviceId(deviceRegistry, deviceName);
}

function resolveDeviceId(
  devices: Array<DeviceRegistryEntry>,
  deviceName: string,
): string {
  // Home Assistant displays `name_by_user` (set when the user renames a
  // device) and falls back to `name` (set by the integration); match against
  // what the user sees.
  const matches = devices.filter(
    (device) => (device.name_by_user ?? device.name) === deviceName,
  );

  if (matches.length === 0) {
    throw new Error(
      `No device named '${deviceName}' found in the Home Assistant device registry`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Device name '${deviceName}' is ambiguous; it matches the ids: ${matches
        .map((device) => device.id)
        .join(", ")}`,
    );
  }

  return matches[0].id;
}

function sunIsUp() {
  // TODO: Very simple implementation; should be replaced with a proper calculation.
  const now = new Date();
  const sunrise = new Date();
  const sunset = new Date();

  sunrise.setHours(6);
  sunrise.setMinutes(0);
  sunset.setHours(20);
  sunset.setMinutes(0);

  return now >= sunrise && now < sunset;
}

// home-assistant-js-websocket throws plain numeric error codes, not Errors.
export function formatError(e: any): string {
  switch (e) {
    case ERR_CANNOT_CONNECT:
      return "cannot connect";
    case ERR_INVALID_AUTH:
      return "invalid auth";
    case ERR_CONNECTION_LOST:
      return "connection lost";
    case ERR_HASS_HOST_REQUIRED:
      return "Home Assistant host required";
    case ERR_INVALID_HTTPS_TO_HTTP:
      return "invalid HTTPS to HTTP connection";
    default:
      return `${e?.message ?? e}`;
  }
}
