import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post() create(@Body() dto: CreateProductDto) { return this.products.create(dto); }
  @Get() findAll() { return this.products.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.products.findOne(id); }
}
