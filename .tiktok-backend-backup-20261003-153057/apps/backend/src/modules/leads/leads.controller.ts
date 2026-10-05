import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leads.create(dto);
  }

  @Get()
  findAll() {
    return this.leads.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leads.findOne(id);
  }
}
