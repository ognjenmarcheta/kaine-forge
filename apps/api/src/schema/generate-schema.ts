import { createLogger } from "@repo/logger";
import { buildSchema, printSchema } from "graphql";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { apiTypeDefs } from "./features";

const logger = createLogger({ name: "schema-gen" });

const filename = fileURLToPath(import.meta.url);
const directory = dirname(filename);
const outputPath = join(directory, "../../schema.graphql");

const schema = buildSchema(apiTypeDefs.join("\n"));

await writeFile(outputPath, `${printSchema(schema)}\n`, "utf8");
logger.info({ outputPath }, "wrote schema");
