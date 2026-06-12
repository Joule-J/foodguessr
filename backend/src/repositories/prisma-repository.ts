import { PrismaClient, RoundStatus, SessionStatus } from "@prisma/client";

import type {
  CountryRecord,
  CountrySeed,
  DishRecord,
  DishSeed,
  SessionRecord
} from "../domain";
import type {
  GameRepository,
  DishUsageStat,
  GuessCreateInput,
  RoundFinalizeInput,
  SessionProgressUpdate,
  SessionRoundSeed
} from "./types";

const sessionInclude = {
  rounds: {
    orderBy: { roundIndex: "asc" as const },
    include: {
      dish: {
        include: {
          country: true
        }
      },
      targetCountry: true,
      guesses: {
        orderBy: { createdAt: "asc" as const },
        include: {
          guessedCountry: true
        }
      }
    }
  }
};

export class PrismaRepository implements GameRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async syncCountries(countries: CountrySeed[]) {
    for (const country of countries) {
      await this.prisma.country.upsert({
        where: { iso2: country.iso2 },
        update: {
          name: country.name,
          latitude: country.latitude,
          longitude: country.longitude,
          alpha3: country.alpha3,
          aliases: country.aliases
        },
        create: {
          name: country.name,
          iso2: country.iso2,
          alpha3: country.alpha3,
          latitude: country.latitude,
          longitude: country.longitude,
          aliases: country.aliases
        }
      });
    }
  }

  async listCountries() {
    const countries = await this.prisma.country.findMany({
      orderBy: { name: "asc" }
    });
    return countries.map(mapCountry);
  }

  async getCountryById(countryId: string) {
    const country = await this.prisma.country.findUnique({
      where: { id: countryId }
    });

    return country ? mapCountry(country) : null;
  }

  async getDishByMealDbId(mealDbId: string) {
    const dish = await this.prisma.dish.findUnique({
      where: { mealDbId },
      include: {
        country: true
      }
    });

    return dish ? mapDish(dish) : null;
  }

  async upsertDishes(dishes: DishSeed[]) {
    for (const dish of dishes) {
      await this.prisma.dish.upsert({
        where: { mealDbId: dish.mealDbId },
        update: {
          title: dish.title,
          areaRaw: dish.areaRaw,
          imageUrl: dish.imageUrl,
          imageGallery: dish.imageGallery,
          instructions: dish.instructions,
          ingredients: dish.ingredients,
          isPlayable: dish.isPlayable,
          needsReview: dish.needsReview,
          countryId: dish.countryId
        },
        create: dish
      });
    }
  }

  async listDishes() {
    const dishes = await this.prisma.dish.findMany({
      include: {
        country: true
      },
      orderBy: { title: "asc" }
    });
    return dishes.map(mapDish);
  }

  async listPlayableDishes() {
    const dishes = await this.prisma.dish.findMany({
      where: {
        isPlayable: true,
        needsReview: false
      },
      include: {
        country: true
      }
    });
    return dishes.map(mapDish);
  }

  async listPlayableDishesByCountry(countryId: string) {
    const dishes = await this.prisma.dish.findMany({
      where: {
        countryId,
        isPlayable: true,
        needsReview: false
      },
      include: {
        country: true
      }
    });

    return dishes.map(mapDish);
  }

  async listDishUsageStats(): Promise<DishUsageStat[]> {
    const stats = await this.prisma.round.groupBy({
      by: ["dishId"],
      _count: {
        _all: true
      },
      _max: {
        createdAt: true
      }
    });

    return stats.map((item) => ({
      dishId: item.dishId,
      timesUsed: item._count._all,
      lastUsedAt: item._max.createdAt
    }));
  }

  async updateDish(
    dishId: string,
    patch: { countryId?: string; isPlayable?: boolean; needsReview?: boolean }
  ) {
    const exists = await this.prisma.dish.findUnique({ where: { id: dishId } });
    if (!exists) {
      return null;
    }

    const updated = await this.prisma.dish.update({
      where: { id: dishId },
      data: patch,
      include: {
        country: true
      }
    });

    return mapDish(updated);
  }

  async createSession(rounds: SessionRoundSeed[]) {
    const session = await this.prisma.gameSession.create({
      data: {
        rounds: {
          create: rounds.map((round) => ({
            roundIndex: round.roundIndex,
            dishId: round.dishId,
            targetCountryId: round.targetCountryId
          }))
        }
      },
      include: sessionInclude
    });

    return mapSession(session);
  }

  async getSession(sessionId: string) {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude
    });

    return session ? mapSession(session) : null;
  }

  async createGuess(input: GuessCreateInput) {
    await this.prisma.guess.create({
      data: input
    });
  }

  async finalizeRound(input: RoundFinalizeInput) {
    await this.prisma.round.update({
      where: { id: input.roundId },
      data: {
        status: RoundStatus.SOLVED,
        totalPenalty: input.totalPenalty,
        roundScore: input.roundScore,
        revealCountryName: input.revealCountryName,
        solvedAt: new Date()
      }
    });
  }

  async updateSessionProgress(update: SessionProgressUpdate) {
    await this.prisma.gameSession.update({
      where: { id: update.sessionId },
      data: {
        totalScore: update.totalScore,
        currentRoundIndex: update.currentRoundIndex,
        status:
          update.status === "COMPLETED"
            ? SessionStatus.COMPLETED
            : SessionStatus.IN_PROGRESS
      }
    });
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}

