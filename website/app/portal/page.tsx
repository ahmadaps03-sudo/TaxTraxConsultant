import { getCurrentUserResult } from "@/lib/auth/current";
import { PortalDashboard, PortalLogin } from "@/components/portal/PortalClient";

export const dynamic = "force-dynamic";

export default async function ClientPortalPage({ searchParams }: { searchParams?: { logout?: string } }) {
  const result = await getCurrentUserResult();
  if (result.status === "unavailable") {
    return (
      <div className="mx-auto max-w-5xl px-5 py-16">
        <div className="card-flat p-6">
          <h1 className="font-serif text-2xl text-paper">Client Portal Unavailable</h1>
          <p role="alert" className="mt-4 text-sm text-smoke">Client authentication is temporarily unavailable. Please try again.</p>
        </div>
      </div>
    );
  }
  const logoutUnconfirmed = searchParams?.logout === "unconfirmed";
  if (result.status === "authorized") return <PortalDashboard name={result.user.name} logoutUnconfirmed={logoutUnconfirmed} />;
  return <PortalLogin logoutUnconfirmed={logoutUnconfirmed} />;
}
