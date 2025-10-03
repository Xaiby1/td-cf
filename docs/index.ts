
import { Hono } from "hono";
export const docs = new Hono();
docs.get("/api/docx", (c) => {
    const html = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Desi Cloudflare API Docs</title>
        <style>
          :root { color-scheme: light dark; }
          body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif; margin: 24px; line-height: 1.5; }
          h1 { margin-bottom: 0.2rem; }
          h2 { margin-top: 2rem; }
          code, pre { background: rgba(127,127,127,0.12); padding: 2px 6px; border-radius: 6px; }
          pre { padding: 12px; overflow: auto; }
          .card { border: 1px solid rgba(127,127,127,0.25); border-radius: 10px; padding: 16px; margin: 12px 0; }
          .row { display: flex; gap: 10px; flex-wrap: wrap; }
          input, select, button { padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(127,127,127,0.3); background: transparent; color: inherit; }
          button { cursor: pointer; border: 1px solid rgba(127,127,127,0.4); }
          .muted { opacity: 0.8; }
          .ok { color: #22a559; }
          .err { color: #d24444; }
          .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        </style>
      </head>
      <body>
        <h1>DESI CLOUDFLARE</h1>
        <p class="muted">Minimal docs and quick checker</p>
        <div class="card">
          <h2>Status</h2>
          <div class="row">
            <button id="pingBtn">Ping /message</button>
            <span id="pingStatus" class="mono"></span>
          </div>
          <h3>Quick Provider Check</h3>
          <div class="row">
            <label>Mode
              <select id="mode">
                <option value="id">ID based</option>
                <option value="url">URL based</option>
              </select>
            </label>
            <label>Host
              <select id="host">
                <option value="daily">daily</option>
                <option value="flash">flash</option>
                <option value="vk">vk</option>
                <option value="t">kimcartoon(t)</option>
                <option value="vh">kimcartoon(vh)</option>
                <option value="vr">vidrock</option>
                <option value="vs">vidsrc</option>
                <option value="filemoon">filemoon (URL)</option>
                <option value="vplayer">vplayer (URL)</option>
              </select>
            </label>
          </div>
          <div class="row" id="idRow">
            <input id="idInput" placeholder="id (e.g., 2698510 or tt0944947)" size="28" />
            <input id="season" placeholder="season (optional)" size="14" />
            <input id="epNum" placeholder="epNum (optional)" size="14" />
            <select id="type">
              <option value="series">series</option>
              <option value="movie">movie</option>
            </select>
          </div>
          <div class="row" id="urlRow" style="display:none">
            <input id="urlInput" placeholder="full embed url" size="60" />
          </div>
          <div class="row">
            <button id="checkBtn">Fetch /sources</button>
            <span id="checkStatus" class="mono"></span>
          </div>
          <pre id="checkOutput" class="mono" style="max-height: 320px"></pre>
        </div>
        <h2>Routes</h2>
        <div class="card">
          <h3>Health</h3>
          <pre>GET /message</pre>
          <h3>Docs</h3>
          <pre>GET /api/docx</pre>
          <h3>Providers (id-based)</h3>
          <pre>
  GET /sources?id={id}&host=daily
  GET /sources?id={id}&host=flash
  GET /sources?id={id}&host=vk
  GET /sources?id={id}&host=vr&type=movie|series[&season=1][&epNum=1]
  GET /sources?id={id}&host=t|vh
  GET /sources?id={imdbId}&host=vs&type=movie|series[&season=1][&epNum=1]
          </pre>
          <h3>Providers (url-based)</h3>
          <pre>
  GET /sources?url={url}                (vidmoly default)
  GET /sources?url={url}&host=filemoon  (filemoon)
  GET /sources?url={url}&host=vplayer   (vplayer)
          </pre>
          <h3>Proxy</h3>
          <pre>GET /hls/{encoded}</pre>
        </div>
        <script>
          const $ = (id) => document.getElementById(id);
          const pingBtn = $('pingBtn');
          const pingStatus = $('pingStatus');
          const modeSel = $('mode');
          const idRow = $('idRow');
          const urlRow = $('urlRow');
          const hostSel = $('host');
          const typeSel = $('type');
          const idInput = $('idInput');
          const urlInput = $('urlInput');
          const seasonInput = $('season');
          const epInput = $('epNum');
          const checkBtn = $('checkBtn');
          const checkStatus = $('checkStatus');
          const checkOutput = $('checkOutput');
          modeSel.addEventListener('change', () => {
            const urlMode = modeSel.value === 'url';
            urlRow.style.display = urlMode ? '' : 'none';
            idRow.style.display = urlMode ? 'none' : '';
          });
          pingBtn.addEventListener('click', async () => {
            pingStatus.textContent = '...';
            try {
              const r = await fetch('/message');
              pingStatus.textContent = r.ok ? 'OK' : ('ERR ' + r.status);
              pingStatus.className = r.ok ? 'ok mono' : 'err mono';
            } catch (e) {
              pingStatus.textContent = 'ERR';
              pingStatus.className = 'err mono';
            }
          });
          checkBtn.addEventListener('click', async () => {
            checkStatus.textContent = '...';
            checkOutput.textContent = '';
            try {
              let url = '/sources';
              const host = hostSel.value;
              if (modeSel.value === 'url') {
                const u = encodeURIComponent(urlInput.value.trim());
                url += '?url=' + u + (host ? ('&host=' + encodeURIComponent(host)) : '');
              } else {
                const id = encodeURIComponent(idInput.value.trim());
                url += '?id=' + id + '&host=' + encodeURIComponent(host);
                const type = typeSel.value;
                if (host === 'vr' || host === 'vs') url += '&type=' + encodeURIComponent(type);
                const s = seasonInput.value.trim();
                const e = epInput.value.trim();
                if (s) url += '&season=' + encodeURIComponent(s);
                if (e) url += '&epNum=' + encodeURIComponent(e);
              }
              const r = await fetch(url);
              checkStatus.textContent = r.ok ? 'OK' : ('ERR ' + r.status);
              checkStatus.className = r.ok ? 'ok mono' : 'err mono';
              const json = await r.json();
              checkOutput.textContent = JSON.stringify(json, null, 2);
            } catch (e) {
              checkStatus.textContent = 'ERR';
              checkStatus.className = 'err mono';
              checkOutput.textContent = String(e);
            }
          });
        </script>
      </body>
    </html>`;
    return c.html(html);
  });