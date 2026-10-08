// Classic US board labels are a layout fallback, not a promotion/prize catalog.
const definitions = [
  ['GO', null, '↖'], ['Mediterranean Avenue', 'brown'], ['Community Chest', null, '▣'], ['Baltic Avenue', 'brown'], ['Income Tax', null, '$'],
  ['Reading Railroad', null, '🚂'], ['Oriental Avenue', 'lightblue'], ['Chance', null, '?'], ['Vermont Avenue', 'lightblue'], ['Connecticut Avenue', 'lightblue'],
  ['Jail / Just Visiting', null, '▥'], ['St. Charles Place', 'pink'], ['Electric Company', null, '☀'], ['States Avenue', 'pink'], ['Virginia Avenue', 'pink'],
  ['Pennsylvania Railroad', null, '🚂'], ['St. James Place', 'orange'], ['Community Chest', null, '▣'], ['Tennessee Avenue', 'orange'], ['New York Avenue', 'orange'],
  ['Free Parking', null, '🚙'], ['Kentucky Avenue', 'red'], ['Chance', null, '?'], ['Indiana Avenue', 'red'], ['Illinois Avenue', 'red'],
  ['B. & O. Railroad', null, '🚂'], ['Atlantic Avenue', 'yellow'], ['Ventnor Avenue', 'yellow'], ['Water Works', null, '◉'], ['Marvin Gardens', 'yellow'],
  ['Go to Jail', null, '↙'], ['Pacific Avenue', 'green'], ['North Carolina Avenue', 'green'], ['Community Chest', null, '▣'], ['Pennsylvania Avenue', 'green'],
  ['Short Line', null, '🚂'], ['Chance', null, '?'], ['Park Place', 'blue'], ['Luxury Tax', null, '◆'], ['Boardwalk', 'blue']
];
export function boardCoordinates(position) {
  if (!Number.isInteger(position) || position < 0 || position > 39) throw new RangeError('Board positions are 0–39.');
  if (position <= 10) return { row: 11, column: 11 - position };
  if (position <= 20) return { row: 21 - position, column: 1 };
  if (position <= 30) return { row: 1, column: position - 19 };
  return { row: position - 29, column: 11 };
}
export function boardSpaces(squares = []) {
  const catalog = new Map(squares.filter(s => s.boardLocation !== null).map(s => [s.boardLocation, s]));
  return definitions.map(([name, color, symbol], position) => {
    const square = catalog.get(position);
    return { position, ...boardCoordinates(position), name: square?.name ?? name, color: square?.color ?? color,
      symbol: square ? null : symbol, number: square?.number, prize: square?.prize,
      count: Number(square?.ticket_count ?? 0), corner: position % 10 === 0 };
  });
}
