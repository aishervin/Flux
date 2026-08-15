// worker.js - Cloudflare Worker برای BFL API و Mistral
const BFL_API_KEY = "bfl_buq7WSfvI175FoOWtSPro3SHfLYXYT59";
const MISTRAL_API_KEY = "S07PkrVEh1ghk6M9WE2hB5FSvB1GczeF";
const BFL_BASE = "https://api.bfl.ai/v1";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // === Prompt Enhancement با Mistral ===
      if (path === "/api/enhance" && request.method === "POST") {
        const { prompt } = await request.json();
        const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${MISTRAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "mistral-small-latest",
            messages: [
              {
                role: "system",
                content: "You are an expert prompt engineer for FLUX AI image generation. Transform simple prompts into detailed, professional prompts with lighting, composition, style, camera angles, and mood. Return ONLY the enhanced prompt, nothing else. Make it vivid and descriptive.",
              },
              { role: "user", content: prompt },
            ],
          }),
        });
        const data = await res.json();
        const enhanced = data.choices?.[0]?.message?.content || prompt;
        return jsonResponse({ enhanced }, 200);
      }

      // === Submit درخواست به BFL ===
      if (path === "/api/submit" && request.method === "POST") {
        const { endpoint, payload } = await request.json();
        const res = await fetch(`${BFL_BASE}/${endpoint}`, {
          method: "POST",
          headers: {
            "accept": "application/json",
            "x-key": BFL_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        return jsonResponse(data, res.status);
      }

      // === Poll برای نتیجه ===
      if (path === "/api/poll" && request.method === "GET") {
        const pollingUrl = url.searchParams.get("url");
        if (!pollingUrl) return jsonResponse({ error: "Missing url" }, 400);
        
        const res = await fetch(pollingUrl, {
          headers: { "accept": "application/json", "x-key": BFL_API_KEY },
        });
        const data = await res.json();
        
        // اگر تصویر آماده است، دانلود و base64 کن
        if (data.status === "Ready" && data.result?.sample) {
          try {
            const imgRes = await fetch(data.result.sample);
            const imgBuffer = await imgRes.arrayBuffer();
            const uint8 = new Uint8Array(imgBuffer);
            let binary = '';
            for (let i = 0; i < uint8.length; i++) {
              binary += String.fromCharCode(uint8[i]);
            }
            const base64 = btoa(binary);
            data.result.imageData = `data:image/jpeg;base64,${base64}`;
          } catch (e) {
            console.error("Image fetch failed", e);
          }
        }
        return jsonResponse(data, res.status);
      }

      // === آپلود تصویر به base64 ===
      if (path === "/api/upload-base64" && request.method === "POST") {
        const { imageUrl } = await request.json();
        const imgRes = await fetch(imageUrl);
        const imgBuffer = await imgRes.arrayBuffer();
        const uint8 = new Uint8Array(imgBuffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);
        return jsonResponse({ base64: `data:image/jpeg;base64,${base64}` }, 200);
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
