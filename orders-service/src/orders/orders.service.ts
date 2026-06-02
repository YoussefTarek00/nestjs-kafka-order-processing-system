import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderEventsProducer } from './events/order-events.producer';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    private readonly eventsProducer: OrderEventsProducer,
  ) {}

  async create(dto: CreateOrderDto, correlationId: string): Promise<Order> {
    const order = this.ordersRepo.create({
      items: dto.items,
      correlationId,
      status: OrderStatus.PENDING,
    });
    const saved = await this.ordersRepo.save(order);
    this.eventsProducer.emitOrderCreated(saved);
    return saved;
  }

  async findById(id: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async transitionStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      console.warn(`[orders] transitionStatus: order ${orderId} not found, skipping`);
      return;
    }

    if (!this.isValidTransition(order.status, newStatus)) {
      console.warn(
        `[orders] invalid transition ${order.status} -> ${newStatus} for order ${orderId}, skipping`,
      );
      return;
    }

    await this.ordersRepo.update(orderId, { status: newStatus });
  }

  isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.FAILED],
      [OrderStatus.CONFIRMED]: [],
      [OrderStatus.FAILED]: [],
    };
    return allowed[from].includes(to);
  }
}
