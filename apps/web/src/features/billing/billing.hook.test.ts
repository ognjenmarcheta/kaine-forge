import { GraphQLError } from "graphql";
import { ClientError } from "graphql-request";
import { expect, it } from "vitest";

import { planErrorOf } from "./billing.hook";

function graphqlFailure(code: string): ClientError {
  return new ClientError(
    {
      status: 200,
      headers: new Headers(),
      body: "",
      errors: [new GraphQLError("refused", { extensions: { code } })]
    },
    { query: "mutation CreateTodo" }
  );
}

it.each([
  [graphqlFailure("PLAN_LIMIT_REACHED"), "PLAN_LIMIT_REACHED"],
  [graphqlFailure("PLAN_FEATURE_REQUIRED"), "PLAN_FEATURE_REQUIRED"],
  [graphqlFailure("BAD_USER_INPUT"), null],
  [new Error("network down"), null]
])("names the Plan refusal behind a failed request", (error, code) => {
  expect(planErrorOf(error)).toBe(code);
});
