import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Kallen Monopoly Pooling', description: 'Collect and pool Monopoly stickers with your family.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<footer>Kallen Monopoly Pooling · An independent sticker organizer. Not affiliated with McDonald’s.</footer></body></html>;
}
