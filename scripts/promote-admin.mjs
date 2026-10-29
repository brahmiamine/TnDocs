import "dotenv/config";
import mysql from "mysql2/promise";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npm run admin:promote -- verified-account@example.com");
  process.exitCode = 2;
} else if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exitCode = 2;
} else {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [result] = await connection.execute(
      "UPDATE users SET role = 'admin' WHERE email = ? AND status = 'active'",
      [email],
    );
    if (result.affectedRows !== 1) {
      console.error("No active account was promoted. Create and verify the account first.");
      process.exitCode = 1;
    } else {
      console.info("Administrator role granted to the active account.");
    }
  } finally {
    await connection.end();
  }
}
