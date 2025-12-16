export const handler = async (event) => {
  try {
    const apiKey = process.env.GOVEE_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing GOVEE_API_KEY" }) };
    }

    const { device, model, cmd } = JSON.parse(event.body || "{}");
    if (!device || !model || !cmd) {
      return { statusCode: 400, body: JSON.stringify({ error: "Expected { device, model, cmd }" }) };
    }

    const resp = await fetch("https://developer-api.govee.com/v1/devices/control", {
      method: "PUT",
      headers: {
        "Govee-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ device, model, cmd }),
    });

    // Govee sometimes returns an empty body; force a JSON response to the client.
    const text = await resp.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    return {
      statusCode: resp.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: resp.ok, status: resp.status, data }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
};
