
export const handler = async () => {
  try {
    const apiKey = process.env.GOVEE_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing GOVEE_API_KEY" }) };
    }

    const resp = await fetch("https://developer-api.govee.com/v1/devices", {
      method: "GET",
      headers: {
        "Govee-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    });

    const data = await resp.json();
    return { statusCode: resp.status, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
