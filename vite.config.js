import { defineConfig, loadEnv } from 'vite';

// Development-only proxy. No environment secrets are included in the static build.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'OPENROUTER_');
  return {
    base: './',
    plugins: [{
      name: 'local-openrouter',
      configureServer(server) {
        server.middlewares.use('/api/local-status', (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ available: Boolean(env.OPENROUTER_API_KEY) }));
        });
        server.middlewares.use('/api/local-completion', async (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          if (req.method !== 'POST' || !env.OPENROUTER_API_KEY) {
            res.statusCode = 404; return res.end(JSON.stringify({ error: { message: 'Local API is unavailable.' } }));
          }
          // Reject cross-origin requests to the local credential-bearing endpoint.
          const origin = req.headers.origin;
          if (origin && origin !== `http://${req.headers.host}`) {
            res.statusCode = 403; return res.end(JSON.stringify({ error: { message: 'Origin rejected.' } }));
          }
          try {
            let body = '';
            for await (const chunk of req) {
              body += chunk;
              if (body.length > 500000) throw new Error('Request too large.');
            }
            const payload = JSON.parse(body);
            if (payload.model !== 'openai/gpt-6.1-sol' || payload.reasoning?.effort !== 'medium') throw new Error('Unsupported model configuration.');
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST', signal: AbortSignal.timeout(90000),
              headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Mafia Table' },
              body: JSON.stringify(payload),
            });
            res.statusCode = response.status;
            res.end(await response.text());
          } catch (error) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: { message: error.name === 'TimeoutError' ? 'The AI took too long. Try again.' : 'Local AI request failed. Please retry.' } }));
          }
        });
      },
    }],
  };
});
