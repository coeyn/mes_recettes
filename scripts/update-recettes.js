const fs = require("fs");
const path = require("path");

const recipeDir = path.join(__dirname, "..", "recettes");
const manifestPath = path.join(recipeDir, "recettes.json");

const files = fs
  .readdirSync(recipeDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => name.endsWith(".json") && name !== "recettes.json")
  .sort((a, b) => a.localeCompare(b));

fs.writeFileSync(manifestPath, JSON.stringify(files, null, 2) + "\n", "utf8");
console.log(`Mis a jour: ${manifestPath}`);
