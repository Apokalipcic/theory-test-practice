// Cloudflare Worker: cross-device progress store for the theory-test site.
//
// It does exactly two things, keyed by nickname:
//   GET  /<nickname>  -> returns that profile's JSON blob (404 if new)
//   PUT  /<nickname>  -> saves the JSON blob sent in the body
//
// The nickname is the KV key; the value is the whole profile blob, which is
// the same shape storage.js already stores in localStorage. Last write wins,
// which is fine for one person hopping between their own devices.
//
// Setup (see the chat steps): bind your KV namespace to this Worker with the
// variable name PROGRESS. That name is how the code below reaches the shelf.

const CORS = {
  // "*" = any site may call this Worker. Fine here: there is no password and
  // nothing secret to protect. Tighten to your Pages URL later if you want.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Cap a single profile so nobody can fill the store with junk. A real profile
// is a few KB; 200 KB is enormous headroom.
const MAX_BYTES = 200 * 1024;

export default {
  async fetch(request, env) {
    // Browsers send a preflight OPTIONS request before a cross-site PUT.
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    // Everything after the leading slash is the nickname. Lower-cased so
    // "Sam" and "sam" are the same profile, matching the old behaviour.
    const name = decodeURIComponent(url.pathname.slice(1)).trim().toLowerCase();
    if (!name) {
      return json({ error: 'Missing nickname in the URL path.' }, 400);
    }

    const key = 'profile:' + name;

    if (request.method === 'GET') {
      const blob = await env.PROGRESS.get(key);
      if (blob === null) {
        // New nickname: 204 (success, empty body) rather than 404, so the
        // browser's own console stays clean on a first-time login. The frontend
        // treats an empty response as "start a blank profile".
        return new Response(null, { status: 204, headers: CORS });
      }
      return new Response(blob, {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > MAX_BYTES) {
        return json({ error: 'Profile too large.' }, 413);
      }
      // Make sure it is at least valid JSON before we store it.
      try {
        JSON.parse(body);
      } catch (e) {
        return json({ error: 'Body is not valid JSON.' }, 400);
      }
      await env.PROGRESS.put(key, body);
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed.' }, 405);
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
