const chalk = require("chalk");
const { readFile, writeFile, copyFile } = require("fs").promises;

console.log(chalk.green("here"));

function log(...args) {
  console.log(chalk.yellow("[postinstall]"), ...args);
}

// Function to modify react-native-maps
async function reactNativeMaps() {
  log(
    "📦 Creating web compatibility of react-native-maps using an empty module loaded on web builds"
  );
  const modulePath = "node_modules/react-native-maps";

  try {
    await writeFile(
      `${modulePath}/lib/index.web.js`,
      "module.exports = {}",
      "utf-8"
    );
    await copyFile(
      `${modulePath}/lib/index.d.ts`,
      `${modulePath}/lib/index.web.d.ts`
    );

    const pkg = JSON.parse(
      await readFile(`${modulePath}/package.json`, "utf-8")
    );
    pkg["react-native"] = "lib/index.js";
    pkg["main"] = "lib/index.web.js";

    await writeFile(
      `${modulePath}/package.json`,
      JSON.stringify(pkg, null, 2),
      "utf-8"
    );
    log("✅ react-native-maps package.json updated successfully");
  } catch (error) {
    log(
      chalk.red("❌ An error occurred while updating react-native-maps"),
      error
    );
  }
}

// Function to modify react-async-hook
async function reactAsyncHook() {
  log("📦 Updating react-async-hook package.json for compatibility");
  const modulePath =
    "node_modules/react-native-country-picker-modal/node_modules/react-async-hook";

  try {
    const pkg = JSON.parse(
      await readFile(`${modulePath}/package.json`, "utf-8")
    );
    pkg["module"] = "dist/react-async-hook.esm.js";

    await writeFile(
      `${modulePath}/package.json`,
      JSON.stringify(pkg, null, 2),
      "utf-8"
    );
    log("✅ react-async-hook package.json updated successfully");
  } catch (error) {
    log(
      chalk.red("❌ An error occurred while updating react-async-hook"),
      error
    );
  }
}

// Function to modify simple-peer
async function simplePeerModifications() {
  log("📦 Updating simple-peer for compatibility with React Native");
  const modulePath = "node_modules/simple-peer/index.js";

  try {
    let fileContent = await readFile(modulePath, "utf-8");

    // Replace randombytes with react-native-uuid
    fileContent = fileContent.replace(
      `const randombytes = require('randombytes')`,
      `import uuid from 'react-native-uuid';`
    );

    // Update relevant parts of the code to use uuid instead of randombytes
    fileContent = fileContent.replace(
      `this._id = randombytes(4).toString('hex').slice(0, 7)`,
      `this._id = uuid.v4().slice(0, 7);`
    );

    fileContent = fileContent.replace(
      `this.channelName = opts.initiator
      ? opts.channelName || randombytes(20).toString('hex')
      : null`,
      `this.channelName = opts.initiator ? opts.channelName || uuid.v4().replace(/-/g, '') : null;`
    );

    await writeFile(modulePath, fileContent, "utf-8");

    log("✅ simple-peer updated successfully");
  } catch (error) {
    log(chalk.red("❌ An error occurred while updating simple-peer"), error);
  }
}

// Function to modify react-native-svg
async function reactNativeSvg() {
  log("📦 Fixing import issue in react-native-svg");

  const modulePath =
    "node_modules/react-native-svg/lib/module/web/utils/prepare.js";

  try {
    let fileContent = await readFile(modulePath, "utf-8");

    // Fix the incorrect import
    fileContent = fileContent.replace(
      `import { hasTouchableProperty, parseTransformProp } from '.';`,
      `import { hasTouchableProperty, parseTransformProp } from './index';`
    );

    await writeFile(modulePath, fileContent, "utf-8");

    log("✅ react-native-svg import issue fixed successfully");
  } catch (error) {
    log(chalk.red("❌ An error occurred while fixing react-native-svg"), error);
  }
}

// Run all modifications
async function runModifications() {
  await reactNativeMaps();
  await reactAsyncHook();
  await simplePeerModifications();
  await reactNativeSvg();
}

runModifications();
