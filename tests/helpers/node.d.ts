declare module "node:fs" {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: string): string;
}
declare module "node:path" {
  export function resolve(...parts: string[]): string;
}
