import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product.name) private readonly model: Model<ProductDocument>) {}

  async create(dto: CreateProductDto) {
    if (dto.affiliateUrl) this.assertTikTokAffiliateUrl(dto.affiliateUrl);
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

  private assertTikTokAffiliateUrl(raw: string) {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !/(^|\.)tiktok\.com$/i.test(url.hostname) || url.username || url.password) {
      throw new BadRequestException('Affiliate URL must use an HTTPS TikTok domain');
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    if (!isValidObjectId(id)) throw new NotFoundException('Product not found');
    const current = await this.model.findById(id).lean();
    if (!current) throw new NotFoundException('Product not found');
    const affiliateUrl = dto.affiliateUrl ?? current.affiliateUrl;
    if (dto.affiliateUrl) this.assertTikTokAffiliateUrl(dto.affiliateUrl);
    if (dto.affiliateStatus === 'READY' && !affiliateUrl) {
      throw new BadRequestException('Add your TikTok Creator affiliate URL before marking READY');
    }
    return this.model.findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true }).lean();
  }
}
