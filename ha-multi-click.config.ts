// Global helpers defined in the execution context of the config file
declare global {
  let sunIsUp: () => boolean;
  let lookupDeviceId: (deviceName: string) => string;
}

if (process.env.HA_TOKEN === undefined) {
  throw new Error("HA_TOKEN environment variable is not set");
}

const bedroomOnActions = () => {
  if (between(8, 0, 0, 17, 0, 0)) {
    return [activateScene("scene.bedroom_bright")];
  }

  return [
    activateScene("scene.bedroom_only_hugo_2nd"),
    activateScene("scene.bedroom_bright"),
  ];
};

module.exports = {
  homeAssistantURL: "http://192.168.178.4:8123",
  longLivedToken: process.env.HA_TOKEN,
  buttonsConfigFn: () => [
    {
      name: "Living Room (Hue Dimmer 1 & Hue Dimmer 2)",
      off: {
        triggers: [
          hueTrigger("off", lookupDeviceId("hue_dimmer_1")),
          hueTrigger("off", lookupDeviceId("hue_dimmer_2")),
        ],
        action: lightOffAction("07c0a512d5c8df0c90018954b8bce3fe"),
      },
      on: {
        triggers: [
          hueTrigger("on", lookupDeviceId("hue_dimmer_1")),
          hueTrigger("on", lookupDeviceId("hue_dimmer_2")),
        ],
        actions: [
          activateScene("scene.nur_sofa"),
          activateScene("scene.wohnzimmer_hell"),
          activateScene("scene.esstisch"),
        ],
      },
    },
    {
      name: "Office (Rodret Dimmer)",
      off: {
        triggers: [commonTrigger("off", lookupDeviceId("rodret_dimmer_1"))],
        action: lightOffAction("65159a1add4f22b453f312828a60de04"),
      },
      on: {
        triggers: [commonTrigger("on", lookupDeviceId("rodret_dimmer_1"))],
        actions: () => {
          if (between(8, 0, 0, 17, 0, 0)) {
            return [
              activateScene("scene.floris_schreibtisch"),
              activateScene("scene.buro_hell"),
              activateScene("scene.floris_schreibtisch_abends"),
            ];
          }

          return [
            activateScene("scene.floris_schreibtisch_abends"),
            activateScene("scene.buro_hell"),
            activateScene("scene.floris_schreibtisch"),
          ];
        },
      },
    },
    {
      name: "Bedroom (Styrbar Dimmer & Hue Knob)",
      off: {
        triggers: [
          commonTrigger("off", "b59909d8bb039e1d435e9327d33a36bd"),
          commonTrigger("off", "1152f655957a1e74f5863ffb4a5978b3"),
        ],
        action: lightOffAction("190b8ce529f36125501677d97dff4f91"),
      },
      on: {
        triggers: [commonTrigger("on", "b59909d8bb039e1d435e9327d33a36bd")],
        actions: bedroomOnActions,
      },
    },
  ],
  verbose: process.env.VERBOSE === "true",
};

// Suites Philips Hue Dimmer Switch (4 buttons )
function hueTrigger(state: "on" | "off", deviceId: string) {
  return trigger(state + "_press", deviceId);
}

// Suites IKEA Rodret, IKEA Styrbar and Philips Hue Smart Button
function commonTrigger(state: "on" | "off", deviceId: string) {
  return trigger(state, deviceId);
}

function lightOffAction(deviceId: string) {
  return {
    domain: "light",
    service: "turn_off",
    target: {
      device_id: deviceId,
    },
  };
}

function trigger(subtype: string, deviceId: string) {
  return {
    trigger: "device",
    domain: "mqtt",
    device_id: deviceId,
    type: "action",
    subtype: subtype,
  };
}

function activateScene(sceneId: string) {
  return {
    domain: "scene",
    service: "turn_on",
    target: {
      entity_id: sceneId,
    },
  };
}

function before(h: number, m: number, s: number): boolean {
  const now = new Date();

  return (
    toSeconds(now.getHours(), now.getMinutes(), now.getSeconds()) <
    toSeconds(h, m, s)
  );
}

// If the end time is smaller than the start time, the range is treated as
// spanning midnight, e.g. between(22, 0, 0, 6, 0, 0).
function between(
  h1: number,
  m1: number,
  s1: number,
  h2: number,
  m2: number,
  s2: number,
): boolean {
  const now = new Date();
  const nowSeconds = toSeconds(
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );
  const start = toSeconds(h1, m1, s1);
  const end = toSeconds(h2, m2, s2);

  if (start <= end) {
    return start <= nowSeconds && nowSeconds < end;
  }

  return start <= nowSeconds || nowSeconds < end;
}

function after(h: number, m: number, s: number): boolean {
  const now = new Date();

  return (
    toSeconds(now.getHours(), now.getMinutes(), now.getSeconds()) >=
    toSeconds(h, m, s)
  );
}

function toSeconds(h: number, m: number, s: number): number {
  return (h * 60 + m) * 60 + s;
}
