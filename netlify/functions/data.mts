import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Generic JSON document store. Each Netlify Blobs "store" is one collection
// (lines, queues, weekly, queueWeekly, uploads); each blob key is one document id.

function storeFor(collection: string) {
  const safe = String(collection).replace(/[^a-zA-Z0-9_-]/g, "");
  return getStore({ name: "pccdash-" + safe, consistency: "strong" });
}

export default async (req: Request, context: Context) => {
  const { collection, id } = context.params;
  if (!collection) {
    return new Response(JSON.stringify({ error: "missing collection" }), { status: 400 });
  }
  const store = storeFor(collection);
  const url = new URL(req.url);

  try {
    if (req.method === "GET" && !id) {
      const { blobs } = await store.list();
      const docs = await Promise.all(
        blobs.map(async (b) => ({ id: b.key, data: await store.get(b.key, { type: "json" }) }))
      );
      return Response.json({ docs });
    }

    if (req.method === "GET" && id) {
      const data = await store.get(id, { type: "json" });
      return Response.json({ id, data });
    }

    if ((req.method === "PUT" || req.method === "POST") && id) {
      const body = await req.json();
      await store.setJSON(id, body);
      return Response.json({ ok: true, id });
    }

    if (req.method === "POST" && !id && url.searchParams.get("bulk") === "1") {
      const body = await req.json();
      const entries = Object.entries(body.docs || {});
      for (const [docId, docData] of entries) {
        await store.setJSON(docId, docData as Record<string, unknown>);
      }
      return Response.json({ ok: true, count: entries.length });
    }

    if (req.method === "POST" && !id) {
      const body = await req.json();
      const newId = body.id || crypto.randomUUID();
      await store.setJSON(newId, body);
      return Response.json({ ok: true, id: newId });
    }

    if (req.method === "DELETE" && id) {
      await store.delete(id);
      return Response.json({ ok: true });
    }

    return new Response(JSON.stringify({ error: "unsupported method/path" }), { status: 405 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/data/:collection", "/api/data/:collection/:id"],
};
