export type AppConfig = {
  port: number;
  frontendUrl: string;
  mealDbBaseUrl: string;
  databaseUrl?: string;
};

export function getConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 4000),
    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
    mealDbBaseUrl:
      process.env.THEMEALDB_BASE_URL ??
      "https://www.themealdb.com/api/json/v1/1",
    databaseUrl: process.env.DATABASE_URL || undefined
  };
}
