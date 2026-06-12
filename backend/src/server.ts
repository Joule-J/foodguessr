import http from "node:http";

import cors from "cors";
import express from "express";
import { Server as SocketServer } from "socket.io";
import { z } from "zod";

import { getConfig } from "./config";
import { createCatalogCountries } from "./data/country-catalog";
import { HttpError } from "./lib/errors";
import { createGameRepository } from "./repositories";
import { countryFlagUrl } from "./services/flags";
import { GameService } from "./services/game-service";
import { ImportService } from "./services/import-service";

export async function createServer() {
  const config = getConfig();
  const repository = createGameRepository({
    databaseUrl: config.databaseUrl
  });
  const gameService = new GameService(repository);
  const importService = new ImportService(repository, config.mealDbBaseUrl);

  await repository.syncCountries(createCatalogCountries());
  await gameService.bootstrapCatalog();

  const app = express();
  app.use(
    cors({
      origin: [config.frontendUrl, "http://localhost:3000"].filter(Boolean)
    })
  );
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
      origin: [config.frontendUrl, "http://localhost:3000"].filter(Boolean),
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    socket.emit("server:ready", {
      mode: "singleplayer-foundation"
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
