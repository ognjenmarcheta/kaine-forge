import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDefaultConfig } from "expo/metro-config";
import { withNativeWind } from "nativewind/metro";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];

export default withNativeWind(config, {
  input: "./src/styles/global.css"
});
