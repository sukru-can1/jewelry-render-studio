import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Jewelry Catalog Renderer",
  description: "Production jewelry catalog rendering pipeline"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
