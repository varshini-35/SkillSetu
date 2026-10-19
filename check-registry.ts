import { loadContentRegistry } from "./apps/api/src/content-registry.ts";
import path from "node:path";

const primaryPath = path.resolve("database/seeds/domestic-electrician-demo.json");
const registry = loadContentRegistry(primaryPath);

console.log("Primary catalogue:", registry.primary.contentSet.id);
console.log(
  "Occupations:",
  JSON.stringify(registry.occupations(), null, 2)
);
