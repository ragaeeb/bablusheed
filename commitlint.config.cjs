module.exports = {
  extends: ["@commitlint/config-conventional"],
  ignores: [(message) => /^v\d+(\.\d+){0,2}$/.test((message || "").trim())],
  rules: {
    "subject-case": [0],
    "scope-case": [2, "always", ["kebab-case", "camel-case", "snake-case", "lower-case"]]
  }
};
