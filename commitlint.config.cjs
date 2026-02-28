module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [0],
    "scope-case": [2, "always", ["kebab-case", "camel-case", "snake-case", "lower-case"]]
  }
};
