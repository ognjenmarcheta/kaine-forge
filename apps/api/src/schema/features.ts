import { baseTypeDefs } from "./base";
import { assistantResolvers } from "../features/assistant/assistant.router";
import { assistantTypeDefs } from "../features/assistant/assistant.schema";
import { auditResolvers } from "../features/audit/audit.router";
import { auditTypeDefs } from "../features/audit/audit.schema";
import { dataExportResolvers } from "../features/data-export/data-export.router";
import { dataExportTypeDefs } from "../features/data-export/data-export.schema";
import { notesResolvers } from "../features/notes/notes.router";
import { notesTypeDefs } from "../features/notes/notes.schema";
import { notificationsResolvers } from "../features/notifications/notifications.router";
import { notificationsTypeDefs } from "../features/notifications/notifications.schema";
import { organizationsResolvers } from "../features/organizations/organizations.router";
import { organizationsTypeDefs } from "../features/organizations/organizations.schema";
import { publicAssetsResolvers } from "../features/public-assets/public-assets.router";
import { publicAssetsTypeDefs } from "../features/public-assets/public-assets.schema";
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

interface ComposedApiFeatures {
  resolvers: ResolverMap;
  typeDefs: string[];
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
        const duplicateField = Object.keys(value).find((fieldName) =>
          Object.prototype.hasOwnProperty.call(current, fieldName)
        );

        if (duplicateField) {
          throw new Error(`duplicate resolver field ${key}.${duplicateField}`);
        }

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
    name: "notes",
    typeDefs: notesTypeDefs,
    resolvers: notesResolvers
  },
  {
    name: "storage",
    typeDefs: storageTypeDefs,
    resolvers: storageResolvers
  },
  {
    name: "public-assets",
    typeDefs: publicAssetsTypeDefs,
    resolvers: publicAssetsResolvers
  },
  {
    name: "assistant",
    typeDefs: assistantTypeDefs,
    resolvers: assistantResolvers
  },
  {
    name: "audit",
    typeDefs: auditTypeDefs,
    resolvers: auditResolvers
  },
  {
    name: "notifications",
    typeDefs: notificationsTypeDefs,
    resolvers: notificationsResolvers
  },
  {
    name: "data-export",
    typeDefs: dataExportTypeDefs,
    resolvers: dataExportResolvers
  }
];

export function composeApiFeatures(features: ApiFeature[]): ComposedApiFeatures {
  return {
    resolvers: mergeResolverMaps([baseResolvers, ...features.map((feature) => feature.resolvers)]),
    typeDefs: [baseTypeDefs, ...features.map((feature) => feature.typeDefs)]
  };
}

const composedApiFeatures = composeApiFeatures(apiFeatures);

export const apiTypeDefs = composedApiFeatures.typeDefs;

export const apiResolvers = composedApiFeatures.resolvers;
