import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Socket } from "http";

export interface ResearchEvent {
  type:
    | "research:start"
    | "phase:start"
    | "phase:complete"
    | "phase:error"
    | "research:complete"
    | "research:error";
  phase?: string;
  phaseIndex?: number;
  totalPhases?: number;
  projectId?: string;
  hypothesisId?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export class EventBroadcaster {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  attach(server: ReturnType<typeof import("@hono/node-server").createAdaptorServer>): void {
    this.wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = new URL(request.url || "/", `http://${request.headers.host}`);
      if (url.pathname === "/ws") {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.clients.add(ws);
          ws.on("close", () => this.clients.delete(ws));
          ws.on("error", () => this.clients.delete(ws));
        });
      }
    });
  }

  broadcast(event: ResearchEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  emit(type: ResearchEvent["type"], partial: Omit<ResearchEvent, "type" | "timestamp">): void {
    this.broadcast({ ...partial, type, timestamp: new Date().toISOString() });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
