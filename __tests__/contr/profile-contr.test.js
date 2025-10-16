const { ProfileImage, CoverImage } = require("../../Controller/Profile-contr");
const { getDB } = require("../../Models/Db");
const { handleError } = require("../../Utils/ErrorHandler");
const cloudinary = require("../../Utils/Cloudinary");
const fs = require("fs");

jest.mock("../../Models/Db", () => ({
  getDB: jest.fn(),
}));

jest.mock("../../Utils/ErrorHandler", () => ({
  handleError: jest.fn((res, error, message, status) =>
    res.status(status || 500).json({ message })
  ),
}));

jest.mock("../../Utils/Cloudinary", () => ({
  uploader: {
    upload: jest.fn(() => Promise.resolve({ secure_url: "mock_url" })),
  },
}));

jest.mock("fs", () => ({
  unlinkSync: jest.fn(),
}));

describe("ProfileImage Controller", () => {
  let req, res, dbMock;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      file: null,
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    dbMock = {
      collection: jest.fn().mockReturnThis(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
    };

    getDB.mockReturnValue(dbMock);
  });

  it("should return 400 if email or file is missing", async () => {
    req.body = {}; // no email
    req.file = null; // no file

    await ProfileImage(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Email and image are required for upload",
      400
    );
  });

  it("should return 404 if user not found", async () => {
    req.body = { email: "user@test.com" };
    req.file = { mimetype: "image/png", path: "somepath" };

    dbMock.findOne.mockResolvedValueOnce(null);

    await ProfileImage(req, res);

    expect(handleError).toHaveBeenCalledWith(res, null, "User not found", 404);
  });

  it("should return 400 if file type is invalid", async () => {
    req.body = { email: "user@test.com" };
    req.file = { mimetype: "application/pdf", path: "somepath" };

    dbMock.findOne.mockResolvedValueOnce({ _id: "mockId" });

    await ProfileImage(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Only image files are allowed",
      400
    );
  });

  it("should upload the image, update DB, delete local file, and return success", async () => {
    req.body = { email: "user@test.com" };
    req.file = { mimetype: "image/png", path: "mockpath" };

    const user = { _id: "mockId" };
    dbMock.findOne.mockResolvedValueOnce(user);
    dbMock.updateOne.mockResolvedValueOnce({});

    await ProfileImage(req, res);

    // cloudinary uploader called correctly
    expect(cloudinary.uploader.upload).toHaveBeenCalledWith("mockpath", {
      folder: "profile_images",
      public_id: "mockId",
      overwrite: true,
    });

    // DB update called to set profileImage URL
    expect(dbMock.updateOne).toHaveBeenCalledWith(
      { email: "user@test.com" },
      { $set: { profileImage: "mock_url" } }
    );

    // fs.unlinkSync called to delete local file
    expect(fs.unlinkSync).toHaveBeenCalledWith("mockpath");

    // Response with success status and message
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Profile image uploaded successfully",
      imageUrl: "mock_url",
    });
  });

  it("should handle unexpected errors gracefully", async () => {
    req.body = { email: "user@test.com" };
    req.file = { mimetype: "image/png", path: "mockpath" };

    dbMock.findOne.mockRejectedValueOnce(new Error("DB failure"));

    await ProfileImage(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      expect.any(Error),
      "Failed to upload profile image",
      500
    );
  });
});

describe("CoverImage Controller", () => {
  let req, res, dbMock;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      file: null,
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    dbMock = {
      collection: jest.fn().mockReturnThis(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
    };

    getDB.mockReturnValue(dbMock);
  });

  it("should return 400 if email or file is missing", async () => {
    req.body = {}; // no email
    req.file = null; // no file

    await CoverImage(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Email and image are required for upload",
      400
    );
  });

  it("should return 404 if user not found", async () => {
    req.body = { email: "user@test.com" };
    req.file = { mimetype: "image/png", path: "somepath" };

    dbMock.findOne.mockResolvedValueOnce(null);

    await CoverImage(req, res);

    expect(handleError).toHaveBeenCalledWith(res, null, "User not found", 404);
  });

  it("should return 400 if file type is invalid", async () => {
    req.body = { email: "user@test.com" };
    req.file = { mimetype: "application/pdf", path: "somepath" };

    dbMock.findOne.mockResolvedValueOnce({ _id: "mockId" });

    await CoverImage(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Only image files are allowed",
      400
    );
  });

  it("should upload the image, update DB, delete local file, and return success", async () => {
    req.body = { email: "user@test.com" };
    req.file = { mimetype: "image/png", path: "mockpath" };

    const user = { _id: "mockId" };
    dbMock.findOne.mockResolvedValueOnce(user);
    dbMock.updateOne.mockResolvedValueOnce({});

    await CoverImage(req, res);

    // cloudinary uploader called correctly
    expect(cloudinary.uploader.upload).toHaveBeenCalledWith("mockpath", {
      folder: "profile_images",
      public_id: "mockId",
      overwrite: true,
    });

    // DB update called to set coverImage URL
    expect(dbMock.updateOne).toHaveBeenCalledWith(
      { email: "user@test.com" },
      { $set: { coverImage: "mock_url" } }
    );

    // fs.unlinkSync called to delete local file
    expect(fs.unlinkSync).toHaveBeenCalledWith("mockpath");

    // Response with success status and message
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Profile image uploaded successfully",
      imageUrl: "mock_url",
    });
  });

  it("should handle unexpected errors gracefully", async () => {
    req.body = { email: "user@test.com" };
    req.file = { mimetype: "image/png", path: "mockpath" };

    dbMock.findOne.mockRejectedValueOnce(new Error("DB failure"));

    await CoverImage(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      expect.any(Error),
      "Failed to upload profile image",
      500
    );
  });
});