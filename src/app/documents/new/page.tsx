import { requireUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { NewDocument } from '@/components/new-document';
export const dynamic = 'force-dynamic';
export default async function NewPage() { const user = await requireUser(); return <Shell user={user}><NewDocument allowed={Boolean(user.area_id)} /></Shell>; }
