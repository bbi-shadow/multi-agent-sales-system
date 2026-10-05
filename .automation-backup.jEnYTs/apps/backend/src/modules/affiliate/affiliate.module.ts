import {
  BadRequestException, Body, Controller, Get, Headers, Injectable, Module,
  NotFoundException, Param, Patch, Post, Redirect,
} from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { Model, Types, isValidObjectId } from 'mongoose';
import { requireAdmin } from '../../common/admin-auth';
import { Product, ProductSchema } from '../products/schemas/product.schema';

@Schema({ timestamps: true })
class VideoPlan {
  @Prop({ type: Types.ObjectId, required: true, index: true }) productId!: Types.ObjectId;
  @Prop({ enum: ['DRAFT', 'APPROVED', 'POSTED'], default: 'DRAFT', index: true }) status!: string;
  @Prop({ required: true }) script!: string;
  @Prop({ required: true }) caption!: string;
  @Prop({ type: [String], default: [] }) shotList!: string[];
  @Prop({ type: Object, required: true }) sourceFacts!: { name: string; priceVnd: number; sourceUrl: string; affiliateUrl: string };
  @Prop() tiktokVideoUrl?: string;
  @Prop() postedAt?: Date;
  @Prop({ default: false }) linkedProductConfirmed!: boolean;
  @Prop({ type: Object, default: {} }) metrics!: { views?: number; likes?: number; comments?: number; shares?: number; productClicks?: number; measuredAt?: Date };
}
const VideoPlanSchema = SchemaFactory.createForClass(VideoPlan);

@Schema({ timestamps: true })
class Commission {
  @Prop({ required: true, trim: true }) orderId!: string;
  @Prop({ required: true, trim: true }) sku!: string;
  @Prop({ required: true, min: 0 }) commissionVnd!: number;
  @Prop({ min: 0 }) orderValueVnd?: number;
  @Prop({ enum: ['PENDING', 'SETTLED', 'REJECTED'], required: true }) status!: string;
  @Prop({ default: 'CREATOR_CENTER_MANUAL' }) source!: string;
  @Prop() recordedAt?: Date;
}
const CommissionSchema = SchemaFactory.createForClass(Commission);
CommissionSchema.index({ orderId: 1, sku: 1 }, { unique: true });

@Schema({ timestamps: true })
class ExternalLink {
  @Prop({ type: Types.ObjectId, required: true }) productId!: Types.ObjectId;
  @Prop({ unique: true, required: true }) code!: string;
  @Prop({ required: true }) destination!: string;
  @Prop({ default: true }) active!: boolean;
}
const ExternalLinkSchema = SchemaFactory.createForClass(ExternalLink);

@Schema({ timestamps: true })
class ExternalClick {
  @Prop({ type: Types.ObjectId, required: true, index: true }) linkId!: Types.ObjectId;
}
const ExternalClickSchema = SchemaFactory.createForClass(ExternalClick);

class CreateVideoDto {
  @IsMongoId() productId!: string;
  @IsOptional() @IsString() @MaxLength(100) angle?: string;
}
class EditVideoDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(3000) script?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(2200) caption?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) shotList?: string[];
}
class MarkPostedDto {
  @IsUrl({ require_tld: false }) tiktokVideoUrl!: string;
  @IsBoolean() linkedProductConfirmed!: boolean;
}
class VideoMetricsDto {
  @IsInt() @Min(0) views!: number;
  @IsInt() @Min(0) likes!: number;
  @IsInt() @Min(0) comments!: number;
  @IsInt() @Min(0) shares!: number;
  @IsInt() @Min(0) productClicks!: number;
}
class UpsertCommissionDto {
  @IsString() @IsNotEmpty() @MaxLength(100) orderId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) sku!: string;
  @IsInt() @Min(0) commissionVnd!: number;
  @IsOptional() @IsInt() @Min(0) orderValueVnd?: number;
  @IsEnum(['PENDING', 'SETTLED', 'REJECTED']) status!: 'PENDING' | 'SETTLED' | 'REJECTED';
  @IsOptional() @IsDateString() recordedAt?: string;
}
class CreateLinkDto { @IsMongoId() productId!: string; }

function requireTikTokHttps(raw: string) {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new BadRequestException('Invalid TikTok URL'); }
  if (parsed.protocol !== 'https:' || !/(^|\.)tiktok\.com$/i.test(parsed.hostname) || parsed.username || parsed.password) {
    throw new BadRequestException('Use an HTTPS TikTok URL');
  }
}

