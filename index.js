export default {
  async fetch(request, env, ctx) {
    // Allow your website to call this worker (CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method === "POST") {
      try {
        const body = await request.json();

        // 1. If receiving a webhook update directly from Telegram
        if (body.message) {
          console.log("Telegram update:", body.message.text);
          return new Response("OK", { status: 200 });
        }

        // 2. If receiving an alert trigger sent from your website
        if (body.text) {
          const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
          const CHAT_ID = env.TELEGRAM_CHAT_ID;

          const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: CHAT_ID,
              text: body.text,
              parse_mode: "Markdown",
            }),
          });

          return new Response(JSON.stringify(await tgRes.json()), {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        return new Response("No actionable payload", { status: 400 });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    return new Response("Worker is active and listening.", { status: 200 });
  },
};