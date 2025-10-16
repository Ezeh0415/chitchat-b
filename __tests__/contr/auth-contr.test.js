// __tests__/authController.test.js

const {
  signup,
  login,
  VerifyOtp,
  ResetOtp,
  logout,
} = require("../../Controller/Auth-Contr");


jest.mock("../../Models/Db", () => ({
  getDB: jest.fn(),
}));

jest.mock("../../Utils/ErrorHandler", () => ({
  handleError: jest.fn((res, error, message, status) =>
    res.status(status || 500).json({ message })
  ),
}));

jest.mock("../../Utils/OtpGenerator", () => jest.fn(() => "123456"));

jest.mock("../../Utils/TokenGenerate", () =>
  jest.fn(() => ({
    accessToken: "mockAccessToken",
    refreshToken: "mockRefreshToken",
  }))
);

jest.mock("../../Utils/Mailer", () => ({
  sendOtpEmail: jest.fn(() => Promise.resolve()),
}));

const { getDB } = require("../../Models/Db");
const { handleError } = require("../../Utils/ErrorHandler");
const generateNumericOTP = require("../../Utils/OtpGenerator");
const generateTokens = require("../../Utils/TokenGenerate");
const { sendOtpEmail } = require("../../Utils/Mailer");
const bcrypt = require("bcrypt");

describe("signup controller", () => {
  let req, res, dbMock;

  beforeEach(() => {
    req = {
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
    };

    dbMock = {
      collection: jest.fn().mockReturnThis(),
      findOne: jest.fn(),
      insertOne: jest.fn(),
    };

    getDB.mockReturnValue(dbMock);

    jest.clearAllMocks();
  });

  it("should return 400 if required fields missing", async () => {
    req.body = {}; // empty

    await signup(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "All inputs are required",
      400
    );
  });

  it("should return 400 for invalid email", async () => {
    req.body = {
      firstName: "John",
      lastName: "Doe",
      email: "notanemail",
      password: "password123",
    };

    await signup(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Invalid email format",
      400
    );
  });

  it("should return 400 for short password", async () => {
    req.body = {
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      password: "short",
    };

    await signup(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Password must be at least 8 characters long",
      400
    );
  });

  it("should return 400 for invalid first or last name", async () => {
    req.body = {
      firstName: "J",
      lastName: "Doe!",
      email: "john@example.com",
      password: "password123",
    };

    await signup(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Names must be at least 2 letters and contain only alphabets",
      400
    );
  });

  it("should return 409 if user already exists", async () => {
    req.body = {
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      password: "password123",
    };

    dbMock.findOne.mockResolvedValueOnce({ email: "john@example.com" });

    await signup(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "User already exists",
      409
    );
  });

  it("should create user successfully", async () => {
    req.body = {
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      password: "password123",
    };

    dbMock.findOne.mockResolvedValueOnce(null); // no existing user
    dbMock.insertOne.mockResolvedValueOnce({ insertedId: "mockId" });

    dbMock.findOne.mockResolvedValueOnce({
      _id: "mockId",
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
    });

    // Mock bcrypt.hash to just return a dummy hash
    jest.spyOn(bcrypt, "hash").mockResolvedValue("hashed_value");

    // Mock generateTokens to return fixed tokens
    generateTokens.mockReturnValue({
      accessToken: "mockAccessToken",
      refreshToken: "mockRefreshToken",
    });

    await signup(req, res);

    expect(dbMock.insertOne).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken",
      "mockRefreshToken",
      expect.any(Object)
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "User created successfully",
        user: expect.objectContaining({
          _id: "mockId",
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
        }),
        accessToken: "mockAccessToken",
      })
    );

    expect(sendOtpEmail).toHaveBeenCalledWith(
      "john@example.com",
      expect.any(String),
      expect.any(String)
    );
  });

  it("should handle errors gracefully", async () => {
    req.body = {
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      password: "password123",
    };

    dbMock.findOne.mockRejectedValueOnce(new Error("DB Error"));

    await signup(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      expect.any(Error),
      "Error creating user"
    );
  });
});

