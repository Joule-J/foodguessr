CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
CREATE TYPE "RoundStatus" AS ENUM ('IN_PROGRESS', 'SOLVED');

CREATE TABLE "Country" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "iso2" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "aliases" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Dish" (
  "id" TEXT NOT NULL,
  "mealDbId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "areaRaw" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "ingredients" JSONB NOT NULL,
  "isPlayable" BOOLEAN NOT NULL DEFAULT true,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "countryId" TEXT NOT NULL,
  CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameSession" (
  "id" TEXT NOT NULL,
  "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "totalScore" INTEGER NOT NULL DEFAULT 0,
  "currentRoundIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Round" (
  "id" TEXT NOT NULL,
  "roundIndex" INTEGER NOT NULL,
  "status" "RoundStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "totalPenalty" INTEGER NOT NULL DEFAULT 0,
  "roundScore" INTEGER NOT NULL DEFAULT 0,
  "solvedAt" TIMESTAMP(3),
  "revealCountryName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sessionId" TEXT NOT NULL,
  "dishId" TEXT NOT NULL,
  "targetCountryId" TEXT NOT NULL,
  CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Guess" (
  "id" TEXT NOT NULL,
  "distanceKm" DOUBLE PRECISION NOT NULL,
  "penalty" INTEGER NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sessionId" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "guessedCountryId" TEXT NOT NULL,
  CONSTRAINT "Guess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");
CREATE UNIQUE INDEX "Country_iso2_key" ON "Country"("iso2");
CREATE UNIQUE INDEX "Dish_mealDbId_key" ON "Dish"("mealDbId");
CREATE UNIQUE INDEX "Round_sessionId_roundIndex_key" ON "Round"("sessionId", "roundIndex");

ALTER TABLE "Dish"
ADD CONSTRAINT "Dish_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Round"
ADD CONSTRAINT "Round_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Round"
ADD CONSTRAINT "Round_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Round"
ADD CONSTRAINT "Round_targetCountryId_fkey" FOREIGN KEY ("targetCountryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Guess"
ADD CONSTRAINT "Guess_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Guess"
ADD CONSTRAINT "Guess_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Guess"
ADD CONSTRAINT "Guess_guessedCountryId_fkey" FOREIGN KEY ("guessedCountryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
