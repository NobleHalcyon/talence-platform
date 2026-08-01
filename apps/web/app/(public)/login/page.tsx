import { redirect } from "next/navigation";

import { SignInLanding } from "@/components/auth/sign-in-landing";
import { getVerifiedAuthState } from "@/lib/auth/auth-state";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
};

interface LoginPageProps {
  searchParams?: Promise<{
    request_id?: string | string[];
    status?: string | string[];
  }>;
}

export default async function LoginPage({ searchParams = Promise.resolve({}) }: LoginPageProps) {
  const [authState, query] = await Promise.all([getVerifiedAuthState(), searchParams]);

  if (authState.status === "authenticated") {
    redirect("/app");
  }

  return <SignInLanding status={query.status} requestId={query.request_id} />;
}
