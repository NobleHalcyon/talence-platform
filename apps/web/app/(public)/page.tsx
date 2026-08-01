import { redirect } from "next/navigation";

import { SignInLanding } from "@/components/auth/sign-in-landing";
import { getVerifiedAuthState } from "@/lib/auth/auth-state";

export const dynamic = "force-dynamic";

interface LandingPageProps {
  searchParams?: Promise<{
    request_id?: string | string[];
    status?: string | string[];
  }>;
}

export default async function LandingPage({
  searchParams = Promise.resolve({}),
}: LandingPageProps) {
  const [authState, query] = await Promise.all([getVerifiedAuthState(), searchParams]);

  if (authState.status === "authenticated") {
    redirect("/app");
  }

  return <SignInLanding status={query.status} requestId={query.request_id} />;
}
