import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LeadDocument = HydratedDocument<Lead>;

@Schema({ timestamps: true })
export class Lead {
  @Prop({ required: true, trim: true }) fullName!: string;
  @Prop({ required: true, lowercase: true, trim: true }) email!: string;
  @Prop({ trim: true }) company?: string;
  @Prop({ trim: true }) industry?: string;
  @Prop({ type: [String], default: [] }) interests!: string[];
  @Prop({ enum: ['NEW', 'RESEARCHED', 'SCORED', 'QUALIFIED', 'CONTACTED', 'RESPONDED', 'CONVERTED', 'LOST'], default: 'NEW', index: true }) status!: string;
  @Prop({ min: 0, max: 100, default: 0 }) score!: number;
  @Prop({ enum: ['COLD', 'WARM', 'HOT', 'QUALIFIED'], default: 'COLD' }) classification!: string;
  @Prop({ enum: ['MANUAL', 'CSV', 'WEBSITE_FORM', 'CRM'], default: 'MANUAL' }) source!: string;
  @Prop({ enum: ['GRANTED', 'NOT_GRANTED', 'UNKNOWN'], default: 'UNKNOWN' }) consentStatus!: string;
  @Prop() consentAt?: Date;
  @Prop() deletedAt?: Date;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
LeadSchema.index({ email: 1, deletedAt: 1 });
LeadSchema.index({ status: 1, score: -1 });
