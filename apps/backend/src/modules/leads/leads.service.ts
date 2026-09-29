import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateLeadDto } from './dto/create-lead.dto';
import { Lead, LeadDocument } from './schemas/lead.schema';

@Injectable()
export class LeadsService {
  constructor(@InjectModel(Lead.name) private readonly model: Model<LeadDocument>) {}

  create(dto: CreateLeadDto) {
    return this.model.create(dto);
  }

  findAll() {
    return this.model.find({ deletedAt: { $exists: false } }).sort({ createdAt: -1 }).lean();
  }

  async findOne(id: string) {
    const lead = await this.model.findOne({ _id: id, deletedAt: { $exists: false } }).lean();
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }
}
