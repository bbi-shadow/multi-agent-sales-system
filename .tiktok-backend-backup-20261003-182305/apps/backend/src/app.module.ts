import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthModule } from './health/health.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ProductsModule } from './modules/products/products.module';
import { DraftsModule } from './modules/drafts/drafts.module';
import { AgentRunsModule } from './modules/agent-runs/agent-runs.module';
import { AffiliateModule } from './modules/affiliate/affiliate.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/salesmind'),
    HealthModule,
    LeadsModule,
    ProductsModule,
    DraftsModule,
    AgentRunsModule,
    AffiliateModule,
  ],
})
export class AppModule {}
