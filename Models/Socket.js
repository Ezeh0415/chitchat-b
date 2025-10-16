// socket.js
let io = null;


module.exports = {
    init: (server) => {
        const { Server } = require("socket.io");
        const allowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
    io = new Server(server, {
      cors: {
        origin: function (origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Socket.IO - Not allowed by CORS"));
          }
        },
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    io.on("connection", (socket) => {
      console.log("Socket connected:", socket.id);
    });

    return io;
  },
  getIO: () => {
    if (!io) {
      throw new Error("Socket.io not initialized!");
    }
    return io;
  },
};
