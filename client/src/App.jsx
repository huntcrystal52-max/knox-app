import { Routes, Route } from 'react-router-dom';
import { useAuth } from './useAuth.js';
import Nav from './components/Nav.jsx';
import Login from './components/Login.jsx';
import Home from './rooms/Home.jsx';

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
          <Route path="/" element={<Home user={user} />} />
        </Routes>
      </main>
    </div>
  );
}
