// Adapter: lets the existing Vercel-style handlers (module.exports = (req, res) => …)
// run unchanged as Yandex Cloud Functions, which use (event, context) => { statusCode, body }.
// Yandex API Gateway delivers requests in AWS-API-Gateway-compatible shape.

function adaptVercel(handler) {
  return async (event = {}, context = {}) => {
    const query = event.queryStringParameters || {};

    // Body may arrive base64-encoded (binary) or as a raw string.
    let rawBody = event.body || '';
    if (event.isBase64Encoded && rawBody) {
      rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
    }
    let parsedBody = {};
    if (rawBody) {
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = {}; }
    }

    const req = {
      method: event.httpMethod || (event.requestContext && event.requestContext.httpMethod) || 'GET',
      query,
      body: parsedBody,
      headers: event.headers || {},
    };

    let statusCode = 200;
    const headers  = {};
    let body       = '';
    let isBase64Encoded = false;

    const res = {
      setHeader(k, v) { headers[k] = v; return this; },
      status(code)    { statusCode = code; return this; },
      json(obj)       {
        headers['Content-Type'] = 'application/json; charset=utf-8';
        body = JSON.stringify(obj);
        return this;
      },
      send(data) {
        if (Buffer.isBuffer(data)) {
          body = data.toString('base64');
          isBase64Encoded = true;
          if (!headers['Content-Type']) headers['Content-Type'] = 'application/octet-stream';
        } else if (typeof data === 'object' && data !== null) {
          headers['Content-Type'] = 'application/json; charset=utf-8';
          body = JSON.stringify(data);
        } else {
          body = data == null ? '' : String(data);
        }
        return this;
      },
      end() { return this; },
    };

    await handler(req, res);

    return { statusCode, headers, body, isBase64Encoded };
  };
}

module.exports = { adaptVercel };
