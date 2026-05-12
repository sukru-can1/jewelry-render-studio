import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Jewelry Render Studio",
  description: "Cloud render lab for photorealistic jewelry imagery"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

