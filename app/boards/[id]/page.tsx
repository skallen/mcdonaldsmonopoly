import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '../../../lib/auth';
import { db } from '../../../lib/db';
import { Header, Message } from '../../components';
import { addMember, addTicket, setTicketStatus } from '../../actions';
export default async function Board({ params, searchParams }: { params: Promise<{id: string}>; searchParams: Promise<{error?: string}> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await db.query(`SELECT b.*, m.role FROM "tbl_gameBoard" b JOIN "tbljn_users_gameBoard" m ON m.game_board_id=b."ID" WHERE b."ID"=$1 AND m.user_id=$2`, [id, user.ID]);
  if (!result.rowCount) notFound();
  const board = result.rows[0];
  const [tickets, members, squares] = await Promise.all([
    db.query(`SELECT t."ID", t.name, t.number, t.code, t.status, t.submitted_by, t.scan_data IS NOT NULL AS has_scan,
      u."firstName", u."lastName", s.color, s.prize FROM tbl_ticket t JOIN tbl_user u ON u."ID"=t.submitted_by
      LEFT JOIN tblkp_square s ON s."ID"=t.square_id WHERE t.game_board_id=$1 ORDER BY t.created_at DESC`, [id]),
    db.query(`SELECT u."firstName", u."lastName", m.role FROM "tbljn_users_gameBoard" m JOIN tbl_user u ON u."ID"=m.user_id WHERE m.game_board_id=$1 ORDER BY m.joined_at`, [id]),
    db.query(`SELECT s.*, EXISTS(SELECT 1 FROM tbl_ticket t WHERE t.square_id=s."ID" AND t.game_board_id=$1 AND t.status='available') AS collected
      FROM tblkp_square s WHERE game_edition=$2 ORDER BY "boardLocation" NULLS LAST, number`, [id, board.game_edition])
  ]);
  const available = tickets.rows.filter(t => t.status === 'available').length;
  return <><Header user={user}/><main><Link className="back-link" href="/">← My boards</Link><div className="page-heading"><div><span className="eyebrow">{board.game_edition} · PRIVATE BOARD</span><h1>{board.name}</h1><p>Every piece in one place. Every member in the loop.</p></div><span className="privacy-badge">● {members.rowCount} members</span></div><Message {...await searchParams}/>
    <div className="stats"><div><b>{tickets.rowCount}</b><span>Total stickers</span></div><div><b>{available}</b><span>Available to share</span></div><div><b>{squares.rows.filter(s=>s.collected).length} / {squares.rowCount}</b><span>Squares collected</span></div></div>
    {squares.rows.length > 0 && <section><div className="section-heading"><h2>Board progress</h2></div><div className="square-grid">{squares.rows.map(s=><div className={`square ${s.collected ? 'collected' : ''}`} key={s.ID}><span className="tag">{s.color || 'Square'}</span><strong>{s.name}</strong><span>#{s.number} {s.collected ? '✓ Collected' : 'Needed'}</span>{s.prize && <small>{s.prize}</small>}</div>)}</div></section>}
    <div className="collection-grid"><section><div className="section-heading"><h2>Shared stickers</h2><span className="muted">{tickets.rowCount} pieces</span></div>{!tickets.rowCount ? <div className="empty panel"><span className="empty-icon">◇</span><h3>The first piece is yours.</h3><p>Add a sticker with its name, number, and code. You can attach a photo too.</p></div> : <div className="ticket-list">{tickets.rows.map(t=><article className="ticket-card" key={t.ID}><div className="ticket-image">{t.has_scan ? <a href={`/api/tickets/${t.ID}/scan`} target="_blank" rel="noreferrer"><img src={`/api/tickets/${t.ID}/scan`} alt={`Scan of ${t.name}`} loading="lazy"/></a> : <span>◇</span>}</div><div className="ticket-details"><div className="card-bottom"><span className="eyebrow">#{t.number} {t.color && `· ${t.color}`}</span><span className={`tag ${t.status==='available' ? 'green' : ''}`}>{t.status}</span></div><h3>{t.name}</h3><code>{t.code}</code><p className="small">Added by {t.firstName} {t.lastName}</p>{t.prize && <p className="small">Prize: {t.prize}</p>}{(t.submitted_by===user.ID || board.role==='owner') && <form action={setTicketStatus}><input type="hidden" name="boardId" value={id}/><input type="hidden" name="ticketId" value={t.ID}/><input type="hidden" name="status" value={t.status==='available' ? 'redeemed' : 'available'}/><button className="text-button">Mark {t.status==='available' ? 'redeemed' : 'available'}</button></form>}</div></article>)}</div>}</section>
    <aside className="sidebar"><section className="panel"><span className="eyebrow">ADD TO THE COLLECTION</span><h2>Found a sticker?</h2><p>Enter the details and share it with your board.</p><form action={addTicket} className="stack"><input type="hidden" name="boardId" value={id}/><label>Sticker name<input name="name" placeholder="e.g. Boardwalk" maxLength={100} required/></label><div className="two-fields"><label>Number<input name="number" placeholder="Sticker number" maxLength={30} required/></label><label>Code<input name="code" placeholder="Unique code" maxLength={100} required/></label></div><label className="upload">Attach a photo<input name="scan" type="file" accept="image/jpeg,image/png,image/webp"/><span className="field-hint">JPEG, PNG, or WebP · up to 5 MB. Enter the printed details above.</span></label><button className="primary">Share sticker <span>＋</span></button></form></section>
    <section className="panel"><h2>Your circle</h2><ul className="member-list">{members.rows.map((m,i)=><li key={i}><span className="avatar">{m.firstName.slice(0,1)}</span><span>{m.firstName} {m.lastName}<small>{m.role}</small></span></li>)}</ul>{board.role==='owner' && <form action={addMember} className="stack"><input type="hidden" name="boardId" value={id}/><label>Add an authorized member<input name="email" type="email" placeholder="Their account email" maxLength={254} required/></label><button className="secondary">Add to board</button></form>}</section></aside></div>
  </main></>;
}