function mapCountry(country: {
  id: string;
  name: string;
  iso2: string;
  alpha3: string;
  latitude: number;
  longitude: number;
  aliases: unknown;
}): CountryRecord {
  return {
    id: country.id,
    name: country.name,
    iso2: country.iso2,
    alpha3: country.alpha3,
    latitude: country.latitude,
    longitude: country.longitude,
    aliases: Array.isArray(country.aliases) ? country.aliases.map(String) : []
  };
}

function mapDish(dish: {
  id: string;
  mealDbId: string;
  title: string;
  areaRaw: string;
  imageUrl: string;
  imageGallery: string[];
  instructions: string;
  ingredients: unknown;
  isPlayable: boolean;
  needsReview: boolean;
  countryId: string;
  country: {
    id: string;
    name: string;
    iso2: string;
    alpha3: string;
    latitude: number;
    longitude: number;
    aliases: unknown;
  };
}): DishRecord {
  return {
    id: dish.id,
    mealDbId: dish.mealDbId,
    title: dish.title,
    areaRaw: dish.areaRaw,
    imageUrl: dish.imageUrl,
    imageGallery: Array.isArray(dish.imageGallery) ? dish.imageGallery.map(String) : [],
    instructions: dish.instructions,
    ingredients: Array.isArray(dish.ingredients) ? dish.ingredients.map(String) : [],
    isPlayable: dish.isPlayable,
    needsReview: dish.needsReview,
    countryId: dish.countryId,
    country: mapCountry(dish.country)
  };
}

function mapSession(session: {
  id: string;
  status: SessionStatus;
  totalScore: number;
  currentRoundIndex: number;
  rounds: Array<{
    id: string;
    roundIndex: number;
    status: RoundStatus;
    totalPenalty: number;
    roundScore: number;
    revealCountryName: string | null;
    solvedAt: Date | null;
    dish: Parameters<typeof mapDish>[0];
    targetCountry: Parameters<typeof mapCountry>[0];
    guesses: Array<{
      id: string;
      sessionId: string;
      roundId: string;
      distanceKm: number;
      penalty: number;
      isCorrect: boolean;
      guessedCountryId: string;
      createdAt: Date;
      guessedCountry: Parameters<typeof mapCountry>[0];
    }>;
  }>;
}): SessionRecord {
  return {
    id: session.id,
    status: session.status,
    totalScore: session.totalScore,
    currentRoundIndex: session.currentRoundIndex,
    rounds: session.rounds.map((round) => ({
      id: round.id,
      roundIndex: round.roundIndex,
      status: round.status,
      totalPenalty: round.totalPenalty,
      roundScore: round.roundScore,
      revealCountryName: round.revealCountryName ?? undefined,
      solvedAt: round.solvedAt ?? undefined,
      dish: mapDish(round.dish),
      targetCountry: mapCountry(round.targetCountry),
      guesses: round.guesses.map((guess) => ({
        id: guess.id,
        sessionId: guess.sessionId,
        roundId: guess.roundId,
        distanceKm: guess.distanceKm,
        penalty: guess.penalty,
        isCorrect: guess.isCorrect,
        guessedCountryId: guess.guessedCountryId,
        guessedCountry: mapCountry(guess.guessedCountry),
        createdAt: guess.createdAt
      }))
    }))
  };
}
