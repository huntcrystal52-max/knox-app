import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Wraps whatever HTML/CSS/JS Knox wrote into a minimal page for the iframe.
// Two layers of safety here, deliberately overlapping: the iframe's
// `sandbox="allow-scripts"` attribute (no allow-same-origin, no
// allow-forms, no allow-top-navigation — it can't touch the real app, read
// its cookies, or navigate anywhere) and this CSP meta tag, which blocks
// the page itself from making any network request or loading anything
// external even if a script tried to. Between the two, whatever runs here
// can draw on the canvas, react to clicks and keys, and nothing else.
function wrapForSandbox(code) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:;">
<style>
  html, body { margin: 0; padding: 0; background: #1a1625; color: #f3eef7; font-family: -apple-system, sans-serif; }
</style>
</head>
<body>
${code}
</body>
</html>`;
}

export default function Build() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [language, setLanguage] = useState('html');
  const [requesting, setRequesting] = useState(false);
  const [openId, setOpenId] = useState(null);

  // Keyed by project id — so running one project's Python doesn't disturb
  // another's, and the output sticks around while you look at other cards.
  const [runResults, setRunResults] = useState({});
  const [runningId, setRunningId] = useState(null);

  useEffect(() => {
    api
      .listBuilds()
      .then((data) => setProjects(data.projects || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || requesting) return;

    setRequesting(true);
    try {
      const data = await api.requestBuild(text, language);
      setProjects((prev) => [data.project, ...prev]);
      setPrompt('');
      setOpenId(data.project.id);
    } catch (err) {
      // Leave the prompt in place so nothing typed is lost if this fails.
    } finally {
      setRequesting(false);
    }
  }

  async function handleRun(id) {
    setRunningId(id);
    try {
      const data = await api.runBuild(id);
      setRunResults((prev) => ({ ...prev, [id]: data }));
    } catch (err) {
      setRunResults((prev) => ({
        ...prev,
        [id]: { error: "Couldn't run that just now." },
      }));
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="room">
      <h1>Build</h1>
      <p className="room-subtitle">Small things Knox makes — on his own, or when you ask him to.</p>

      <form className="entry-form" onSubmit={handleSubmit}>
        <div className="build-language-toggle">
          <button
            type="button"
            className={'build-language-button' + (language === 'html' ? ' build-language-button--active' : '')}
            onClick={() => setLanguage('html')}
            disabled={requesting}
          >
            Web app
          </button>
          <button
            type="button"
            className={'build-language-button' + (language === 'python' ? ' build-language-button--active' : '')}
            onClick={() => setLanguage('python')}
            disabled={requesting}
          >
            Python script
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            language === 'python'
              ? 'Ask him to write a Python script — a calculator, a little game, something that crunches numbers...'
              : 'Ask him to build something — a game, a generative pattern, a toy...'
          }
          rows={2}
          disabled={requesting}
        />
        <button type="submit" disabled={requesting || !prompt.trim()}>
          {requesting ? 'Building...' : 'Ask Knox to build it'}
        </button>
      </form>

      <div className="build-grid">
        {loading && <p className="room-subtitle">Loading...</p>}
        {!loading && projects.length === 0 && <p className="room-subtitle">Nothing built yet.</p>}
        {projects.map((project) => {
          const isOpen = openId === project.id;
          const isPython = project.language === 'python';
          const result = runResults[project.id];
          const isRunning = runningId === project.id;

          return (
            <div key={project.id} className="build-card">
              <h2 className="build-title">{project.title}</h2>
              {project.description && <p className="build-description">{project.description}</p>}
              <span className="entry-meta">
                {project.author} — {new Date(project.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                {isPython ? ' — Python' : ''}
              </span>

              <button
                type="button"
                className="ask-knox-button"
                onClick={() => setOpenId(isOpen ? null : project.id)}
              >
                {isOpen ? 'Close' : isPython ? 'View code' : 'Run it'}
              </button>

              {isOpen && !isPython && (
                <iframe
                  className="build-frame"
                  title={project.title}
                  sandbox="allow-scripts"
                  srcDoc={wrapForSandbox(project.code)}
                />
              )}

              {isOpen && isPython && (
                <div className="build-python">
                  <pre className="build-code">{project.code}</pre>
                  <button
                    type="button"
                    className="ask-knox-button"
                    onClick={() => handleRun(project.id)}
                    disabled={isRunning}
                  >
                    {isRunning ? 'Running...' : 'Run it'}
                  </button>

                  {result && (
                    <div className="build-output">
                      {result.error && <p className="build-output-error">{result.error}</p>}
                      {result.stdout && <pre className="build-output-stdout">{result.stdout}</pre>}
                      {result.stderr && <pre className="build-output-stderr">{result.stderr}</pre>}
                      {!result.error && !result.stdout && !result.stderr && (
                        <p className="room-subtitle">Ran with no output.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
