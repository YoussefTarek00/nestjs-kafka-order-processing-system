import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessedEvent } from '../src/inventory/entities/processed-event.entity';
import { InventoryItem } from '../src/inventory/entities/inventory-item.entity';
import { OrderEventsConsumer } from '../src/inventory/events/order-events.consumer';
import { InventoryService } from '../src/inventory/inventory.service';

const mockItemRepo = () => ({
  findOne: jest.fn(),
});

const mockProcessedRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
});

const mockKafkaClient = () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  emit: jest.fn(),
});

describe('InventoryService', () => {
  let service: InventoryService;
  let itemRepo: jest.Mocked<Repository<InventoryItem>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventoryItem), useFactory: mockItemRepo },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    itemRepo = module.get(getRepositoryToken(InventoryItem));
  });

  describe('checkStock', () => {
    it('returns true when all items have sufficient stock', async () => {
      itemRepo.findOne.mockResolvedValue({ productId: 'p-1', quantity: 10 } as InventoryItem);

      const result = await service.checkStock([{ productId: 'p-1', quantity: 3 }]);

      expect(result).toBe(true);
    });

    it('returns false when a product does not exist in inventory', async () => {
      itemRepo.findOne.mockResolvedValue(null);

      const result = await service.checkStock([{ productId: 'unknown', quantity: 1 }]);

      expect(result).toBe(false);
    });

    it('returns false when a product has insufficient quantity', async () => {
      itemRepo.findOne.mockResolvedValue({ productId: 'p-1', quantity: 2 } as InventoryItem);

      const result = await service.checkStock([{ productId: 'p-1', quantity: 5 }]);

      expect(result).toBe(false);
    });

    it('returns false as soon as any item fails — does not require all to fail', async () => {
      itemRepo.findOne
        .mockResolvedValueOnce({ productId: 'p-1', quantity: 100 } as InventoryItem)
        .mockResolvedValueOnce(null);

      const result = await service.checkStock([
        { productId: 'p-1', quantity: 1 },
        { productId: 'missing', quantity: 1 },
      ]);

      expect(result).toBe(false);
    });
  });
});

describe('OrderEventsConsumer', () => {
  let consumer: OrderEventsConsumer;
  let inventoryService: jest.Mocked<InventoryService>;
  let processedRepo: jest.Mocked<Repository<ProcessedEvent>>;
  let kafkaClient: ReturnType<typeof mockKafkaClient>;

  beforeEach(async () => {
    kafkaClient = mockKafkaClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderEventsConsumer,
        {
          provide: InventoryService,
          useValue: { checkStock: jest.fn() },
        },
        {
          provide: 'KAFKA_CLIENT',
          useValue: kafkaClient,
        },
        {
          provide: getRepositoryToken(ProcessedEvent),
          useFactory: mockProcessedRepo,
        },
      ],
    }).compile();

    consumer = module.get<OrderEventsConsumer>(OrderEventsConsumer);
    inventoryService = module.get(InventoryService);
    processedRepo = module.get(getRepositoryToken(ProcessedEvent));
  });

  const basePayload = {
    correlationId: 'corr-1',
    orderId: 'order-1',
    items: [{ productId: 'p-1', quantity: 2 }],
    createdAt: new Date().toISOString(),
  };

  it('skips processing when the event was already handled (idempotency)', async () => {
    processedRepo.findOne.mockResolvedValue({ eventKey: 'corr-1:order.created' } as ProcessedEvent);

    await consumer.handleOrderCreated(basePayload);

    expect(inventoryService.checkStock).not.toHaveBeenCalled();
    expect(kafkaClient.emit).not.toHaveBeenCalled();
  });

  it('emits order.confirmed when stock is sufficient', async () => {
    processedRepo.findOne.mockResolvedValue(null);
    inventoryService.checkStock.mockResolvedValue(true);
    processedRepo.save.mockResolvedValue({} as ProcessedEvent);

    await consumer.handleOrderCreated(basePayload);

    expect(kafkaClient.emit).toHaveBeenCalledWith(
      'order.confirmed',
      expect.objectContaining({ correlationId: 'corr-1', orderId: 'order-1' }),
    );
  });

  it('emits order.failed when stock is insufficient', async () => {
    processedRepo.findOne.mockResolvedValue(null);
    inventoryService.checkStock.mockResolvedValue(false);
    processedRepo.save.mockResolvedValue({} as ProcessedEvent);

    await consumer.handleOrderCreated(basePayload);

    expect(kafkaClient.emit).toHaveBeenCalledWith(
      'order.failed',
      expect.objectContaining({ correlationId: 'corr-1', orderId: 'order-1' }),
    );
  });

  it('saves the processed event key after handling', async () => {
    processedRepo.findOne.mockResolvedValue(null);
    inventoryService.checkStock.mockResolvedValue(true);
    processedRepo.save.mockResolvedValue({} as ProcessedEvent);

    await consumer.handleOrderCreated(basePayload);

    expect(processedRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: 'corr-1:order.created' }),
    );
  });
});
