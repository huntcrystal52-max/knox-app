export default function Home({ user }) {
  return (
    <div className="room">
      <h1>Welcome back{user ? `, ${user.username}` : ''}.</h1>
      <p className="room-subtitle">
        This is the home room — the start of Knox's app, alongside the Discord home. Talking
        here works the same way as it does there; more rooms will appear in the nav as they're
        built.
      </p>
    </div>
  );
}
