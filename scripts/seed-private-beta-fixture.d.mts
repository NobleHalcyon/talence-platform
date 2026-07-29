export interface PrivateBetaFixtureUserConfiguration {
  readonly displayName: string;
  readonly email: string;
  readonly handle: string;
  readonly invitationId: string;
  readonly password: string;
  readonly platformAdmin: boolean;
}

export interface PrivateBetaFixtureSeedResult {
  activeCatalogVersion: string;
  activePrintings: number;
  users: Array<{
    collectionId: string;
    email: string;
    userId: string;
    workspaceId: string;
  }>;
}

export const PRIVATE_BETA_FIXTURE_USERS: readonly PrivateBetaFixtureUserConfiguration[];
export function seedPrivateBetaFixture(): Promise<PrivateBetaFixtureSeedResult>;
