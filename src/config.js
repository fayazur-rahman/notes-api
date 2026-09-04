const REQUIRED_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'PORT',
];

function requiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveInteger(name, value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig() {
  for (const name of REQUIRED_VARS) {
    requiredEnv(name);
  }

  return {
    port: positiveInteger('PORT', process.env.PORT),
    db: {
      host: process.env.DB_HOST,
      port: positiveInteger('DB_PORT', process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: {
        rejectUnauthorized: false
      }
    },
  };
}
