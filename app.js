const { connectDB } = require("./Models/Db");
const { server } = require("./server");
const { init } = require("./Models/Socket");

const PORT = process.env.PORT || 8080;

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`✅ Server listening on http://localhost:${PORT}`);
      init(server); // Initialize socket.io once here
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to DB:", err);
  });
