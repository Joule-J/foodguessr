import type { AddressInfo } from "node:net";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";

import { createServer } from "../src/server";

type RoomSnapshot = {
  roomCode: string;
  roomStatus: "WAITING_FOR_PLAYER" | "IN_PROGRESS" | "COMPLETED";
  selfMemberId: string;
  selfName: string;
  members: Array<{ id: string; name: string }>;
  messages: Array<{ text: string }>;
  session: {
    id: string;
    status: "IN_PROGRESS" | "COMPLETED";
    totalScore: number;
    solvedRounds: Array<{
      dishTitle: string;
      dishImageUrl: string;
      countryName: string;
    }>;
    currentRound: {
      dish: {
        imageUrl: string;
      };
    } | null;
  };
};

let app: Awaited<ReturnType<typeof createServer>>["app"];
let server: Awaited<ReturnType<typeof createServer>>["server"];
let baseUrl = "";
const sockets: Socket[] = [];

function waitForSocketEvent<T>(socket: Socket, eventName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 5000);

    socket.once(eventName, (payload: T) => {
      clearTimeout(timeoutId);
      resolve(payload);
    });
  });
}

async function connectRoomSocket(roomCode: string, memberId: string) {
  const socket = createSocketClient(baseUrl, {
    transports: ["websocket"]
  });
  sockets.push(socket);

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });

  const initialSnapshotPromise = waitForSocketEvent<RoomSnapshot>(socket, "room:updated");
  socket.emit("room:subscribe", { roomCode, memberId });
  await initialSnapshotPromise;

  return socket;
}

async function findCorrectCountryId(imageUrl: string) {
  const dishesResponse = await request(app).get("/api/admin/dishes");
  const currentDish = dishesResponse.body.find(
    (dish: { imageUrl: string; country: { id: string } }) => dish.imageUrl === imageUrl
  ) as { country: { id: string } } | undefined;

  if (!currentDish) {
    throw new Error("Could not find matching dish.");
  }

  return currentDish.country.id;
}

