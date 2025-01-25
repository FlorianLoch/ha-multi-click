import {
  Connection,
  createConnection,
  createLongLivedTokenAuth,
} from "home-assistant-js-websocket";
import { type Config, monitorConfig } from "./src/config.ts";

let teardownFn: null | (() => Promise<void>) = null;

monitorConfig(async (cfg: Config | Error) => {
  if (cfg instanceof Error) {
    console.error(`Failed to load config file: ${cfg.message}`);

    process.exit(1);
  }

  if (teardownFn !== null) {
    console.log("Config file changed; tearing down previous setup...");

    await teardownFn();
  }

  teardownFn = await up(cfg);
});

process.on("SIGINT", down);
process.on("SIGTERM", down);

// Automatically reload/reconnect every 10 minutes to work-around of possible registering to the event bus before it's
// fully ready.
// In case HA restarts, and we reconnect before all triggers are known to HA, we can register for them without error -
// but they will never fire.
setInterval(
  () => {
    process.kill(process.pid, "SIGHUP");
  },
  60 * 1000 * 10,
);

async function connect(
  cfg: Config,
  initialConnect: boolean,
): Promise<Connection> {
  async function waitForConnection() {
    try {
      console.log("Connecting to Home Assistant...");

      return await createConnection({
        auth: createLongLivedTokenAuth(
          cfg.homeAssistantURL,
          cfg.longLivedToken,
        ),
      });
    } catch (e: any) {
      console.error(`Failed to connect to Home Assistant: ${e.message}`);
      console.log("Retrying in 5 seconds...");

      return new Promise<Connection>((resolve) =>
        setTimeout(() => {
          resolve(waitForConnection());
        }, 5000),
      );
    }
  }

  async function waitForEventBusToBeReady(
    connection: Connection,
    initialConnect: boolean,
  ) {
    return new Promise<void>(async (resolve) => {
      let ready = false;

      const unsubscribeFn = await connection.subscribeMessage(
        () => {
          ready = true;

          console.log("Test event triggered; event bus is ready!");

          // To be very sure, we wait another 30 seconds when reconnecting.
          if (initialConnect) {
            resolve();
          } else {
            setTimeout(resolve, 30_000);
          }
        },
        {
          type: "subscribe_trigger",
          trigger: {
            trigger: "event",
            event_type: "ha-multi-click-test-event",
          },
        },
        { resubscribe: false },
      );

      setTimeout(() => {
        unsubscribeFn();

        if (ready) {
          return;
        }

        console.log(
          "Test event did not fire... Waiting for event bus to become ready...",
        );

        resolve(waitForEventBusToBeReady(connection, initialConnect));
      }, 2000);

      // As documented at https://developers.home-assistant.io/docs/api/websocket/#fire-an-event
      connection.sendMessage({
        type: "fire_event",
        event_type: "ha-multi-click-test-event",
      });
    });
  }

  const connection = await waitForConnection();

  await waitForEventBusToBeReady(connection, initialConnect);

  return connection;
}

async function up(cfg: Config): Promise<() => Promise<void>> {
  let teardownFns = new Array<() => Promise<void>>();

  const _up = async (initialConnect: boolean) => {
    teardownFns = [];

    const connection = await connect(cfg, initialConnect);

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

        teardownFns.push(
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
            { resubscribe: false },
          ),
        );

        teardownFns.push(
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
            { resubscribe: false },
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

      connection.close();

      setImmediate(() => {
        _up(false);
      });
    });

    connection.addEventListener("reconnect-error", (err) => {
      console.error(`Failed to reconnect to Home Assistant: ${err}`);
      console.log("Shutting down...");

      // We delegate the task of restarting to the service manager, i.e. systemd, docker etc.
      down();
    });

    teardownFns.push(() => Promise.resolve(connection.close()));
  };

  await _up(true);

  return async () => {
    console.log("Shutting down...");

    for (const teardownFn of teardownFns) {
      await teardownFn();
    }

    console.log(
      "Called all teardown functions; unsubscribed from all triggers.",
    );
  };
}

async function down() {
  if (teardownFn !== null) {
    await teardownFn();
  }

  process.exit(0);
}
