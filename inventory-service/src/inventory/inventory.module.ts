import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessedEvent } from './entities/processed-event.entity';
import { InventoryItem } from './entities/inventory-item.entity';
import { OrderEventsConsumer } from './events/order-events.consumer';
import { InventoryService } from './inventory.service';
import { InventorySeed } from './seed/inventory.seed';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryItem, ProcessedEvent]),
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_CLIENT',
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'inventory-producer',
              brokers: [config.get<string>('kafka.broker')],
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [OrderEventsConsumer],
  providers: [InventoryService, InventorySeed],
})
export class InventoryModule {}
