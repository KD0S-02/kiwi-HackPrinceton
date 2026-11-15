import "./globals.css";
import { KiwiBridge } from "../components/KiwiBridge";

export const metadata = { title: "Fieldnote" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <KiwiBridge />
      </body>
    </html>
  );
}
