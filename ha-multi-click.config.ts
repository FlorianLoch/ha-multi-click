if (process.env.HA_TOKEN === undefined) {
  throw new Error("HA_TOKEN environment variable is not set");
}

module.exports = {
  homeAssistantURL: "http://192.168.178.4:8123",
  longLivedToken: process.env.HA_TOKEN,
  buttons: [
    {
      name: "Living Room Hue Dimmer",
      off: {
        trigger: hueTrigger("off", "9f9fb2dd477999c5183eb67b82c208e5"),
        action: lightOffAction("07c0a512d5c8df0c90018954b8bce3fe"),
      },
      on: {
        trigger: hueTrigger("on", "9f9fb2dd477999c5183eb67b82c208e5"),
        actions: [
          activateScene("scene.nur_sofa"),
          activateScene("scene.wohnzimmer_hell"),
        ],
      },
    },
    {
      name: "Office Hue Dimmer",
      off: {
        trigger: hueTrigger("off", "660eeac1daf54cd24f70057735f36acd"),
        action: lightOffAction("65159a1add4f22b453f312828a60de04"),
      },
      on: {
        trigger: hueTrigger("on", "660eeac1daf54cd24f70057735f36acd"),
        actions: () => {
          if (between(8, 0, 0, 18, 0, 0)) {
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
  ],
  verbose: process.env.VERBOSE === "true",
};

function hueTrigger(state: "on" | "off", deviceId: string) {
  return trigger(state + "-press", deviceId);
}

function rodretTrigger(state: "on" | "off", deviceId: string) {
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
    toSeconds(h, m, s) <
    toSeconds(now.getHours(), now.getMinutes(), now.getSeconds())
  );
}

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

  return (
    toSeconds(h1, m1, s1) <= nowSeconds && nowSeconds < toSeconds(h2, m2, s2)
  );
}

function after(h: number, m: number, s: number): boolean {
  const now = new Date();

  return (
    toSeconds(h, m, s) >=
    toSeconds(now.getHours(), now.getMinutes(), now.getSeconds())
  );
}

function toSeconds(h: number, m: number, s: number): number {
  return (h * 60 + m) * 60 + s;
}
