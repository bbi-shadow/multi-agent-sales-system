import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { success: true, service: 'salesmind-backend', status: 'ok' };
  }
}
