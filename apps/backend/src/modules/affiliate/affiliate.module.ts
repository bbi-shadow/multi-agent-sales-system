import {
  BadRequestException, Body, Controller, Get, Headers, Injectable, Module,
  NotFoundException, Param, Patch, Post, Redirect, StreamableFile, UnauthorizedException,
} from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Model, Types, isValidObjectId } from 'mongoose';
import { requireAdmin } from '../../common/admin-auth';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { assembleThirtySeconds, makeSafeScript, pollVeo, readReferenceImage, startVeo, VIDEO_SCENES } from './video-automation.provider';

@Schema({ timestamps: true })
class VideoPlan {
  @Prop({ type: Types.ObjectId, required: true, index: true }) productId!: Types.ObjectId;
  @Prop({ unique: true, sparse: true }) automationKey?: string;
  @Prop({ enum: ['DRAFT', 'APPROVED', 'POSTED'], default: 'DRAFT', index: true }) status!: string;
  @Prop({ required: true }) script!: string;
  @Prop({ required: true }) caption!: string;
  @Prop({ type: [String], default: [] }) shotList!: string[];
  @Prop({ type: Object, required: true }) sourceFacts!: { name: string; priceVnd: number; sourceUrl: string; affiliateUrl: string };
  @Prop() tiktokVideoUrl?: string;
  @Prop() postedAt?: Date;
  @Prop({ default: false }) linkedProductConfirmed!: boolean;
  @Prop({ type: Object, default: {} }) metrics!: { views?: number; likes?: number; comments?: number; shares?: number; productClicks?: number; measuredAt?: Date };
  @Prop({ enum: ['EVERGREEN', 'USER_SUPPLIED'], default: 'EVERGREEN' }) trendMode?: string;
  @Prop() trendEvidenceUrl?: string;
  @Prop() scriptSource?: string;
  @Prop({ enum: ['PENDING', 'GENERATING', 'READY', 'FAILED'], default: 'PENDING' }) scriptStatus?: string;
  @Prop() scriptStartedAt?: Date;
  @Prop() scriptError?: string;
  @Prop({ enum: ['PENDING', 'STARTING', 'SUBMITTED', 'DOWNLOADING', 'STARTING_NEXT', 'CLIP_READY', 'FAILED'], default: 'PENDING' }) renderStatus?: string;
  @Prop() renderOperation?: string;
  @Prop({ min: 0, max: 3 }) renderStep?: number;
  @Prop() renderStartedAt?: Date;
  @Prop() renderError?: string;
  @Prop() videoPath?: string;
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

