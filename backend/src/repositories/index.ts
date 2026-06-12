import { PrismaClient } from "@prisma/client";

import { InMemoryRepository } from "./in-memory-repository";
import { PrismaRepository } from "./prisma-repository";
import type { GameRepository } from "./types";

export function createGameRepository(input: {
  databaseUrl?: string;
}): GameRepository {
  if (!input.databaseUrl) {
    return new InMemoryRepository();
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: input.databaseUrl
      }
    }
  });

  return new PrismaRepository(prisma);
}
