/** The data sources and licenses page's data, made at build time (`scripts/notices-data.ts`). */
declare module "virtual:langle-notices" {
  // An ambient module cannot `import type` a relative path; an import type can.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const data: import("./core/notices").NoticesData;
  export default data;
}
