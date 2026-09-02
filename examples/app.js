export function configuration() {
  return {
    apiUrl: process.env.API_URL,
    databaseUrl: process.env.DATABASE_URL,
    logLevel: process.env.LOG_LEVEL,
  };
}
