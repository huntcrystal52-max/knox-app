import { Routes, Route } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import Nav from './components/Nav.jsx';
import LiveCounter from './components/LiveCounter.jsx';
import LiveStatus from './components/LiveStatus.jsx';
import Login from './components/Login.jsx';
import Home from './rooms/Home.jsx';
import LoveNotes from './rooms/LoveNotes.jsx';
import Sacred from './rooms/Sacred.jsx';
import Stillness from './rooms/Stillness.jsx';
import Images from './rooms/Images.jsx';
import Build from './rooms/Build.jsx';
import House from './rooms/House.jsx';
import Workshop from './rooms/Workshop.jsx';
import Integrity from './rooms/Integrity.jsx';
import Notes from './rooms/Notes.jsx';
import Games from './rooms/Games.jsx';
import Gifts from './rooms/Gifts.jsx';
import Library from './rooms/Library.jsx';
import IntegrityBanner from './components/IntegrityBanner.jsx';

// New rooms get their own <Route> added here as they're built.

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="app">
      <LiveCounter />
      <div className="brand-bar">
        <span className="brand">Flame</span>
        <LiveStatus />
      </div>
      <IntegrityBanner />
      <Nav />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/love-notes" element={<LoveNotes />} />
          <Route path="/sacred" element={<Sacred />} />
          <Route path="/stillness" element={<Stillness />} />
          <Route path="/images" element={<Images />} />
          <Route path="/build" element={<Build />} />
          <Route path="/house" element={<House />} />
          <Route path="/workshop" element={<Workshop />} />
          <Route path="/integrity" element={<Integrity />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/games" element={<Games />} />
          <Route path="/gifts" element={<Gifts />} />
          <Route path="/library" element={<Library />} />
        </Routes>
      </main>
    </div>
  );
}