describe("login controller", () => {
  let req, res, dbMock;

  beforeEach(() => {
    req = {
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
    };

    dbMock = {
      collection: jest.fn().mockReturnThis(),
      findOne: jest.fn(),
    };

    getDB.mockReturnValue(dbMock);

    jest.clearAllMocks();
  });

  it("should return 400 if required fields missing", async () => {
    req.body = {}; // empty

    await login(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Email and password are required",
      400
    );
  });

  it("should return 400 for invalid email", async () => {
    req.body = {
      email: "notanemail",
      password: "password123",
    };

    await login(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Invalid email format",
      400
    );
  });

  it("should return 400 for invalid password length", async () => {
    req.body = {
      email: "john@example.com",
      password: "short",
    };

    await login(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Password must be at least 8 characters long",
      400
    );
  });

  it("should return 400 if user not found", async () => {
    req.body = {
      email: "john@example.com",
      password: "password123",
    };

    dbMock.findOne.mockResolvedValueOnce(null);

    await login(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "user not found ",
      400
    );
  });

  it("should return 400 if password is incorrect", async () => {
    req.body = {
      email: "john@example.com",
      password: "wrongpassword",
    };

    dbMock.findOne.mockResolvedValueOnce({
      _id: "mockId",
      email: "john@example.com",
      password: "hashed_password",
    });

    jest.spyOn(bcrypt, "compare").mockResolvedValueOnce(false);

    await login(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "password is not correct try again",
      400
    );
  });

  it("should return 200 if login is successful", async () => {
    req.body = {
      email: "john@example.com",
      password: "password123",
    };

    const mockUser = {
      _id: "mockId",
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      password: "hashed_password",
    };

    dbMock.findOne.mockResolvedValueOnce(mockUser);

    jest.spyOn(bcrypt, "compare").mockResolvedValueOnce(true);

    generateTokens.mockReturnValue({
      accessToken: "mockAccessToken",
      refreshToken: "mockRefreshToken",
    });

    await login(req, res);

    expect(dbMock.findOne).toHaveBeenCalledWith({ email: "john@example.com" });

    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken",
      "mockRefreshToken",
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
        maxAge: expect.any(Number),
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Login successful",
      user: {
        _id: "mockId",
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
      },
      accessToken: "mockAccessToken",
    });
  });

  it("should handle unexpected errors", async () => {
    req.body = {
      email: "john@example.com",
      password: "password123",
    };

    dbMock.findOne.mockRejectedValueOnce(new Error("DB Error"));

    await login(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      expect.any(Error),
      "Error logging in user"
    );
  });
});

