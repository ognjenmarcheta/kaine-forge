declare module "graphql-request/dist/types.dom" {
  type CompatHeadersInit = Array<[string, string]> | Record<string, string>;

  export interface RequestInit {
    headers?: CompatHeadersInit;
  }
}
