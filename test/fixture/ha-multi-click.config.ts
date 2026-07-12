declare global {
  let lookupDeviceId: (deviceName: string) => string;
}

if (process.env.CALL_TOO_EARLY === "true") {
  // Must throw: no connection to Home Assistant exists at config-eval time.
  lookupDeviceId("Test Dimmer");
}

module.exports = {
  homeAssistantURL: process.env.HA_URL,
  longLivedToken: "test-token",
  buttonsConfigFn: () => [
    {
      name: "test button",
      off: {
        triggers: [
          {
            device_id: lookupDeviceId(
              process.env.OFF_DEVICE_NAME ?? "Test Dimmer",
            ),
          },
        ],
        action: {},
      },
      on: {
        // One subscription per trigger.
        triggers: [
          { device_id: lookupDeviceId("Renamed Dimmer") },
          { device_id: lookupDeviceId("Test Dimmer") },
        ],
        actions: [{}],
      },
    },
  ],
  verbose: true,
};
