import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessedEvent } from '../src/orders/entities/processed-event.entity';
import { Order, OrderStatus } from '../src/orders/entities/order.entity';
import { OrderEventsConsumer } from '../src/orders/events/order-events.consumer';
import { OrderEventsProducer } from '../src/orders/events/order-events.producer';
import { OrdersService } from '../src/orders/orders.service';

const mockOrdersRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
});

const mockProcessedRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
});

const mockEventsProducer = () => ({
  emitOrderCreated: jest.fn(),
});

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: jest.Mocked<Repository<Order>>;
  let producer: jest.Mocked<OrderEventsProducer>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useFactory: mockOrdersRepo },
        { provide: OrderEventsProducer, useFactory: mockEventsProducer },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    ordersRepo = module.get(getRepositoryToken(Order));
    producer = module.get(OrderEventsProducer);
  });

  describe('isValidTransition', () => {
    it('allows PENDING -> CONFIRMED', () => {
      expect(service.isValidTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED)).toBe(true);
    });

    it('allows PENDING -> FAILED', () => {
      expect(service.isValidTransition(OrderStatus.PENDING, OrderStatus.FAILED)).toBe(true);
    });

    it('rejects CONFIRMED -> FAILED (terminal state)', () => {
      expect(service.isValidTransition(OrderStatus.CONFIRMED, OrderStatus.FAILED)).toBe(false);
    });

    it('rejects FAILED -> CONFIRMED (terminal state)', () => {
      expect(service.isValidTransition(OrderStatus.FAILED, OrderStatus.CONFIRMED)).toBe(false);
    });

    it('rejects CONFIRMED -> PENDING (no going back)', () => {
      expect(service.isValidTransition(OrderStatus.CONFIRMED, OrderStatus.PENDING)).toBe(false);
    });
  });

  describe('transitionStatus', () => {
    it('calls repo.update when transition is valid', async () => {
      const order = { id: 'order-1', status: OrderStatus.PENDING } as Order;
      ordersRepo.findOne.mockResolvedValue(order);

      await service.transitionStatus('order-1', OrderStatus.CONFIRMED);

      expect(ordersRepo.update).toHaveBeenCalledWith('order-1', { status: OrderStatus.CONFIRMED });
    });

    it('does not call repo.update when transition is invalid', async () => {
      const order = { id: 'order-1', status: OrderStatus.CONFIRMED } as Order;
      ordersRepo.findOne.mockResolvedValue(order);

      await service.transitionStatus('order-1', OrderStatus.FAILED);

      expect(ordersRepo.update).not.toHaveBeenCalled();
    });

    it('does not call repo.update when order is not found', async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await service.transitionStatus('non-existent', OrderStatus.CONFIRMED);

      expect(ordersRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('saves an order with PENDING status and the given correlationId', async () => {
      const dto = { items: [{ productId: 'p-1', quantity: 2 }] };
      const built = { ...dto, status: OrderStatus.PENDING, correlationId: 'corr-1' };
      const saved = { id: 'order-1', ...built };

      ordersRepo.create.mockReturnValue(built as Order);
      ordersRepo.save.mockResolvedValue(saved as Order);

      const result = await service.create(dto, 'corr-1');

      expect(ordersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.PENDING, correlationId: 'corr-1' }),
      );
      expect(result.id).toBe('order-1');
    });

    it('emits order.created after saving', async () => {
      const dto = { items: [{ productId: 'p-1', quantity: 1 }] };
      const saved = { id: 'order-1', ...dto, status: OrderStatus.PENDING } as Order;

      ordersRepo.create.mockReturnValue(saved);
      ordersRepo.save.mockResolvedValue(saved);

      await service.create(dto, 'corr-1');

      expect(producer.emitOrderCreated).toHaveBeenCalledWith(saved);
    });
  });

  describe('findById', () => {
    it('returns the order when found', async () => {
      const order = { id: 'order-1', status: OrderStatus.PENDING } as Order;
      ordersRepo.findOne.mockResolvedValue(order);

      const result = await service.findById('order-1');

      expect(result).toBe(order);
    });

    it('throws NotFoundException when order does not exist', async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });
});

describe('OrderEventsConsumer', () => {
  let consumer: OrderEventsConsumer;
  let ordersService: jest.Mocked<OrdersService>;
  let processedRepo: jest.Mocked<Repository<ProcessedEvent>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderEventsConsumer,
        {
          provide: OrdersService,
          useValue: { transitionStatus: jest.fn() },
        },
        {
          provide: getRepositoryToken(ProcessedEvent),
          useFactory: mockProcessedRepo,
        },
      ],
    }).compile();

    consumer = module.get<OrderEventsConsumer>(OrderEventsConsumer);
    ordersService = module.get(OrdersService);
    processedRepo = module.get(getRepositoryToken(ProcessedEvent));
  });

  describe('handleOrderConfirmed', () => {
    const payload = { correlationId: 'corr-1', orderId: 'order-1' };

    it('skips processing when event was already handled (idempotency)', async () => {
      processedRepo.findOne.mockResolvedValue({ eventKey: 'corr-1:order.confirmed' } as ProcessedEvent);

      await consumer.handleOrderConfirmed(payload);

      expect(ordersService.transitionStatus).not.toHaveBeenCalled();
    });

    it('transitions order to CONFIRMED and records the processed event', async () => {
      processedRepo.findOne.mockResolvedValue(null);
      ordersService.transitionStatus.mockResolvedValue(undefined);
      processedRepo.save.mockResolvedValue({} as ProcessedEvent);

      await consumer.handleOrderConfirmed(payload);

      expect(ordersService.transitionStatus).toHaveBeenCalledWith('order-1', OrderStatus.CONFIRMED);
      expect(processedRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventKey: 'corr-1:order.confirmed' }),
      );
    });
  });

  describe('handleOrderFailed', () => {
    const payload = { correlationId: 'corr-2', orderId: 'order-2' };

    it('skips processing when event was already handled (idempotency)', async () => {
      processedRepo.findOne.mockResolvedValue({ eventKey: 'corr-2:order.failed' } as ProcessedEvent);

      await consumer.handleOrderFailed(payload);

      expect(ordersService.transitionStatus).not.toHaveBeenCalled();
    });

    it('transitions order to FAILED and records the processed event', async () => {
      processedRepo.findOne.mockResolvedValue(null);
      ordersService.transitionStatus.mockResolvedValue(undefined);
      processedRepo.save.mockResolvedValue({} as ProcessedEvent);

      await consumer.handleOrderFailed(payload);

      expect(ordersService.transitionStatus).toHaveBeenCalledWith('order-2', OrderStatus.FAILED);
      expect(processedRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventKey: 'corr-2:order.failed' }),
      );
    });
  });
});
