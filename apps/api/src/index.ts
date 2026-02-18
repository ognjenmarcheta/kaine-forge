import { createYoga, createSchema } from "graphql-yoga";
import { createServer } from "node:http";

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      health: String!
    }
  `,
  resolvers: {
    Query: {
      health: () => "ok"
    }
  }
});

const yoga = createYoga({ schema });
const server = createServer(yoga);

const port = Number(process.env.API_PORT ?? 4000);

server.listen(port, () => {
  console.log(`api running on http://localhost:${String(port)}/graphql`);
});
