import { createSchema } from "graphql-yoga";

import { baseTypeDefs } from "./base";
import { apiResolvers, apiTypeDefs } from "./features";
import type { ApiContext } from "../context";

export { baseTypeDefs };

type ApiSchemaOptions = Parameters<typeof createSchema<ApiContext>>[0];

export const apiSchema = createSchema<ApiContext>({
  typeDefs: apiTypeDefs,
  // SAFETY: apiResolvers merges the per-feature resolver maps written against
  // these exact typeDefs; composition only widens the type to a plain Record,
  // and createSchema rejects resolvers that do not match the SDL at startup.
  resolvers: apiResolvers as NonNullable<ApiSchemaOptions["resolvers"]>
});
