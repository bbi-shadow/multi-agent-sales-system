import './globals.css';

export const metadata = { title: 'SalesMind AI', description: 'Multi-Agent Sales System' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
