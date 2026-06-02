# Order Processing System

A small event-driven system built with NestJS microservices and Apache Kafka. Two services communicate asynchronously to process customer orders and validate stock.

## Services

- **Orders Service** – REST API that accepts orders and listens for inventory results
- **Inventory Service** – Kafka consumer that checks stock and publishes the outcome

## How it works

When a client places an order via `POST /orders`, the Orders Service saves it with a `PENDING` status and publishes an `order.created` event to Kafka. The Inventory Service picks it up, checks the database for available stock, and publishes either `order.confirmed` or `order.failed`. The Orders Service consumes that result and updates the order status accordingly.

The client can call `GET /orders/:id` at any point to check the current status.

## Getting started

The only requirement is Docker and Docker Compose.

```bash
docker-compose up --build
```

This starts Zookeeper, Kafka, two PostgreSQL instances, and both services. On first boot the Inventory Service seeds five products into the database automatically.

Wait until you see both services are running:

```
orders-service    | [Nest] Application is running on: http://0.0.0.0:3000
inventory-service | [inventory] microservice is listening
```

## Trying it out

**Place an order:**

```bash
curl -s -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"productId":"product-1","quantity":2}]}' | jq .
```

Copy the `id` from the response, then poll the status:

```bash
curl -s http://localhost:3000/orders/<id> | jq .status
```

It starts as `"PENDING"` and should become `"CONFIRMED"` within a couple of seconds.

**Trigger a failure:**

`product-4` is seeded with zero stock, so ordering it will result in `"FAILED"`:

```bash
curl -s -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"productId":"product-4","quantity":1}]}' | jq .
```

## Seeded products

| productId | quantity |
| product-1 | 100 |
| product-2 | 50 |
| product-3 | 200 |
| product-4 | 0 |
| product-5 | 75 |

## Running the tests

```bash
cd orders-service
npm install
npm test

cd ../inventory-service
npm install
npm test
```

## Notes

**Two databases** — each service has its own PostgreSQL instance to keep the data boundaries clean.

**Idempotent consumers** — both services track processed events in a `processed_events` table so duplicate deliveries from Kafka are silently ignored.

**Correlation ID** — a UUID is generated when an order is created and flows through every event, making it easy to trace a request across both services in the logs. You can also pass your own via the `x-correlation-id` request header.

**Consumer retry and dead-letter handling** — intentionally left out to keep the implementation focused on the core event-driven flow. In a production environment, I would introduce retry policies with exponential backoff and dead-letter topics for messages that exceed the retry threshold.
