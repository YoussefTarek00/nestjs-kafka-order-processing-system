import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { ProcessedEvent } from './entities/processed-event.entity';
import { OrderEventsConsumer } from './events/order-events.consumer';
import { OrderEventsProducer } from './events/order-events.producer';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, ProcessedEvent]),
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_CLIENT',
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'orders-producer',
              brokers: [config.get<string>('kafka.broker')],
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [OrdersController, OrderEventsConsumer],
  providers: [OrdersService, OrderEventsProducer],
  exports: [OrdersService],
})
export class OrdersModule {}
