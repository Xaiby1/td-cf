import { Hono } from "hono";
import { extractFlash } from "./providers/flashplayer";
import type { Source } from "./types/sources";
import { handleHlsProxy } from "./proxy/proxy";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.options("/sources", (c) =>
  c.body(null, 204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  })
);

app.options("/hls/:b64", (c) =>
  c.body(null, 200, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Max-Age": "86400",
  })
);

app.get("/hls/:b64", async (c) => handleHlsProxy(c));

app.get("/sources", async (c) => {
  const id = c.req.query("id");
  if (id) {
    try {
      const data: Source = await extractFlash(id);
      return c.json(
        { success: true, url: id, data },
        200,
        { "Access-Control-Allow-Origin": "*" }
      );
    } catch (err: any) {
      const message = err?.message || "Internal error";
      return c.json(
        { success: false, error: message },
        500,
        { "Access-Control-Allow-Origin": "*" }
      );
    }
  }

  return c.json(
    { success: false, error: "Missing required query parameter: id" },
    400,
    { "Access-Control-Allow-Origin": "*" }
  );
});

export default app;