@Injectable()
export class AffiliateService {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(VideoPlan.name) private readonly videos: Model<VideoPlan>,
    @InjectModel(Commission.name) private readonly commissions: Model<Commission>,
    @InjectModel(ExternalLink.name) private readonly links: Model<ExternalLink>,
    @InjectModel(ExternalClick.name) private readonly clicks: Model<ExternalClick>,
  ) {}

  private async product(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Product not found');
    const product = await this.products.findById(id).lean();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async createVideo(dto: CreateVideoDto) {
    const product = await this.product(dto.productId);
    if (product.affiliateStatus !== 'READY' || !product.affiliateUrl) {
      throw new BadRequestException('Verify the Creator affiliate link before preparing a monetized video');
    }
    requireTikTokHttps(product.affiliateUrl);
    const angle = dto.angle?.trim() || 'phối đồ hằng ngày';
    return this.videos.create({
      productId: product._id, status: 'DRAFT',
      sourceFacts: { name: product.name, priceVnd: product.priceVnd, sourceUrl: product.sourceUrl, affiliateUrl: product.affiliateUrl },
      script: `Mở đầu: gợi ý ${angle}. Giới thiệu ${product.name}. Giá tham khảo lúc kiểm tra: ${product.priceVnd.toLocaleString('vi-VN')}đ. Cho xem sản phẩm thật, chất liệu, size và cách phối sau khi tự kiểm tra. Kết: xem sản phẩm đã gắn trong video để đối chiếu giá hiện tại.`,
      caption: `${product.name} | Giá có thể thay đổi, kiểm tra tại sản phẩm được gắn trong video. #thoitrang #tiktokshop #affiliate`,
      shotList: ['Quay sản phẩm thật và nhãn', 'Quay cận chất liệu, màu và size thực tế', 'Quay một cách phối đồ', 'Đối chiếu giá trong TikTok Shop trước khi đăng'],
    });
  }

  listVideos() { return this.videos.find().sort({ createdAt: -1 }).limit(100).lean(); }

  async editVideo(id: string, dto: EditVideoDto) {
    if (!isValidObjectId(id)) throw new NotFoundException('Video draft not found');
    const video = await this.videos.findOneAndUpdate({ _id: id, status: 'DRAFT' }, { $set: dto }, { new: true, runValidators: true }).lean();
    if (!video) throw new NotFoundException('Editable draft not found');
    return video;
  }

  async approveVideo(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Video draft not found');
    const video = await this.videos.findOneAndUpdate({ _id: id, status: 'DRAFT' }, { $set: { status: 'APPROVED' } }, { new: true }).lean();
    if (!video) throw new NotFoundException('Draft awaiting approval not found');
    return video;
  }

  async markPosted(id: string, dto: MarkPostedDto) {
    requireTikTokHttps(dto.tiktokVideoUrl);
    if (!dto.linkedProductConfirmed) throw new BadRequestException('Confirm the native product link in TikTok');
    if (!isValidObjectId(id)) throw new NotFoundException('Approved video not found');
    const video = await this.videos.findOneAndUpdate({ _id: id, status: 'APPROVED' }, {
      $set: { status: 'POSTED', tiktokVideoUrl: dto.tiktokVideoUrl, linkedProductConfirmed: true, postedAt: new Date() },
    }, { new: true }).lean();
    if (!video) throw new NotFoundException('Approved video not found');
    return video;
  }

  async updateMetrics(id: string, dto: VideoMetricsDto) {
    if (!isValidObjectId(id)) throw new NotFoundException('Posted video not found');
    const video = await this.videos.findOneAndUpdate({ _id: id, status: 'POSTED' }, {
      $set: { metrics: { ...dto, measuredAt: new Date() } },
    }, { new: true }).lean();
    if (!video) throw new NotFoundException('Posted video not found');
    return video;
  }

  async upsertCommission(dto: UpsertCommissionDto) {
    const product = await this.products.findOne({ sku: dto.sku }).lean();
    if (!product) throw new NotFoundException('SKU not found in catalog');
    return this.commissions.findOneAndUpdate({ orderId: dto.orderId, sku: dto.sku }, {
      $set: { commissionVnd: dto.commissionVnd, orderValueVnd: dto.orderValueVnd,
        status: dto.status, recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(), source: 'CREATOR_CENTER_MANUAL' },
    }, { upsert: true, new: true, runValidators: true }).lean();
  }

  listCommissions() { return this.commissions.find().sort({ createdAt: -1 }).limit(100).lean(); }

  async createLink(dto: CreateLinkDto) {
    const product = await this.product(dto.productId);
    if (product.affiliateStatus !== 'READY' || !product.affiliateUrl) throw new BadRequestException('Affiliate link is not ready');
    requireTikTokHttps(product.affiliateUrl);
    return this.links.create({ productId: product._id, code: randomBytes(8).toString('hex'), destination: product.affiliateUrl });
  }

  listLinks() { return this.links.find().sort({ createdAt: -1 }).limit(100).lean(); }

  async redirect(code: string) {
    const link = await this.links.findOne({ code, active: true }).lean();
    if (!link) throw new NotFoundException('Link not found');
    requireTikTokHttps(link.destination);
    await this.clicks.create({ linkId: link._id });
    return { url: link.destination, statusCode: 302 };
  }

  async summary() {
    const [products, videos, externalClicks, commissions] = await Promise.all([
      this.products.countDocuments(), this.videos.find().select('status').lean(),
      this.clicks.countDocuments(), this.commissions.find().select('status commissionVnd').lean(),
    ]);
    return {
      products, videoDrafts: videos.filter(v => v.status === 'DRAFT').length,
      videosPosted: videos.filter(v => v.status === 'POSTED').length,
      recordedViews: videos.reduce((sum, v) => sum + (v.metrics?.views ?? 0), 0),
      externalClicks,
      pendingCommissionVnd: commissions.filter(c => c.status === 'PENDING').reduce((sum, c) => sum + c.commissionVnd, 0),
      settledCommissionVnd: commissions.filter(c => c.status === 'SETTLED').reduce((sum, c) => sum + c.commissionVnd, 0),
      note: 'External clicks are not TikTok in-app views or proof of attributed orders.',
    };
  }

  async productPerformance() {
    const [products, videos, commissions] = await Promise.all([
      this.products.find().select('sku name').lean(),
      this.videos.find().select('productId status metrics').lean(),
      this.commissions.find().select('sku status commissionVnd').lean(),
    ]);
    return products.map(product => {
      const productVideos = videos.filter(video => String(video.productId) === String(product._id));
      const productCommissions = commissions.filter(commission => commission.sku === product.sku);
      return {
        productId: product._id, sku: product.sku, name: product.name,
        videosPosted: productVideos.filter(video => video.status === 'POSTED').length,
        recordedViews: productVideos.reduce((sum, video) => sum + (video.metrics?.views ?? 0), 0),
        settledOrders: productCommissions.filter(commission => commission.status === 'SETTLED').length,
        settledCommissionVnd: productCommissions.filter(commission => commission.status === 'SETTLED').reduce((sum, commission) => sum + commission.commissionVnd, 0),
      };
    }).sort((a, b) => b.settledCommissionVnd - a.settledCommissionVnd);
  }
}

