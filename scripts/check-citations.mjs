import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Every numbered citation in executable code must point to the normative math
 * spec, and every cited section must resolve to a real heading. Source comments
 * cite sections in the bare `§X.Y` form; the qualified `<file>.md §X.Y` form is
 * additionally required to name the spec itself rather than some other document. */
const SPEC = "docs/MATH-SPEC.md";
// This file legitimately contains the patterns it hunts for.
const SELF = path.relative(process.cwd(), fileURLToPath(import.meta.url));
const ROOTS = ["src", "scripts", "tests", "fixtures"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".css"]);

async function filesUnder(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const filePath = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(filePath) : Promise.resolve([filePath]);
    }),
  );
  return nested.flat();
}

const specHeadings = new Set();
for (const line of (await readFile(SPEC, "utf8")).split("\n")) {
  const heading = /^#{1,6}\s+(\d+(?:\.\d+)*[a-z]?)/.exec(line);
  if (heading) specHeadings.add(heading[1]);
}
if (specHeadings.size === 0) {
  console.error(`citation check failed: no numbered headings found in ${SPEC}.`);
  process.exit(1);
}

const files = (await Promise.all(ROOTS.map(filesUnder)))
  .flat()
  .filter((file) => EXTENSIONS.has(path.extname(file)) && path.normalize(file) !== SELF);

const offSpec = [];
const unresolved = [];

let citationCount = 0;

for (const file of files) {
  const content = await readFile(file, "utf8");
  content.split("\n").forEach((line, index) => {
    // Where a citation names its document, that document must be the spec. Those
    // already reported as off-spec are not also measured against spec headings.
    const reportedOffSpec = new Set();
    for (const match of line.matchAll(/([\w./-]+\.md) §(\d+(?:\.\d+)*[a-z]?)/g)) {
      if (match[1] === SPEC) continue;
      reportedOffSpec.add(match.index + match[1].length + 1);
      offSpec.push(`${file}:${index + 1}: ${match[1]} §${match[2]} is not the normative spec`);
    }
    // Every remaining citation, qualified or bare, must resolve to a real heading.
    for (const match of line.matchAll(/§(\d+(?:\.\d+)*[a-z]?)/g)) {
      citationCount += 1;
      if (reportedOffSpec.has(match.index)) continue;
      if (!specHeadings.has(match[1])) {
        unresolved.push(`${file}:${index + 1}: §${match[1]} is not a heading in ${SPEC}`);
      }
    }
  });
}

if (offSpec.length > 0 || unresolved.length > 0) {
  console.error("citation check failed.");
  if (offSpec.length > 0) {
    console.error(`\n${offSpec.length} numbered citation(s) point outside ${SPEC}:`);
    for (const hit of offSpec) console.error(` - ${hit}`);
  }
  if (unresolved.length > 0) {
    console.error(`\n${unresolved.length} citation(s) name a section that does not exist:`);
    for (const hit of unresolved) console.error(` - ${hit}`);
    console.error("\nEither add the section to the spec or cite the one that governs.");
  }
  process.exit(1);
}

console.log(
  `citations OK — ${files.length} files scanned, all ${citationCount} § citations resolve in ${SPEC} (${specHeadings.size} numbered headings).`,
);
