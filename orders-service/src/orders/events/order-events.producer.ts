import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { KAFKA_TOPICS } from '../../common/constants/kafka-topics';
import { Order } from '../entities/order.entity';

@Injectable()
export class OrderEventsProducer implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafkaClient: ClientKafka) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
  }

  emitOrderCreated(order: Order): void {
    const payload = {
      correlationId: order.correlationId,
      orderId: order.id,
      items: order.items,
      createdAt: order.createdAt.toISOString(),
    };
    this.kafkaClient.emit(KAFKA_TOPICS.ORDER_CREATED, payload);
  }
}
