import { createLogger } from "@repo/logger";
import { buildSchema, printSchema } from "graphql";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { baseTypeDefs } from "./base";
import { organizationsTypeDefs } from "../features/organizations/organizations.schema";
import { todosTypeDefs } from "../features/todos/todos.schema";

const logger = createLogger({ name: "schema-gen" });

const filename = fileURLToPath(import.meta.url);
const directory = dirname(filename);
const outputPath = join(directory, "../../schema.graphql");

const schema = buildSchema(`${baseTypeDefs}\n${organizationsTypeDefs}\n${todosTypeDefs}`);

await writeFile(outputPath, `${printSchema(schema)}\n`, "utf8");
logger.info({ outputPath }, "wrote schema");
