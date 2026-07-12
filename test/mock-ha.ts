// A minimal mock of the Home Assistant websocket API: auth handshake, the
// test-event readiness dance, trigger subscriptions and the device registry.
export interface MockHA {
  url: string;
  // device_ids of subscribe_trigger messages (excluding the test event)
  subscribedDeviceIds: Array<string>;
  stop(): void;
}

export const mockDevices = [
  { id: "abc123", name: "Test Dimmer", name_by_user: null },
  { id: "def456", name: "integration name", name_by_user: "Renamed Dimmer" },
  // Decoy: its integration name collides with def456's user-given name, but
  // its *displayed* name is "Something Else", so it must not match.
  { id: "decoy", name: "Renamed Dimmer", name_by_user: "Something Else" },
  // Two devices displayed as "Twin Dimmer" to provoke an ambiguity error.
  { id: "twin1", name: "Twin Dimmer", name_by_user: null },
  { id: "twin2", name: "other name", name_by_user: "Twin Dimmer" },
];

export function startMockHA(): MockHA {
  const subscribedDeviceIds: Array<string> = [];

  const server = Bun.serve<{ testEventSubId: number | null }, {}>({
    port: 0,
    fetch(req, server) {
      if (server.upgrade(req, { data: { testEventSubId: null } })) {
        return;
      }

      return new Response("expected websocket", { status: 400 });
    },
    websocket: {
      open(ws) {
        ws.send(
          JSON.stringify({ type: "auth_required", ha_version: "2025.6.0" }),
        );
      },
      message(ws, raw) {
        const msg = JSON.parse(String(raw));

        const respondSuccess = (result: unknown = null) =>
          ws.send(
            JSON.stringify({
              id: msg.id,
              type: "result",
              success: true,
              result,
            }),
          );

        switch (msg.type) {
          case "auth":
            ws.send(
              JSON.stringify({ type: "auth_ok", ha_version: "2025.6.0" }),
            );
            break;

          case "subscribe_trigger":
            if (msg.trigger?.event_type === "ha-multi-click-test-event") {
              ws.data.testEventSubId = msg.id;
            } else {
              subscribedDeviceIds.push(msg.trigger?.device_id);
            }

            respondSuccess();
            break;

          case "fire_event":
            respondSuccess();

            if (ws.data.testEventSubId !== null) {
              ws.send(
                JSON.stringify({
                  id: ws.data.testEventSubId,
                  type: "event",
                  event: { variables: { trigger: {} } },
                }),
              );
            }
            break;

          case "config/device_registry/list":
            respondSuccess(mockDevices);
            break;

          default:
            if (msg.id) {
              respondSuccess();
            }
        }
      },
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    subscribedDeviceIds,
    stop: () => server.stop(true),
  };
}
