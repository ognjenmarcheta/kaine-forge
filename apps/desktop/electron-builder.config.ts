export default {
  appId: "com.kaine.forge.desktop",
  directories: {
    output: "release"
  },
  files: ["dist/**/*", "package.json"],
  mac: {
    category: "public.app-category.productivity"
  },
  win: {
    target: ["nsis"]
  },
  linux: {
    target: ["AppImage"]
  }
};
