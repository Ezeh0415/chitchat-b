const jwt = require("jsonwebtoken");

const secret = process.env.JWT_SECRET;

if (!secret) {
  throw new Error("JWT_SECRET is not defined");
}

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, username: user.username },
    secret,
    { expiresIn: "15m" } // shorter expiry for access token
  );

  const refreshToken = jwt.sign(
    { id: user.id, username: user.username },
    secret,
    { expiresIn: "7d" } // longer expiry for refresh token
  );

  return { accessToken, refreshToken };
};

module.exports = generateTokens;
