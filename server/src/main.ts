import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './api/app.module';

export async function configure(app: NestExpressApplication): Promise<NestExpressApplication> {
  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '6mb' }); // файли імпорту до 5 МБ передаються в тілі запиту
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  await configure(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`WandeRoot API: http://localhost:${port}/api`);
}

if (require.main === module) bootstrap();
