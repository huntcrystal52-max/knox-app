import SimpleContentRoom from './SimpleContentRoom.jsx';

export default function LoveNotes() {
  return (
    <SimpleContentRoom
      room="love-notes"
      title="Love Notes"
      subtitle="Somewhere to leave what doesn't fit into the everyday."
      placeholder="Write him a note..."
      emptyText="Nothing here yet — leave the first one."
    />
  );
}
