import { createSchema } from "graphql-yoga";

import { baseTypeDefs } from "./base";
import { todosResolvers } from "../features/todos/todos.router";
import { todosTypeDefs } from "../features/todos/todos.schema";

export { baseTypeDefs };

export const apiSchema = createSchema({
  typeDefs: [baseTypeDefs, todosTypeDefs],
  resolvers: {
    Query: {
      health: () => "ok",
      ...todosResolvers.Query
    },
    Mutation: {
      ...todosResolvers.Mutation
    },
    DateTime: {
      serialize(value: unknown) {
        if (value instanceof Date) {
          return value.toISOString();
        }

        return String(value);
      }
    }
  }
});
