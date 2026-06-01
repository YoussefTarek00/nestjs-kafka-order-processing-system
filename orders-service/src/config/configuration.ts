export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
    name: process.env.DATABASE_NAME || 'orders_db',
    user: process.env.DATABASE_USER || 'orders_user',
    password: process.env.DATABASE_PASSWORD || 'orders_pass',
  },
  kafka: {
    broker: process.env.KAFKA_BROKER || 'localhost:9092',
  },
});
