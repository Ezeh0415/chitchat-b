function handleError(res, error, message = "Server error", status = 500) {
  console.error(message, error);
  return res.status(status).json({ message, error: error?.message });
}

module.exports = { handleError };
