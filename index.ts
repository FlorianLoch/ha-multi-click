import {
  createConnection,
  createLongLivedTokenAuth,
} from "home-assistant-js-websocket";
import {
  type Config,
  loadConfig,
  type ObjectWithStringKeys,
} from "./src/config.ts";

let cfg: Config;
try {
  cfg = loadConfig();
} catch (e: any) {
  console.error(`Failed to load config file: ${e.toString()}`);

  process.exit(1);
}

const connection = await createConnection({
  auth: createLongLivedTokenAuth(cfg.homeAssistantURL, cfg.longLivedToken),
});

const sendAction = (action: any) => {
  connection.sendMessage({
    type: "call_service", // seems to be the only valid type; therefore, we set it here
    ...action,
  });
};

console.log(`Connected to Home Assistant at ${cfg.homeAssistantURL}`);

const unsubscribeFns = new Array<() => Promise<void>>();

cfg.buttons.forEach(async (button) => {
  let count = 0;
  let lastChange = new Date();

  unsubscribeFns.push(
    await connection.subscribeMessage(
      (_) => {
        cfg.verbose && console.log(`Received 'on' for '${button.name}'`);

        const onActions =
          typeof button.on.actions === "function"
            ? button.on.actions()
            : button.on.actions;
        
        const action = onActions[count];

        count = (count + 1) % onActions.length;
        lastChange = new Date();

        sendAction(action);
      },
      {
        type: "subscribe_trigger",
        trigger: {
          ...button.on.trigger,
        },
      },
    ),
  );

  unsubscribeFns.push(
    await connection.subscribeMessage(
      (result) => {
        cfg.verbose && console.log(`Received 'off' for '${button.name}'`);

        count = 0;
        lastChange = new Date();

        sendAction(button.off.action);
      },
      {
        type: "subscribe_trigger",
        trigger: {
          ...button.off.trigger,
        },
      },
    ),
  );
});

const shutdown = async () => {
  console.log("Shutting down...");

  for (const unsubscribe of unsubscribeFns) {
    await unsubscribe();
  }

  console.log("Unsubscribed from all triggers. Exiting...");

  connection.close();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
