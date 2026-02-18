import { createApiServer } from "./server";

const port = Number(process.env.API_PORT ?? 4000);
const { server } = createApiServer();

server.listen(port, () => {
  console.log(`api running on http://localhost:${String(port)}/graphql`);
});
