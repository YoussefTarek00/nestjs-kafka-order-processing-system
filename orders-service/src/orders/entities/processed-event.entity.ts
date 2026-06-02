import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryColumn()
  eventKey: string;

  @Column()
  processedAt: Date;
}
