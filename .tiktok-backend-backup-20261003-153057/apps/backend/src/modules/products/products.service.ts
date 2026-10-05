import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { CreateProductDto } from './dto/create-product.dto';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product.name) private readonly model: Model<ProductDocument>) {}

  async create(dto: CreateProductDto) {
    if (Boolean(dto.trendEvidenceUrl) !== Boolean(dto.trendCheckedAt)) {
      throw new ConflictException('trendEvidenceUrl and trendCheckedAt must be provided together');
    }
    try {
      return await this.model.create(dto);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('SKU already exists');
      throw error;
    }
  }

  async findAll() {
    return this.model.find().sort({ createdAt: -1 }).limit(100).lean();
  }

  async findOne(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Product not found');
    const product = await this.model.findById(id).lean();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
