import { Routes, Route } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import Nav from './components/Nav.jsx';
import Login from './components/Login.jsx';
import Home from './rooms/Home.jsx';
import LoveNotes from './rooms/LoveNotes.jsx';
import Sacred from './rooms/Sacred.jsx';
import Stillness from './rooms/Stillness.jsx';
import Images from './rooms/Images.jsx';
import Build from './rooms/Build.jsx';

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
      <Nav />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/love-notes" element={<LoveNotes />} />
          <Route path="/sacred" element={<Sacred />} />
          <Route path="/stillness" element={<Stillness />} />
          <Route path="/images" element={<Images />} />
          <Route path="/build" element={<Build />} />
        </Routes>
      </main>
    </div>
  );
}
