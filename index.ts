import {
  Connection,
  createConnection,
  createLongLivedTokenAuth,
} from "home-assistant-js-websocket";
import { type Config, monitorConfig } from "./src/config.ts";

let teardownFn: null | (() => Promise<void>) = null;

monitorConfig(async (c: Config | Error) => {
  if (c instanceof Error) {
    console.error(`Failed to load config file: ${c.message}`);

    process.exit(1);
  }

  if (teardownFn !== null) {
    await teardownFn();
  }

  teardownFn = await up(c);
});

process.on("SIGINT", down);
process.on("SIGTERM", down);

async function up(cfg: Config): Promise<() => Promise<void>> {
  const unsubscribeFns = new Array<() => Promise<void>>();

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

  await Promise.all(
    cfg.buttons.map(async (button) => {
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

            // We need this safeguard because the length of the actions array might have changed since the
            // last iteration and count could be out of bounds.
            const action = onActions[Math.min(count, onActions.length - 1)];

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
          { resubscribe: true },
        ),
      );

      unsubscribeFns.push(
        await connection!.subscribeMessage(
          (_) => {
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
          { resubscribe: true },
        ),
      );
    }),
  );

  connection.addEventListener("ready", () => {
    // Will not be called for the initial establishing of a connection
    console.log(`Reconnected to Home Assistant at ${cfg.homeAssistantURL}`);
  });

  connection.addEventListener("disconnected", () => {
    console.log("Disconnected from Home Assistant. Reconnecting...");
  });

  connection.addEventListener("reconnect-error", (err) => {
    console.error(`Failed to reconnect to Home Assistant: ${err}`);
    console.log("Shutting down...");

    // We delegate the task of restarting to the service manager, i.e. systemd, docker etc.
    down()
  });

  return async () => {
    console.log("Shutting down...");

    for (const unsubscribe of unsubscribeFns) {
      await unsubscribe();
    }

    console.log("Unsubscribed from all triggers.");

    connection.close();
  };
}

async function down() {
  if (teardownFn !== null) {
    await teardownFn();
  }

  process.exit(0);
}
