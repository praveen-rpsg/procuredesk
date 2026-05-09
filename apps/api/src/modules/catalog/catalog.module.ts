import { Module } from "@nestjs/common";

import { CacheModule } from "../../common/cache/cache.module.js";
import { DatabaseModule } from "../../database/database.module.js";
import { IdentityAccessModule } from "../identity-access/identity-access.module.js";
import { CatalogService } from "./application/catalog.service.js";
import { CatalogCacheService } from "./infrastructure/catalog-cache.service.js";
import { CatalogRepository } from "./infrastructure/catalog.repository.js";
import { CatalogController } from "./interfaces/http/catalog.controller.js";

@Module({
  imports: [DatabaseModule, IdentityAccessModule, CacheModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogRepository, CatalogCacheService],
  exports: [CatalogService],
})
export class CatalogModule {}