@Controller('affiliate')
class AffiliateController {
  constructor(private readonly service: AffiliateService) {}
  @Post('videos') createVideo(@Headers('x-review-secret') s: string | undefined, @Body() dto: CreateVideoDto) { requireAdmin(s); return this.service.createVideo(dto); }
  @Get('videos') videos(@Headers('x-review-secret') s?: string) { requireAdmin(s); return this.service.listVideos(); }
  @Patch('videos/:id') editVideo(@Headers('x-review-secret') s: string | undefined, @Param('id') id: string, @Body() dto: EditVideoDto) { requireAdmin(s); return this.service.editVideo(id, dto); }
  @Patch('videos/:id/approve') approve(@Headers('x-review-secret') s: string | undefined, @Param('id') id: string) { requireAdmin(s); return this.service.approveVideo(id); }
  @Patch('videos/:id/posted') posted(@Headers('x-review-secret') s: string | undefined, @Param('id') id: string, @Body() dto: MarkPostedDto) { requireAdmin(s); return this.service.markPosted(id, dto); }
  @Patch('videos/:id/metrics') metrics(@Headers('x-review-secret') s: string | undefined, @Param('id') id: string, @Body() dto: VideoMetricsDto) { requireAdmin(s); return this.service.updateMetrics(id, dto); }
  @Post('commissions') commission(@Headers('x-review-secret') s: string | undefined, @Body() dto: UpsertCommissionDto) { requireAdmin(s); return this.service.upsertCommission(dto); }
  @Get('commissions') commissions(@Headers('x-review-secret') s?: string) { requireAdmin(s); return this.service.listCommissions(); }
  @Post('links') link(@Headers('x-review-secret') s: string | undefined, @Body() dto: CreateLinkDto) { requireAdmin(s); return this.service.createLink(dto); }
  @Get('links') links(@Headers('x-review-secret') s?: string) { requireAdmin(s); return this.service.listLinks(); }
  @Get('summary') summary(@Headers('x-review-secret') s?: string) { requireAdmin(s); return this.service.summary(); }
  @Get('products/performance') performance(@Headers('x-review-secret') s?: string) { requireAdmin(s); return this.service.productPerformance(); }
}

@Controller('go')
class ExternalLinkController {
  constructor(private readonly service: AffiliateService) {}
  @Get(':code') @Redirect(undefined, 302)
  go(@Param('code') code: string) { return this.service.redirect(code); }
}

@Module({ imports: [MongooseModule.forFeature([
  { name: Product.name, schema: ProductSchema },
  { name: VideoPlan.name, schema: VideoPlanSchema },
  { name: Commission.name, schema: CommissionSchema },
  { name: ExternalLink.name, schema: ExternalLinkSchema },
  { name: ExternalClick.name, schema: ExternalClickSchema },
])], controllers: [AffiliateController, ExternalLinkController], providers: [AffiliateService] })
export class AffiliateModule {}
