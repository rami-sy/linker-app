module.exports = [
  {
    files: ["app.js", "socket.js", "src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
    },
    rules: {
      "no-unreachable": "error",
      "no-duplicate-case": "error",
      "no-dupe-keys": "error",
      "valid-typeof": "error",
      "no-constant-condition": "error",
      "no-unused-vars": "off",
    },
  },
];
