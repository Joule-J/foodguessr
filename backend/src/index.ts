import { createServer } from "./server";

async function start() {
  const { server, config } = await createServer();

  server.listen(config.port, () => {
    console.log(`Food Guessr backend listening on http://localhost:${config.port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
