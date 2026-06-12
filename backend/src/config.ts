export type AppConfig = {
  host: string;
  port: number;
  frontendUrl: string;
  mealDbBaseUrl: string;
  databaseUrl?: string;
  liveMealDbSessionImportEnabled: boolean;
};

export function getConfig(): AppConfig {
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 4000),
    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
    mealDbBaseUrl:
      process.env.THEMEALDB_BASE_URL ??
      "https://www.themealdb.com/api/json/v1/1",
    databaseUrl: process.env.DATABASE_URL || undefined,
    liveMealDbSessionImportEnabled:
      process.env.LIVE_MEALDB_SESSION_IMPORT !== "false"
  };
}
