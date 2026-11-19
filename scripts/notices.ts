import type { Plugin } from "vite";

/** The module the data sources and licenses page imports its data from. */
const MODULE_ID = "virtual:langle-notices";

/**
 * Serves `virtual:langle-notices` (`noticesData`) to the build and the tests. The data
 * module is loaded only when the page asks for it, so the configs that use this plugin
 * do not load the data scripts.
 */
export function noticesPlugin(): Plugin {
  const resolved = `\0${MODULE_ID}`;
  return {
    name: "langle-notices",
    resolveId: (source) => (source === MODULE_ID ? resolved : undefined),
    async load(id) {
      if (id !== resolved) return undefined;
      const url = new URL("./notices-data.ts", import.meta.url).href;
      const { noticesData } = (await import(
        url
      )) as typeof import("./notices-data.ts");
      return `export default ${JSON.stringify(noticesData())};`;
    },
  };
}
