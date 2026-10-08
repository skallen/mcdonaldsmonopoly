import Link from 'next/link';
import { requireUser } from '../lib/auth';
import { db } from '../lib/db';
import { createBoard } from './actions';
import { Header, Message } from './components';
import { MonopolyBoard } from './monopoly-board';
export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; board?: string }> }) {
  const user = await requireUser();
  const boards = await db.query(`SELECT b."ID", b.name, b.game_edition, m.role,
    (SELECT count(*) FROM tbl_ticket t WHERE t.game_board_id=b."ID") AS tickets,
    (SELECT count(*) FROM "tbljn_users_gameBoard" x WHERE x.game_board_id=b."ID") AS members
    FROM "tbl_gameBoard" b JOIN "tbljn_users_gameBoard" m ON m.game_board_id=b."ID"
    WHERE m.user_id=$1 ORDER BY b.created_at DESC`, [user.ID]);
  const params = await searchParams;
  const selected = boards.rows.find(board => board.ID === params.board) ?? boards.rows[0];
  const squares = selected ? await db.query(`SELECT s."boardLocation", s.name, s.color, s.number, s.prize,
    (SELECT count(*) FROM tbl_ticket t WHERE t.square_id=s."ID" AND t.game_board_id=$1 AND t.status='available') AS ticket_count
    FROM tblkp_square s WHERE s.game_edition=$2`, [selected.ID, selected.game_edition]) : { rows: [] };
  return <><Header user={user}/><main><div className="pool-heading"><h1>Kallen Monopoly Pooling</h1><p>One family. One board. More pieces together.</p></div><Message {...params}/>
    {boards.rows.length > 0 && <nav className="board-tabs" aria-label="Choose a game board">{boards.rows.map(board => <Link key={board.ID} href={`/?board=${board.ID}`} className={board.ID===selected?.ID ? 'active' : ''} aria-current={board.ID===selected?.ID ? 'page' : undefined}>{board.name}</Link>)}</nav>}
    <MonopolyBoard squares={squares.rows} boardId={selected?.ID} name={selected?.name}/>
    <div className="section-heading"><h2>My game boards</h2><span className="muted">{boards.rowCount} boards</span></div><div className="home-grid"><section className="board-list">{boards.rows.length ? boards.rows.map(board => <Link className="board-card" href={`/boards/${board.ID}`} key={board.ID}><span className="eyebrow">{board.game_edition}</span><h3>{board.name}</h3><div className="board-numbers"><span><b>{board.tickets}</b> stickers</span><span><b>{board.members}</b> members</span></div><div className="card-bottom"><span className="tag">{board.role}</span><span>Open board →</span></div></Link>) : <div className="empty panel"><span className="empty-icon">＋</span><h3>Your collection starts here.</h3><p>Create your first board, add your circle, and enter the stickers you find.</p></div>}</section>
    <aside className="panel"><span className="eyebrow">MAKE ROOM FOR A WIN</span><h2>Start a board</h2><p>Give your group a place to collect.</p><form action={createBoard} className="stack"><label>Board name<input name="name" placeholder="Family collection" maxLength={100} required/></label><label>Game edition<input name="edition" placeholder="US 2026" maxLength={100} required/><span className="field-hint">Use the same edition for boards sharing a square catalog.</span></label><button className="primary">Create board <span>＋</span></button></form></aside></div>
  </main></>;
}
