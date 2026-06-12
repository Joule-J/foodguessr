import { createCatalogCountries } from "../src/data/country-catalog";
import { createGameRepository } from "../src/repositories";

async function main() {
  const repository = createGameRepository({
    databaseUrl: process.env.DATABASE_URL
  });

  await repository.syncCountries(createCatalogCountries());
  await repository.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
