import { notFound } from 'next/navigation';

/** The app serves landing links only; its root has nothing to show. */
export default function Home(): never {
  notFound();
}
