import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KAFKA_TOPICS } from '../../common/constants/kafka-topics';
import { ProcessedEvent } from '../entities/processed-event.entity';
import { OrderStatus } from '../entities/order.entity';
import { OrdersService } from '../orders.service';

interface OrderResultPayload {
  correlationId: string;
  orderId: string;
}

@Controller()
export class OrderEventsConsumer {
  constructor(
    private readonly ordersService: OrdersService,
    @InjectRepository(ProcessedEvent)
    private readonly processedRepo: Repository<ProcessedEvent>,
  ) {}

  @EventPattern(KAFKA_TOPICS.ORDER_CONFIRMED)
  async handleOrderConfirmed(@Payload() payload: OrderResultPayload): Promise<void> {
    console.log('[orders] received order.confirmed:', JSON.stringify(payload));

    const eventKey = `${payload.correlationId}:${KAFKA_TOPICS.ORDER_CONFIRMED}`;

    const alreadyProcessed = await this.processedRepo.findOne({ where: { eventKey } });
    if (alreadyProcessed) {
      console.log(`[orders] duplicate event ${eventKey}, skipping`);
      return;
    }

    await this.ordersService.transitionStatus(payload.orderId, OrderStatus.CONFIRMED);
    await this.processedRepo.save({ eventKey, processedAt: new Date() });
  }

  @EventPattern(KAFKA_TOPICS.ORDER_FAILED)
  async handleOrderFailed(@Payload() payload: OrderResultPayload): Promise<void> {
    console.log('[orders] received order.failed:', JSON.stringify(payload));

    const eventKey = `${payload.correlationId}:${KAFKA_TOPICS.ORDER_FAILED}`;

    const alreadyProcessed = await this.processedRepo.findOne({ where: { eventKey } });
    if (alreadyProcessed) {
      console.log(`[orders] duplicate event ${eventKey}, skipping`);
      return;
    }

    await this.ordersService.transitionStatus(payload.orderId, OrderStatus.FAILED);
    await this.processedRepo.save({ eventKey, processedAt: new Date() });
  }
}
