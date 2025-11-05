function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const ips = xff
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    return ips[0];
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || null;
}

module.exports = { getClientIp };
