import { Controller, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka, EventPattern, Payload } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KAFKA_TOPICS } from '../../common/constants/kafka-topics';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { InventoryService } from '../inventory.service';

interface OrderCreatedPayload {
  correlationId: string;
  orderId: string;
  items: Array<{ productId: string; quantity: number }>;
  createdAt: string;
}

@Controller()
export class OrderEventsConsumer implements OnModuleInit {
  constructor(
    private readonly inventoryService: InventoryService,
    @Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka,
    @InjectRepository(ProcessedEvent)
    private readonly processedRepo: Repository<ProcessedEvent>,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
  }

  @EventPattern(KAFKA_TOPICS.ORDER_CREATED)
  async handleOrderCreated(@Payload() payload: OrderCreatedPayload): Promise<void> {
    console.log('[inventory] received order.created:', JSON.stringify(payload));

    const eventKey = `${payload.correlationId}:${KAFKA_TOPICS.ORDER_CREATED}`;

    const alreadyProcessed = await this.processedRepo.findOne({ where: { eventKey } });
    if (alreadyProcessed) {
      console.log(`[inventory] duplicate event ${eventKey}, skipping`);
      return;
    }

    try {
      const inStock = await this.inventoryService.checkStock(payload.items);

      if (inStock) {
        this.kafkaClient.emit(KAFKA_TOPICS.ORDER_CONFIRMED, {
          correlationId: payload.correlationId,
          orderId: payload.orderId,
          confirmedAt: new Date().toISOString(),
        });
        console.log(`[inventory] order ${payload.orderId} confirmed`);
      } else {
        this.kafkaClient.emit(KAFKA_TOPICS.ORDER_FAILED, {
          correlationId: payload.correlationId,
          orderId: payload.orderId,
          reason: 'Insufficient stock for one or more items',
          failedAt: new Date().toISOString(),
        });
        console.log(`[inventory] order ${payload.orderId} failed — insufficient stock`);
      }

      await this.processedRepo.save({ eventKey, processedAt: new Date() });
    } catch (err) {
      console.error(`[inventory] error processing event ${eventKey}:`, err.message);
    }
  }
}
