import {
  GraphQLError,
  Kind,
  type DocumentNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValidationRule
} from "graphql";

type RuntimeEnv = Record<string, string | undefined>;

const DEFAULT_MAX_QUERY_DEPTH = 8;

export interface ApiRuntimeConfig {
  allowedCorsOrigins: string[] | undefined;
  exposeErrorDetails: boolean;
  maskedErrors: boolean;
  maxQueryDepth: number;
}

export function parseCorsOrigins(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const origins = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return origins.length > 0 ? origins : undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function resolveApiRuntimeConfig(env: RuntimeEnv): ApiRuntimeConfig {
  const exposeErrorDetails = env.NODE_ENV !== "production";

  return {
    allowedCorsOrigins: parseCorsOrigins(env.API_CORS_ORIGINS),
    exposeErrorDetails,
    maskedErrors: !exposeErrorDetails,
    maxQueryDepth: parsePositiveInteger(env.API_GRAPHQL_MAX_DEPTH, DEFAULT_MAX_QUERY_DEPTH)
  };
}

export function createDepthValidationRule(maxDepth: number): ValidationRule {
  return (context) => {
    const fragments = new Map<string, FragmentDefinitionNode>();

    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragments.set(definition.name.value, definition);
      }
    }

    return {
      OperationDefinition(node) {
        const depth = measureOperationDepth(node, fragments);

        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`graphql query exceeds max depth ${String(maxDepth)}`, {
              nodes: [node]
            })
          );
        }
      }
    };
  };
}

export function createDepthLimitPlugin(maxDepth: number) {
  return {
    onValidate({ addValidationRule }: { addValidationRule: (rule: ValidationRule) => void }) {
      addValidationRule(createDepthValidationRule(maxDepth));
    }
  };
}

export function measureQueryDepth(document: DocumentNode): number {
  const fragments = new Map<string, FragmentDefinitionNode>();
  const operations: OperationDefinitionNode[] = [];

  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
      continue;
    }

    if (definition.kind === Kind.OPERATION_DEFINITION) {
      operations.push(definition);
    }
  }

  return operations.reduce((max, operation) => {
    const depth = measureOperationDepth(operation, fragments);
    return Math.max(max, depth);
  }, 0);
}

function measureOperationDepth(
  operation: OperationDefinitionNode,
  fragments: Map<string, FragmentDefinitionNode>
): number {
  return measureSelectionSetDepth(operation.selectionSet, fragments, new Set(), 1);
}

function measureSelectionSetDepth(
  selectionSet: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  visitedFragments: Set<string>,
  depth: number
): number {
  let maxDepth = depth;

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (!selection.selectionSet) {
        maxDepth = Math.max(maxDepth, depth);
        continue;
      }

      maxDepth = Math.max(
        maxDepth,
        measureSelectionSetDepth(selection.selectionSet, fragments, visitedFragments, depth + 1)
      );
      continue;
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      maxDepth = Math.max(
        maxDepth,
        measureSelectionSetDepth(selection.selectionSet, fragments, visitedFragments, depth)
      );
      continue;
    }

    const fragmentName = selection.name.value;

    if (visitedFragments.has(fragmentName)) {
      continue;
    }

    const fragment = fragments.get(fragmentName);

    if (!fragment) {
      continue;
    }

    const nextVisited = new Set(visitedFragments);
    nextVisited.add(fragmentName);

    maxDepth = Math.max(
      maxDepth,
      measureSelectionSetDepth(fragment.selectionSet, fragments, nextVisited, depth)
    );
  }

  return maxDepth;
}
