import Link from 'next/link';
import { boardSpaces } from '../lib/monopoly-board.mjs';
type Square = { boardLocation: number | null; name: string; color: string | null; number: string; prize: string | null; ticket_count: string };
const colors: Record<string, string> = {
  brown: '#955333', lightblue: '#8bcbdc', pink: '#d5629c', purple: '#d5629c', orange: '#f29a37',
  red: '#df4e48', yellow: '#ebd54d', green: '#318862', blue: '#2e65a5', darkblue: '#2e65a5'
};
export function MonopolyBoard({ squares, boardId, name }: { squares: Square[]; boardId?: string; name?: string }) {
  const spaces = boardSpaces(squares);
  const collected = spaces.filter(s => s.count > 0).length;
  return <section className="monopoly-section" aria-label="Monopoly board">
    <div className="monopoly-scroll"><div className="monopoly-board">
      {spaces.map(space => <div key={space.position} style={{ gridRow: space.row, gridColumn: space.column }}
        className={`monopoly-space ${space.corner ? 'monopoly-corner' : ''} ${space.count ? 'monopoly-collected' : ''}`}
        title={`${space.name}${space.number ? ` · #${space.number}` : ''}${space.prize ? ` · ${space.prize}` : ''} · ${space.count} available stickers`}>
        {space.color && <span className="monopoly-color" style={{ backgroundColor: colors[String(space.color).toLowerCase().replace(/[\s_-]/g, '')] ?? '#87988c' }}/>} 
        {space.symbol && <span className="monopoly-symbol" aria-hidden="true">{space.symbol}</span>}
        <span className="monopoly-space-name">{space.name}</span>
        {space.number && <span className="monopoly-number">#{space.number}</span>}
        {space.count > 0 && <span className="monopoly-count" aria-label={`${space.count} available stickers`}>✓ {space.count}</span>}
      </div>)}
      <div className="monopoly-center"><span className="eyebrow">THE KALLEN FAMILY COLLECTION</span>
        <div className="monopoly-wordmark">MONOPOLY</div><h2>{name || 'Let’s fill the board.'}</h2>
        <p>Pool your pieces.<br/>Collect together.</p>
        {boardId ? <><span className="board-progress">{collected} squares collected</span><Link className="primary" href={`/boards/${boardId}`}>View &amp; add stickers →</Link></> : <p className="small">Create a board below to start pooling stickers.</p>}
      </div>
    </div></div>
    <div className="monopoly-legend"><span><i className="legend-dot"/> Collected</span><span>Number badges show available stickers.</span></div>
  </section>;
}
