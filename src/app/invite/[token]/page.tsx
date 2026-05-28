import { InviteAcceptClient } from "./invite-client";

export const metadata = {
  title: "Accept invite — Work Calendar",
};

export default async function InviteAcceptPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  return <InviteAcceptClient token={token} />;
}
