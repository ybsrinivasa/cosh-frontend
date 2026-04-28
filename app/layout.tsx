import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Cosh 2.0",
  description: "Cosh Knowledge Management System",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  )
}
