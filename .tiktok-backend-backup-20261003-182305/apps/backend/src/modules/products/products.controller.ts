import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { requireAdmin } from '../../common/admin-auth';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post() create(@Headers('x-review-secret') secret: string | undefined, @Body() dto: CreateProductDto) {
    requireAdmin(secret); return this.products.create(dto);
  }
  @Get() findAll() { return this.products.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.products.findOne(id); }
  @Patch(':id') update(@Headers('x-review-secret') secret: string | undefined, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    requireAdmin(secret); return this.products.update(id, dto);
  }
}
