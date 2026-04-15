import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDefaultConfig } from "expo/metro-config.js";
import { withNativeWind } from "nativewind/dist/metro/index.js";

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

config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
  "react-native-css-interop": path.resolve(projectRoot, "node_modules/react-native-css-interop")
};

export default withNativeWind(config, {
  input: "./src/styles/global.css",
  inlineRem: 16
});
