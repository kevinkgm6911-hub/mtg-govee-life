

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

    const data = await resp.json();
    return { statusCode: resp.status, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
