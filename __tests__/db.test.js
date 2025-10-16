const { connectDB, getDB } = require('../Models/Db');
const { MongoMemoryServer } = require('mongodb-memory-server');

describe('Db.js', () => {
  const originalUri = process.env.MONGODB_URI;
  let mongoServer;

  afterEach(() => {
    process.env.MONGODB_URI = originalUri; // restore original env
  });

  afterAll(async () => {
    if (mongoServer) await mongoServer.stop();
  });

  it('should throw if MONGODB_URI is not set', async () => {
    delete process.env.MONGODB_URI;
    await expect(connectDB()).rejects.toThrow(
      "❌ MONGODB_URI is not defined in Railway variables."
    );
  });

  it('getDB should throw if not connected', () => {
    expect(() => getDB()).toThrow("Database not connected. Call connectDB() first.");
  });

  it('should connect successfully if MONGODB_URI is set', async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = await mongoServer.getUri();  // await here
    process.env.MONGODB_URI = uri;

    await expect(connectDB()).resolves.not.toThrow();

    const db = getDB();
    expect(db).toBeTruthy();
    expect(typeof db.collection).toBe('function');
  });
});
