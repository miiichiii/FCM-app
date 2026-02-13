import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..", "web");
const port = Number(process.env.PORT ?? 5173);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".wasm", "application/wasm"],
]);

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function safeResolveUrlToPath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname);
  const clean = decoded.split("?")[0].split("#")[0];
  const relativePath = clean === "/" ? "/index.html" : clean;
  const resolved = path.resolve(rootDir, "." + relativePath);
  if (!resolved.startsWith(rootDir + path.sep)) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const filePath = safeResolveUrlToPath(url.pathname);
    if (!filePath) {
      send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad request");
      return;
    }

    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = contentTypes.get(ext) ?? "application/octet-stream";
    const body = await fs.readFile(filePath);
    send(
      res,
      200,
      {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
        // Enable SharedArrayBuffer if we need it later (COOP/COEP).
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      body,
    );
  } catch (err) {
    send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, String(err?.stack ?? err));
  }
});

server.on("error", (err) => {
  const code = err?.code ? String(err.code) : "";
  if (code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use.`);
    console.error(`Try: PORT=${port + 1} npm run dev`);
  } else if (code === "EPERM") {
    console.error(`Permission denied while binding to 127.0.0.1:${port} (EPERM).`);
    console.error("This environment may block listening sockets. Run on your local machine instead.");
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FCM-app dev server running at http://127.0.0.1:${port}`);
  console.log(`Serving ${rootDir}`);
});
