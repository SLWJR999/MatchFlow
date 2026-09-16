import ClaimClient from "./ClaimClient";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClaimClient token={token} />;
}
