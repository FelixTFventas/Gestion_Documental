import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { database } from '@/lib/db';
import { detail } from '@/lib/documents';
import { AppError } from '@/lib/errors';
import { Shell } from '@/components/shell';
import { DocumentDetail } from '@/components/document-detail';
export const dynamic = 'force-dynamic';
export default async function DetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const user = await requireUser(); const { id } = await params; const query = await searchParams;
  try {
    const data = await detail(await database(), user, id, query.version ? Number(query.version) : undefined);
    return <Shell user={user}><DocumentDetail key={`${data.doc.id}-${data.doc.revision}-${data.version.number}`} data={JSON.parse(JSON.stringify(data))} user={user} /></Shell>;
  } catch (error) { if (error instanceof AppError && error.status === 404) notFound(); throw error; }
}