beforeAll(async () => {
  const serverBundle = await createServer();
  app = serverBundle.app;
  server = serverBundle.server;

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  sockets.forEach((socket) => socket.disconnect());

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

describe("room routes", () => {
  test("room creation starts in waiting state", async () => {
    const createResponse = await request(app).post("/api/rooms").send({ name: "Host" });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.roomStatus).toBe("WAITING_FOR_PLAYER");
    expect(createResponse.body.members).toHaveLength(1);
    expect(createResponse.body.session.currentRound).not.toHaveProperty("debugCountryName");
  });

  test("joining a room starts the match and broadcasts the member join", async () => {
    const createResponse = await request(app).post("/api/rooms").send({ name: "Host" });
    const hostRoom = createResponse.body as RoomSnapshot;
    const hostSocket = await connectRoomSocket(hostRoom.roomCode, hostRoom.selfMemberId);
    const joinEventPromise = waitForSocketEvent<RoomSnapshot>(hostSocket, "room:member_joined");

    const joinResponse = await request(app)
      .post("/api/rooms/join")
      .send({ code: hostRoom.roomCode, name: "Guest" });

    expect(joinResponse.status).toBe(200);
    expect(joinResponse.body.roomStatus).toBe("IN_PROGRESS");

    const joinEvent = await joinEventPromise;
    expect(joinEvent.roomStatus).toBe("IN_PROGRESS");
    expect(joinEvent.members).toHaveLength(2);
  });

  test("guessing before player 2 joins is rejected", async () => {
    const createResponse = await request(app).post("/api/rooms").send({ name: "SoloHost" });
    const room = createResponse.body as RoomSnapshot;
    const countriesResponse = await request(app).get("/api/countries");

    const response = await request(app)
      .post(`/api/rooms/${room.roomCode}/guesses`)
      .send({ memberId: room.selfMemberId, countryId: countriesResponse.body[0].id });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Waiting for a second player.");
  });

  test("player 2 can submit a country guess", async () => {
    const createResponse = await request(app).post("/api/rooms").send({ name: "Host" });
    const joinResponse = await request(app)
      .post("/api/rooms/join")
      .send({ code: createResponse.body.roomCode, name: "Guest" });
    const guestRoom = joinResponse.body as RoomSnapshot;
    const countriesResponse = await request(app).get("/api/countries");
    const correctCountryId = await findCorrectCountryId(
      guestRoom.session.currentRound!.dish.imageUrl
    );
    const wrongCountry = (
      countriesResponse.body as Array<{ id: string }>
    ).find((country) => country.id !== correctCountryId);

    const response = await request(app)
      .post(`/api/rooms/${guestRoom.roomCode}/guesses`)
      .send({
        memberId: guestRoom.selfMemberId,
        countryId: wrongCountry?.id
      });

    expect(response.status).toBe(200);
    expect(response.body.room.selfMemberId).toBe(guestRoom.selfMemberId);
    expect(response.body.room.session.currentRound.guesses).toHaveLength(1);
  });

  test("chat messages broadcast to connected room members", async () => {
    const createResponse = await request(app).post("/api/rooms").send({ name: "Host" });
    const hostRoom = createResponse.body as RoomSnapshot;
    const hostSocket = await connectRoomSocket(hostRoom.roomCode, hostRoom.selfMemberId);
    const joinResponse = await request(app)
      .post("/api/rooms/join")
      .send({ code: hostRoom.roomCode, name: "Guest" });
    const guestRoom = joinResponse.body as RoomSnapshot;
    const guestSocket = await connectRoomSocket(guestRoom.roomCode, guestRoom.selfMemberId);

    const hostMessagePromise = waitForSocketEvent<RoomSnapshot>(hostSocket, "room:message_added");
    const guestMessagePromise = waitForSocketEvent<RoomSnapshot>(guestSocket, "room:message_added");

    const messageResponse = await request(app)
      .post(`/api/rooms/${hostRoom.roomCode}/messages`)
      .send({ memberId: hostRoom.selfMemberId, text: "Check the spices list." });

    expect(messageResponse.status).toBe(201);
    expect(messageResponse.body.messages.at(-1)?.text).toBe("Check the spices list.");

    const [hostEvent, guestEvent] = await Promise.all([hostMessagePromise, guestMessagePromise]);
    expect(hostEvent.messages.at(-1)?.text).toBe("Check the spices list.");
    expect(guestEvent.messages.at(-1)?.text).toBe("Check the spices list.");
  });

  test("valid guesses broadcast room updates and completed rooms reject extra guesses", async () => {
    const createResponse = await request(app).post("/api/rooms").send({ name: "Host" });
    const hostRoom = createResponse.body as RoomSnapshot;
    const hostSocket = await connectRoomSocket(hostRoom.roomCode, hostRoom.selfMemberId);
    const joinResponse = await request(app)
      .post("/api/rooms/join")
      .send({ code: hostRoom.roomCode, name: "Guest" });

    let room = joinResponse.body as RoomSnapshot;
    const chatResponse = await request(app)
      .post(`/api/rooms/${room.roomCode}/messages`)
      .send({ memberId: room.selfMemberId, text: "Keep this chat." });

    expect(chatResponse.status).toBe(201);
    const firstCorrectCountryId = await findCorrectCountryId(room.session.currentRound!.dish.imageUrl);
    const guessEventPromise = waitForSocketEvent<
      RoomSnapshot & { guessResult: { correct: boolean } }
    >(hostSocket, "room:guess_submitted");

    const firstGuessResponse = await request(app)
      .post(`/api/rooms/${room.roomCode}/guesses`)
      .send({ memberId: room.selfMemberId, countryId: firstCorrectCountryId });

    expect(firstGuessResponse.status).toBe(200);

    const guessEvent = await guessEventPromise;
    expect(guessEvent.guessResult.correct).toBe(true);
    expect(guessEvent.roomStatus).toBe("IN_PROGRESS");

    room = firstGuessResponse.body.room as RoomSnapshot;

    while (room.session.status !== "COMPLETED") {
      const correctCountryId = await findCorrectCountryId(room.session.currentRound!.dish.imageUrl);
      const solveResponse = await request(app)
        .post(`/api/rooms/${room.roomCode}/guesses`)
        .send({ memberId: room.selfMemberId, countryId: correctCountryId });

      expect(solveResponse.status).toBe(200);
      room = solveResponse.body.room as RoomSnapshot;
    }

    expect(room.roomStatus).toBe("COMPLETED");
    expect(room.session.solvedRounds).toHaveLength(5);
    expect(
      room.session.solvedRounds.every(
        (round) => round.dishTitle && round.dishImageUrl && round.countryName
      )
    ).toBe(true);

    const extraGuessResponse = await request(app)
      .post(`/api/rooms/${room.roomCode}/guesses`)
      .send({ memberId: room.selfMemberId, countryId: firstCorrectCountryId });

    expect(extraGuessResponse.status).toBe(409);
    expect(extraGuessResponse.body.error).toBe("This room is already complete.");

    const previousSessionId = room.session.id;
    const restartResponse = await request(app)
      .post(`/api/rooms/${room.roomCode}/restart`)
      .send({ memberId: room.selfMemberId });

    expect(restartResponse.status).toBe(200);
    expect(restartResponse.body.roomCode).toBe(room.roomCode);
    expect(restartResponse.body.roomStatus).toBe("IN_PROGRESS");
    expect(restartResponse.body.members).toHaveLength(2);
    expect(restartResponse.body.session.id).not.toBe(previousSessionId);
    expect(restartResponse.body.session.totalScore).toBe(0);
    expect(restartResponse.body.session.solvedRounds).toHaveLength(0);
    expect(restartResponse.body.messages.at(-1)?.text).toBe("Keep this chat.");
  });
});
