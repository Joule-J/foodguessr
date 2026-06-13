import http from "node:http";

import cors from "cors";
import express from "express";
import { Server as SocketServer } from "socket.io";
import { z } from "zod";

import { getConfig } from "./config";
import { createCatalogCountries } from "./data/country-catalog";
import { HttpError } from "./lib/errors";
import { createGameRepository } from "./repositories";
import { DishImageEnricher } from "./services/dish-image-enricher";
import { countryFlagUrl } from "./services/flags";
import { GameService } from "./services/game-service";
import { ImportService } from "./services/import-service";
import { RoomService } from "./services/room-service";

function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000") {
    return true;
  }

  try {
    const url = new URL(origin);
    return url.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export async function createServer(input?: {
  fetcher?: typeof fetch;
  configOverrides?: Partial<ReturnType<typeof getConfig>>;
}) {
  const config = {
    ...getConfig(),
    ...input?.configOverrides
  };
  const repository = createGameRepository({
    databaseUrl: config.databaseUrl
  });
  const imageEnricher = new DishImageEnricher(
    config.wikipediaRestBaseUrl,
    config.wikipediaActionApiUrl,
    input?.fetcher
  );
  const importService = new ImportService(
    repository,
    config.mealDbBaseUrl,
    imageEnricher,
    input?.fetcher
  );
  const roomService = new RoomService();
  const gameService = new GameService(
    repository,
    config.liveMealDbSessionImportEnabled ? importService : undefined
  );
  const allowedOrigins = Array.from(
    new Set([...config.frontendUrls, config.frontendUrl, "http://localhost:3000"])
  ).filter(Boolean);

  await repository.syncCountries(createCatalogCountries());
  await gameService.bootstrapCatalog();

  const app = express();
  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin, allowedOrigins)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin not allowed: ${origin ?? "unknown"}`));
      }
    })
  );
  app.options(/.*/, cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      storage: config.databaseUrl ? "prisma" : "in-memory"
    });
  });

  app.get("/api/countries", async (_request, response, next) => {
    try {
      const countries = await gameService.listCountries();
      response.json(
        countries.map((country) => ({
          id: country.id,
          name: country.name,
          iso2: country.iso2,
          flagUrl: countryFlagUrl(country.iso2)
        }))
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions", async (_request, response, next) => {
    try {
      const session = await gameService.createSession();
      response.status(201).json(session);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/rooms", async (_request, response, next) => {
    try {
      const body = z
        .object({
          name: z.string().trim().min(2).max(24)
        })
        .parse(_request.body);

      const session = await gameService.createSession();
      const sessionRecord = await repository.getSession(session.id);

      if (!sessionRecord) {
        throw new HttpError(500, "Failed to initialize room session.");
      }

      const { room, selfMember } = roomService.createRoom(sessionRecord, body.name);
      roomService.syncRoomStatus(room.code, sessionRecord.status);
      response.status(201).json({
        ...roomService.toClientPayload(room, selfMember.id),
        session
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/rooms/join", async (request, response, next) => {
    try {
      const body = z
        .object({
          code: z.string().trim().min(4).max(10),
          name: z.string().trim().min(2).max(24)
        })
        .parse(request.body);

      const joined = roomService.joinRoom(body.code, body.name);

      if (!joined) {
        throw new HttpError(404, "Room not found.");
      }

      const session = await gameService.getSession(joined.room.sessionId);
      roomService.syncRoomStatus(joined.room.code, session.status);
      const snapshot = {
        ...roomService.toClientPayload(joined.room, joined.selfMember.id),
        session
      };

      io.to(joined.room.code).emit("room:member_joined", snapshot);
      io.to(joined.room.code).emit("room:updated", snapshot);

      response.json(snapshot);
    } catch (error) {
      if (error instanceof Error && error.message === "Room is full.") {
        next(new HttpError(409, error.message));
        return;
      }
      if (error instanceof Error && error.message === "Room is already complete.") {
        next(new HttpError(409, error.message));
        return;
      }
      next(error);
    }
  });

  app.get("/api/rooms/:code", async (request, response, next) => {
    try {
      const memberId = z.string().min(1).parse(request.query.memberId);
      const room = roomService.findRoom(request.params.code);

      if (!room) {
        throw new HttpError(404, "Room not found.");
      }

      const session = await gameService.getSession(room.sessionId);
      roomService.syncRoomStatus(room.code, session.status);
      response.json({
        ...roomService.toClientPayload(room, memberId),
        session
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/rooms/:code/messages", async (request, response, next) => {
    try {
      const body = z
        .object({
          memberId: z.string().min(1),
          text: z.string().trim().min(1).max(280),
          replyToMessageId: z.string().min(1).optional()
        })
        .parse(request.body);

      const room = roomService.findRoom(request.params.code);

      if (!room) {
        throw new HttpError(404, "Room not found.");
      }

      if (room.status === "COMPLETED") {
        throw new HttpError(409, "This room is already complete.");
      }

      const member = roomService.getMember(request.params.code, body.memberId);

      if (!member) {
        throw new HttpError(404, "Room member not found.");
      }

      let message;
      try {
        message = roomService.addMessage(
          request.params.code,
          body.memberId,
          body.text,
          body.replyToMessageId
        );
      } catch (error) {
        if (error instanceof Error && error.message === "Reply target not found.") {
          throw new HttpError(404, "Reply target not found.");
        }

        throw error;
      }

      if (!message) {
        throw new HttpError(404, "Room member not found.");
      }

      const session = await gameService.getSession(room.sessionId);
      roomService.syncRoomStatus(room.code, session.status);
      const snapshot = {
        ...roomService.toClientPayload(room, member.id),
        session
      };

      io.to(room.code).emit("room:message_added", snapshot);
      io.to(room.code).emit("room:updated", snapshot);

      response.status(201).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/rooms/:code/messages/:messageId/reactions", async (request, response, next) => {
    try {
      const body = z
        .object({
          memberId: z.string().min(1),
          emoji: z.string().trim().min(1).max(32)
        })
        .parse(request.body);

      const room = roomService.findRoom(request.params.code);

      if (!room) {
        throw new HttpError(404, "Room not found.");
      }

      const member = roomService.getMember(request.params.code, body.memberId);

      if (!member) {
        throw new HttpError(404, "Room member not found.");
      }

      try {
        roomService.addReaction(request.params.code, body.memberId, request.params.messageId, body.emoji);
      } catch (error) {
        if (error instanceof Error && error.message === "Message not found.") {
          throw new HttpError(404, "Message not found.");
        }

        throw error;
      }

      const session = await gameService.getSession(room.sessionId);
      roomService.syncRoomStatus(room.code, session.status);
      const snapshot = {
        ...roomService.toClientPayload(room, member.id),
        session
      };

      io.to(room.code).emit("room:message_added", snapshot);
      io.to(room.code).emit("room:updated", snapshot);

      response.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions/:id", async (request, response, next) => {
    try {
      const session = await gameService.getSession(request.params.id);
      response.json(session);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/guesses", async (request, response, next) => {
    try {
      const body = z
        .object({
          countryId: z.string().min(1)
        })
        .parse(request.body);

      const result = await gameService.submitGuess(request.params.id, body.countryId);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/rooms/:code/guesses", async (request, response, next) => {
    try {
      const body = z
        .object({
          memberId: z.string().min(1),
          countryId: z.string().min(1)
        })
        .parse(request.body);

      const room = roomService.findRoom(request.params.code);

      if (!room) {
        throw new HttpError(404, "Room not found.");
      }

      const member = roomService.getMember(request.params.code, body.memberId);

      if (!member) {
        throw new HttpError(404, "Room member not found.");
      }

      if (room.status === "COMPLETED") {
        throw new HttpError(409, "This room is already complete.");
      }

      if (room.status === "WAITING_FOR_PLAYER") {
        throw new HttpError(409, "Waiting for a second player.");
      }

      const result = await gameService.submitGuess(room.sessionId, body.countryId);
      roomService.syncRoomStatus(room.code, result.session.status);

      const snapshot = {
        ...roomService.toClientPayload(room, member.id),
        session: result.session
      };

      io.to(room.code).emit("room:guess_submitted", {
        ...snapshot,
        guessResult: result.guessResult,
        actorMemberId: member.id
      });
      io.to(room.code).emit("room:updated", snapshot);

      if (result.guessResult.roundEnded) {
        io.to(room.code).emit("room:round_solved", {
          ...snapshot,
          guessResult: result.guessResult,
          actorMemberId: member.id
        });
      }

      if (result.session.status === "COMPLETED") {
        io.to(room.code).emit("room:completed", {
          ...snapshot,
          guessResult: result.guessResult,
          actorMemberId: member.id
        });
      }

      response.json({
        ...result,
        room: snapshot
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/rooms/:code/restart", async (request, response, next) => {
    try {
      const body = z
        .object({
          memberId: z.string().min(1)
        })
        .parse(request.body);
      const room = roomService.findRoom(request.params.code);

      if (!room) {
        throw new HttpError(404, "Room not found.");
      }

      const member = roomService.getMember(room.code, body.memberId);

      if (!member) {
        throw new HttpError(404, "Room member not found.");
      }

      const currentSession = await gameService.getSession(room.sessionId);

      if (currentSession.status !== "COMPLETED") {
        throw new HttpError(409, "The current match is not complete.");
      }

      const session = await gameService.createSession();
      const sessionRecord = await repository.getSession(session.id);

      if (!sessionRecord) {
        throw new HttpError(500, "Failed to restart room session.");
      }

      const restartedRoom = roomService.restartRoom(room.code, sessionRecord);

      if (!restartedRoom) {
        throw new HttpError(404, "Room not found.");
      }

      const snapshot = {
        ...roomService.toClientPayload(restartedRoom, member.id),
        session
      };

      io.to(restartedRoom.code).emit("room:restarted", snapshot);
      io.to(restartedRoom.code).emit("room:updated", snapshot);
      response.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/import/themealdb", async (_request, response, next) => {
    try {
      const result = await importService.importThemealdb();
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/dishes", async (_request, response, next) => {
    try {
      const dishes = await gameService.listDishes();
      response.json(
        dishes.map((dish) => ({
          id: dish.id,
          title: dish.title,
          areaRaw: dish.areaRaw,
          imageUrl: dish.imageUrl,
          imageGallery: dish.imageGallery,
          isPlayable: dish.isPlayable,
          needsReview: dish.needsReview,
          country: {
            id: dish.country.id,
            name: dish.country.name
          }
        }))
      );
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/dishes/:id", async (request, response, next) => {
    try {
      const body = z
        .object({
          countryId: z.string().min(1).optional(),
          isPlayable: z.boolean().optional(),
          needsReview: z.boolean().optional()
        })
        .parse(request.body);

      const dish = await gameService.updateDish(request.params.id, body);
      response.json(dish);
    } catch (error) {
      next(error);
    }
  });

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction
    ) => {
      if (error instanceof HttpError) {
        response.status(error.statusCode).json({ error: error.message });
        return;
      }

      if (error instanceof z.ZodError) {
        response.status(400).json({
          error: "Invalid request payload.",
          issues: error.flatten()
        });
        return;
      }

      console.error(error);
      response.status(500).json({ error: "Internal server error." });
    }
  );

  const server = http.createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin, allowedOrigins)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin not allowed: ${origin ?? "unknown"}`));
      },
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    socket.on("room:subscribe", async (payload) => {
      try {
        const parsed = z
          .object({
            roomCode: z.string().trim().min(4).max(10),
            memberId: z.string().min(1)
          })
          .parse(payload);

        const room = roomService.findRoom(parsed.roomCode);

        if (!room) {
          socket.emit("room:error", { error: "Room not found." });
          return;
        }

        const member = roomService.getMember(parsed.roomCode, parsed.memberId);

        if (!member) {
          socket.emit("room:error", { error: "Room member not found." });
          return;
        }

        socket.join(room.code);
        const session = await gameService.getSession(room.sessionId);
        roomService.syncRoomStatus(room.code, session.status);

        socket.emit("room:updated", {
          ...roomService.toClientPayload(room, member.id),
          session
        });
      } catch {
        socket.emit("room:error", { error: "Invalid room subscription." });
      }
    });
  });

  return {
    app,
    server,
    io,
    repository,
    config
  };
}
