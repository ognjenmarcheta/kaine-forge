import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDefaultConfig } from "expo/metro-config.js";
import { withNativeWind } from "nativewind/dist/metro/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const mobileSingletonModules = [
  "nativewind",
  "react",
  "react-native",
  "react-native-css-interop",
  "react-native-reanimated",
  "react-native-safe-area-context",
  "react-native-worklets"
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];

config.resolver.extraNodeModules = Object.fromEntries(
  mobileSingletonModules.map((moduleName) => [
    moduleName,
    path.resolve(projectRoot, "node_modules", moduleName)
  ])
);
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  new RegExp(
    `${escapeRegExp(workspaceRoot)}/packages/[^/]+/node_modules/(${mobileSingletonModules
      .map(escapeRegExp)
      .join("|")})(/.*)?$`
  )
];

export default withNativeWind(config, {
  input: "./src/styles/global.css",
  inlineRem: 16
});
