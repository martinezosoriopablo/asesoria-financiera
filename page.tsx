// app/page.tsx
// Redirect automático a /advisor

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/advisor');
}
