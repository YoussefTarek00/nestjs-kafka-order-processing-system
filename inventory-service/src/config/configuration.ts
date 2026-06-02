export default () => ({
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT, 10) || 5433,
    name: process.env.DATABASE_NAME || 'inventory_db',
    user: process.env.DATABASE_USER || 'inventory_user',
    password: process.env.DATABASE_PASSWORD || 'inventory_pass',
  },
  kafka: {
    broker: process.env.KAFKA_BROKER || 'localhost:9092',
  },
});