  async generateEveryTwoDaysDraft() {
    // One global slot per two calendar days in Vietnam. The unique index on
    // automationKey also prevents duplicate drafts when n8n retries a request.
    const vietnamDay = Math.floor((Date.now() + 7 * 60 * 60 * 1000) / 86400000);
    const automationKey = `affiliate-script:2d:${Math.floor(vietnamDay / 2)}`;
    const products = await this.products.find({ affiliateStatus: 'READY', affiliateUrl: { $exists: true, $ne: '' } })
      .sort({ updatedAt: -1 }).limit(25).lean();
    const result = { checked: products.length, created: 0, skipped: 0, draftIds: [] as string[],
      note: 'One draft per two-day Vietnam-time slot. Existing draft can resume after missing AI credentials or image are configured. Publishing is not automatic.' };

    const existing = await this.videos.findOne({ automationKey }).select('_id status').lean();
    if (existing) {
      result.skipped = products.length;
      if (existing.status === 'DRAFT') result.draftIds.push(String(existing._id));
      return result;
    }

    // An editor-entered URL is a hint, not proof that a topic is currently hot.
    // Prefer recent supplied signals; otherwise rotate to the least recently used product.
    const recentVideos = await this.videos.find().sort({ createdAt: -1 }).limit(100).select('productId').lean();
    const lastUsed = new Map<string, number>();
    recentVideos.forEach((video, index) => {
      const id = String(video.productId);
      if (!lastUsed.has(id)) lastUsed.set(id, index);
    });
    const validSignals = (p: typeof products[number]) => Boolean(p.trendEvidenceUrl && p.trendCheckedAt
      && Date.now() - new Date(p.trendCheckedAt).getTime() >= 0
      && Date.now() - new Date(p.trendCheckedAt).getTime() < 7 * 86400000);
    products.sort((a, b) => Number(validSignals(b)) - Number(validSignals(a))
      || (lastUsed.get(String(b._id)) ?? 999) - (lastUsed.get(String(a._id)) ?? 999));
    for (const product of products) {
      const productId = product._id as Types.ObjectId;
      if (!product.affiliateUrl) { result.skipped++; continue; }
      try { requireTikTokHttps(product.affiliateUrl); } catch { result.skipped++; continue; }
      const facts = { name: product.name, priceVnd: product.priceVnd,
        sourceUrl: product.sourceUrl, affiliateUrl: product.affiliateUrl };
      const draft = {
        productId, automationKey, status: 'DRAFT', sourceFacts: facts,
        trendMode: validSignals(product) ? 'USER_SUPPLIED' : 'EVERGREEN',
        ...(validSignals(product) ? { trendEvidenceUrl: product.trendEvidenceUrl } : {}),
        scriptStatus: 'PENDING', renderStatus: 'PENDING',
        script: `Mở đầu: gợi ý phối đồ với ${product.name}. Giá tham khảo lúc kiểm tra: ${product.priceVnd.toLocaleString('vi-VN')}đ. Xem sản phẩm thật, xác minh màu, size và giá hiện tại trước khi nói trong video. Kết: xem sản phẩm được gắn trong video.`,
        caption: `${product.name} | Giá có thể thay đổi, kiểm tra trên TikTok Shop. #thoitrang #tiktokshop #affiliate`,
        shotList: ['Đối chiếu sản phẩm và ảnh nguồn', 'Quay hoặc dựng cảnh phối đồ', 'Xác minh giá và size trước khi đăng'],
      };
      try {
        const write = await this.videos.updateOne({ automationKey }, { $setOnInsert: draft }, { upsert: true });
        if (write.upsertedCount) { result.created++; result.draftIds.push(String(write.upsertedId)); }
        else result.skipped++;
      } catch (error) {
        if ((error as { code?: number }).code === 11000) result.skipped++;
        else throw error;
      }
      return result;
    }
    return result;
  }

  async generateAIScript(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Video draft not found');
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { id, status: 'BLOCKED', reason: 'GEMINI_API_KEY_MISSING' };
    const claim = await this.videos.findOneAndUpdate(
      { _id: id, status: 'DRAFT', scriptStatus: { $in: ['PENDING', 'FAILED', null] } },
      { $set: { scriptStatus: 'GENERATING', scriptStartedAt: new Date(), scriptError: null } },
      { new: true },
    ).lean();
    if (!claim) {
      const previous = await this.videos.findById(id).select('scriptStatus scriptSource').lean();
      if (!previous) throw new NotFoundException('Video draft not found');
      return { id, status: previous.scriptStatus === 'READY' ? 'SCRIPT_READY' : previous.scriptStatus || 'BLOCKED' };
    }
    try {
      const product = await this.product(String(claim.productId));
      const result = await makeSafeScript(key, process.env.GEMINI_MODEL || '', claim.sourceFacts.name, product.category);
      await this.videos.updateOne({ _id: id, scriptStatus: 'GENERATING' }, {
        $set: { script: result.script, caption: result.caption, shotList: result.shotList,
          scriptSource: `GEMINI:${result.model}`, scriptStatus: 'READY' },
      });
      return { id, status: 'SCRIPT_READY', script: result.script, caption: result.caption, trendMode: claim.trendMode || 'EVERGREEN' };
    } catch (error) {
      await this.videos.updateOne({ _id: id, scriptStatus: 'GENERATING' }, {
        $set: { scriptStatus: 'FAILED', scriptError: error instanceof Error ? error.message.slice(0, 200) : 'AI error' },
      });
      throw error;
    }
  }

