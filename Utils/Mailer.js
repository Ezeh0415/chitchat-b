require("dotenv").config();
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);
async function sendOtpEmail(subject, message) {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_USER,
      to: "ezeanwechigozie@gmail.com",
      subject: subject,
      html: message,
    });
    if (error) {
      console.error("❌ Failed to send email:", error);
    } else {
      console.log("✅ Email sent:", data);
    }
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

module.exports = { sendOtpEmail };
