import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryItem } from './entities/inventory-item.entity';

interface OrderItem {
  productId: string;
  quantity: number;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly itemRepo: Repository<InventoryItem>,
  ) {}

  async checkStock(items: OrderItem[]): Promise<boolean> {
    for (const item of items) {
      const record = await this.itemRepo.findOne({ where: { productId: item.productId } });
      if (!record || record.quantity < item.quantity) {
        return false;
      }
    }
    return true;
  }
}