  async startRender(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Video draft not found');
    if (process.env.AUTO_RENDER_ENABLED !== 'true') return { id, status: 'BLOCKED', reason: 'AUTO_RENDER_DISABLED' };
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { id, status: 'BLOCKED', reason: 'GEMINI_API_KEY_MISSING' };
    const draft = await this.videos.findById(id).lean();
    if (!draft) throw new NotFoundException('Video draft not found');
    if (draft.scriptStatus !== 'READY' || !draft.scriptSource?.startsWith('GEMINI:')) {
      return { id, status: 'BLOCKED', reason: 'AI_SCRIPT_NOT_READY' };
    }
    if (draft.renderStatus && !['PENDING'].includes(draft.renderStatus)) {
      return { id, status: draft.renderStatus, reason: 'Video job already started; no second paid request is allowed' };
    }
    const product = await this.product(String(draft.productId));
    const reference = await readReferenceImage(product.sku);
    if (!reference) return { id, status: 'BLOCKED', reason: 'PRODUCT_REFERENCE_IMAGE_MISSING', filename: `${product.sku}.png` };
    const claim = await this.videos.findOneAndUpdate(
      { _id: id, status: 'DRAFT', scriptStatus: 'READY', renderStatus: { $in: ['PENDING', null] } },
      { $set: { renderStatus: 'STARTING', renderStartedAt: new Date(), renderStep: 0 } }, { new: true },
    ).lean();
    if (!claim) return { id, status: 'BLOCKED', reason: 'VIDEO_JOB_ALREADY_CLAIMED' };
    try {
      const prompt = `Vertical 9:16 realistic eight-second scene one of four, later assembled into a 30-second video. One fictional adult Vietnamese presenter with short black hair and a plain cream shirt in a clean room. Show the authorized reference product image faithfully; avoid invented logos, details, sizing and fabric claims. Natural voice and lip synchronization. No prices, no on-screen product links or fake testimonials. ${VIDEO_SCENES[0]}`;
      const operation = await startVeo(key, process.env.VEO_MODEL || '', prompt, reference);
      await this.videos.updateOne({ _id: id, renderStatus: 'STARTING' }, {
        $set: { renderStatus: 'SUBMITTED', renderOperation: operation },
      });
      return { id, status: 'SUBMITTED' };
    } catch (error) {
      // Do not release STARTING automatically: if the provider accepted the job
      // before a network failure, retrying could create a second paid request.
      await this.videos.updateOne({ _id: id, renderStatus: 'STARTING' }, {
        $set: { renderError: 'Submission uncertain; inspect provider before manual recovery' },
      });
      throw error;
    }
  }

