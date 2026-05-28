import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications — Work Calendar",
};

export default function NotificationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
