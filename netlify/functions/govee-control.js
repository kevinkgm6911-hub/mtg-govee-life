export const handler = async (event) => {
  try {
    const apiKey = process.env.GOVEE_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing GOVEE_API_KEY" }) };
    }

    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing request body" }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Body was not valid JSON" }) };
    }

    const { device, model, cmd } = parsed || {};
    if (!device || !model || !cmd) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Expected { device, model, cmd }", received: parsed }),
      };
    }

    const resp = await fetch("https://developer-api.govee.com/v1/devices/control", {
      method: "PUT",
      headers: {
        "Govee-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ device, model, cmd }),
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Return Govee’s status code + body, even on errors, instead of throwing.
    return { statusCode: resp.status, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err), stack: err?.stack }) };
  }
};
