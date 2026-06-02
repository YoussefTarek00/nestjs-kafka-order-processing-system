import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../src/orders/entities/order.entity';
import { OrderEventsProducer } from '../src/orders/events/order-events.producer';
import { OrdersService } from '../src/orders/orders.service';

const mockOrdersRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
});

const mockEventsProducer = () => ({
  emitOrderCreated: jest.fn(),
});

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: jest.Mocked<Repository<Order>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(Order),
          useFactory: mockOrdersRepo,
        },
        {
          provide: OrderEventsProducer,
          useFactory: mockEventsProducer,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    ordersRepo = module.get(getRepositoryToken(Order));
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
});
