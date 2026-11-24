// Local static server for the web app (ES modules don't load from file://).
// Usage (from web-dev/): npm run serve  →  http://localhost:8787
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../web/", import.meta.url)));
const port = Number(process.env.PORT) || 8787;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(root, path === "/" ? "index.html" : path));
  if (!file.startsWith(root) || /[\/](tests|tools|node_modules)[\/]/.test(file.slice(root.length))) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch { res.writeHead(404).end("Not found"); }
}).listen(port, "127.0.0.1", () => console.log(`Flowline Calc on http://localhost:${port}`));
