import { io, type Socket } from "socket.io-client";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export function createRoomSocket(): Socket {
  return io(backendUrl, {
    transports: ["websocket", "polling"]
  });
}
