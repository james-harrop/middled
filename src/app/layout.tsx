import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["400", "500", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Middled — One swing. One fix.",
  description:
    "Upload one golf swing from your phone. Get the single highest-leverage fix, a drill, and three checkpoints. Your video never leaves your phone.",
  openGraph: {
    title: "Middled — One swing. One fix.",
    description:
      "AI swing analysis in your browser. No app. No subscription. First swing free.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
          <Link href="/" className="wordmark text-xl">
            Middled<span className="text-[var(--brass)]">.</span>
          </Link>
          <Link href="/analyze" className="btn-ghost text-sm !py-2 !px-4">
            Analyse a swing
          </Link>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="px-6 py-10 max-w-5xl mx-auto w-full flex flex-col sm:flex-row gap-3 items-center justify-between text-sm dim">
          <span className="wordmark">Middled.golf</span>
          <span>Your video never leaves your phone. Only four still frames are analysed.</span>
        </footer>
      </body>
    </html>
  );
}
