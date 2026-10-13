import bcrypt from 'bcryptjs';

// Usage: pnpm --filter api hash-password '<password>'  → prints a value for HR_PASSWORD_HASH.
const BCRYPT_COST = 12;
const MIN_LENGTH = 12;

const password = process.argv[2];
if (!password) {
  console.error("Usage: pnpm --filter api hash-password '<password>'");
  process.exit(1);
}
if (password.length < MIN_LENGTH) {
  console.error(`Password must be at least ${MIN_LENGTH} characters.`);
  process.exit(1);
}

console.log(await bcrypt.hash(password, BCRYPT_COST));
