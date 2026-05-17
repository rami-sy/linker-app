const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

/** Root CJS entry files — bypass package.json exports so Metro resolves ./utils.js next to aes.js (avoids broken esm/ paths on web). */
function nobleCjsMap(projectRoot) {
  const nm = (...parts) => path.join(projectRoot, "node_modules", ...parts);
  const h = (name) => nm("@noble", "hashes", `${name}.js`);
  return {
    "@noble/ciphers/aes": nm("@noble", "ciphers", "aes.js"),
    "@noble/hashes/hkdf": h("hkdf"),
    "@noble/hashes/sha2": h("sha2"),
    "@noble/hashes/sha2.js": h("sha2"),
    "@noble/hashes/utils": h("utils"),
    "@noble/hashes/utils.js": h("utils"),
    "@noble/hashes/crypto": h("crypto"),
    "@noble/hashes/crypto.js": h("crypto"),
    "@noble/curves/ed25519": nm("@noble", "curves", "ed25519.js"),
  };
}

module.exports = (() => {
  const projectRoot = __dirname;
  const config = getDefaultConfig(projectRoot);
  const nobleMap = nobleCjsMap(projectRoot);

  const { transformer, resolver } = config;

  // دمج إعدادات svg transformer
  config.transformer = {
    ...transformer,
    babelTransformerPath: require.resolve("react-native-svg-transformer/expo"),
  };

  const upstreamResolveRequest = resolver.resolveRequest;
  // تعديل إعدادات resolver لإضافة svg
  config.resolver = {
    ...resolver,
    assetExts: resolver.assetExts.filter((ext) => ext !== "svg"),
    sourceExts: [...resolver.sourceExts, "svg"],
    extraNodeModules: {
      ...resolver.extraNodeModules,
      events: require.resolve("events"),
    },
    resolveRequest(context, moduleName, platform) {
      const filePath = nobleMap[moduleName];
      if (filePath) {
        return { type: "sourceFile", filePath };
      }
      if (upstreamResolveRequest) {
        return upstreamResolveRequest(context, moduleName, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  };

  // دمج إعدادات NativeWind
  return withNativeWind(config, { input: "./global.css" });
})();
