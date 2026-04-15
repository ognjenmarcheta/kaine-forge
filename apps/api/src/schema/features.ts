import { baseTypeDefs } from "./base";
import { organizationsResolvers } from "../features/organizations/organizations.router";
import { organizationsTypeDefs } from "../features/organizations/organizations.schema";
import { storageResolvers } from "../features/storage/storage.router";
import { storageTypeDefs } from "../features/storage/storage.schema";
import { todosResolvers } from "../features/todos/todos.router";
import { todosTypeDefs } from "../features/todos/todos.schema";

type ResolverMap = Record<string, unknown>;

interface ApiFeature {
  name: string;
  resolvers: ResolverMap;
  typeDefs: string;
}

function isResolverObject(value: unknown): value is ResolverMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeResolverMaps(resolverMaps: ResolverMap[]): ResolverMap {
  const merged: ResolverMap = {};

  for (const resolverMap of resolverMaps) {
    for (const [key, value] of Object.entries(resolverMap)) {
      const current = merged[key];

      if (isResolverObject(current) && isResolverObject(value)) {
        merged[key] = {
          ...current,
          ...value
        };
        continue;
      }

      merged[key] = value;
    }
  }

  return merged;
}

const baseResolvers: ResolverMap = {
  Query: {
    health: () => "ok"
  },
  DateTime: {
    serialize(value: unknown) {
      if (value instanceof Date) {
        return value.toISOString();
      }

      return String(value);
    }
  }
};

export const apiFeatures: ApiFeature[] = [
  {
    name: "organizations",
    typeDefs: organizationsTypeDefs,
    resolvers: organizationsResolvers
  },
  {
    name: "todos",
    typeDefs: todosTypeDefs,
    resolvers: todosResolvers
  },
  {
    name: "storage",
    typeDefs: storageTypeDefs,
    resolvers: storageResolvers
  }
];

export const apiTypeDefs = [baseTypeDefs, ...apiFeatures.map((feature) => feature.typeDefs)];

export const apiResolvers = mergeResolverMaps([
  baseResolvers,
  ...apiFeatures.map((feature) => feature.resolvers)
]);
