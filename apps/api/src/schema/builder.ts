import { createSchema } from "graphql-yoga";

import { baseTypeDefs } from "./base";
import { apiResolvers, apiTypeDefs } from "./features";
import type { ApiContext } from "../context";

export { baseTypeDefs };

type ApiSchemaOptions = Parameters<typeof createSchema<ApiContext>>[0];

export const apiSchema = createSchema<ApiContext>({
  typeDefs: apiTypeDefs,
  resolvers: apiResolvers as NonNullable<ApiSchemaOptions["resolvers"]>
});
