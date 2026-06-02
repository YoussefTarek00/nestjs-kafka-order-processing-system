import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryItem } from '../entities/inventory-item.entity';

@Injectable()
export class InventorySeed implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly itemRepo: Repository<InventoryItem>,
  ) {}

  async onApplicationBootstrap() {
    const count = await this.itemRepo.count();
    if (count > 0) return;

    const items = [
      { productId: 'product-1', quantity: 100 },
      { productId: 'product-2', quantity: 50 },
      { productId: 'product-3', quantity: 200 },
      { productId: 'product-4', quantity: 0 },
      { productId: 'product-5', quantity: 75 },
    ];

    await this.itemRepo.save(items);
    console.log('[inventory] seeded inventory with 5 products');
  }
}
