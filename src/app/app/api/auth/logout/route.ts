import { clearSession } from '../../../account-auth';
export async function POST() {
  await clearSession();
  return Response.json({ ok: true });
}
