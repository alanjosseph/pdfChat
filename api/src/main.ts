import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // strips unknown fields
      forbidNonWhitelisted: true, // throws if extra fields sent
      transform: true,            // auto-transform payloads to DTO types
    }),
  );

  await app.listen(3030, '0.0.0.0');
}
bootstrap();
