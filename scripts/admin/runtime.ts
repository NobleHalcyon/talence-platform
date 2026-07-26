import { AdminService } from "./admin-service.js";
import type { AdminEnvironment } from "./environment.js";
import { readDatabaseUrl, readSupabaseAdminConfiguration } from "./environment.js";
import { createPostgresAdminRepository } from "./postgres-repository.js";
import { createSupabaseAuthAdminGateway } from "./supabase-auth-gateway.js";

export async function withAdminService<T>(
  environment: AdminEnvironment,
  operation: (service: AdminService) => Promise<T>,
  now?: () => Date,
): Promise<T> {
  const supabase = readSupabaseAdminConfiguration(environment);
  const databaseUrl = readDatabaseUrl(environment);
  const auth = createSupabaseAuthAdminGateway(supabase.url, supabase.secretKey);
  const repository = createPostgresAdminRepository(databaseUrl);

  try {
    return await operation(new AdminService({ repository, auth, ...(now ? { now } : {}) }));
  } finally {
    await repository.close();
  }
}
