import { z } from 'zod';
import { currentUser } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });
  const result = await db.query(`SELECT t.scan_data, t.scan_mime_type FROM tbl_ticket t
    JOIN "tbljn_users_gameBoard" m ON m.game_board_id=t.game_board_id
    WHERE t."ID"=$1 AND m.user_id=$2 AND t.scan_data IS NOT NULL`, [id, user.ID]);
  if (!result.rowCount) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(result.rows[0].scan_data), { headers: {
    'Content-Type': result.rows[0].scan_mime_type,
    'Cache-Control': 'private, no-store',
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff'
  }});
}
