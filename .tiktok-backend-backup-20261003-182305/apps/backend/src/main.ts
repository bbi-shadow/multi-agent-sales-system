import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('SalesMind AI API')
    .setDescription('TikTok affiliate workspace. Private endpoints use x-review-secret; /health and /go are public.')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-review-secret' }, 'admin-key')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}
bootstrap();
