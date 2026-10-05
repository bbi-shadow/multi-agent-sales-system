import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { requireAdmin } from '../../common/admin-auth';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  create(@Headers('x-review-secret') secret: string | undefined, @Body() dto: CreateLeadDto) {
    requireAdmin(secret);
    return this.leads.create(dto);
  }

  @Get()
  findAll(@Headers('x-review-secret') secret?: string) {
    requireAdmin(secret);
    return this.leads.findAll();
  }

  @Get(':id')
  findOne(@Headers('x-review-secret') secret: string | undefined, @Param('id') id: string) {
    requireAdmin(secret);
    return this.leads.findOne(id);
  }
}
