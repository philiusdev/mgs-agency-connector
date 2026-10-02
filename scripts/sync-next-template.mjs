import { cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const template = join(root, "templates/next-generic");
const copies = [
  ["lib/agency", "lib/agency"],
  ["components/agency", "components/agency"],
  ["components/agency.css", "components/agency.css"],
  ["app/api/agency", "app/api/agency"],
];

for (const [sourcePath, destinationPath] of copies) {
  const source = join(root, sourcePath);
  const destination = join(template, destinationPath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

console.log(`Connector synced into ${template}`);
