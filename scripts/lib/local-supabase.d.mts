export interface LocalSupabaseStatus {
  readonly apiUrl: string;
  readonly databaseUrl: string;
  readonly publishableKey: string;
  readonly secretKey: string;
}

export const repositoryRoot: string;
export function readLocalSupabaseStatus(): LocalSupabaseStatus;