  async renderStatus(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Video draft not found');
    const video = await this.videos.findById(id).lean();
    if (!video) throw new NotFoundException('Video draft not found');
    if (video.renderStatus === 'CLIP_READY') return { id, status: 'CLIP_READY', downloadPath: `/api/v1/affiliate/videos/${id}/clip` };
    if (video.renderStatus !== 'SUBMITTED' || !video.renderOperation) return { id, status: video.renderStatus || 'PENDING', reason: video.renderError };
    if (video.renderStartedAt && Date.now() - new Date(video.renderStartedAt).getTime() > 120 * 60000) {
      await this.videos.updateOne({ _id: id, renderStatus: 'SUBMITTED' },
        { $set: { renderStatus: 'FAILED', renderError: 'Job exceeded two hours; inspect provider before manual recovery' } });
      return { id, status: 'FAILED', reason: 'RENDER_TIMED_OUT' };
    }
    const claim = await this.videos.findOneAndUpdate({ _id: id, renderStatus: 'SUBMITTED' },
      { $set: { renderStatus: 'DOWNLOADING' } }, { new: true }).lean();
    if (!claim) return { id, status: 'DOWNLOADING' };
    try {
      const scene = claim.renderStep ?? 0;
      const result = await pollVeo(process.env.GEMINI_API_KEY || '', claim.renderOperation!, id, scene);
      if (result.status === 'SUBMITTED') {
        await this.videos.updateOne({ _id: id, renderStatus: 'DOWNLOADING' }, { $set: { renderStatus: 'SUBMITTED' } });
        return { id, status: 'SUBMITTED' };
      }
      if (scene < VIDEO_SCENES.length - 1) {
        // Claim the next paid request before contacting Veo. An uncertain
        // submission cannot be retried automatically and charged twice.
        await this.videos.updateOne({ _id: id, renderStatus: 'DOWNLOADING' },
          { $set: { renderStatus: 'STARTING_NEXT', videoPath: result.path } });
        const product = await this.product(String(claim.productId));
        const reference = await readReferenceImage(product.sku);
        if (!reference) throw new Error('Product reference image disappeared');
        const prompt = `Vertical 9:16 realistic eight-second scene ${scene + 2} of four, later assembled into a 30-second video. The same fictional adult Vietnamese presenter with short black hair and a plain cream shirt in a clean room. Show the authorized reference product faithfully. No invented product claims, fake testimonials, prices, or on-screen links. Natural Vietnamese voice. ${VIDEO_SCENES[scene + 1]}`;
        const operation = await startVeo(process.env.GEMINI_API_KEY || '', process.env.VEO_MODEL || '', prompt, reference);
        await this.videos.updateOne({ _id: id, renderStatus: 'STARTING_NEXT' },
          { $set: { renderStatus: 'SUBMITTED', renderStep: scene + 1, renderOperation: operation } });
        return { id, status: 'SUBMITTED', completedScenes: scene + 1, totalScenes: VIDEO_SCENES.length };
      }
      const path = await assembleThirtySeconds(id);
      await this.videos.updateOne({ _id: id, renderStatus: 'DOWNLOADING' }, {
        $set: { renderStatus: 'CLIP_READY', videoPath: path },
      });
      return { id, status: 'CLIP_READY', downloadPath: `/api/v1/affiliate/videos/${id}/clip`, note: '30-second draft; product tag and posting have not happened' };
    } catch (error) {
      await this.videos.updateOne({ _id: id, renderStatus: { $in: ['DOWNLOADING', 'STARTING_NEXT'] } }, {
        $set: { renderStatus: 'FAILED', renderError: error instanceof Error ? error.message.slice(0, 200) : 'Video error' },
      });
      throw error;
    }
  }

  async downloadClip(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Video clip not found');
    const video = await this.videos.findOne({ _id: id, renderStatus: 'CLIP_READY' }).lean();
    if (!video) throw new NotFoundException('Video clip not found');
    try {
      const bytes = await readFile(join(process.env.VIDEO_STORAGE_DIR || '/app/storage', 'videos', `${id}.mp4`));
      return new StreamableFile(bytes, { type: 'video/mp4', disposition: `attachment; filename="${id}.mp4"` });
    } catch { throw new NotFoundException('Video file is unavailable'); }
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
  private workflowSecret(secret?: string) {
    if (!process.env.N8N_WEBHOOK_SECRET || secret !== process.env.N8N_WEBHOOK_SECRET) throw new UnauthorizedException();
  }
  @Post('videos/auto-generate')
  autoGenerate(@Headers('x-workflow-secret') secret?: string) {
    this.workflowSecret(secret);
    return this.service.generateEveryTwoDaysDraft();
  }
  @Post('videos/:id/generate-script')
  generateScript(@Headers('x-workflow-secret') secret: string | undefined, @Param('id') id: string) {
    this.workflowSecret(secret); return this.service.generateAIScript(id);
  }
  @Post('videos/:id/render')
  render(@Headers('x-workflow-secret') secret: string | undefined, @Param('id') id: string) {
    this.workflowSecret(secret); return this.service.startRender(id);
  }
  @Get('videos/:id/render-status')
  renderState(@Headers('x-workflow-secret') secret: string | undefined, @Param('id') id: string) {
    this.workflowSecret(secret); return this.service.renderStatus(id);
  }
  @Get('videos/:id/clip')
  clip(@Headers('x-review-secret') secret: string | undefined, @Param('id') id: string) {
    requireAdmin(secret); return this.service.downloadClip(id);
  }
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
