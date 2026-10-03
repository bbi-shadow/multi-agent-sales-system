import {
  BadRequestException, Body, ConflictException, Controller, Get,
  Headers, Injectable, Module, NotFoundException, Param, Patch,
  Post, UnauthorizedException,
} from '@nestjs/common';
import {
  InjectModel, MongooseModule, Prop, Schema, SchemaFactory,
} from '@nestjs/mongoose';
import {
  IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString,
} from 'class-validator';
import { Model, Types } from 'mongoose';
import { Product, ProductSchema } from '../products/schemas/product.schema';

type ReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

@Schema({ timestamps: true })
class Draft {
  @Prop({ type: Types.ObjectId, ref: Product.name, required: true, index: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  draftText!: string;

  @Prop({
    enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED'],
    default: 'PENDING_REVIEW',
  })
  reviewStatus!: ReviewStatus;

  @Prop()
  reviewNote?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop({ type: Object, required: true })
  sourceFacts!: {
    name: string;
    priceVnd: number;
    sourceUrl: string;
  };
}

const DraftSchema = SchemaFactory.createForClass(Draft);

class CreateDraftDto {
  @IsMongoId()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  draftText!: string;
}

class ReviewDraftDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  note?: string;
}

@Injectable()
class DraftsService {
  constructor(
    @InjectModel(Draft.name) private readonly drafts: Model<Draft>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
  ) {}

  async create(dto: CreateDraftDto) {
    const product = await this.products.findById(dto.productId).lean();
    if (!product) throw new NotFoundException('Product not found');

    return this.drafts.create({
      productId: new Types.ObjectId(dto.productId),
      draftText: dto.draftText,
      reviewStatus: 'PENDING_REVIEW',
      sourceFacts: {
        name: product.name,
        priceVnd: product.priceVnd,
        sourceUrl: product.sourceUrl,
      },
    });
  }

  list() {
    return this.drafts.find().sort({ createdAt: -1 }).limit(100).lean();
  }

  async review(id: string, dto: ReviewDraftDto) {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      throw new BadRequestException('Invalid draft ID');
    }

    if (!dto || !['APPROVED', 'REJECTED'].includes(dto.status)) {
      throw new BadRequestException('Status must be APPROVED or REJECTED');
    }

    if (dto.note !== undefined && typeof dto.note !== 'string') {
      throw new BadRequestException('Note must be a string');
    }

    const note = dto.note?.trim() ?? '';
    if (note.length > 1000) {
      throw new BadRequestException('Note is too long');
    }
    if (dto.status === 'REJECTED' && !note) {
      throw new BadRequestException('A rejection note is required');
    }

    const draftId = new Types.ObjectId(id);
    const updated = await this.drafts.findOneAndUpdate(
      { _id: draftId, reviewStatus: 'PENDING_REVIEW' },
      {
        $set: {
          reviewStatus: dto.status,
          reviewNote: note,
          reviewedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    ).lean();

    if (updated) return updated;

    const exists = await this.drafts.exists({ _id: draftId });
    if (!exists) throw new NotFoundException('Draft not found');
    throw new ConflictException('Draft has already been reviewed');
  }
}

@Controller('drafts')
class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  private checkWorkflowSecret(secret?: string) {
    const expected = process.env.N8N_WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException();
    }
  }

  private checkReviewSecret(secret?: string) {
    const expected = process.env.ADMIN_REVIEW_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException();
    }
  }

  @Post()
  create(
    @Headers('x-workflow-secret') secret: string | undefined,
    @Body() dto: CreateDraftDto,
  ) {
    this.checkWorkflowSecret(secret);
    return this.drafts.create(dto);
  }

  @Get()
  list(@Headers('x-workflow-secret') secret: string | undefined) {
    this.checkWorkflowSecret(secret);
    return this.drafts.list();
  }

  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Headers('x-review-secret') secret: string | undefined,
    @Body() dto: ReviewDraftDto,
  ) {
    this.checkReviewSecret(secret);
    return this.drafts.review(id, dto);
  }
}

@Module({
  imports: [MongooseModule.forFeature([
    { name: Draft.name, schema: DraftSchema },
    { name: Product.name, schema: ProductSchema },
  ])],
  controllers: [DraftsController],
  providers: [DraftsService],
})
export class DraftsModule {}
