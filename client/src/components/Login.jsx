import { api } from '../api.js';

export default function Login() {
  return (
    <div className="login">
      <h1>Knox</h1>
      <p>Log in with Discord to continue.</p>
      <a className="login-button" href={api.loginUrl()}>
        Log in with Discord
      </a>
    </div>
  );
}
