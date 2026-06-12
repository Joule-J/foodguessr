export type AppConfig = {
  host: string;
  port: number;
  frontendUrl: string;
  frontendUrls: string[];
  mealDbBaseUrl: string;
  databaseUrl?: string;
  liveMealDbSessionImportEnabled: boolean;
};

export function getConfig(): AppConfig {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const frontendUrls = (process.env.FRONTEND_URLS ?? frontendUrl)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 4000),
    frontendUrl,
    frontendUrls,
    mealDbBaseUrl:
      process.env.THEMEALDB_BASE_URL ??
      "https://www.themealdb.com/api/json/v1/1",
    databaseUrl: process.env.DATABASE_URL || undefined,
    liveMealDbSessionImportEnabled:
      process.env.LIVE_MEALDB_SESSION_IMPORT !== "false"
  };
}
