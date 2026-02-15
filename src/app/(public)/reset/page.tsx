import ResetConfirmForm from "./confirm-form";
import ResetForm from "./form";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <ResetForm />;
  return <ResetConfirmForm token={token} />;
}
