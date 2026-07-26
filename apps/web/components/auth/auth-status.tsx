import { InlineAlert } from "@talence/ui";

import { getSafeStatus, safeRequestId } from "@/lib/auth/safe-status";

export interface AuthStatusProps {
  status?: string | string[];
  requestId?: string | string[];
}

export function AuthStatus({ status, requestId }: AuthStatusProps) {
  const safeStatus = getSafeStatus(status);
  const safeId = safeRequestId(requestId);

  if (!safeStatus) {
    return null;
  }

  return (
    <InlineAlert title={safeStatus.title} tone={safeStatus.tone}>
      {safeStatus.message}
      {safeId ? ` Support reference: ${safeId}.` : ""}
    </InlineAlert>
  );
}