describe("VerifyOtp controller", () => {
  let req, res, dbMock;

  beforeEach(() => {
    req = {
      body: {},
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
    jest.clearAllMocks();
  });

  it("should return 400 if email or OTP is missing", async () => {
    req.body = { email: "", otp: "" };

    await VerifyOtp(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Email and OTP are required",
      400
    );
  });

  it("should return 400 for invalid email format", async () => {
    req.body = { email: "invalid_email", otp: "123456" };

    await VerifyOtp(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "Invalid email format",
      400
    );
  });

  it("should return 400 if user is not found", async () => {
    req.body = { email: "test@example.com", otp: "123456" };
    dbMock.findOne.mockResolvedValueOnce(null);

    await VerifyOtp(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "User not found. Please sign up or log in.",
      400
    );
  });

  it("should return 400 if OTP does not match", async () => {
    req.body = { email: "test@example.com", otp: "wrongOtp" };
    dbMock.findOne.mockResolvedValueOnce({
      email: "test@example.com",
      otp: "hashedOtp",
      otpCreatedAt: new Date(),
    });

    jest.spyOn(bcrypt, "compare").mockResolvedValueOnce(false);

    await VerifyOtp(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "OTP does not match. Please try again.",
      400
    );
  });

  it("should return 400 if OTP is expired", async () => {
    req.body = { email: "test@example.com", otp: "123456" };

    const oldDate = new Date(Date.now() - 11 * 60 * 1000); // 11 mins ago
    dbMock.findOne.mockResolvedValueOnce({
      email: "test@example.com",
      otp: "hashedOtp",
      otpCreatedAt: oldDate,
    });

    jest.spyOn(bcrypt, "compare").mockResolvedValueOnce(true);

    await VerifyOtp(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "OTP has expired. Please request a new one.",
      400
    );
  });

  it("should verify OTP successfully", async () => {
    req.body = { email: "test@example.com", otp: "123456" };

    const recentDate = new Date();
    dbMock.findOne.mockResolvedValueOnce({
      email: "test@example.com",
      otp: "hashedOtp",
      otpCreatedAt: recentDate,
    });

    jest.spyOn(bcrypt, "compare").mockResolvedValueOnce(true);
    dbMock.updateOne.mockResolvedValueOnce({});

    await VerifyOtp(req, res);

    expect(dbMock.updateOne).toHaveBeenCalledWith(
      { email: "test@example.com" },
      {
        $set: { isVerified: true },
        $unset: { otp: "", otpExpire: "" },
      }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OTP verified successfully",
    });
  });

  it("should handle unexpected errors", async () => {
    req.body = { email: "test@example.com", otp: "123456" };

    dbMock.findOne.mockRejectedValueOnce(new Error("DB Error"));

    await VerifyOtp(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      expect.any(Error),
      "OTP verification failed due to server error",
      500
    );
  });
});

describe("ResetOtp controller", () => {
  let req, res, dbMock;

  beforeEach(() => {
    req = {
      body: {},
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
    jest.clearAllMocks();
  });

  it("should return 404 if email is missing", async () => {
    req.body = {};

    await ResetOtp(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "could not get the sent email",
      404
    );
  });

  it("should return 404 if user not found", async () => {
    req.body = { email: "user@example.com" };

    dbMock.findOne.mockResolvedValueOnce(null);

    await ResetOtp(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      null,
      "user can`t be found ",
      404
    );
  });

  it("should resend OTP successfully", async () => {
    req.body = { email: "user@example.com" };

    dbMock.findOne.mockResolvedValueOnce({
      firstName: "John",
      lastName: "Doe",
      email: "user@example.com",
    });

    dbMock.updateOne.mockResolvedValueOnce({});

    jest.spyOn(bcrypt, "hash").mockResolvedValue("hashedOtp");
    generateNumericOTP.mockReturnValue("123456");

    await ResetOtp(req, res);

    expect(dbMock.updateOne).toHaveBeenCalledWith(
      { email: "user@example.com" },
      {
        $set: {
          isVerified: false,
          otp: "hashedOtp",
          otpExpire: expect.any(Date),
        },
      }
    );

    expect(sendOtpEmail).toHaveBeenCalledWith(
      "user@example.com",
      expect.any(String),
      expect.stringContaining("123456")
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "OTP resent successfully",
    });
  });

  it("should handle unexpected errors", async () => {
    req.body = { email: "user@example.com" };

    dbMock.findOne.mockRejectedValueOnce(new Error("DB Failure"));

    await ResetOtp(req, res);

    expect(handleError).toHaveBeenCalledWith(
      res,
      expect.any(Error),
      "ERROR RESENDING OTP"
    );
  });
});

describe("logout controller", () => {
  let req, res;

  beforeEach(() => {
    req = {}; // nothing needed
    res = {
      clearCookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    jest.clearAllMocks();
  });

  it("should clear refresh token cookie and return 200", async () => {
    await logout(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith("refreshToken", {
      httpOnly: true,
      sameSite: "Strict",
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Logged out successfully",
    });
  });
});
