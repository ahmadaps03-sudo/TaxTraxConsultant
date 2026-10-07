import { RecoveryForm } from "@/components/portal/RecoveryForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return <RecoveryForm mode="request" />;
}
